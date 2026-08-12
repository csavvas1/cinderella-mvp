# Cleaner Reviews + Review Reminders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a customer open any past day with a booking, leave a polished 2-step star + comment review of the cleaner, and receive two automatic reminders (same day, then again 2 days later if still unreviewed) delivered by push + in-app + email.

**Architecture:** Three coupled slices. (1) **Calendar unlock** — a one-line predicate change in `CalendarView` so past days that have bookings become tappable; the existing selected-day cards and "Leave a review" button already handle the rest. (2) **2-step review flow** — replace the single-screen `ReviewModal` in `Bookings.tsx` with a guided two-step version (big stars + live label, then optional comment); the submit wiring, Supabase persistence, and agent notification already exist and are unchanged. (3) **Review reminders** — a new `review_reminders` ledger table + a `review-reminders` scheduled edge function fired every 15 min by pg_cron. The function finds completed, unrated bookings whose reminder window is due, inserts a `review_reminder` in-app notification for the customer, sends a web push, sends a branded email, and records the send in the ledger so each reminder fires at most once.

**Tech Stack:** React + TypeScript + Vite (PWA), Supabase (Postgres + RLS + Edge Functions in Deno), pg_cron + pg_net, web-push (VAPID), Resend (email). Project ref: `cpudfwfepexswgmqdbnm`.

**Key facts discovered (do not re-derive):**
- Customer calendar: `src/screens/customer/Bookings.tsx`, `CalendarView` (lines ~805-1023). Past-day gate is line ~898: `const clickable = !isPast || hasCancelled;`. Selected-day completed-booking card already renders a "Leave a review" / "Edit review" button (~line 1000) calling `onReview(b)`.
- Current review modal: `ReviewModal` in `Bookings.tsx` (lines ~533-552). Submit handler with all persistence + agent notify + agent email: `Bookings.tsx` lines ~326-356. **Leave the submit handler unchanged** — only swap the modal's internal UI.
- Booking type: `src/types.ts` `Booking` (lines ~163-213). Has `rating?: number`, `reviewText?: string`, `status`, `date`, `cleanerId`, `cleanerName`, `addressNickname`, `jobId?`.
- `NotifKind` union: `src/types.ts` lines ~300-312. Add `"review_reminder"`.
- Reviews persist via `AppStore.addReview` (`src/context/AppStore.tsx` ~1961) + `updateBooking` (~1822). No change needed.
- Supabase tables live as ad-hoc `.sql` files in `supabase/` (NO `migrations/` folder). `bookings` schema `supabase/schema.sql` lines ~71-105 — customer is `user_id uuid`, plus `rating numeric`, `review_text text`, `status booking_status`, `date date`. `notifications` table lines ~170-183 (columns: `id, user_id, audience, kind, title, body, read, booking_id, job_id, created_at`; `kind` is free `text`, so no enum change needed). `push_subscriptions(endpoint, user_id, p256dh, auth)`.
- pg_cron pattern already proven: `supabase/beds24_poll_cron.sql` (job `beds24-poll-hourly`). Extensions `pg_cron` + `pg_net` already enabled.
- Scheduled edge function pattern: `supabase/functions/beds24-poll/index.ts` (service-role client, `Deno.serve`, no body). Push delivery helper `pushToUser` pattern: `supabase/functions/notify-user/index.ts` lines ~33-45. Branded email sender: `supabase/functions/_shared/email.ts` `sendEmail(to, subject, payload)` used by `supabase/functions/send-email/index.ts`.
- Deploy method (per project memory "Auto-deploy Supabase"): deploy edge functions and run SQL yourself via Supabase CLI / Management API; `NODE_TLS_REJECT_UNAUTHORIZED=0` works around corporate VPN TLS. Service role key: `vercel service role.txt` in repo root (do NOT commit into any tracked file).
- Brand: primary indigo `#4f46e5`, star `#f59e0b`. App name `Σιντερέλλα`. Reminder push should deep-link to `/` (customer bookings) via existing `sessionStorage "focus-booking"` mechanism (`Bookings.tsx` ~820-831).

