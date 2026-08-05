// ============================================================================
// welcome-email Edge Function — send a branded welcome + verify-your-email
// message to the signed-in user's own address.
//
// Generates a random verification token, stores it on the caller's users row,
// and emails a branded welcome with a "Verify email" button linking to the
// public verify-email function. Idempotent-ish: re-calling issues a fresh token
// (used by the "Resend email" action). Best-effort.
//
// POST { name?: string }   // optional display name for the greeting
// ============================================================================
import { createClient } from "jsr:@supabase/supabase-js@2";
import { json, preflight } from "../_shared/http.ts";
import { sendViaResend, BRAND } from "../_shared/email.ts";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
// where the verify link bounces the user back into the app after success
const SITE_URL = (Deno.env.get("SITE_URL") ?? "https://cinderella-mvp.vercel.app").replace(/\/+$/, "");

function makeToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  const pf = preflight(req);
  if (pf) return pf;
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return json({ error: "not authenticated" }, 401);
  const { data: userData, error: authErr } = await admin.auth.getUser(auth.slice(7));
  if (authErr || !userData.user?.email) return json({ error: "not authenticated" }, 401);
  const uid = userData.user.id;
  const email = userData.user.email;

  let body: { name?: string };
  try { body = await req.json(); } catch { body = {}; }
  const name = (body.name ?? "").trim() || (userData.user.user_metadata?.name as string | undefined) || "there";

  // already verified? nothing to do
  const { data: row } = await admin.from("users").select("email_verified").eq("id", uid).maybeSingle();
  if (row?.email_verified) return json({ ok: true, alreadyVerified: true });

  // issue + store a fresh token
  const token = makeToken();
  const { error: upErr } = await admin.from("users")
    .update({ email_verify_token: token, email_verify_sent_at: new Date().toISOString() })
    .eq("id", uid);
  if (upErr) return json({ error: upErr.message }, 500);

  // public verify endpoint (no JWT needed — token is the credential)
  const verifyUrl = `${SUPABASE_URL}/functions/v1/verify-email?token=${token}`;

  const r = await sendViaResend(email, `Welcome to ${BRAND} — please verify your email`, {
    subject: `Welcome to ${BRAND} — please verify your email`,
    heading: `Welcome to ${BRAND}!`,
    greeting: `Hi ${name},`,
    intro: `Thanks for joining ${BRAND}, the easy way to book trusted cleaners in Cyprus. Please confirm your email address to secure your account — it only takes a second.`,
    cta: { label: "Verify my email", url: verifyUrl },
    note: `If the button doesn't work, copy this link into your browser:\n${verifyUrl}\nIf you didn't create this account, you can safely ignore this email.`,
  });
  if (!r.ok) return json({ error: `resend: ${r.error}` }, 502);
  return json({ ok: true, skipped: r.skipped ?? false });
});
