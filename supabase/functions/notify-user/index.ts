// ============================================================================
// notify-user Edge Function — deliver a notification into ANOTHER user's row.
//
// RLS on public.notifications is own-row-only (auth.uid() = user_id), so a
// customer's browser can't write a "you got booked" alert into the agent's row.
// This function does it server-side with the service role.
//
// The caller MUST be signed in (valid Supabase JWT). We only allow inserting an
// AGENT-audience notification tied to a job the caller actually booked, so a
// user can't spam arbitrary people.
//
// POST { target_uid, notification: { id, audience, kind, title, body, read,
//        bookingId?, jobId?, createdAt } }
// ============================================================================
import { createClient } from "jsr:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

const VAPID_PUBLIC = Deno.env.get("VAPID_PUBLIC") ?? "";
const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE") ?? "";
if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails(Deno.env.get("VAPID_SUBJECT") ?? "mailto:support@cinderella.cy", VAPID_PUBLIC, VAPID_PRIVATE);
}

// Fire a Web Push to every saved subscription of a user (best-effort).
async function pushToUser(userId: string, title: string, body: string, url = "/") {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return;
  const { data: subs } = await admin.from("push_subscriptions").select("endpoint, p256dh, auth").eq("user_id", userId);
  if (!subs?.length) return;
  const payload = JSON.stringify({ title, body, url, tag: `${userId}-${Date.now()}` });
  const stale: string[] = [];
  await Promise.all(subs.map(async (s) => {
    try { await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload); }
    catch (e) { const c = (e as { statusCode?: number }).statusCode; if (c === 404 || c === 410) stale.push(s.endpoint); }
  }));
  if (stale.length) await admin.from("push_subscriptions").delete().in("endpoint", stale);
}

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  // require a signed-in caller
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return json({ error: "not authenticated" }, 401);
  const { data: userData, error: authErr } = await admin.auth.getUser(auth.slice(7));
  if (authErr || !userData.user) return json({ error: "not authenticated" }, 401);
  const callerId = userData.user.id;

  let body: { target_uid?: string; notification?: Record<string, unknown> };
  try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }
  const targetUid = String(body.target_uid ?? "");
  const n = body.notification;
  if (!targetUid || !n) return json({ error: "target_uid + notification required" }, 400);

  // guard: only allow delivering an AGENT-audience alert for a job the caller
  // actually booked (job.customer_uid = caller AND job.cleaner_uid = target).
  if (n.audience !== "agent" || !n.job_id) return json({ error: "only agent job alerts allowed" }, 403);
  const { data: job } = await admin.from("jobs").select("customer_uid, cleaner_uid")
    .eq("id", n.job_id).maybeSingle();
  if (!job || job.customer_uid !== callerId || job.cleaner_uid !== targetUid) {
    return json({ error: "not your job / target mismatch" }, 403);
  }

  const { error } = await admin.from("notifications").insert({
    id: n.id,
    user_id: targetUid,
    audience: n.audience,
    kind: n.kind,
    title: n.title,
    body: n.body,
    read: n.read ?? false,
    booking_id: n.booking_id ?? null,
    job_id: n.job_id ?? null,
    created_at: n.created_at ?? new Date().toISOString(),
  });
  if (error) return json({ error: error.message }, 500);

  // deliver a real push so the agent is alerted even with the app closed
  await pushToUser(targetUid, String(n.title ?? "Σιντερέλλα"), String(n.body ?? ""), "/agent/jobs");

  return json({ ok: true });
});
