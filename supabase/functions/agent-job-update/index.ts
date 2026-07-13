// ============================================================================
// agent-job-update Edge Function — an AGENT acts on a job assigned to them
// (accept / decline / complete / cancel). The agent is NOT the job's customer,
// so under RLS (own-row) they can't update the job's customer-owned mirror rows.
// This runs with the service role after verifying the caller is the job's
// cleaner_uid, and:
//   1. updates the job status/timeline
//   2. updates the linked customer booking's status
//   3. inserts a customer-facing notification into the CUSTOMER's row
//
// POST {
//   jobId, jobCols, bookingId?, bookingCols?, notification?  // notification is
//   a full row payload (audience 'customer') for the customer's notifications
// }
// ============================================================================
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

  let body: {
    jobId?: string; jobCols?: Record<string, unknown>;
    bookingId?: string; bookingCols?: Record<string, unknown>;
    notification?: Record<string, unknown>;
  };
  try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }
  const { jobId, jobCols, bookingId, bookingCols, notification } = body;
  if (!jobId || !jobCols) return json({ error: "jobId + jobCols required" }, 400);

  // verify the caller is the job's assigned cleaner
  const { data: job } = await admin.from("jobs")
    .select("id, cleaner_uid, customer_uid, booking_id").eq("id", jobId).maybeSingle();
  if (!job) return json({ error: "job not found" }, 404);
  if (job.cleaner_uid !== callerId) return json({ error: "not your job" }, 403);

  // 1. job status/timeline
  const { error: jErr } = await admin.from("jobs").update(jobCols).eq("id", jobId);
  if (jErr) return json({ error: jErr.message }, 500);

  // 2. linked customer booking status (service role — bypasses the customer's RLS)
  if (bookingId && bookingCols && Object.keys(bookingCols).length) {
    await admin.from("bookings").update(bookingCols).eq("id", bookingId);
  }

  // 3. notify the customer (insert into THEIR notifications row)
  if (notification && job.customer_uid) {
    await admin.from("notifications").insert({
      ...notification,
      user_id: job.customer_uid,
      audience: "customer",
    });
  }

  return json({ ok: true });
});