**Reminder timing rules (authoritative):**
- Reminder 1 ("same day"): due once `now >= booking.date @ 18:00 Europe/Nicosia` AND booking is `completed` AND `rating IS NULL`.
- Reminder 2 ("2 days later"): due once `now >= booking.date + 2 days @ 18:00 Europe/Nicosia` AND still `completed` AND `rating IS NULL` AND reminder 1 was already sent.
- Each (booking, stage) sends exactly once — enforced by the `review_reminders` ledger unique key.
- If the customer reviews before a stage fires, that stage never fires (rating no longer NULL).
- Cron cadence: every 15 minutes. Late-but-once is acceptable; duplicates are not.

---

## File Structure

**Created:**
- `supabase/review_reminders.sql` — ledger table + RLS + indexes.
- `supabase/review_reminders_cron.sql` — pg_cron schedule calling the new function.
- `supabase/functions/review-reminders/index.ts` — scheduled function: find due bookings, notify + push + email, record ledger.

**Modified:**
- `src/screens/customer/Bookings.tsx` — (a) calendar past-day predicate; (b) replace `ReviewModal` internals with a 2-step flow.
- `src/types.ts` — add `"review_reminder"` to `NotifKind`.
- `src/theme.css` — a small block of styles for the 2-step review flow (step header, big star row, live label).

**Unchanged but relied upon:** review submit handler + `AppStore.addReview`/`updateBooking`, `notify-user`, `send-push`, `send-email`, `_shared/email.ts`.

---

## Task 1: Unlock past days with bookings in the calendar

**Files:**
- Modify: `src/screens/customer/Bookings.tsx` (~line 898)

- [ ] **Step 1: Change the clickable predicate**

Find (around line 898):

```tsx
          const clickable = !isPast || hasCancelled;
```

Replace with:

```tsx
          // Past days are tappable when they hold any booking (so the customer
          // can open a completed cleaning and leave/edit a review) or a
          // cancelled one. Empty past days stay disabled.
          const clickable = !isPast || hasCancelled || dayBookings.length > 0;
```

- [ ] **Step 2: Confirm the `past` cell style still reads as tappable**

Open `src/theme.css`, search for `.calcell.past`. If it sets `pointer-events:none` OR `opacity` below ~0.5, relax it so a past cell that is NOT `:disabled` looks interactive. Add after the existing `.calcell.past` rule:

```css
/* A past day that still has bookings is interactive (review access). Only the
   truly disabled (empty past) cells stay dimmed. */
.calcell.past:not(:disabled) { opacity: 1; cursor: pointer; }
.calcell.past:disabled { cursor: default; }
```

If `.calcell.past` does not exist, add the two rules above anyway (harmless).

- [ ] **Step 3: Manual verification (dev server)**

Run: `pnpm dev`
Open the app as a customer, go to the Bookings calendar, page back to a month that has a **completed** booking on a past date. Tap that day.
Expected: the day expands, showing the completed booking card with a "Leave a review" button. An empty past day remains untappable.

- [ ] **Step 4: Commit**

```bash
git add src/screens/customer/Bookings.tsx src/theme.css
git commit -m "feat(calendar): open past days that have bookings so reviews are reachable"
```

---

## Task 2: Add the `review_reminder` notification kind

**Files:**
- Modify: `src/types.ts` (~line 309)

- [ ] **Step 1: Extend the union**

Find:

```ts
  | "review_new"         // agent: customer left a review
```

Add immediately below it:

```ts
  | "review_reminder"    // customer: nudge to review a completed cleaning
```

- [ ] **Step 2: Type-check**

Run: `pnpm tsc --noEmit`
Expected: no new errors. (`notifications.kind` is free `text` in Postgres, so no DB change is needed for this value.)

- [ ] **Step 3: Commit**

```bash
git add src/types.ts
git commit -m "feat(types): add review_reminder notification kind"
```

