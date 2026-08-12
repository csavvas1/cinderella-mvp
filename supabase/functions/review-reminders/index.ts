// ============================================================================
// review-reminders — scheduled nudge for customers to review a completed
// cleaning. Runs on pg_cron every ~15 min (no request body).
//
// For each completed, still-unrated booking:
//   stage 1 (same-day)  fires once now >= <date> 18:00 Europe/Nicosia
//   stage 2 (+2 days)   fires once now >= <date + 2d> 18:00, and stage 1 sent
// Each (booking, stage) is written to review_reminders with a UNIQUE key, so a
// stage delivers exactly once. If the customer reviews first, rating is no
// longer NULL and no further stage fires.
//
// Delivery: in-app notification row + web push + branded email (best-effort).
// ============================================================================
import { createClient } from "jsr:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";
import { json } from "../_shared/http.ts";
import { sendEmail } from "../_shared/email.ts";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

const VAPID_PUBLIC = Deno.env.get("VAPID_PUBLIC") ?? "";
const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE") ?? "";
if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails(
    Deno.env.get("VAPID_SUBJECT") ?? "mailto:support@cinderella.cy",
    VAPID_PUBLIC, VAPID_PRIVATE,
  );
}

// Local reminder hour, in Cyprus time. 18:00 EET/EEST.
const REMINDER_HOUR = 18;
// Public app origin for deep links (set as a function secret). Falls back to the
// production domain. The review deep link opens the app straight on the booking's
// review sheet: <SITE_URL>/?review=<bookingId>.
const SITE_URL = (Deno.env.get("SITE_URL") || "https://cinderella-mvp.vercel.app").replace(/\/+$/, "");
// Cyprus is UTC+2 (winter) / UTC+3 (summer). Use +3 as the conservative offset
// so the nudge never fires before local 18:00 (worst case it lands ~1h late in
// winter, which is fine). Adjust here if exact DST handling is ever needed.
const CY_OFFSET_HOURS = 3;

// UTC instant of <dateISO> at local REMINDER_HOUR.
function dueAtUtc(dateISO: string, addDays: number): number {
  const [y, m, d] = dateISO.split("-").map(Number);
  // local 18:00 == UTC (18 - offset):00
  return Date.UTC(y, m - 1, d + addDays, REMINDER_HOUR - CY_OFFSET_HOURS, 0, 0);
}

async function pushToUser(userId: string, title: string, body: string, url = "/") {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return;
  const { data: subs } = await admin.from("push_subscriptions")
    .select("endpoint, p256dh, auth").eq("user_id", userId);
  if (!subs?.length) return;
  const payload = JSON.stringify({ title, body, url, tag: `rev-${userId}-${Date.now()}` });
  const stale: string[] = [];
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload);
    } catch (e) {
      const c = (e as { statusCode?: number }).statusCode;
      if (c === 404 || c === 410) stale.push(s.endpoint);
    }
  }));
  if (stale.length) await admin.from("push_subscriptions").delete().in("endpoint", stale);
}

Deno.serve(async (_req) => {
  const now = Date.now();
  // Look back 30 days — long enough to cover both stages, bounded so the scan
  // stays cheap. Only completed + unrated bookings are candidates.
  const since = new Date(now - 30 * 864e5).toISOString().slice(0, 10);

  const { data: bookings, error } = await admin
    .from("bookings")
    .select("id, user_id, cleaner_name, address_nickname, date, status, rating, job_id")
    .eq("status", "completed")
    .is("rating", null)
    .gte("date", since);
  if (error) return json({ error: error.message }, 500);
  if (!bookings?.length) return json({ ok: true, scanned: 0, sent: 0 });

  // Which (booking, stage) reminders already went out?
  const ids = bookings.map((b) => b.id);
  const { data: already } = await admin
    .from("review_reminders").select("booking_id, stage").in("booking_id", ids);
  const sentKey = new Set((already ?? []).map((r) => `${r.booking_id}:${r.stage}`));

  // recipient emails, resolved once per user
  const emailCache = new Map<string, string>();
  async function emailFor(uid: string): Promise<string> {
    if (emailCache.has(uid)) return emailCache.get(uid)!;
    const { data } = await admin.auth.admin.getUserById(uid);
    const e = data.user?.email ?? "";
    emailCache.set(uid, e);
    return e;
  }

  let sent = 0;
  for (const b of bookings) {
    // stage 2 requires stage 1 already sent; stage 1 must not repeat.
    const s1Sent = sentKey.has(`${b.id}:1`);
    const s2Sent = sentKey.has(`${b.id}:2`);

    let stage: 1 | 2 | 0 = 0;
    if (!s1Sent && now >= dueAtUtc(b.date, 0)) stage = 1;
    else if (s1Sent && !s2Sent && now >= dueAtUtc(b.date, 2)) stage = 2;
    if (stage === 0) continue;

    // Claim the (booking, stage) slot FIRST. If a concurrent run already did,
    // the unique key rejects it and we skip delivery — no duplicates.
    const claim = await admin.from("review_reminders")
      .insert({ booking_id: b.id, stage });
    if (claim.error) {
      // 23505 = unique_violation → someone else took it; skip quietly.
      continue;
    }

    const title = stage === 1 ? "How was your cleaning?" : "A quick reminder";
    const body = stage === 1
      ? `Rate ${b.cleaner_name} for ${b.address_nickname} (${b.date}) — it takes 10 seconds.`
      : `${b.cleaner_name} would love your feedback for ${b.address_nickname}. Leave a quick review?`;

    // 1) in-app notification (customer audience)
    await admin.from("notifications").insert({
      user_id: b.user_id,
      audience: "customer",
      kind: "review_reminder",
      title, body,
      read: false,
      booking_id: b.id,
      job_id: b.job_id ?? null,
    });

    // deep link straight to this booking's review sheet in the app
    const reviewUrl = `${SITE_URL}/?review=${b.id}`;

    // 2) web push (best-effort) — tapping opens the review sheet
    await pushToUser(b.user_id, title, body, `/?review=${b.id}`);

    // 3) branded email (best-effort) with a "Leave a review" CTA button
    const to = await emailFor(b.user_id);
    if (to) {
      await sendEmail(to, title, {
        subject: title,
        heading: title,
        intro: body,
        rows: [
          { label: "Cleaner", value: b.cleaner_name },
          { label: "Property", value: b.address_nickname },
          { label: "Date", value: b.date },
        ],
        cta: { label: `Review ${b.cleaner_name}`, url: reviewUrl },
      });
    }

    sent++;
  }

  return json({ ok: true, scanned: bookings.length, sent });
});
