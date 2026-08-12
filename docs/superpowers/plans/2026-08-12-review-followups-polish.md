# Review Feature Follow-ups + Agent/Chat Polish — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Tighten the just-shipped review feature and fix several adjacent UX issues: current-month-only calendar, keep past days visually greyed (but tappable) with a nicer review CTA in the day panel, no Modify/Message on completed bookings, drop agent proof-photos for now, restyle + reorder the agent "Message customer" button, collapse duplicate chat threads to one-per-pair (Messenger-style), and hide past-completed jobs from the agent Jobs tab.

**Architecture:** All frontend edits plus one Supabase schema change for chat. Chat de-duplication changes the `message_threads` uniqueness from per-(customer,cleaner,job) to per-(customer,cleaner), merges existing duplicate threads' messages into the oldest thread per pair, then updates the client upsert key. Everything else is component-level edits.

**Tech Stack:** React + TypeScript + Vite (PWA), Supabase (Postgres + RLS). Project ref `cpudfwfepexswgmqdbnm`. Deploy: commit + push (Vercel auto-deploy); SQL via Management API using node fetch with `NODE_TLS_REJECT_UNAUTHORIZED=0` (PAT in `supabase key.txt`).

**Key facts (verified, do not re-derive):**
- Customer calendar + completed card: `src/screens/customer/Bookings.tsx`. Month arrows ~lines 923-927 (`atCurrentMonth` gate on prev only; next always on). Past-day predicate now at ~line 898 `const clickable = !isPast || hasCancelled || dayBookings.length > 0;`. Past CSS in `src/theme.css` (`.calcell.past` opacity .38; my last change added `.calcell.past:not(:disabled){opacity:1}` — this must be REVERTED so past days stay greyed). Completed-booking card ~lines 1044-1072: already has NO Modify/Message (those only render for upcoming/confirmed/awaiting ~1035-1042). Completed card buttons: review (~1057), Tip (~1061), refund (~1066).
- Agent job detail: `src/screens/agent/JobDetail.tsx`. "Message customer" button lines 73-82 (class `btn secondary sm`). "Open in Maps" anchor lines 152-157 (class `maploc__btn`, hidden when `status === "completed"`). Proof photos section lines 159-180 (`isLive` gate) + camera block 182-194 + `ProofStrip` 236-249 + `before`/`after`/`saveJobPhotos`/`cam`/`CameraCapture` usage.
- Agent jobs list: `src/screens/agent/Jobs.tsx` filter lines ~31-34 (statuses pending/approved/modified/cancelled-not-dismissed). Job status enum `types.ts:239`: `"pending"|"approved"|"declined"|"completed"|"cancelled"|"modified"`. `completed` already excluded — but a **past approved/modified job that was auto/marked completed** must not linger; also guard by hiding any job with `date < today && status==="completed"` defensively and confirm completed truly excluded.
- Chat: `supabase/messaging.sql` — `message_threads` unique `(customer_id, cleaner_id, job_id)` (line ~19). `createThread` in `src/context/AppStore.tsx` lines 1577-1603 upserts `onConflict: "customer_id,cleaner_id,job_id"`. Thread list render `src/screens/customer/Messages.tsx` `ThreadList` (~46-95) keys by `t.id`, one row per thread. Two call sites pass `job?.id`: `Bookings.tsx:269`, `JobDetail.tsx:77` — signature unchanged after fix (jobId becomes context-only).

---

## Task 1: Calendar — current month only

**Files:** Modify `src/screens/customer/Bookings.tsx` (~923-927)

- [ ] **Step 1: Gate the next-month arrow too**

Find:

```tsx
        <button className="iconbtn" onClick={() => setMonth(new Date(y, m + 1, 1))}>›</button>
```

Replace with (disable BOTH arrows so only the current month shows):

```tsx
        <button className="iconbtn" disabled style={{ opacity: 0.35 }} aria-label="Next month (disabled)">›</button>
```

Also change the prev arrow to be permanently disabled (viewing is locked to the current month):

Find:

```tsx
        <button className="iconbtn" disabled={atCurrentMonth} style={{ opacity: atCurrentMonth ? 0.35 : 1 }}
          onClick={() => { if (!atCurrentMonth) setMonth(new Date(y, m - 1, 1)); }}>‹</button>
```

Replace with:

```tsx
        <button className="iconbtn" disabled style={{ opacity: 0.35 }} aria-label="Previous month (disabled)">‹</button>
```

- [ ] **Step 2: Type-check**