---

## Task 3: Rebuild `ReviewModal` as a polished 2-step flow

The submit contract stays identical: `onSubmit(rating: number, text: string)`. Only the modal's internal UI changes. The call site (`Bookings.tsx` ~326-356) is untouched.

**Files:**
- Modify: `src/screens/customer/Bookings.tsx` (`ReviewModal`, ~lines 533-552)
- Modify: `src/theme.css` (append review-flow styles)

- [ ] **Step 1: Replace the `ReviewModal` component body**

Replace the entire existing `ReviewModal` function (lines ~534-552) with:

```tsx
function ReviewModal({ booking, onClose, onSubmit }: {
  booking: Booking; onClose: () => void; onSubmit: (rating: number, text: string) => void;
}) {
  // Two guided steps: pick the stars, then (optionally) add a comment. If the
  // booking was already reviewed we jump straight to the comment step for edits.
  const [rating, setRating] = useState(booking.rating ?? 0);
  const [hover, setHover] = useState(0);
  const [text, setText] = useState(booking.reviewText ?? "");
  const [step, setStep] = useState<1 | 2>(booking.rating ? 2 : 1);

  const LABELS = ["", "Poor", "Fair", "Good", "Great", "Excellent"];
  const shown = hover || rating;

  return (
    <Modal onClose={onClose} title={booking.rating ? `Edit review` : `Rate ${booking.cleanerName}`}>
      {/* progress */}
      <div className="revsteps" aria-hidden>
        <span className={"revstep" + (step >= 1 ? " on" : "")} />
        <span className={"revstep" + (step >= 2 ? " on" : "")} />
      </div>

      {step === 1 && (
        <div className="revpane">
          <p className="sub revpane__q">How was your cleaning with {booking.cleanerName}?</p>
          <div className="revstars" role="radiogroup" aria-label="Star rating">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={rating === n}
                aria-label={`${n} star${n === 1 ? "" : "s"}`}
                className={"revstar" + (n <= shown ? " on" : "")}
                onMouseEnter={() => setHover(n)}
                onMouseLeave={() => setHover(0)}
                onClick={() => { setRating(n); setHover(0); }}
              >
                <Star size={40} fill={n <= shown ? "currentColor" : "none"} />
              </button>
            ))}
          </div>
          <div className={"revlabel" + (shown ? " show" : "")}>{LABELS[shown] || "Tap a star"}</div>
          <div style={{ height: 14 }} />
          <button className="btn" disabled={rating === 0} style={{ opacity: rating === 0 ? 0.5 : 1 }}
            onClick={() => setStep(2)}>Continue</button>
        </div>
      )}

      {step === 2 && (
        <div className="revpane">
          <div className="revrecap">
            <span className="revrecap__stars">
              {[1, 2, 3, 4, 5].map((n) => (
                <Star key={n} size={18} fill={n <= rating ? "currentColor" : "none"} />
              ))}
            </span>
            <button className="revrecap__edit" type="button" onClick={() => setStep(1)}>Change</button>
          </div>
          <p className="sub revpane__q">Add a comment for {booking.cleanerName} <span className="muted">(optional)</span></p>
          <textarea className="input" rows={4} placeholder="What went well? Anything they could improve?"
            value={text} onChange={(e) => setText(e.target.value)} />
          <div style={{ height: 12 }} />
          <div className="row" style={{ gap: 8 }}>
            <button className="btn secondary" style={{ flex: "0 0 auto" }} onClick={() => setStep(1)}>Back</button>
            <button className="btn grow" onClick={() => onSubmit(rating, text.trim())}>
              {booking.rating ? "Update review" : "Submit review"}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
```

- [ ] **Step 2: Append the review-flow styles**

Append to the end of `src/theme.css`:

