// ============================================================================
// verify-email Edge Function — PUBLIC endpoint hit from the welcome email's
// "Verify my email" link. Validates the token, marks the user verified, and
// redirects back into the app.
//
// GET /verify-email?token=HEX
//   -> 302 {SITE_URL}/?verified=1      on success
//   -> 302 {SITE_URL}/?verified=0      on invalid/expired/used token
//
// Deploy with JWT verification DISABLED (no Authorization header — the token in
// the URL is the credential):  supabase functions deploy verify-email --no-verify-jwt
// ============================================================================
import { createClient } from "jsr:@supabase/supabase-js@2";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

const SITE_URL = (Deno.env.get("SITE_URL") ?? "https://cinderella-mvp.vercel.app").replace(/\/+$/, "");
// token older than this is rejected (user must request a fresh one)
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function redirect(ok: boolean): Response {
  return new Response(null, { status: 302, headers: { Location: `${SITE_URL}/?verified=${ok ? 1 : 0}` } });
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const token = url.searchParams.get("token") ?? "";
  if (!token || token.length < 16) return redirect(false);

  const { data: user } = await admin.from("users")
    .select("id, email_verified, email_verify_sent_at")
    .eq("email_verify_token", token)
    .maybeSingle();

  if (!user) return redirect(false);              // unknown / already-consumed token
  if (user.email_verified) return redirect(true);  // already verified — treat as success

  // reject stale tokens
  const sentAt = user.email_verify_sent_at ? new Date(user.email_verify_sent_at).getTime() : 0;
  if (sentAt && Date.now() - sentAt > MAX_AGE_MS) return redirect(false);

  const { error } = await admin.from("users")
    .update({ email_verified: true, email_verify_token: null })
    .eq("id", user.id);
  if (error) return redirect(false);

  return redirect(true);
});
