# Notification Prefs + Booking Reminders + Account Row Sizing — Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use checkbox syntax.

**Goal:** (1) Let users control alert channels — a master **Email notifications** toggle beside the existing Push toggle in Settings. (2) Uniform row heights across the Account view. (3) Booking reminders: **agent 1h before**, **customer 2h before**, via email + push, respecting the prefs.

**Architecture:** Add an `email_notifications` boolean to `public.users` (default true) surfaced as a profile field + a Settings toggle. All email-sending edge functions check it before sending; push already has its own toggle (browser subscription) — a new `push_opt_out` is NOT needed since removing the subscription already stops push, but we add a stored `push_notifications` flag too so the toggle state persists and server push respects it. A new `booking-reminders` scheduled edge function (pg_cron every 15m, mirrors `review-reminders`) finds bookings/jobs due in the reminder window and alerts each side once (ledger-deduped). Account row heights normalised via a shared min-height on settings/agent rows.

**Tech Stack:** React + TS + Vite PWA, Supabase (Postgres + edge functions Deno + pg_cron). Project ref `cpudfwfepexswgmqdbnm`. SQL via Management API (node fetch, `NODE_TLS_REJECT_UNAUTHORIZED=0`, PAT in `supabase key.txt`). Functions deploy via `npx supabase functions deploy`.

**Verified facts:**
- Settings section: `src/screens/customer/Account.tsx` ~987+. Push toggle ~1011 (`togglePush`, `pushEnabled`, `pushBusy`). Email toggle goes right after the push block (~1037, before Appearance).
- Prefs plumbing: `src/lib/profile.ts` — `ProfileFields` (551), `UsersRow` (568), `rowToProfile` (589), `profileToRow` (613). Add `emailNotifications` + `pushNotifications` here.
- Store: `src/context/AppStore.tsx` — `pushEnabled` state 594; `writeProfile`/`patchAcct` persist profile; `disablePushNotifications` 2305, `requestPushPermission` 2296. Add `emailNotifications` getter + `setEmailNotifications`.
- Email transport: `supabase/functions/_shared/email.ts` `sendEmail(to, subject, payload)`. Callers: `send-email`, `welcome-email`, `review-reminders`, `notify-user` (push+email), plus new `booking-reminders`. Gate them on the recipient's `email_notifications`.
- Reminder cron pattern: `supabase/review_reminders_cron.sql` + `supabase/functions/review-reminders/index.ts` (service-role client, `pushToUser`, `sendEmail`, ledger claim-before-send). Booking reminders mirror this.
- Booking/job time: `bookings.date` (date) + `bookings.time` (text HH:MM); `jobs.date` + `jobs.time`; `jobs.cleaner_uid` = agent, `bookings.user_id` = customer. `push_subscriptions(endpoint,user_id,p256dh,auth)`.
- Account row classes: `.card row between` used for every settings/agent row; heights differ because trailing control varies (switch vs `.segmini` vs `.statuspill` vs plain text). Normalise with a min-height rule.
- Cyprus tz handling: reuse the `review-reminders` conservative offset approach (compute due instant from date+time).

---

## Task 1: DB — add notification-preference columns

**Files:** Create `supabase/notif_prefs.sql`

- [ ] **Step 1: SQL**

```sql
-- Per-user alert channel prefs. Default TRUE so existing users keep getting
-- alerts until they opt out. Apply to project cpudfwfepexswgmqdbnm.
alter table users add column if not exists email_notifications boolean not null default true;
alter table users add column if not exists push_notifications  boolean not null default true;
```

- [ ] **Step 2: Apply**

```bash
cd "C:/Users/schrysostomou/Desktop/App/cinderella-mvp"
NODE_TLS_REJECT_UNAUTHORIZED=0 node -e '
const fs=require("fs");const pat=fs.readFileSync("supabase key.txt","utf8").trim();
const sql=fs.readFileSync("supabase/notif_prefs.sql","utf8");
fetch("https://api.supabase.com/v1/projects/cpudfwfepexswgmqdbnm/database/query",{method:"POST",headers:{Authorization:"Bearer "+pat,"Content-Type":"application/json"},body:JSON.stringify({query:sql})}).then(async r=>{console.log("HTTP",r.status);console.log(await r.text());});
'
```
Expected HTTP 201.

- [ ] **Step 3: Verify columns exist** (information_schema query for both columns). Commit the .sql.

---

## Task 2: Profile plumbing — carry the two flags