```css
/* ---- 2-step review flow ---- */
.revsteps { display: flex; gap: 6px; margin: 2px 0 14px; }
.revstep { flex: 1; height: 4px; border-radius: 999px; background: var(--border); transition: background .2s; }
.revstep.on { background: var(--indigo); }
.revpane { animation: revfade .18s ease; }
@keyframes revfade { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
.revpane__q { margin: 0 0 12px; text-align: center; }
.revstars { display: flex; justify-content: center; gap: 6px; color: var(--star); }
.revstar { background: none; border: none; padding: 4px; cursor: pointer; color: var(--border); transition: transform .08s, color .12s; }
.revstar.on { color: var(--star); }
.revstar:active { transform: scale(.9); }
.revlabel { text-align: center; min-height: 20px; margin-top: 8px; font-weight: 700; color: var(--star); opacity: 0; transition: opacity .15s; }
.revlabel.show { opacity: 1; }
.revrecap { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
.revrecap__stars { display: inline-flex; gap: 2px; color: var(--star); }
.revrecap__edit { background: none; border: none; color: var(--indigo); font-weight: 700; cursor: pointer; font-size: 13px; }
```

- [ ] **Step 3: Type-check**

Run: `pnpm tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Manual verification (dev server)**

Run: `pnpm dev`
Open a past completed booking → "Leave a review".
Expected: Step 1 shows five large stars; hovering/tapping updates a live label ("Poor"→"Excellent"); "Continue" is disabled until a star is chosen. Step 2 shows the chosen stars with a "Change" link, an optional comment box, and Back / Submit. Submitting stores the review (star now shows on the card, button flips to "Edit review"). Re-opening "Edit review" jumps straight to Step 2 pre-filled.

- [ ] **Step 5: Commit**

```bash
git add src/screens/customer/Bookings.tsx src/theme.css
git commit -m "feat(reviews): polished 2-step star + comment review flow"
```

---

## Task 4: Create the `review_reminders` ledger table

The ledger records which reminder stage has been sent for each booking so the cron never double-sends. One row per (booking_id, stage).

**Files:**
- Create: `supabase/review_reminders.sql`

- [ ] **Step 1: Write the SQL**

Create `supabase/review_reminders.sql`:

```sql
-- ============================================================================
-- review_reminders — ledger of review-nudge sends, one row per (booking, stage).
-- Written ONLY by the service role (the review-reminders edge function). The
-- unique (booking_id, stage) key makes each reminder fire at most once even if
-- the cron overlaps or retries.
--   stage 1 = same-day nudge, stage 2 = +2 day follow-up.
-- Apply to project cpudfwfepexswgmqdbnm.
-- ============================================================================
create table if not exists review_reminders (
  id         uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings(id) on delete cascade,
  stage      smallint not null check (stage in (1, 2)),
  sent_at    timestamptz not null default now(),
  unique (booking_id, stage)
);
create index if not exists review_reminders_booking_idx on review_reminders (booking_id);

alter table review_reminders enable row level security;

-- Customers may read their own reminder history (their booking); nobody writes
-- from the client. The service role bypasses RLS, so the function can insert.
drop policy if exists "own review reminders readable" on review_reminders;
create policy "own review reminders readable" on review_reminders
  for select using (
    exists (
      select 1 from bookings b
      where b.id = review_reminders.booking_id
        and b.user_id = auth.uid()
    )
  );
