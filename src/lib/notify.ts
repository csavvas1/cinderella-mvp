import type { AppNotification } from "../types";
import { supabase } from "./supabase";

// Deliver a notification into ANOTHER user's row (customer -> agent) via the
// notify-user Edge Function (service role bypasses the own-row RLS). Used to
// alert a real agent when a customer books them. Best-effort: failures are
// swallowed so a booking never breaks over a missed alert.
const FN_URL = `${String(import.meta.env.VITE_SUPABASE_URL || "").replace(/\/+$/, "")}/functions/v1/notify-user`;
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

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
