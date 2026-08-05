// ============================================================================
// send-email Edge Function — send a branded transactional email via Resend.
//
// Two recipient modes:
//   • self  (default) — recipient derived from the verified JWT (the caller's
//     own address). Used for every customer-facing email.
//   • agent — set target_uid to email ANOTHER user, but ONLY the agent of a job
//     the caller actually booked (job.customer_uid = caller, cleaner_uid =
//     target). Mirrors the guard in notify-user so the endpoint can't be used
//     to email arbitrary people.
//
// Payload (preferred, structured — renders the branded template):
//   POST {
//     subject: string,
//     kind?: string,                     // e.g. "booking_confirmed" (cosmetic)
//     greeting?: string,                 // "Hi Savvas,"
//     heading: string,                   // big line, e.g. "Your cleaning is confirmed"
//     intro?: string,                    // paragraph under the heading
//     rows?: { label: string, value: string }[],   // detail card
//     cta?: { label: string, url: string },
//     note?: string,                     // small muted line above the footer
//     target_uid?: string,               // agent mode (see above)
//     job_id?: string,                   // required with target_uid
//   }
//
// Backward-compatible: POST { subject, body } still works (body = plain text,
// rendered inside the branded shell).
//
// Secrets: RESEND_API_KEY, EMAIL_FROM. If RESEND_API_KEY is missing the function
// no-ops with {ok:true, skipped:true} so the app keeps working.
// ============================================================================
import { createClient } from "jsr:@supabase/supabase-js@2";
import { json, preflight } from "../_shared/http.ts";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const EMAIL_FROM = Deno.env.get("EMAIL_FROM") ?? "Σιντερέλλα <onboarding@resend.dev>";

const BRAND = "Σιντερέλλα";

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

interface Row { label?: string; value?: string }
interface Payload {
  subject?: string;
  body?: string;              // legacy plain-text
  greeting?: string;
  heading?: string;
  intro?: string;
  rows?: Row[];
  cta?: { label?: string; url?: string };
  note?: string;
}

// Branded HTML shell: warm-charcoal header with the wordmark, white body, an
// optional bordered detail card, an optional CTA button, muted footer. Table-
// based + inline styles for broad email-client support (Gmail/Outlook/Apple).
function renderHtml(p: Payload): string {
  const heading = escapeHtml(p.heading ?? p.subject ?? BRAND);
  const greeting = p.greeting ? `<p style="margin:0 0 6px;font-size:15px;color:#14151a">${escapeHtml(p.greeting)}</p>` : "";
  const intro = p.intro ? `<p style="margin:0 0 18px;font-size:15px;line-height:1.55;color:#3a3b42">${escapeHtml(p.intro)}</p>` : "";

  const rows = (p.rows ?? []).filter((r) => r.label && r.value);
  const card = rows.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e7e8ee;border-radius:14px;overflow:hidden;margin:0 0 22px">
         ${rows.map((r, i) => `
           <tr style="${i ? "border-top:1px solid #f0f1f5" : ""}">
             <td style="padding:12px 16px;font-size:13px;color:#6b7280;font-weight:600;white-space:nowrap">${escapeHtml(r.label!)}</td>
             <td style="padding:12px 16px;font-size:14px;color:#14151a;font-weight:600;text-align:right">${escapeHtml(r.value!)}</td>
           </tr>`).join("")}
       </table>`
    : "";

  const cta = p.cta?.label && p.cta?.url
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px">
         <tr><td style="border-radius:12px;background:#4f46e5">
           <a href="${escapeHtml(p.cta.url)}" style="display:inline-block;padding:13px 26px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:12px">${escapeHtml(p.cta.label)}</a>
         </td></tr>
       </table>`
    : "";

  const legacyBody = p.body && !p.heading
    ? `<div style="font-size:15px;line-height:1.55;color:#3a3b42">${escapeHtml(p.body).replace(/\n/g, "<br>")}</div>`
    : "";

  const note = p.note ? `<p style="margin:0 0 6px;font-size:12.5px;color:#9aa0ad;line-height:1.5">${escapeHtml(p.note)}</p>` : "";

  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#f2f3f7">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f2f3f7;padding:24px 0">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 6px 24px rgba(20,21,26,0.06)">
        <!-- header -->
        <tr><td style="background:linear-gradient(160deg,#1a1420 0%,#221a2c 50%,#2a1f35 100%);padding:26px 28px;text-align:center">
          <span style="font-family:'Segoe Script','Bradley Hand',cursive;font-size:30px;font-weight:700;color:#ffffff;letter-spacing:.5px">${BRAND}</span>
        </td></tr>
        <!-- body -->
        <tr><td style="padding:28px">
          <h1 style="margin:0 0 14px;font-size:20px;font-weight:800;letter-spacing:-.3px;color:#14151a;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif">${heading}</h1>
          ${greeting}${intro}${legacyBody}${card}${cta}
        </td></tr>
        <!-- footer -->
        <tr><td style="padding:18px 28px 26px;border-top:1px solid #f0f1f5">
          ${note}
          <p style="margin:0;font-size:12px;color:#9aa0ad;line-height:1.5;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif">
            ${BRAND} · Cyprus<br>
            You’re receiving this because you have an account with ${BRAND}.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

// Plain-text fallback (some clients / spam filters prefer a text part present)
function renderText(p: Payload): string {
  if (p.body && !p.heading) return p.body;
  const lines: string[] = [];
  if (p.greeting) lines.push(p.greeting);
  if (p.heading) lines.push(p.heading);
  if (p.intro) lines.push("", p.intro);
  for (const r of p.rows ?? []) if (r.label && r.value) lines.push(`${r.label}: ${r.value}`);
  if (p.cta?.url) lines.push("", `${p.cta.label ?? "Open"}: ${p.cta.url}`);
  if (p.note) lines.push("", p.note);
  lines.push("", `${BRAND} · Cyprus`);
  return lines.join("\n");
}

Deno.serve(async (req) => {
  const pf = preflight(req);
  if (pf) return pf;
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return json({ error: "not authenticated" }, 401);
  const { data: userData, error: authErr } = await admin.auth.getUser(auth.slice(7));
  if (authErr || !userData.user) return json({ error: "not authenticated" }, 401);
  const callerId = userData.user.id;

  let body: Payload & { target_uid?: string; job_id?: string };
  try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }

  const subject = String(body.subject ?? body.heading ?? "").slice(0, 200);
  if (!subject) return json({ error: "subject required" }, 400);

  // ---- resolve recipient ----
  let to = userData.user.email ?? "";
  if (body.target_uid) {
    // agent mode: only the cleaner of a job the caller booked
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

  // no key configured yet → no-op so the app keeps working
  if (!RESEND_API_KEY) return json({ ok: true, skipped: true });

  const html = renderHtml(body);
  const text = renderText(body);

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
