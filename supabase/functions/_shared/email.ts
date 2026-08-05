// Shared branded email template used by send-email + welcome-email so every
// transactional message looks identical: warm-charcoal wordmark header, white
// body, optional detail card, optional CTA button, muted footer.

export const BRAND = "Σιντερέλλα";

export interface EmailPayload {
  subject?: string;
  body?: string;               // legacy plain text
  greeting?: string;
  heading?: string;
  intro?: string;
  rows?: { label?: string; value?: string }[];
  cta?: { label?: string; url?: string };
  note?: string;
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function renderHtml(p: EmailPayload): string {
  const heading = escapeHtml(p.heading ?? p.subject ?? BRAND);
  const greeting = p.greeting ? `<p style="margin:0 0 6px;font-size:15px;color:#14151a">${escapeHtml(p.greeting)}</p>` : "";
  const intro = p.intro ? `<p style="margin:0 0 18px;font-size:15px;line-height:1.55;color:#3a3b42">${escapeHtml(p.intro)}</p>` : "";

  const rows = (p.rows ?? []).filter((r) => r.label && r.value);
  const card = rows.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e7e8ee;border-radius:14px;overflow:hidden;margin:0 0 22px">
         ${rows.map((r, i) => `
           <tr style="${i ? "border-top:1px solid #f0f1f5" : ""}">
             <td style="padding:12px 16px;font-size:13px;color:#6b7280;font-weight:600;white-space:nowrap;vertical-align:top">${escapeHtml(r.label!)}</td>
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
        <tr><td style="background:linear-gradient(160deg,#1a1420 0%,#221a2c 50%,#2a1f35 100%);padding:26px 28px;text-align:center">
          <span style="font-family:'Segoe Script','Bradley Hand',cursive;font-size:30px;font-weight:700;color:#ffffff;letter-spacing:.5px">${BRAND}</span>
        </td></tr>
        <tr><td style="padding:28px">
          <h1 style="margin:0 0 14px;font-size:20px;font-weight:800;letter-spacing:-.3px;color:#14151a;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif">${heading}</h1>
          ${greeting}${intro}${legacyBody}${card}${cta}
        </td></tr>
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

export function renderText(p: EmailPayload): string {
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

// Send an email. Primary transport is Gmail SMTP (no domain needed — sends to
// any recipient using a Google App Password). Falls back to Resend's REST API
// if Gmail isn't configured. No-ops (ok:true, skipped) when neither is set.
//
// Gmail SMTP secrets: GMAIL_USER, GMAIL_APP_PASSWORD. EMAIL_FROM sets the
// display name/address (defaults to the Gmail address).
export async function sendEmail(to: string, subject: string, p: EmailPayload): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  const gmailUser = Deno.env.get("GMAIL_USER") ?? "";
  const gmailPass = (Deno.env.get("GMAIL_APP_PASSWORD") ?? "").replace(/\s+/g, "");
  const from = Deno.env.get("EMAIL_FROM") ?? (gmailUser ? `${BRAND} <${gmailUser}>` : `${BRAND} <onboarding@resend.dev>`);
  const html = renderHtml(p);
  const text = renderText(p);

  if (gmailUser && gmailPass) {
    try {
      const { SMTPClient } = await import("https://deno.land/x/denomailer@1.6.0/mod.ts");
      const client = new SMTPClient({
        connection: { hostname: "smtp.gmail.com", port: 465, tls: true, auth: { username: gmailUser, password: gmailPass } },
      });
      await client.send({ from, to, subject, content: text, html });
      await client.close();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: `gmail-smtp: ${(e as Error).message}` };
    }
  }

  // fallback: Resend REST API
  const key = Deno.env.get("RESEND_API_KEY") ?? "";
  if (!key) return { ok: true, skipped: true };
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, subject, text, html }),
  });
  if (!res.ok) return { ok: false, error: await res.text() };
  return { ok: true };
}
