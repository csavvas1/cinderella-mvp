// ============================================================================
// send-email Edge Function — send a transactional email via Resend.
//
// The app fires these for booking confirmations, cancellations, declines and
// review alerts. To prevent the endpoint being used to email arbitrary people,
// the caller MUST be signed in and we ONLY send to the caller's OWN account
// email (recipient is derived from the verified JWT, never from the body).
//
// POST { subject: string, body: string }   // body is plain text
//
// Secrets required (set via supabase secrets):
//   RESEND_API_KEY   — Resend API key (re_...)
//   EMAIL_FROM       — verified sender, e.g. "Cinderella <hello@cinderella.cy>"
// If RESEND_API_KEY is missing the function no-ops with {ok:true, skipped:true}
// so the app keeps working before email is configured.
// ============================================================================
import { createClient } from "jsr:@supabase/supabase-js@2";
import { json, preflight } from "../_shared/http.ts";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const EMAIL_FROM = Deno.env.get("EMAIL_FROM") ?? "Cinderella <onboarding@resend.dev>";

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

Deno.serve(async (req) => {
  const pf = preflight(req);
  if (pf) return pf;
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return json({ error: "not authenticated" }, 401);
  const { data: userData, error: authErr } = await admin.auth.getUser(auth.slice(7));
  if (authErr || !userData.user?.email) return json({ error: "not authenticated" }, 401);
  const to = userData.user.email; // recipient is always the caller's own address

  let body: { subject?: string; body?: string };
  try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }
  const subject = String(body.subject ?? "").slice(0, 200);
  const text = String(body.body ?? "");
  if (!subject || !text) return json({ error: "subject + body required" }, 400);

  // no key configured yet → no-op so the app keeps working
  if (!RESEND_API_KEY) return json({ ok: true, skipped: true });

  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;font-size:15px;color:#14151a;line-height:1.5">${
    escapeHtml(text).replace(/\n/g, "<br>")
  }</div>`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: EMAIL_FROM, to, subject, text, html }),
  });
  if (!res.ok) {
    const err = await res.text();
    return json({ error: `resend: ${err}` }, 502);
  }
  return json({ ok: true });
});