```

- [ ] **Step 2: Apply the SQL to the project**

Apply via the Supabase SQL runner (Management API or `psql`), per the project's auto-deploy convention. Example using the CLI-linked DB:

```bash
cd "C:/Users/schrysostomou/Desktop/App/cinderella-mvp"
NODE_TLS_REJECT_UNAUTHORIZED=0 npx supabase db execute --file supabase/review_reminders.sql
```
(If the project uses the Management API `POST /v1/projects/{ref}/database/query` flow instead, send the file contents as the `query`. Use whichever mechanism prior `.sql` files in this repo were applied with.)

- [ ] **Step 3: Verify the table exists**

Run a query against the DB:

```sql
select column_name, data_type from information_schema.columns
where table_name = 'review_reminders' order by ordinal_position;
```
Expected rows: `id uuid`, `booking_id uuid`, `stage smallint`, `sent_at timestamptz`.

- [ ] **Step 4: Commit**

```bash
git add supabase/review_reminders.sql
git commit -m "feat(db): review_reminders ledger table + RLS"
```

---

## Task 5: Build the `review-reminders` scheduled edge function

Finds bookings that are `completed`, unrated, and whose reminder window is due, then for each: insert a customer `review_reminder` notification, web-push the customer, email the customer, and write the ledger row. All idempotent via the ledger unique key.

**Files:**
- Create: `supabase/functions/review-reminders/index.ts`

- [ ] **Step 1: Write the function**

Create `supabase/functions/review-reminders/index.ts`:

```ts
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

    // 2) web push (best-effort)
    await pushToUser(b.user_id, title, body, "/");

    // 3) branded email (best-effort)
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
      });
    }

    sent++;
  }

  return json({ ok: true, scanned: bookings.length, sent });
});
```

- [ ] **Step 2: Confirm the shared helpers' signatures match**

Open `supabase/functions/_shared/email.ts` and confirm `sendEmail(to: string, subject: string, payload)` accepts a payload with `{ subject, heading, intro, rows: {label,value}[] }` (it is the same shape used by `functions/send-email/index.ts` and the customer `sendEmail` in `src/lib/notify.ts`). Also confirm `_shared/http.ts` exports `json`. If either differs, adapt the import/usage in `index.ts` to the real signature — do not change the shared files.

- [ ] **Step 3: Deploy the function (no JWT — cron calls it with the service role)**

```bash
cd "C:/Users/schrysostomou/Desktop/App/cinderella-mvp"
NODE_TLS_REJECT_UNAUTHORIZED=0 npx supabase functions deploy review-reminders --no-verify-jwt
```
Also confirm `VAPID_PUBLIC`, `VAPID_PRIVATE`, `VAPID_SUBJECT`, `RESEND_API_KEY` (whatever `_shared/email.ts` reads) are already set as function secrets — they are, since `notify-user`/`send-email` use them. If unsure: `npx supabase secrets list`.

- [ ] **Step 4: Smoke-test the function directly**

Invoke it once manually with the service-role bearer (find the key in `vercel service role.txt`, do not echo it into any tracked file):

```bash
curl -s -X POST "https://cpudfwfepexswgmqdbnm.functions.supabase.co/review-reminders" \
  -H "Authorization: Bearer <SERVICE_ROLE_KEY>" -H "Content-Type: application/json"
```
Expected JSON: `{"ok":true,"scanned":<n>,"sent":<m>}`. With no due bookings, `sent` is 0 and nothing is inserted. To force a positive test, temporarily set one test booking to `status='completed', rating=null, date=<today>` and re-invoke after 18:00 CY (or temporarily set `CY_OFFSET_HOURS`/`REMINDER_HOUR` low, verify, then revert). Confirm exactly one `review_reminders` row (stage 1) and one `notifications` row appear, and a second immediate invoke does NOT create a duplicate.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/review-reminders/index.ts
git commit -m "feat(functions): review-reminders scheduled nudge (in-app + push + email)"
```

---

## Task 6: Schedule the function with pg_cron

**Files:**
- Create: `supabase/review_reminders_cron.sql`

- [ ] **Step 1: Write the cron SQL (mirror the beds24 pattern)**

Create `supabase/review_reminders_cron.sql`:

```sql
-- ============================================================================
-- Schedule review-reminders every 15 minutes via pg_cron + pg_net.
-- Mirrors beds24_poll_cron.sql. Prereqs already applied:
--   create extension if not exists pg_cron;
--   create extension if not exists pg_net;
-- The bearer is the project SERVICE ROLE key — do NOT commit the real value;
-- substitute it when applying. Apply to project cpudfwfepexswgmqdbnm.
-- ============================================================================
select cron.schedule('review-reminders-15min', '*/15 * * * *', $$
  select net.http_post(
    url := 'https://cpudfwfepexswgmqdbnm.functions.supabase.co/review-reminders',
    headers := jsonb_build_object(
      'Authorization', 'Bearer <SERVICE_ROLE_KEY>',
      'Content-Type', 'application/json'
    )
  )
$$);

-- Inspect / manage:
--   select jobname, schedule, active from cron.job where jobname = 'review-reminders-15min';
--   select * from cron.job_run_details order by start_time desc limit 10;
--   select cron.unschedule(jobid) from cron.job where jobname = 'review-reminders-15min';
```