Run: `./node_modules/.bin/tsc --noEmit`
Expected: exit 0. (`atCurrentMonth` may now be unused — if tsc/eslint flags it, leave the `const atCurrentMonth` line; it is cheap and still referenced by the `.today`/nav display. If tsc errors "declared but never read", prefix with `void atCurrentMonth;` right after its declaration, or remove the line if nothing else uses it. Grep `atCurrentMonth` first; if 1 remaining use, remove the declaration.)

- [ ] **Step 3: Commit**

```bash
git add src/screens/customer/Bookings.tsx
git commit -m "feat(calendar): lock the customer calendar to the current month"
```

---

## Task 2: Past days greyed again + nicer review CTA in the day panel

Revert the opacity override so past days look greyed like before, but remain tappable (Task from prior plan kept `clickable` true for days with bookings — keep that). Then improve the below-panel completed card so leaving a review reads as the primary action.

**Files:** Modify `src/theme.css`, `src/screens/customer/Bookings.tsx` (~1044-1072)

- [ ] **Step 1: Revert the past-day opacity override**

In `src/theme.css` find the block added previously:

```css
.calcell.past { opacity: .38; cursor: default; }
/* A past day that still has bookings is interactive (review access). Only the
   truly disabled (empty past) cells stay dimmed. */
.calcell.past:not(:disabled) { opacity: 1; cursor: pointer; }
.calcell.past:disabled { cursor: default; }
.calcell.past:active { transform: none; }
```

Replace with (greyed regardless, but a tappable past day gets a pointer cursor so it still feels clickable):

```css
.calcell.past { opacity: .38; cursor: default; }
/* Past days stay visually greyed. Those still holding a booking remain tappable
   (to open the day panel and review), signalled by the pointer cursor only. */
.calcell.past:not(:disabled) { cursor: pointer; }
.calcell.past:disabled { cursor: default; }
.calcell.past:active { transform: none; }
```

- [ ] **Step 2: Make the review CTA primary on completed cards**

In `src/screens/customer/Bookings.tsx`, in the `b.status === "completed"` block, find the review button:

```tsx
                  <div className="row" style={{ gap: 8, marginTop: 10 }}>
                    <button className="btn sm secondary grow" onClick={() => onReview(b)}>
                      {b.rating ? "Edit review" : "Leave a review"}
                    </button>
                    {!b.tip && (
                      <button className="btn sm secondary grow" onClick={() => onTip(b)}>Tip</button>
                    )}
                  </div>
```

Replace with (review becomes a filled primary button on its own row; Tip drops to a secondary row so the review reads as the main next step):

```tsx
                  <button className={"btn sm grow" + (b.rating ? " secondary" : "")} style={{ marginTop: 10 }} onClick={() => onReview(b)}>
                    {b.rating ? "Edit your review" : `Review ${b.cleanerName}`}
                  </button>
                  {!b.tip && (
                    <button className="btn sm secondary grow" style={{ marginTop: 8 }} onClick={() => onTip(b)}>Leave a tip</button>
                  )}
```

- [ ] **Step 3: Type-check**

Run: `./node_modules/.bin/tsc --noEmit`
Expected: exit 0.

- [ ] **Step 4: Manual check (dev server)**

Run: `pnpm dev` (or `./node_modules/.bin/vite`). Past day with a completed booking: cell is greyed but opens the panel; the panel shows a filled "Review <name>" button as the primary action, "Leave a tip" below.

- [ ] **Step 5: Commit**

```bash
git add src/theme.css src/screens/customer/Bookings.tsx
git commit -m "feat(reviews): grey past days but keep them tappable; make review the primary CTA"
```

---

## Task 3: Agent JobDetail — drop proof photos, reorder + restyle Message customer

Remove proof-photo UI (keep the persisted data + `saveJobPhotos` in the store untouched for future re-add). Move "Message customer" to sit directly below "Open in Maps" and give it the `maploc__btn` look. Gate messaging so it disappears once the job is completed (parity with maps, and with "after done, messaging is not an option").

**Files:** Modify `src/screens/agent/JobDetail.tsx`

- [ ] **Step 1: Remove the top Message customer block**

Delete lines 73-82 entirely (the `{/* Message the customer ... */}` block ending with `)}` before the `{j.status === "modified" && (` block).

- [ ] **Step 2: Add a reordered, restyled Message customer button under Open in Maps**

Find the Open in Maps block:

```tsx
      {j.status !== "completed" && (
        <a className="maploc__btn" style={{ marginTop: 12 }} href={mapsUrl} target="_blank" rel="noreferrer">
          <span>Open in Maps</span>
          <span className="maploc__arrow"><ArrowRight size={14} /></span>
        </a>
      )}
```

