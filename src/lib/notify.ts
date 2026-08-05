import type { AppNotification } from "../types";
import { supabase } from "./supabase";

// Deliver a notification into ANOTHER user's row (customer -> agent) via the
// notify-user Edge Function (service role bypasses the own-row RLS). Used to
// alert a real agent when a customer books them. Best-effort: failures are
// swallowed so a booking never breaks over a missed alert.
const FN_URL = `${String(import.meta.env.VITE_SUPABASE_URL || "").replace(/\/+$/, "")}/functions/v1/notify-user`;
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

const EMAIL_FN_URL = `${String(import.meta.env.VITE_SUPABASE_URL || "").replace(/\/+$/, "")}/functions/v1/send-email`;

// Structured, branded email payload rendered server-side by the send-email
// Edge Function. `body` is the legacy plain-text field (still supported).
export interface EmailPayload {
  subject: string;
  heading?: string;
  greeting?: string;
  intro?: string;
  rows?: { label: string; value: string }[];
  cta?: { label: string; url: string };
  note?: string;
  body?: string; // legacy plain-text fallback
}

// Send a branded transactional email to the SIGNED-IN user's own address via
// the send-email Edge Function (recipient derived server-side from the JWT).
// Accepts either a structured payload or a legacy (subject, body) pair.
// Best-effort: a missed email never breaks a booking. In dev/demo (no session)
// it just logs.
export async function sendEmailToSelf(payload: EmailPayload): Promise<void>;
export async function sendEmailToSelf(subject: string, body: string): Promise<void>;
export async function sendEmailToSelf(a: EmailPayload | string, b?: string): Promise<void> {
  const payload: EmailPayload = typeof a === "string" ? { subject: a, body: b ?? "" } : a;
  try {
    const { data: sess } = await supabase.auth.getSession();
    const token = sess.session?.access_token;
    if (!token) {
      // eslint-disable-next-line no-console
      console.info(`[email] ${payload.subject}\n${payload.heading ?? ""}\n${payload.intro ?? payload.body ?? ""}`);
      return;
    }
    await fetch(EMAIL_FN_URL, {
      method: "POST",
      headers: { "content-type": "application/json", apikey: ANON, authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    });
  } catch {
    /* best-effort: ignore delivery failures */
  }
}

// Send a branded email to ANOTHER user — only the agent (cleaner_uid) of a job
// the caller booked; the Edge Function enforces this guard server-side. Used to
// email the agent when they get a new job. Best-effort.
export async function sendEmailToUser(targetUid: string, jobId: string, payload: EmailPayload): Promise<void> {
  try {
    const { data: sess } = await supabase.auth.getSession();
    const token = sess.session?.access_token;
    if (!token) {
      // eslint-disable-next-line no-console
      console.info(`[email → ${targetUid}] ${payload.subject}`);
      return;
    }
    await fetch(EMAIL_FN_URL, {
      method: "POST",
      headers: { "content-type": "application/json", apikey: ANON, authorization: `Bearer ${token}` },
      body: JSON.stringify({ ...payload, target_uid: targetUid, job_id: jobId }),
    });
  } catch {
    /* best-effort: ignore delivery failures */
  }
}

const WELCOME_FN_URL = `${String(import.meta.env.VITE_SUPABASE_URL || "").replace(/\/+$/, "")}/functions/v1/welcome-email`;

// Send the branded welcome + verify-your-email message to the signed-in user.
// Used on signup and by the "Resend email" banner action. Returns ok/error so
// the banner can show feedback. Best-effort in dev/demo (no session).
export async function sendWelcomeEmail(name?: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const { data: sess } = await supabase.auth.getSession();
    const token = sess.session?.access_token;
    if (!token) return { ok: false, error: "no session" };
    const res = await fetch(WELCOME_FN_URL, {
      method: "POST",
      headers: { "content-type": "application/json", apikey: ANON, authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: name ?? "" }),
    });
    if (!res.ok) return { ok: false, error: await res.text() };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function notifyUser(targetUid: string, n: AppNotification): Promise<void> {
  try {
    const { data: sess } = await supabase.auth.getSession();
    const token = sess.session?.access_token;
    if (!token) return; // demo / not a real session — nothing to deliver
    await fetch(FN_URL, {
      method: "POST",
      headers: { "content-type": "application/json", apikey: ANON, authorization: `Bearer ${token}` },
      body: JSON.stringify({
        target_uid: targetUid,
        notification: {
          id: n.id, audience: n.audience, kind: n.kind, title: n.title, body: n.body,
          read: n.read, booking_id: n.bookingId ?? null, job_id: n.jobId ?? null,
          created_at: new Date(n.createdAt).toISOString(),
        },
      }),
    });
  } catch {
    /* best-effort: ignore delivery failures */
  }
}