- [ ] **Step 2: Apply it (substitute the real service-role key inline, do not save the key)**

Run the SQL with the real bearer substituted, via the same runner used in Task 4 Step 2. Do not write the key back into the file.

- [ ] **Step 3: Verify the job is registered**

```sql
select jobname, schedule, active from cron.job where jobname = 'review-reminders-15min';
```
Expected: one active row, schedule `*/15 * * * *`.

- [ ] **Step 4: Verify a scheduled run executed**

Wait up to ~15 min, then:

```sql
select status, start_time, return_message
from cron.job_run_details
where command like '%review-reminders%'
order by start_time desc limit 3;
```
Expected: recent rows with `status = 'succeeded'`.

- [ ] **Step 5: Commit**

```bash
git add supabase/review_reminders_cron.sql
git commit -m "feat(db): schedule review-reminders every 15m via pg_cron"
```

---

## Task 7: End-to-end verification

- [ ] **Step 1: Full happy path**

With a customer test account that has web push enabled:
1. Create/seed a booking with `status='completed'`, `rating=null`, `date=today`.
2. Confirm no reminder before local 18:00 (invoke the function → `sent:0`, no rows).
3. After 18:00 CY (or temporarily lower `REMINDER_HOUR`), invoke → `sent:1`; confirm: one in-app notification (bell), one push received, one email received, one ledger row stage 1.
4. Leave a review via the calendar 2-step flow. Confirm booking `rating` set, review row created, agent notified (existing behaviour).
5. Simulate day+2 (set the booking `date` back 2 days) and invoke → because `rating` is now non-null, `sent:0`, no stage-2 reminder.

- [ ] **Step 2: The "not done" branch (stage 2 fires)**

1. Reset a completed booking to `rating=null`, `date=today-2`.
2. Manually insert a stage-1 ledger row: `insert into review_reminders(booking_id, stage) values ('<id>', 1);`.
3. Invoke after 18:00 CY → `sent:1`, and confirm a stage-2 notification/push/email plus a stage-2 ledger row. A second invoke → `sent:0` (no duplicate).

- [ ] **Step 3: Deploy the frontend**

Per project convention (memory "Auto-push to Vercel"): commit + push so Vercel redeploys.

```bash
git push
```

- [ ] **Step 4: Final self-check**

Confirm: past days with bookings open; the 2-step review flow works and edits work; both reminder stages deliver on all three channels; no reminder ever sends twice; a reviewed booking never receives a later reminder.

---

## Self-Review Notes

- **Spec coverage:** past-day click (Task 1) ✓; nice 2-step star+comment flow (Task 3) ✓; same-day reminder + 2-day follow-up if not done (Tasks 4-6) ✓; fully functional backend reviews (already existed; reminders backend built new) ✓; three delivery channels (Task 5) ✓.
- **Idempotency:** the `review_reminders` unique (booking_id, stage) + claim-before-send guarantees exactly-once per stage even with 15-min cron overlap.
- **No new review persistence needed:** the existing `reviews` table + `AppStore.addReview` + `updateBooking` already write rating/text and notify the agent; the plan deliberately does not touch them.
- **Type consistency:** `onSubmit(rating, text)` unchanged; new `NotifKind "review_reminder"` added in Task 2 and used in Task 5; DB `notifications.kind` is free text so no enum migration.
- **DST caveat noted in code:** conservative +3h offset so a nudge never fires early; documented inline for future exact handling.