**Files:** Modify `src/lib/profile.ts`

- [ ] **Step 1: Extend `ProfileFields`** — add after `autoMessageTemplate`:

```ts
  emailNotifications?: boolean; // master email alert channel (default on)
  pushNotifications?: boolean;  // master push alert channel (default on)
```

- [ ] **Step 2: Extend `UsersRow`** — add:

```ts
  email_notifications: boolean | null;
  push_notifications: boolean | null;
```

- [ ] **Step 3: `rowToProfile`** — add:

```ts
    emailNotifications: row.email_notifications ?? true,
    pushNotifications: row.push_notifications ?? true,
```

- [ ] **Step 4: `profileToRow`** — add:

```ts
  if (patch.emailNotifications !== undefined) out.email_notifications = patch.emailNotifications;
  if (patch.pushNotifications !== undefined) out.push_notifications = patch.pushNotifications;
```

- [ ] **Step 5:** `./node_modules/.bin/tsc --noEmit` → exit 0. Commit.

---

## Task 3: Store — expose + persist the email pref

**Files:** Modify `src/context/AppStore.tsx`

- [ ] **Step 1: Add to the store interface** (near `pushEnabled`, ~401):

```ts
  emailNotifications: boolean;
  setEmailNotifications: (on: boolean) => void;
```

- [ ] **Step 2: Implement in the returned store object** (near `pushEnabled,` ~2297):

```ts
    emailNotifications: acct.emailNotifications ?? true,
    setEmailNotifications: (on: boolean) => {
      patchAcct({ emailNotifications: on });
      writeProfile({ emailNotifications: on });
    },
```

- [ ] **Step 3:** confirm `AccountData` carries `emailNotifications` (it spreads ProfileFields). If `AccountData` is a distinct type that must list the field, add `emailNotifications?: boolean;` to it. Grep `interface AccountData`. Run tsc → exit 0. Commit.

---

## Task 4: Settings — Email notifications toggle + uniform row heights

**Files:** Modify `src/screens/customer/Account.tsx`, `src/theme.css`

- [ ] **Step 1: Destructure** `emailNotifications, setEmailNotifications` from `useStore()` in Account.

- [ ] **Step 2: Add the Email toggle** immediately after the push block's closing (after the iOS/denied notes, before Appearance ~1039). Insert:

```tsx
      <div className="card row between" style={{ marginTop: 12, cursor: "pointer" }}
        onClick={() => setEmailNotifications(!emailNotifications)}>
        <b style={{ fontSize: 14 }}>Email notifications</b>
        <div className={"switch" + (emailNotifications ? " on" : "")}><div className="switch__dot" /></div>
      </div>
```

- [ ] **Step 3: Uniform row heights.** Append to `src/theme.css`:

```css
/* Account rows: consistent height regardless of the trailing control
   (switch / segmini / pill / chevron / plain text). */
.card.row.between { min-height: 56px; box-sizing: border-box; }
/* keep the trailing segmented controls from inflating the row */
.card.row.between > .segmini { flex: 0 0 auto; }
```

- [ ] **Step 4:** tsc → exit 0. `pnpm dev`, open Account: Email + Push toggles both present and working; all setting/agent rows are the same height. Commit.

---

## Task 5: Gate outgoing email on the recipient pref

Email must not go out when the recipient turned Email off. Centralise the check.

**Files:** Modify `supabase/functions/_shared/email.ts`, and callers that email another user.

- [ ] **Step 1: Add a helper** in `_shared/email.ts`:

```ts
import { createClient } from "jsr:@supabase/supabase-js@2";
// Returns false when the user opted out of email. Best-effort: on any error we
// default to TRUE (don't silently swallow important mail on a transient issue).
export async function emailAllowed(admin: ReturnType<typeof createClient>, userId: string): Promise<boolean> {
  try {
    const { data } = await admin.from("users").select("email_notifications").eq("id", userId).maybeSingle();
    return data ? (data as { email_notifications?: boolean }).email_notifications !== false : true;
  } catch { return true; }
}
```

- [ ] **Step 2: `send-email`** (`supabase/functions/send-email/index.ts`): before the final `sendEmail(...)`, when emailing `target_uid`, check `emailAllowed(admin, target_uid)`; when self, check `emailAllowed(admin, callerId)`. If not allowed, return `json({ ok: true, skipped: true })` without sending.