Replace with (maps stays; message customer directly below, same visual style, hidden once completed and only for two distinct real accounts):

```tsx
      {j.status !== "completed" && (
        <a className="maploc__btn" style={{ marginTop: 12 }} href={mapsUrl} target="_blank" rel="noreferrer">
          <span>Open in Maps</span>
          <span className="maploc__arrow"><ArrowRight size={14} /></span>
        </a>
      )}

      {/* Message the customer — mirrors the maps button, and (like maps) only
          while the job is still active. After completion, messaging closes. */}
      {j.status !== "completed" && j.customerUid && j.cleanerUid && j.customerUid !== j.cleanerUid && (
        <button className="maploc__btn" style={{ marginTop: 10, width: "100%", cursor: "pointer" }}
          onClick={async () => {
            const tid = await createThread(j.customerUid!, j.cleanerUid!, j.id, `Cleaning · ${j.date}`);
            if (tid) nav("/messages?thread=" + tid);
          }}>
          <span>Message customer</span>
          <span className="maploc__arrow"><ArrowRight size={14} /></span>
        </button>
      )}
```

- [ ] **Step 3: Remove the proof-photos section**

Delete the `isLive` proof block (lines ~159-180):

```tsx
      {isLive && (
        <>
          <div className="h2">Proof photos</div>
          ... (through) ...
        </>
      )}
```

Delete the whole `{isLive && ( ... )}` block for proof photos.

- [ ] **Step 4: Remove the now-unused camera block + ProofStrip + imports**

Delete the camera capture block (lines ~182-194):

```tsx
      {cam && (
        <CameraCapture
          ... 
        />
      )}
```

Delete the `ProofStrip` function at the bottom (lines ~236-249).

Now remove dead code these leave behind:
- The `cam` state: `const [cam, setCam] = useState<null | "before" | "after">(null);`
- The `before` / `after` derived consts (lines 19-20).
- From the store destructure (line 12) remove `saveJobPhotos` (keep `createThread`, `myUid`, etc.).
- Remove the `CameraCapture` import (line 5) and its `CapturedPhoto` type import if unused.
- Keep `isLive` if still referenced by the Accept/Cancel action block (it is, line ~206). Do NOT delete `isLive`.

- [ ] **Step 5: Type-check (this will surface any missed dead reference)**

Run: `./node_modules/.bin/tsc --noEmit`
Expected: exit 0. If tsc reports an unused import/var, delete that specific line and re-run. Do not silence with `// @ts-ignore`.

- [ ] **Step 6: Manual check**

Run the dev server, open an agent job:
- Active job: "Open in Maps" then "Message customer" directly beneath it, same pill style. No "Proof photos" section.
- Completed job: neither maps nor message customer shows.

- [ ] **Step 7: Commit**

```bash
git add src/screens/agent/JobDetail.tsx
git commit -m "feat(agent): drop proof photos; move + restyle Message customer under Open in Maps; close messaging on completed jobs"
```

---

## Task 4: Agent Jobs tab — hide past completed jobs

`completed` is already excluded by the filter, but make the intent explicit and also drop any past `declined`/stale rows so the tab is a clean "upcoming" view. Keep cancelled-not-dismissed (the agent still needs to see a cancellation) and today's jobs.

**Files:** Modify `src/screens/agent/Jobs.tsx` (~31-34)

- [ ] **Step 1: Add a today cutoff and an explicit completed exclusion**

Find:

```tsx
  const relevant = jobs.filter((j) =>
    j.cleanerUid === myUid &&
    (j.status === "pending" || j.status === "approved" || j.status === "modified" ||
      (j.status === "cancelled" && !j.dismissedByAgent)));
```

Replace with:

```tsx
  const todayISO = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  })();
  // The Jobs tab is the agent's forward-looking worklist: only jobs that still
  // need attention. Completed jobs are always dropped; a past day's leftover
  // rows (declined/cancelled once acted on) don't linger either.
  const relevant = jobs.filter((j) =>
    j.cleanerUid === myUid &&
    j.status !== "completed" && j.status !== "declined" &&
    (j.date >= todayISO || j.status === "pending" || j.status === "modified") &&
    (j.status === "pending" || j.status === "approved" || j.status === "modified" ||
      (j.status === "cancelled" && !j.dismissedByAgent)));
```

Rationale: keeps all actionable future/today jobs; still surfaces pending/modified even if their date slipped to the past (they need a response); hides completed always and past cancelled/approved leftovers.

- [ ] **Step 2: Type-check**

