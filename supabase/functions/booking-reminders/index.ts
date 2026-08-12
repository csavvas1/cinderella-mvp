// booking-reminders — remind each side before an upcoming cleaning.
//   agent    1h before   customer 2h before
// Runs on pg_cron every ~15m. Alerts via in-app notification + push + email,
// each respecting the recipient's prefs. Exactly-once per (booking, audience).
//
// The agent's account uid is NOT on the booking (bookings.cleaner_id is text);
// it lives on the linked job (jobs.cleaner_uid) via bookings.job_id.
import { createClient } from "jsr:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";
import { json } from "../_shared/http.ts";
import { sendEmail, emailAllowed } from "../_shared/email.ts";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const VAPID_PUBLIC = Deno.env.get("VAPID_PUBLIC") ?? "";
const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE") ?? "";
if (VAPID_PUBLIC && VAPID_PRIVATE) webpush.setVapidDetails(Deno.env.get("VAPID_SUBJECT") ?? "mailto:support@cinderella.cy", VAPID_PUBLIC, VAPID_PRIVATE);
const CY_OFFSET_HOURS = 3; // conservative UTC+3 so we never fire early

// UTC ms for a booking's start (date + HH:MM, Cyprus local).
function startUtc(dateISO: string, time: string): number {
  const [y, m, d] = dateISO.split("-").map(Number);
  const [hh, mm] = (time || "00:00").split(":").map(Number);
  return Date.UTC(y, m - 1, d, (hh || 0) - CY_OFFSET_HOURS, mm || 0, 0);
}

async function pushIfAllowed(userId: string, title: string, body: string, url: string) {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return;
  const { data: pref } = await admin.from("users").select("push_notifications").eq("id", userId).maybeSingle();
  if (pref && (pref as { push_notifications?: boolean }).push_notifications === false) return;
  const { data: subs } = await admin.from("push_subscriptions").select("endpoint,p256dh,auth").eq("user_id", userId);
  if (!subs?.length) return;
  const payload = JSON.stringify({ title, body, url, tag: `bk-${userId}-${Date.now()}` });
  const stale: string[] = [];
  await Promise.all(subs.map(async (s) => {
    try { await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload); }
    catch (e) { const c = (e as { statusCode?: number }).statusCode; if (c === 404 || c === 410) stale.push(s.endpoint); }
  }));
  if (stale.length) await admin.from("push_subscriptions").delete().in("endpoint", stale);
}

Deno.serve(async (_req) => {
  const now = Date.now();
  const today = new Date(now).toISOString().slice(0, 10);
  const tomorrow = new Date(now + 864e5).toISOString().slice(0, 10);

  const { data: bookings, error } = await admin.from("bookings")
    .select("id, user_id, cleaner_name, address_nickname, date, time, status, job_id")
    .in("status", ["confirmed", "awaiting", "upcoming"])
    .in("date", [today, tomorrow]);
  if (error) return json({ error: error.message }, 500);
  if (!bookings?.length) return json({ ok: true, scanned: 0, sent: 0 });

  const ids = bookings.map((b) => b.id);
  const { data: already } = await admin.from("booking_reminders").select("booking_id, audience").in("booking_id", ids);
  const sent = new Set((already ?? []).map((r) => `${r.booking_id}:${r.audience}`));

  // resolve agent uid per booking via its linked job (jobs.cleaner_uid)
  const jobIds = bookings.map((b) => b.job_id).filter(Boolean) as string[];
  const agentByJob = new Map<string, string>();
  if (jobIds.length) {
    const { data: jobs } = await admin.from("jobs").select("id, cleaner_uid").in("id", jobIds);
    for (const j of jobs ?? []) if (j.cleaner_uid) agentByJob.set(j.id, j.cleaner_uid);
  }

  const emailCache = new Map<string, string>();
  async function emailFor(uid: string) {
    if (emailCache.has(uid)) return emailCache.get(uid)!;
    const { data } = await admin.auth.admin.getUserById(uid);
    const e = data.user?.email ?? ""; emailCache.set(uid, e); return e;
  }

  let count = 0;
  for (const b of bookings) {
    const start = startUtc(b.date, b.time);
    const custDue = now >= start - 2 * 3600e3 && now < start;
    const agentDue = now >= start - 1 * 3600e3 && now < start;

    // ---- customer (2h before) ----
    if (custDue && !sent.has(`${b.id}:customer`)) {
      const claim = await admin.from("booking_reminders").insert({ booking_id: b.id, audience: "customer" });
      if (!claim.error) {
        const title = "Your cleaning is coming up";
        const body = `${b.cleaner_name} arrives around ${b.time} for ${b.address_nickname}.`;
        await admin.from("notifications").insert({ user_id: b.user_id, audience: "customer", kind: "booking_reminder", title, body, read: false, booking_id: b.id, job_id: b.job_id ?? null });
        await pushIfAllowed(b.user_id, title, body, "/bookings");
        const to = await emailFor(b.user_id);
        if (to && await emailAllowed(admin, b.user_id)) {
          await sendEmail(to, title, { subject: title, heading: title, intro: body, rows: [
            { label: "Cleaner", value: b.cleaner_name }, { label: "Property", value: b.address_nickname },
            { label: "Time", value: b.time }, { label: "Date", value: b.date } ] });
        }
        count++;
      }
    }

    // ---- agent (1h before) ----
    const agentUid = b.job_id ? agentByJob.get(b.job_id) : undefined;
    if (agentDue && agentUid && !sent.has(`${b.id}:agent`)) {
      const claim = await admin.from("booking_reminders").insert({ booking_id: b.id, audience: "agent" });
      if (!claim.error) {
        const title = "Cleaning in 1 hour";
        const body = `You're due at ${b.address_nickname} around ${b.time}.`;
        await admin.from("notifications").insert({ user_id: agentUid, audience: "agent", kind: "booking_reminder", title, body, read: false, booking_id: b.id, job_id: b.job_id ?? null });
        await pushIfAllowed(agentUid, title, body, "/agent/jobs");
        const to = await emailFor(agentUid);
        if (to && await emailAllowed(admin, agentUid)) {
          await sendEmail(to, title, { subject: title, heading: title, intro: body, rows: [
            { label: "Property", value: b.address_nickname }, { label: "Time", value: b.time }, { label: "Date", value: b.date } ] });
        }
        count++;
      }
    }
  }
  return json({ ok: true, scanned: bookings.length, sent: count });
});
