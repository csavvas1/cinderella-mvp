// ============================================================================
// send-push Edge Function — deliver a Web Push notification to all of a user's
// saved subscriptions. Called server-to-server (from notify-user /
// agent-job-update) and directly from the client for own-user notifications.
//
// POST { userId, title, body, url? }
//   -> { sent, failed }  |  { error }
//
// Auth: the caller must present a valid JWT (any signed-in user). We do NOT let
// a caller spoof arbitrary sends beyond providing a target userId — payloads are
// plain notification text, and subscriptions are looked up server-side with the
// service role. VAPID_PRIVATE / VAPID_PUBLIC are function secrets.
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
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:support@cinderella.cy";
if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
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
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return json({ error: "VAPID keys not configured" }, 500);

  // require a valid caller JWT (any signed-in user)
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return json({ error: "not authenticated" }, 401);
  const { data: userData, error: authErr } = await admin.auth.getUser(auth.slice(7));
  if (authErr || !userData.user) return json({ error: "not authenticated" }, 401);

  let userId = "", title = "", body = "", url = "/";
  try {
    const b = await req.json();
    userId = String(b.userId ?? "");
    title = String(b.title ?? "Σιντερέλλα");
    body = String(b.body ?? "");
    url = String(b.url ?? "/");
  } catch { return json({ error: "bad json" }, 400); }
  if (!userId) return json({ error: "userId required" }, 400);

  const { data: subs } = await admin.from("push_subscriptions")
    .select("endpoint, p256dh, auth").eq("user_id", userId);
  if (!subs || subs.length === 0) return json({ sent: 0, failed: 0 });

  const payload = JSON.stringify({ title, body, url, tag: `${userId}-${Date.now()}` });
  let sent = 0, failed = 0;
  const stale: string[] = [];

  await Promise.all(subs.map(async (s) => {
    const subscription = { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } };
    try {
      await webpush.sendNotification(subscription, payload);
      sent++;
    } catch (e) {
      failed++;
      // 404/410 = subscription gone; prune it
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) stale.push(s.endpoint);
    }
  }));

  if (stale.length) {
    await admin.from("push_subscriptions").delete().in("endpoint", stale);
  }

  return json({ sent, failed });
});
