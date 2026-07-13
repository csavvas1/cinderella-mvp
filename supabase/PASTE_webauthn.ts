// ============================================================================
// WebAuthn Edge Function — real Face ID / Touch ID (2nd-factor unlock).
//
// Four actions (POST body { action, ... }):
//   register-options : issue a registration challenge (requires a valid Supabase
//                      JWT — only a signed-in user can register a new device).
//   register-verify  : verify the attestation + store the credential public key.
//   auth-options     : issue an authentication challenge for a given email.
//   auth-verify      : verify the assertion against a stored credential.
//
// Challenges are persisted in webauthn_challenges (short TTL). Credentials live
// in webauthn_credentials. All DB access uses the service role (bypasses RLS)
// because authentication happens before a user session exists.
//
// Env (set via `supabase secrets set`):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  (auto-populated in the platform)
//   WEBAUTHN_RP_ID     e.g. "cinderella-mvp.vercel.app"  (no scheme, no path)
//   WEBAUTHN_ORIGIN    e.g. "https://cinderella-mvp.vercel.app"
// ============================================================================
import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "npm:@simplewebauthn/server@11";

const RP_ID = Deno.env.get("WEBAUTHN_RP_ID") ?? "localhost";
const ORIGIN = Deno.env.get("WEBAUTHN_ORIGIN") ?? "http://localhost:5173";
const RP_NAME = "Cinderella";
const CHALLENGE_TTL_MS = 5 * 60 * 1000; // 5 minutes

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "content-type": "application/json" },
  });
}

// Resolve the signed-in user from the Authorization: Bearer <jwt> header.
async function userFromJwt(req: Request): Promise<{ id: string; email: string } | null> {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const token = auth.slice(7);
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return null;
  return { id: data.user.id, email: data.user.email ?? "" };
}

async function saveChallenge(key: string, kind: string, challenge: string) {
  // one live challenge per key+kind: clear old ones first
  await admin.from("webauthn_challenges").delete().eq("key", key).eq("kind", kind);
  await admin.from("webauthn_challenges").insert({ key, kind, challenge });
}

async function takeChallenge(key: string, kind: string): Promise<string | null> {
  const { data } = await admin
    .from("webauthn_challenges")
    .select("id, challenge, created_at")
    .eq("key", key).eq("kind", kind)
    .order("created_at", { ascending: false })
    .limit(1);
  const row = data?.[0];
  if (!row) return null;
  // consume it (single use)
  await admin.from("webauthn_challenges").delete().eq("id", row.id);
  if (Date.now() - new Date(row.created_at).getTime() > CHALLENGE_TTL_MS) return null;
  return row.challenge as string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }
  const action = body.action as string;

  try {
    // ---- REGISTER: issue options (must be signed in) ----
    if (action === "register-options") {
      const user = await userFromJwt(req);
      if (!user) return json({ error: "not authenticated" }, 401);

      // exclude already-registered credentials on this account
      const { data: existing } = await admin
        .from("webauthn_credentials").select("credential_id, transports")
        .eq("user_id", user.id);

      const options = await generateRegistrationOptions({
        rpName: RP_NAME,
        rpID: RP_ID,
        userName: user.email || user.id,
        userID: new TextEncoder().encode(user.id),
        attestationType: "none",
        authenticatorSelection: {
          residentKey: "preferred",
          userVerification: "required",
          authenticatorAttachment: "platform", // Face ID / Touch ID, not roaming keys
        },
        excludeCredentials: (existing ?? []).map((c) => ({
          id: c.credential_id as string,
          transports: (c.transports ? String(c.transports).split(",") : undefined) as
            AuthenticatorTransport[] | undefined,
        })),
      });
      await saveChallenge(user.id, "register", options.challenge);
      return json(options);
    }

    // ---- REGISTER: verify attestation + store credential ----
    if (action === "register-verify") {
      const user = await userFromJwt(req);
      if (!user) return json({ error: "not authenticated" }, 401);
      const expectedChallenge = await takeChallenge(user.id, "register");
      if (!expectedChallenge) return json({ error: "challenge expired" }, 400);

      const verification = await verifyRegistrationResponse({
        response: body.response as Parameters<typeof verifyRegistrationResponse>[0]["response"],
        expectedChallenge,
        expectedOrigin: ORIGIN,
        expectedRPID: RP_ID,
        requireUserVerification: true,
      });
      if (!verification.verified || !verification.registrationInfo) {
        return json({ error: "verification failed" }, 400);
      }
      const { credential } = verification.registrationInfo;
      await admin.from("webauthn_credentials").insert({
        user_id: user.id,
        credential_id: credential.id,
        public_key: btoa(String.fromCharCode(...credential.publicKey)),
        counter: credential.counter,
        transports: (credential.transports ?? []).join(","),
      });
      return json({ verified: true });
    }

    // ---- AUTH: issue options for an email ----
    if (action === "auth-options") {
      const email = String(body.email ?? "").trim().toLowerCase();
      if (!email) return json({ error: "email required" }, 400);
      // find the user id for this email, then their credentials
      const { data: userRow } = await admin.from("users").select("id").eq("email", email).maybeSingle();
      if (!userRow) return json({ error: "no such user" }, 404);
      const { data: creds } = await admin
        .from("webauthn_credentials").select("credential_id, transports")
        .eq("user_id", userRow.id);
      if (!creds || creds.length === 0) return json({ error: "no credentials" }, 404);

      const options = await generateAuthenticationOptions({
        rpID: RP_ID,
        userVerification: "required",
        allowCredentials: creds.map((c) => ({
          id: c.credential_id as string,
          transports: (c.transports ? String(c.transports).split(",") : undefined) as
            AuthenticatorTransport[] | undefined,
        })),
      });
      // key the challenge by email for the verify step
      await saveChallenge(email, "auth", options.challenge);
      return json(options);
    }

    // ---- AUTH: verify assertion ----
    if (action === "auth-verify") {
      const email = String(body.email ?? "").trim().toLowerCase();
      if (!email) return json({ error: "email required" }, 400);
      const expectedChallenge = await takeChallenge(email, "auth");
      if (!expectedChallenge) return json({ error: "challenge expired" }, 400);

      const response = body.response as { id?: string };
      const { data: cred } = await admin
        .from("webauthn_credentials").select("*")
        .eq("credential_id", response.id ?? "")
        .maybeSingle();
      if (!cred) return json({ error: "unknown credential" }, 404);

      const verification = await verifyAuthenticationResponse({
        response: body.response as Parameters<typeof verifyAuthenticationResponse>[0]["response"],
        expectedChallenge,
        expectedOrigin: ORIGIN,
        expectedRPID: RP_ID,
        requireUserVerification: true,
        credential: {
          id: cred.credential_id as string,
          publicKey: Uint8Array.from(atob(cred.public_key as string), (c) => c.charCodeAt(0)),
          counter: Number(cred.counter),
          transports: (cred.transports ? String(cred.transports).split(",") : undefined) as
            AuthenticatorTransport[] | undefined,
        },
      });
      if (!verification.verified) return json({ error: "verification failed" }, 400);

      // bump the signature counter + last used
      await admin.from("webauthn_credentials")
        .update({ counter: verification.authenticationInfo.newCounter, last_used_at: new Date().toISOString() })
        .eq("id", cred.id);

      return json({ verified: true });
    }

    return json({ error: "unknown action" }, 400);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