- [ ] **Step 3: `notify-user`** (`supabase/functions/notify-user/index.ts`): it sends push (keep) — it does not email, so no change unless it also emails; if it does, gate that call.

- [ ] **Step 4: `review-reminders`**: before the `sendEmail(...)` call, wrap in `if (await emailAllowed(admin, b.user_id)) { ... }`. Push stays (push respects its own pref in Task 6).

- [ ] **Step 5:** Deploy the touched functions:

```bash
NODE_TLS_REJECT_UNAUTHORIZED=0 SUPABASE_ACCESS_TOKEN=$(tr -d '\r\n' < "supabase key.txt") \
  npx -y supabase@latest functions deploy send-email review-reminders --project-ref cpudfwfepexswgmqdbnm
```
(`send-email` keeps its JWT gate — do NOT pass `--no-verify-jwt` for it; `review-reminders` is cron-invoked so deploy it with `--no-verify-jwt` separately if needed.)
Commit.

---

## Task 6: Gate push on the pref (server helper)

**Files:** Modify `supabase/functions/notify-user/index.ts` + `review-reminders` `pushToUser`.

- [ ] **Step 1:** In each function's `pushToUser`, first read the user's `push_notifications`; return early when false:

```ts
async function pushToUser(userId: string, title: string, body: string, url = "/") {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return;
  const { data: pref } = await admin.from("users").select("push_notifications").eq("id", userId).maybeSingle();
  if (pref && (pref as { push_notifications?: boolean }).push_notifications === false) return;
  // ...existing subscription fetch + send...
}
```

- [ ] **Step 2:** Redeploy those functions. Commit.

---

## Task 7: booking-reminders edge function (agent 1h, customer 2h)

**Files:** Create `supabase/functions/booking-reminders/index.ts`, `supabase/booking_reminders.sql` (ledger), `supabase/booking_reminders_cron.sql`.

- [ ] **Step 1: Ledger SQL** (`supabase/booking_reminders.sql`):

```sql
-- One row per (booking, audience) reminder sent, so each fires at most once.
create table if not exists booking_reminders (
  id         uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings(id) on delete cascade,
  audience   text not null check (audience in ('customer','agent')),
  sent_at    timestamptz not null default now(),
  unique (booking_id, audience)
);
create index if not exists booking_reminders_booking_idx on booking_reminders (booking_id);
alter table booking_reminders enable row level security;
drop policy if exists "own booking reminders readable" on booking_reminders;
create policy "own booking reminders readable" on booking_reminders for select using (
  exists (select 1 from bookings b where b.id = booking_reminders.booking_id and b.user_id = auth.uid())
);
```
Apply via Management API (as Task 1 Step 2). Verify. Commit.

- [ ] **Step 2: Function** (`supabase/functions/booking-reminders/index.ts`) — mirror `review-reminders`. Full file:

