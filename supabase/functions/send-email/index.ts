// ============================================================================
// send-email Edge Function — send a branded transactional email via Resend.
//
// Recipient modes:
//   • self  (default) — recipient derived from the verified JWT.
//   • agent — set target_uid to email ANOTHER user, but ONLY the agent of a job
//     the caller booked (job.customer_uid = caller, cleaner_uid = target).
//
// Structured payload renders the branded template (see _shared/email.ts);
// legacy { subject, body } still works.
// ============================================================================
import { createClient } from "jsr:@supabase/supabase-js@2";
import { json, preflight } from "../_shared/http.ts";
import { sendEmail, emailAllowed, type EmailPayload } from "../_shared/email.ts";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

Deno.serve(async (req) => {
  const pf = preflight(req);
  if (pf) return pf;
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return json({ error: "not authenticated" }, 401);
  const { data: userData, error: authErr } = await admin.auth.getUser(auth.slice(7));
  if (authErr || !userData.user) return json({ error: "not authenticated" }, 401);
  const callerId = userData.user.id;

  let body: EmailPayload & { target_uid?: string; job_id?: string };
  try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }

  const subject = String(body.subject ?? body.heading ?? "").slice(0, 200);
  if (!subject) return json({ error: "subject required" }, 400);

  let to = userData.user.email ?? "";
  if (body.target_uid) {
    if (!body.job_id) return json({ error: "job_id required with target_uid" }, 400);
    const { data: job } = await admin.from("jobs").select("customer_uid, cleaner_uid")
      .eq("id", body.job_id).maybeSingle();
    if (!job || job.customer_uid !== callerId || job.cleaner_uid !== body.target_uid) {
      return json({ error: "not your job / target mismatch" }, 403);
    }
    const { data: target } = await admin.auth.admin.getUserById(body.target_uid);
    to = target.user?.email ?? "";
  }
  if (!to) return json({ error: "no recipient email" }, 400);

  // respect the recipient's email-notifications preference
  const recipientUid = body.target_uid ?? callerId;
  if (!(await emailAllowed(admin, recipientUid))) {
    return json({ ok: true, skipped: true });
  }

  const r = await sendEmail(to, subject, body);
  if (!r.ok) return json({ error: `resend: ${r.error}` }, 502);
  return json({ ok: true, skipped: r.skipped ?? false });
});
