# Auto-Dispatch Cleaning Jobs — Design

**Date:** 2026-07-20
**Status:** Approved (design), pending implementation plan
**Scope:** Mock end-to-end first (real Beds24 poll wiring is a later follow-up)

## Problem

When a guest checks out of a connected short-let property (Airbnb / Booking via
Beds24), the owner currently has to book a cleaner manually. The app's core value
is turning a guest checkout into an automatic cleaning job. Today `beds24-poll`
syncs checkouts and notifies the owner but deliberately does NOT create jobs.

## Goal

On a guest checkout, automatically create a cleaning job and assign the first
available cleaner from an owner-defined priority list — using the same
accept/decline logic as a normal customer booking. If no priority cleaner is
available, ask the owner to pick one. Owners can flag a stay as a late checkout
to push the cleaning later by an editable number of hours.

## Approach

**Approach A — client-side reactive dispatch.** A pure decision function plus a
store reconcile pass act on the existing (mock) `externalBookings`. This is fully
testable solo, reuses the existing `autoAcceptDecision`, job-creation and notify
code, and needs no cron/edge-function dependency. The pure function is written so
a future edge-function version (`beds24-poll`) can reuse the same logic once real
OTA connections exist.

Rejected: B (edge-function first — not solo-testable, contradicts mock-first,
requires porting matching logic to Deno now); C (hybrid shared module — YAGNI
before real OTA data exists).

## Data Model

### `PropertyAddress` (new optional fields — feature off until enabled)
```ts
autoDispatch?: boolean;         // master toggle for this property
dispatchCleanerIds?: string[];  // priority order; index 0 = first choice
dispatchTime?: string;          // default cleaning start, e.g. "11:00"
dispatchHours?: number;         // default cleaning duration (hours)
```

### `ExternalBooking` (new optional fields)
```ts
lateCheckout?: boolean;   // owner flagged this stay as a late checkout
lateHours?: number;       // hours added to dispatchTime when late; default 3, editable
dispatchedJobId?: string; // idempotency guard; set once a job exists for this stay
                          // sentinel "PENDING_OWNER" = awaiting owner cleaner pick
```

### `Job` (new field)
```ts
externalBookingId?: string; // link back to the stay that generated the job
```

Config persists on the address (via existing `updateAddress` path). Real Supabase
columns are added when the real-poll follow-up lands; the mock flow uses local
account state.

## Dispatch Engine

### Pure decision function — `src/data/dispatch.ts`
```
dispatchDecision(booking, property, cleaners, existingJobs, now)
  -> { cleanerId, date, time, hours, autoAccepted }   // a cleaner was found
   | { needsOwner: true }                              // list exhausted, none free
   | null                                              // not applicable / already done
```

Logic:
1. Return `null` if `!property.autoDispatch`, or `dispatchCleanerIds` empty, or
   `booking.dispatchedJobId` already set, or `dispatchTime`/`dispatchHours` unset.
2. `date` = `booking.checkOut`. `time` = `dispatchTime`, plus `lateHours` (default
   3) when `booking.lateCheckout`. `hours` = `dispatchHours`.
3. Walk `dispatchCleanerIds` in order. For each id, look up the cleaner (skip if
   no longer in the marketplace) and run the existing
   `autoAcceptDecision(cleanerId, date, time, hours, existingJobs, now, …)`.
   The first cleaner whose decision is not "unavailable" is chosen; `autoAccepted`
   is whatever that decision returns (identical to the normal booking path).
4. If the whole list is exhausted with no availability, return `{ needsOwner: true }`.

Any throw / unknown decision for a cleaner is treated as unavailable and the walk
continues.

