import { createClient } from "jsr:@supabase/supabase-js@2";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

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
  return json({ ok: true });
});