Run: `./node_modules/.bin/tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Manual check**

Agent Jobs tab shows only upcoming/actionable jobs; a job marked completed disappears from the list.

- [ ] **Step 4: Commit**

```bash
git add src/screens/agent/Jobs.tsx
git commit -m "feat(agent): Jobs tab shows only upcoming/actionable jobs, hides completed"
```

---

## Task 5: Chat — one thread per user pair (DB)

Change thread identity from (customer, cleaner, job) to (customer, cleaner). Merge existing duplicate threads for a pair into the oldest thread (repoint messages, move `last_message_at`, delete the extras), then swap the unique constraint.

**Files:** Create `supabase/messaging_one_thread_per_pair.sql`

- [ ] **Step 1: Write the migration SQL**

Create `supabase/messaging_one_thread_per_pair.sql`:

```sql
-- ============================================================================
-- Collapse chat to one thread per (customer, cleaner) pair — Messenger-style.
-- Previously message_threads was unique on (customer_id, cleaner_id, job_id),
-- so every job spawned a separate thread for the same two people. This:
--   1. picks the SURVIVING thread per pair (the oldest by created_at),
--   2. repoints all messages from duplicate threads onto the survivor,
--   3. carries the latest last_message_at onto the survivor,
--   4. deletes the now-empty duplicate threads,
--   5. swaps the unique constraint to (customer_id, cleaner_id).
-- Idempotent-ish: safe to re-run; after the constraint swap there are no dups
-- left to merge. Apply to project cpudfwfepexswgmqdbnm.
-- ============================================================================

-- 1+2+3: merge duplicates into the oldest thread per pair.
with survivor as (
  select distinct on (customer_id, cleaner_id)
         id as keep_id, customer_id, cleaner_id
  from message_threads
  order by customer_id, cleaner_id, created_at asc, id asc
),
dupes as (
  select t.id as dup_id, s.keep_id
  from message_threads t
  join survivor s
    on s.customer_id = t.customer_id
   and s.cleaner_id  = t.cleaner_id
  where t.id <> s.keep_id
)
update messages m
set thread_id = d.keep_id
from dupes d
where m.thread_id = d.dup_id;

-- carry newest activity onto survivors
update message_threads keep
set last_message_at = greatest(
  keep.last_message_at,
  coalesce((select max(m.created_at) from messages m where m.thread_id = keep.id), keep.last_message_at)
);

-- 4: delete duplicate (non-survivor) threads.
with survivor as (
  select distinct on (customer_id, cleaner_id)
         id as keep_id, customer_id, cleaner_id
  from message_threads
  order by customer_id, cleaner_id, created_at asc, id asc
)
delete from message_threads t
using survivor s
where s.customer_id = t.customer_id
  and s.cleaner_id  = t.cleaner_id
  and t.id <> s.keep_id;

-- 5: swap the unique constraint.
-- The original unnamed unique key must be dropped by its generated name; find
-- and drop any unique constraint covering exactly (customer_id, cleaner_id, job_id),
-- then add the pair uniqueness.
do $$
declare cname text;
begin
  select conname into cname
  from pg_constraint
  where conrelid = 'message_threads'::regclass
    and contype = 'u'
    and pg_get_constraintdef(oid) ilike '%(customer_id, cleaner_id, job_id)%';
  if cname is not null then
    execute format('alter table message_threads drop constraint %I', cname);
  end if;
end $$;

alter table message_threads
  drop constraint if exists message_threads_customer_id_cleaner_id_key;
alter table message_threads
  add constraint message_threads_customer_id_cleaner_id_key
  unique (customer_id, cleaner_id);