### Reconcile pass — store `reconcileDispatch()`
For each `externalBooking`, call `dispatchDecision`:
- `{ cleanerId, … }` → build a Job (reuse the CleanerDetail job template),
  `addJob`, set `booking.dispatchedJobId = job.id`, notify the cleaner
  (`notifyUser` for a real agent, else `notify`) and the owner ("Cleaning booked
  for {property} on {date}").
- `{ needsOwner: true }` → set `dispatchedJobId = "PENDING_OWNER"` (so we don't
  re-alert every pass) and notify the owner ("Pick a cleaner for {property} —
  checkout {date}").
- `null` → skip.

Also: if a booking that previously produced a job (real `dispatchedJobId`) no
longer exists and its job is still pending/future, cancel that job.

Note: `"PENDING_OWNER"` bookings are re-evaluated by `reconcileDispatch` (the
sentinel is not treated as "done"): if the owner later adds/reorders priority
cleaners or availability changes, a subsequent reconcile can auto-assign one and
replace the sentinel. The sentinel only suppresses duplicate owner alerts within
a pass, not future auto-assignment.

The exact return shape of the existing `autoAcceptDecision` (what constitutes
"unavailable" vs an accepted/pending result) must be confirmed against
`src/data/cleaners.ts` during planning; the priority walk adapts to it.

### Trigger points
- After `mockLinkProperties` (new bookings appear).
- After the owner saves dispatch config (a newly-enabled property picks up
  existing bookings).
- After `addManualStay`.
- On store init / app load (catch anything missed).

## Owner Setup UI — linked-property card (`Listings.tsx`)

A collapsible **"Cleaning setup"** section under the platform logos.

**Collapsed summary line + chevron:**
- Configured: `Auto-cleaning · 3 cleaners · 11:00 · 3h` with a green dot.
- Not configured: `Set up auto-cleaning` (amber hint).

**Expanded:**
- Toggle: **Auto-book cleaning on checkout** (`autoDispatch`).
- **Priority cleaners** — ordered list; add via `DispatchCleanerPicker`
  (marketplace cleaners filtered to the property city), reorder (up/down),
  remove (✕). Order = priority.
- **Default start time** (`dispatchTime`) via `TimeSelect`.
- **Default duration** (`dispatchHours`) via a number stepper.
- Helper text: "First available cleaner in your list is booked automatically when
  a guest checks out. If none are free, we'll ask you to pick."

Saving writes config via `updateAddress`, then runs `reconcileDispatch`.

### `DispatchCleanerPicker` — new modal (`src/components/DispatchCleanerPicker.tsx`)
Lists city cleaners (name, rating, rate, avatar). Two modes:
- priority-add (multi, from setup): tap to add/remove from the priority list.
- single-pick (from the needs-cleaner fallback): pick one to fill a specific stay.

Reuses `cleaners` store data + existing card styles.

## Late Checkout + Owner-Pick Fallback

### Upcoming checkouts (per linked-property card)
Under Cleaning setup, an **"Upcoming checkouts"** mini-list of that property's
bookings with a future `checkOut` (only shown for `autoDispatch` properties).

Each row: `{guest} · out {date} · cleaning {time}` plus:
- **Late** toggle. ON → reveals an inline "hrs later" number stepper (default 3,
  editable). Cleaning time = `dispatchTime + lateHours`. If a job was already
  dispatched for this stay, update the job's time and notify the cleaner
  ("Checkout is late — arrive {newTime}"). OFF → revert to `dispatchTime`.
- If `dispatchedJobId === "PENDING_OWNER"`: an amber **"Needs cleaner"** pill + a
  **Pick** button opening `DispatchCleanerPicker` (single-pick). Picking creates
  the job via the normal path and clears the sentinel.

## Error Handling
- Missing time/hours → property treated as not-configured; dispatch skipped, "Set
  up" state shown. No crash.
- Cleaner id in the priority list no longer in the marketplace → skipped, walk
  continues.
- `autoAcceptDecision` throw / unknown result → treated as unavailable, continue.
- `dispatchedJobId` is the duplicate guard — a stay is never double-booked.

## Testing (mock, solo, browser)
1. Connect a property (mock); enable auto-dispatch, add 3 priority cleaners,
   11:00, 3h.
2. Mock bookings appear → jobs auto-created for the first available cleaner;
   visible in agent Jobs and the owner sees "Cleaning booked".
3. Make cleaner #1 busy (overlapping job) → cleaner #2 is picked.
4. Make all busy → owner gets a "Needs cleaner" pill → Pick works.
5. Late toggle → time shifts by the editable hrs → job time updates + cleaner
   notified.
6. Remove a booking → its future job is cancelled.

No unit-test harness in the repo; verification is manual in the browser covering
the golden path and each edge case above.

## File Map
- `src/types.ts` — add PropertyAddress, ExternalBooking and Job fields.
- `src/data/dispatch.ts` — NEW: `dispatchDecision` pure fn + time-shift / priority
  helpers.
- `src/context/AppStore.tsx` — `reconcileDispatch`, trigger wiring, dispatch-config
  setters on the address, cancel-on-booking-removed.
- `src/screens/customer/Listings.tsx` — Cleaning-setup expander + upcoming-checkouts
  list + late toggle + needs-cleaner pick.
- `src/components/DispatchCleanerPicker.tsx` — NEW: priority / single cleaner picker.
- `src/theme.css` — expander, priority rows, upcoming-list styles.

## Out of Scope (follow-ups)
- Wiring job-creation into the deployed `beds24-poll` edge function + real DB
  columns (real OTA connections required to test).
- OTA booking date-change handling (rare; note for real-poll follow-up).