```ts
// booking-reminders — remind each side before an upcoming cleaning.
//   agent    1h before   customer 2h before
// Runs on pg_cron every ~15m. Alerts via in-app notification + push + email,
// each respecting the recipient's prefs. Exactly-once per (booking, audience).
import { createClient } from "jsr:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";
import { json } from "../_shared/http.ts";
import { sendEmail, emailAllowed } from "../_shared/email.ts";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const VAPID_PUBLIC = Deno.env.get("VAPID_PUBLIC") ?? "";
const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE") ?? "";
if (VAPID_PUBLIC && VAPID_PRIVATE) webpush.setVapidDetails(Deno.env.get("VAPID_SUBJECT") ?? "mailto:support@cinderella.cy", VAPID_PUBLIC, VAPID_PRIVATE);
const SITE_URL = (Deno.env.get("SITE_URL") || "https://cinderella-mvp.vercel.app").replace(/\/+$/, "");
const CY_OFFSET_HOURS = 3; // conservative UTC+3 so we never fire early

// UTC ms for a booking's start (date + HH:MM local Cyprus).
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

  // upcoming, still-active bookings today or tomorrow (covers both windows)
  const { data: bookings, error } = await admin.from("bookings")
    .select("id, user_id, cleaner_name, cleaner_uid, address_nickname, date, time, status, job_id")
    .in("status", ["confirmed", "awaiting", "upcoming"])
    .in("date", [today, tomorrow]);
  if (error) return json({ error: error.message }, 500);
  if (!bookings?.length) return json({ ok: true, scanned: 0, sent: 0 });

  const ids = bookings.map((b) => b.id);
  const { data: already } = await admin.from("booking_reminders").select("booking_id, audience").in("booking_id", ids);
  const sent = new Set((already ?? []).map((r) => `${r.booking_id}:${r.audience}`));

  const emailCache = new Map<string, string>();
  async function emailFor(uid: string) {
    if (emailCache.has(uid)) return emailCache.get(uid)!;
    const { data } = await admin.auth.admin.getUserById(uid);
    const e = data.user?.email ?? ""; emailCache.set(uid, e); return e;
  }

  let count = 0;
  for (const b of bookings) {
    const start = startUtc(b.date, b.time);
    // window opens at (start - lead) and we only fire while start is still future
    const custDue = now >= start - 2 * 3600e3 && now < start;
    const agentDue = now >= start - 1 * 3600e3 && now < start;

    // ---- customer (2h) ----
    if (custDue && !sent.has(`${b.id}:customer`)) {
      const claim = await admin.from("booking_reminders").insert({ booking_id: b.id, audience: "customer" });
      if (!claim.error) {
        const title = "Your cleaning is coming up";
        const body = `${b.cleaner_name} arrives around ${b.time} today for ${b.address_nickname}.`;
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

    // ---- agent (1h) ----
    if (agentDue && b.cleaner_uid && !sent.has(`${b.id}:agent`)) {
      const claim = await admin.from("booking_reminders").insert({ booking_id: b.id, audience: "agent" });
      if (!claim.error) {
        const title = "Cleaning in 1 hour";
        const body = `You're due at ${b.address_nickname} around ${b.time} today.`;
        await admin.from("notifications").insert({ user_id: b.cleaner_uid, audience: "agent", kind: "booking_reminder", title, body, read: false, booking_id: b.id, job_id: b.job_id ?? null });
        await pushIfAllowed(b.cleaner_uid, title, body, "/agent/jobs");
        const to = await emailFor(b.cleaner_uid);
        if (to && await emailAllowed(admin, b.cleaner_uid)) {
          await sendEmail(to, title, { subject: title, heading: title, intro: body, rows: [
            { label: "Property", value: b.address_nickname }, { label: "Time", value: b.time }, { label: "Date", value: b.date } ] });
        }
        count++;
      }
    }
  }
  return json({ ok: true, scanned: bookings.length, sent: count });
});
```

- [ ] **Step 3: Add `booking_reminder` NotifKind** in `src/types.ts` (after `review_reminder`): `| "booking_reminder"`. (DB `notifications.kind` is free text — no DB change.) tsc → 0.

- [ ] **Step 4: Deploy** the function (cron-invoked, no user JWT):

```bash
NODE_TLS_REJECT_UNAUTHORIZED=0 SUPABASE_ACCESS_TOKEN=$(tr -d '\r\n' < "supabase key.txt") \
  npx -y supabase@latest functions deploy booking-reminders --project-ref cpudfwfepexswgmqdbnm --no-verify-jwt
```

- [ ] **Step 5: Smoke test** with the service-role bearer (from `vercel service role.txt`): expect `{"ok":true,...}`. Force a positive test by setting one booking to `date=today, time=<now+~1h55m CY>, status=confirmed`; invoke; confirm a customer `booking_reminders` row + notification; invoke again → no duplicate.

- [ ] **Step 6: Cron** (`supabase/booking_reminders_cron.sql`, mirror `review_reminders_cron.sql`, every 15m, real service-role bearer substituted at apply time, job name `booking-reminders-15min`). Apply + verify `cron.job`. Commit all.

---

## Task 8: End-to-end + deploy

- [ ] **Step 1:** tsc clean; `git push` (Vercel).
- [ ] **Step 2:** Verify: Settings shows Email + Push toggles, both persist across reload; turning Email off suppresses a subsequent review/booking email (invoke the function, confirm skipped); all Account rows equal height; booking-reminders fires customer at ~2h and agent at ~1h, once each, on all enabled channels.

## Self-Review
- Prefs default TRUE (no silent loss for existing users). Email checked server-side in every sender; push checked in `pushToUser`. `emailAllowed` fails-open on error (transactional mail like verification shouldn't vanish on a transient DB blip).
- Reminders exactly-once via `booking_reminders` unique (booking_id, audience) + claim-before-send. Fire only while start is still future; 15m cron with conservative +3h CY offset never fires early.
- Types consistent: `emailNotifications`/`pushNotifications` across profile↔row↔store; `booking_reminder` kind added once.
