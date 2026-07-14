import { startRegistration, startAuthentication } from "@simplewebauthn/browser";
import { supabase } from "./supabase";

// Client side of the real Face ID / Touch ID flow. Talks to the `webauthn` Edge
// Function for challenges + verification and drives the browser's WebAuthn
// prompt via @simplewebauthn/browser. See supabase/functions/webauthn/index.ts.

// strip any trailing slash on the base URL so we never build a double-slash
// path (…supabase.co//functions/…), which the functions gateway rejects.
const SB_URL = String(import.meta.env.VITE_SUPABASE_URL || "").replace(/\/+$/, "");
const FN_URL = `${SB_URL}/functions/v1/webauthn`;
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

async function callFn(action: string, payload: Record<string, unknown>, accessToken?: string) {
  const res = await fetch(FN_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      apikey: ANON,
      // registration needs the user's session token; auth flows use the anon key
      authorization: `Bearer ${accessToken ?? ANON}`,
    },
    body: JSON.stringify({ action, ...payload }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `webauthn ${action} failed`);
  return data;
}

// True only when the device exposes a platform authenticator (Face ID / Touch ID
// / Windows Hello). Used to hide the Face ID UI where it can't work.
export async function isBiometricAvailable(): Promise<boolean> {
  try {
    if (typeof PublicKeyCredential === "undefined") return false;
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

// Register this device's biometric for the signed-in user. Requires an active
// Supabase session (the Edge Function checks the JWT). Triggers the real Face ID
// / Touch ID prompt. Returns true on success.
export async function registerBiometric(): Promise<boolean> {
  const { data: sess } = await supabase.auth.getSession();
  const token = sess.session?.access_token;
  if (!token) throw new Error("Sign in first to enable Face ID.");

  const options = await callFn("register-options", {}, token);
  let attResp;
  try {
    attResp = await startRegistration({ optionsJSON: options });
  } catch (err) {
    // The server excludes already-registered credentials, so if this device is
    // already enrolled the browser throws InvalidStateError ("authenticator was
    // previously registered"). That's not a failure — the device already has a
    // working passkey, so treat it as success and just (re)enable the flag.
    if ((err as { name?: string }).name === "InvalidStateError") return true;
    throw err;
  }
  const verify = await callFn("register-verify", { response: attResp }, token);
  return !!verify.verified;
}

// Verify the user's biometric for a given email (quick unlock / login). Triggers
// the real Face ID / Touch ID prompt. Returns true on success.
export async function verifyBiometric(email: string): Promise<boolean> {
  const options = await callFn("auth-options", { email });
  const authResp = await startAuthentication({ optionsJSON: options });
  const verify = await callFn("auth-verify", { email, response: authResp });
  return !!verify.verified;
}