```

- [ ] **Step 2: Apply via Management API (node)**

```bash
cd "C:/Users/schrysostomou/Desktop/App/cinderella-mvp"
NODE_TLS_REJECT_UNAUTHORIZED=0 node -e '
const fs=require("fs");
const pat=fs.readFileSync("supabase key.txt","utf8").trim();
const sql=fs.readFileSync("supabase/messaging_one_thread_per_pair.sql","utf8");
fetch("https://api.supabase.com/v1/projects/cpudfwfepexswgmqdbnm/database/query",{
  method:"POST",headers:{Authorization:"Bearer "+pat,"Content-Type":"application/json"},
  body:JSON.stringify({query:sql})
}).then(async r=>{console.log("HTTP",r.status);console.log((await r.text()).slice(0,500));}).catch(e=>console.log("ERR",e.message));
'
```
Expected: HTTP 201.

- [ ] **Step 3: Verify one thread per pair + constraint**

```bash
NODE_TLS_REJECT_UNAUTHORIZED=0 node -e '
const fs=require("fs");
const pat=fs.readFileSync("supabase key.txt","utf8").trim();
const q="select customer_id, cleaner_id, count(*) c from message_threads group by 1,2 having count(*)>1;";
fetch("https://api.supabase.com/v1/projects/cpudfwfepexswgmqdbnm/database/query",{method:"POST",headers:{Authorization:"Bearer "+pat,"Content-Type":"application/json"},body:JSON.stringify({query:q})}).then(async r=>console.log("dups:",await r.text()));
'
```
Expected: `dups: []` (no pair has more than one thread).

- [ ] **Step 4: Commit**

```bash
git add supabase/messaging_one_thread_per_pair.sql
git commit -m "feat(chat): collapse to one thread per customer/cleaner pair (DB migration)"
```

---

## Task 6: Chat — client upsert on the pair key

Point `createThread`'s upsert conflict target at the new pair constraint so it always reuses the pair's single thread. `job_id` is still written (as the most-recent context) but no longer part of identity.

**Files:** Modify `src/context/AppStore.tsx` (~1585-1592); update the schema doc file `supabase/messaging.sql` comment for future readers.

- [ ] **Step 1: Change the upsert conflict target**

Find:

```tsx
      const { data, error } = await supabase
        .from("message_threads")
        .upsert(
          { customer_id: customerUid, cleaner_id: cleanerUid, job_id: jobId ?? null, subject },
          { onConflict: "customer_id,cleaner_id,job_id" },
        )
        .select()
        .single();
```

Replace with:

```tsx
      const { data, error } = await supabase
        .from("message_threads")
        .upsert(
          // One thread per (customer, cleaner) pair — Messenger-style. job_id is
          // kept only as the latest context; it is NOT part of thread identity,
          // so re-messaging from any booking reuses the same conversation.
          { customer_id: customerUid, cleaner_id: cleanerUid, job_id: jobId ?? null, subject },
          { onConflict: "customer_id,cleaner_id" },
        )
        .select()
        .single();
```

- [ ] **Step 2: Update the schema doc comment (non-functional, keeps the repo honest)**

In `supabase/messaging.sql`, change the unique line + comment:

```sql
  -- one thread per (customer, cleaner, job) trio. job_id NULL groups as one
  -- general thread per pair.
  unique (customer_id, cleaner_id, job_id)
```

to:

```sql
  -- one thread per (customer, cleaner) pair — Messenger-style. job_id is kept as
  -- context only (see messaging_one_thread_per_pair.sql for the migration).
  unique (customer_id, cleaner_id)
```

- [ ] **Step 3: Type-check**

Run: `./node_modules/.bin/tsc --noEmit`
Expected: exit 0.

- [ ] **Step 4: Manual check**

With two real accounts (customer + cleaner) that already had multiple job threads: open Messages — a single conversation row for that person, all past messages present in order. Send a new message from a different booking's "Message" button — it lands in the SAME thread. No second row appears.

- [ ] **Step 5: Commit**

```bash
git add src/context/AppStore.tsx supabase/messaging.sql
git commit -m "feat(chat): upsert threads on the (customer,cleaner) pair key"
```

---

## Task 7: Deploy + final verification

- [ ] **Step 1: Push (Vercel auto-deploy)**

```bash
git push
```

- [ ] **Step 2: Full pass on preview/prod**

- Customer calendar: only current month; prev/next arrows disabled; past days greyed but a past day with a booking opens and shows the filled "Review <name>" CTA. Completed cards show no Modify/Message.
- Agent job (active): Open in Maps then Message customer beneath it, matching style; no proof photos. Completed job: no maps, no message.
- Agent Jobs tab: no completed jobs; upcoming/actionable only.
- Messages: exactly one thread per counterparty; new messages continue the existing thread.

---

## Self-Review Notes

- **Contradiction check:** Ask #3 said "drop Modify/Message from completed card" — those never rendered on completed cards (only upcoming/confirmed/awaiting). No change needed there; Task 2 only elevates the review CTA. Documented so the reviewer isn't surprised.
- **Proof photos:** UI removed, store method `saveJobPhotos` + columns retained so a future re-add is trivial. No DB change.
- **Chat identity change is destructive-ish:** the migration merges + deletes duplicate threads. Messages are repointed first, so no message is lost; only empty duplicate thread rows are deleted. Survivor = oldest thread per pair (stable). Re-runnable.
- **Type consistency:** `createThread(customerUid, cleanerUid, jobId, subject)` signature unchanged across both call sites; only the upsert conflict target changed.
- **`atCurrentMonth`:** may become unused after Task 1 — handle per Task 1 Step 2 to keep tsc clean.
