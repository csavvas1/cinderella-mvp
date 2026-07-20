# Auto-Dispatch Cleaning Jobs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a mock OTA guest checkout appears, auto-create a cleaning job assigned to the first available cleaner from an owner-defined per-property priority list, with an editable late-checkout shift and an owner-pick fallback.

**Architecture:** Client-side reactive dispatch. A pure decision function (`src/data/dispatch.ts`) decides per booking; a store reconcile pass (`reconcileDispatch`) creates jobs+bookings (reusing the existing CleanerDetail creation shape), notifies, and guards against duplicates via `ExternalBooking.dispatchedJobId`. Owner config + late toggle live on the linked-property card in `Listings.tsx`.

**Tech Stack:** Vite + React + TypeScript PWA, Zustand-style context store (`AppStore.tsx`), Supabase backend (mock path only here). No unit-test harness exists — each task is gated by `npx tsc --noEmit` + `npx vite build` and a manual browser check, then a commit.

**IMPORTANT conventions discovered during planning:**
- `autoAcceptDecision(...)` returns `{ decision: "auto" | "pending", reason }` — it NEVER says "unavailable". Clash/day-off/hours all return `"pending"`. So availability screening for the priority walk uses `availabilityStatus(...).free` (a separate exported fn), and the chosen cleaner's job status uses `autoAcceptDecision` (auto → job `approved`+`autoAccepted`, pending → job `pending`).
- `store.cleaners` contains REAL agents only (mock `CLEANERS` are hidden from the browsable list). For this mock-first feature the cleaner picker must combine both: `[...store.cleaners, ...CLEANERS]` deduped by id, filtered by property city. A cleaner is "real" if `store.cleaners.some(c => c.id === id)`.
- Jobs are created together with a Booking (see `CleanerDetail.confirm`): both carry `externalBookingId`, `bookingId`/`jobId` cross-links, and pricing from `priceJob`.
- Notify: real agent → `notifyUser(cleanerId, notif)` (from `src/lib/notify.ts`); mock → `notify({...})` (store).
- `availabilityStatus(cleanerId, dates: string[], time, durationHours, bookings, cleanerObj?)` → `{ free, reason }`. `bookings` items need `{ cleanerId, date, time, durationHours, status, id? }` — Jobs have `cleanerId`, `date`, `time`, `durationHours`, `status`; pass jobs mapped to that shape (status "cancelled"/"declined" ignored).

---

## File Structure

- `src/types.ts` — add fields to `PropertyAddress`, `ExternalBooking` (Job already has `externalBookingId`? NO — Job has no such field; add it).
- `src/data/dispatch.ts` — NEW: `dispatchTimeFor`, `pickCleaner`, `dispatchDecision` pure fns.
- `src/context/AppStore.tsx` — add config setter, `reconcileDispatch`, late-toggle setter, cancel-on-remove; wire triggers; expose new actions on the context interface + value.
- `src/components/DispatchCleanerPicker.tsx` — NEW: cleaner picker modal (multi for priority, single for fallback).
- `src/screens/customer/Listings.tsx` — Cleaning-setup expander + upcoming-checkouts list + late toggle + needs-cleaner pick.
- `src/theme.css` — styles for the expander, priority rows, upcoming list.

---

## Task 1: Data model fields

**Files:**
- Modify: `src/types.ts` (PropertyAddress ~126-144, ExternalBooking ~70-78, Job ~200-267)

- [ ] **Step 1: Add PropertyAddress dispatch config fields**

In `src/types.ts`, inside `interface PropertyAddress`, before the closing `}` (after `memberCount?: number;`):

```ts
  // ---- auto-dispatch (short-let checkout -> auto cleaning job) ----
  autoDispatch?: boolean;         // master toggle for this property
  dispatchCleanerIds?: string[];  // priority order; index 0 = first choice
  dispatchTime?: string;          // default cleaning start, e.g. "11:00"
  dispatchHours?: number;         // default cleaning duration (hours)
```

- [ ] **Step 2: Add ExternalBooking fields**

In `interface ExternalBooking`, before the closing `}` (after `addressId?: string;`):

```ts
  // ---- auto-dispatch ----
  lateCheckout?: boolean;    // owner flagged this stay as a late checkout
  lateHours?: number;        // hours added to dispatchTime when late (default 3)
  dispatchedJobId?: string;  // idempotency: job id once created, or "PENDING_OWNER"
```

- [ ] **Step 3: Add Job.externalBookingId**

In `interface Job`, after `bookingId?: string;` (~line 228):

```ts
  externalBookingId?: string;  // the guest stay that generated this cleaning job
```

- [ ] **Step 4: Verify compile**

Run: `npx tsc --noEmit`
Expected: no output (clean). New optional fields don't break existing code.

- [ ] **Step 5: Commit**

```bash
git add src/types.ts
git commit -m "Add auto-dispatch fields to property, external booking and job types"
```

---

## Task 2: Pure dispatch decision module

**Files:**
- Create: `src/data/dispatch.ts`

- [ ] **Step 1: Create the module with time helper + decision fn**

Create `src/data/dispatch.ts`:

```ts
import type { PropertyAddress, ExternalBooking, Cleaner, Job } from "../types";
import { availabilityStatus } from "./cleaners";

export const DEFAULT_LATE_HOURS = 3;

// Compute the cleaning start time for a stay: the property default, shifted by
// the booking's late offset when the owner flagged a late checkout.
export function dispatchTimeFor(property: PropertyAddress, booking: ExternalBooking): string {
  const base = property.dispatchTime || "11:00";
  if (!booking.lateCheckout) return base;
  const offset = booking.lateHours ?? DEFAULT_LATE_HOURS;
  const [h, m] = base.split(":").map(Number);
  const total = h * 60 + m + Math.round(offset * 60);
  const hh = Math.min(23, Math.floor(total / 60));
  const mm = total % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

// Map jobs to the slot shape availabilityStatus expects.
function jobsToSlots(jobs: Job[]) {
  return jobs
    .filter((j) => j.cleanerId && j.date && j.time && j.status !== "cancelled" && j.status !== "declined")
    .map((j) => ({
      cleanerId: j.cleanerId!, date: j.date, time: j.time,
      durationHours: j.durationHours, status: j.status, id: j.id,
    }));
}

export type DispatchResult =
  | { kind: "assign"; cleanerId: string; date: string; time: string; hours: number }
  | { kind: "needsOwner"; date: string; time: string; hours: number }
  | { kind: "skip" };

// Decide what to do for one external booking. Pure: no side effects.
// `cleaners` must be the full pool (real + mock) so priority ids resolve.
export function dispatchDecision(
  booking: ExternalBooking,
  property: PropertyAddress | undefined,
  cleaners: Cleaner[],
  jobs: Job[],
  nowMs: number = Date.now(),
): DispatchResult {
  if (!property) return { kind: "skip" };
  if (!property.autoDispatch) return { kind: "skip" };
  if (!property.dispatchCleanerIds?.length) return { kind: "skip" };
  if (!property.dispatchTime || !property.dispatchHours) return { kind: "skip" };
  // already handled (has a real job id or the owner-pending sentinel)
  if (booking.dispatchedJobId) return { kind: "skip" };

  const date = booking.checkOut;
  const time = dispatchTimeFor(property, booking);
  const hours = property.dispatchHours;
  const slots = jobsToSlots(jobs);

  for (const id of property.dispatchCleanerIds) {
    const cleaner = cleaners.find((c) => c.id === id);
    if (!cleaner) continue; // removed from marketplace — skip
    let free = false;
    try {
      free = availabilityStatus(id, [date], time, hours, slots, cleaner).free;
    } catch { free = false; }
    if (free) return { kind: "assign", cleanerId: id, date, time, hours };
  }
  return { kind: "needsOwner", date, time, hours };
}
```

- [ ] **Step 2: Verify compile**

Run: `npx tsc --noEmit`
Expected: clean. (`availabilityStatus` is exported from cleaners.ts; `nowMs` param kept for parity/future notice checks even if unused now — if tsc flags unused, prefix with `_nowMs`.)

- [ ] **Step 3: If tsc flags `nowMs` unused, rename to `_nowMs`**

Only if the previous step errored on unused `nowMs`: change the param name to `_nowMs` in the signature. Re-run `npx tsc --noEmit` → clean.

- [ ] **Step 4: Commit**

```bash
git add src/data/dispatch.ts
git commit -m "Add pure dispatch-decision module for auto cleaning jobs"
```

---

## Task 3: Store — reconcile pass + config/late setters + triggers

**Files:**
- Modify: `src/context/AppStore.tsx` (interface ~250-367, value block ~1337-1551, imports ~1-15)

- [ ] **Step 1: Import dispatch helpers + mock cleaners + notifyUser**

At the top of `src/context/AppStore.tsx`, add imports (place near the other data imports around line 9):

```ts
import { dispatchDecision, dispatchTimeFor, DEFAULT_LATE_HOURS } from "../data/dispatch";
import { CLEANERS } from "../data/cleaners";
import { notifyUser } from "../lib/notify";
```

(If `priceJob` is already imported from `../data/platform`, leave it. If `CLEANERS`/`notifyUser` are already imported, don't duplicate.)

- [ ] **Step 2: Declare new actions on the context interface**

In the `AppState` interface, near the property/booking actions (after `updateAddress:` ~line 252) add:

```ts
  // auto-dispatch
  setDispatchConfig: (addressId: string, cfg: {
    autoDispatch?: boolean; dispatchCleanerIds?: string[];
    dispatchTime?: string; dispatchHours?: number;
  }) => void;
  setBookingLate: (bookingId: string, late: boolean, hours?: number) => void;
  assignDispatchCleaner: (bookingId: string, cleanerId: string) => void;
  reconcileDispatch: () => void;
```

- [ ] **Step 3: Add a shared cleaner-pool helper + reconcile core in the store body**

Find where the store value object is built (the big returned object, ~line 1337+). ABOVE the `return { ... }` value object (or just before `addBookings`), add a local helper and the reconcile implementation. Place this inside the store hook body where `acct`, `patchAcct`, `jobs`, `setJobs`, `notify`, `realCleaners` are in scope:

```ts
    // Full cleaner pool for dispatch (real agents + mock directory), deduped.
    const dispatchPool = (() => {
      const byId = new Map<string, import("../types").Cleaner>();
      [...realCleaners, ...CLEANERS].forEach((c) => { if (!byId.has(c.id)) byId.set(c.id, c); });
      return [...byId.values()];
    })();
    const isRealCleaner = (id: string) => realCleaners.some((c) => c.id === id);

    // Build a Booking + Job pair for a dispatched cleaning, mirroring
    // CleanerDetail.confirm. Returns the pair (caller persists + notifies).
    function buildDispatchJob(
      booking: import("../types").ExternalBooking,
      prop: import("../types").PropertyAddress,
      cleaner: import("../types").Cleaner,
      date: string, time: string, hours: number,
    ) {
      const bid = crypto.randomUUID();
      const jid = crypto.randomUUID();
      const wknd = (() => { const d = new Date(date + "T00:00:00").getDay(); return d === 0 || d === 6; })();
      const rate = wknd ? cleaner.rateWeekend : cleaner.rateWeekday;
      const basePay = +(rate * hours).toFixed(2);
      const { commission, cleanerPay, customerTotal } = priceJob(basePay);
      const dec = autoAcceptDecision(cleaner.id, date, time, hours, jobs.map((j) => ({
        cleanerId: j.cleanerId!, date: j.date, time: j.time, durationHours: j.durationHours, status: j.status, id: j.id,
      })), Date.now(), acct.customerRep?.rating, acct.customerRep?.reviewsCount ?? 0, cleaner);
      const auto = dec.decision === "auto";
      const real = isRealCleaner(cleaner.id);
      const booking2: import("../types").Booking = {
        id: bid, cleanerId: cleaner.id, cleanerName: cleaner.name, cleanerPhoto: cleaner.photo,
        addressNickname: prop.nickname, address: prop.address, addressId: prop.id,
        date, time, durationHours: hours, ratePerHour: rate, total: customerTotal,
        commission, cleanerPay, scope: "whole",
        status: auto ? "confirmed" : "awaiting", jobId: jid,
        externalBookingId: booking.id, createdAt: Date.now(),
        ...(auto ? { confirmedAt: Date.now() } : {}),
        recurring: false, recurrence: "none",
      };
      const job: import("../types").Job = {
        id: jid, customerName: prop.nickname || "Short-let", type: "Short-let",
        propertyType: prop.propertyType, apartmentNumber: prop.apartmentNumber, floor: prop.floor,
        address: prop.address, date, time, durationHours: hours, ratePerHour: rate, cleanerPay,
        bedrooms: prop.bedrooms, bathrooms: prop.bathrooms, kitchens: prop.kitchens, commonRooms: prop.commonRooms,
        distanceFromHomeKm: 0, distanceFromPrevKm: null, lat: prop.lat, lng: prop.lng,
        status: auto ? "approved" : "pending", cleanerId: cleaner.id,
        cleanerUid: real ? cleaner.id : undefined, bookingId: bid,
        externalBookingId: booking.id, autoAccepted: auto, alertedAt: Date.now(),
        ...(auto ? { respondedAt: Date.now(), response: "accepted" as const } : {}),
      };
      return { booking2, job, real, auto };
    }
```

(Note: `autoAcceptDecision` and `priceJob` must be imported at the top of AppStore — `priceJob` already is; add `import { autoAcceptDecision } from "../data/cleaners";` alongside the CLEANERS import from Step 1.)

- [ ] **Step 4: Add `reconcileDispatch` implementation to the value object**

Inside the returned store value object (same block as `addBookings`, `addJob`), add:

```ts
    reconcileDispatch: () => {
      const bookings = acct.externalBookings ?? [];
      const addrs = acct.addresses;
      const newBookings2: import("../types").Booking[] = [];
      const newJobs: import("../types").Job[] = [];
      const patchedExt = bookings.map((b) => ({ ...b }));
      let changed = false;
      const alerts: { audience: "customer" | "agent"; kind: "booking_new"; jobId?: string; title: string; body: string; targetUid?: string }[] = [];

      patchedExt.forEach((b) => {
        const prop = addrs.find((a) => a.id === b.addressId);
        const res = dispatchDecision(b, prop, dispatchPool, jobs, Date.now());
        if (res.kind === "assign" && prop) {
          const cleaner = dispatchPool.find((c) => c.id === res.cleanerId)!;
          const { booking2, job, real, auto } = buildDispatchJob(b, prop, cleaner, res.date, res.time, res.hours);
          newBookings2.push(booking2); newJobs.push(job);
          b.dispatchedJobId = job.id; changed = true;
          alerts.push({
            audience: "agent", kind: "booking_new", jobId: job.id,
            title: auto ? "New cleaning" : "New cleaning request",
            body: `${prop.nickname} · guest checkout ${res.date} ${res.time}.`,
            targetUid: real ? cleaner.id : undefined,
          });
          alerts.push({
            audience: "customer", kind: "booking_new",
            title: "Cleaning booked", body: `${cleaner.name} · ${prop.nickname} · ${res.date} ${res.time}.`,
          });
        } else if (res.kind === "needsOwner" && prop) {
          b.dispatchedJobId = "PENDING_OWNER"; changed = true;
          alerts.push({
            audience: "customer", kind: "booking_new",
            title: "Pick a cleaner", body: `No favourite is free for ${prop.nickname} — checkout ${res.date}. Tap to pick.`,
          });
        }
      });

      if (!changed && !newJobs.length) return;
      if (newBookings2.length) { patchAcct({ bookings: [...newBookings2, ...acct.bookings], externalBookings: patchedExt }); dbInsertBookings(newBookings2); }
      else { patchAcct({ externalBookings: patchedExt }); }
      if (newJobs.length) { setJobs((p) => [...newJobs, ...p]); dbInsertJobs(newJobs); }
      alerts.forEach((a) => {
        if (a.targetUid) void notifyUser(a.targetUid, { id: crypto.randomUUID(), audience: a.audience, kind: a.kind, jobId: a.jobId, title: a.title, body: a.body, read: false, createdAt: Date.now() });
        else notify({ audience: a.audience, kind: a.kind, jobId: a.jobId, title: a.title, body: a.body });
      });
    },
```

(Confirm `dbInsertBookings` and `dbInsertJobs` are the persistence fns used by `addBookings`/`addJob` — reuse whatever names those actions call. If different, match them.)

- [ ] **Step 5: Add `setDispatchConfig`, `setBookingLate`, `assignDispatchCleaner`**

Add to the value object:

```ts
    setDispatchConfig: (addressId, cfg) => {
      const a = acct.addresses.find((x) => x.id === addressId);
      if (!a) return;
      const updated = { ...a, ...cfg };
      patchAcct({ addresses: acct.addresses.map((x) => x.id === addressId ? updated : x) });
      dbUpsertAddress?.(updated); // if an address persistence fn exists; else omit this line
      setTimeout(() => api.reconcileDispatch(), 0); // pick up existing bookings after enable
    },
    setBookingLate: (bookingId, late, hours) => {
      const exts = (acct.externalBookings ?? []).map((b) =>
        b.id === bookingId ? { ...b, lateCheckout: late, lateHours: hours ?? b.lateHours ?? DEFAULT_LATE_HOURS } : b);
      patchAcct({ externalBookings: exts });
      // if a job was already dispatched for this stay, shift its time + notify
      const b = exts.find((x) => x.id === bookingId);
      if (b?.dispatchedJobId && b.dispatchedJobId !== "PENDING_OWNER") {
        const prop = acct.addresses.find((a) => a.id === b.addressId);
        if (prop) {
          const newTime = dispatchTimeFor(prop, b);
          setJobs((p) => p.map((j) => j.id === b.dispatchedJobId ? { ...j, time: newTime } : j));
          const job = jobs.find((j) => j.id === b.dispatchedJobId);
          if (job?.cleanerUid) void notifyUser(job.cleanerUid, { id: crypto.randomUUID(), audience: "agent", kind: "booking_modified", jobId: job.id, title: "Checkout time changed", body: `${prop.nickname} cleaning now ${newTime}.`, read: false, createdAt: Date.now() });
          else notify({ audience: "agent", kind: "booking_modified", jobId: b.dispatchedJobId, title: "Checkout time changed", body: `${prop.nickname} cleaning now ${newTime}.` });
        }
      }
    },
    assignDispatchCleaner: (bookingId, cleanerId) => {
      const b = (acct.externalBookings ?? []).find((x) => x.id === bookingId);
      const prop = b ? acct.addresses.find((a) => a.id === b.addressId) : undefined;
      const cleaner = dispatchPool.find((c) => c.id === cleanerId);
      if (!b || !prop || !cleaner) return;
      const time = dispatchTimeFor(prop, b);
      const hours = prop.dispatchHours || 2;
      const { booking2, job, real, auto } = buildDispatchJob(b, prop, cleaner, b.checkOut, time, hours);
      patchAcct({
        bookings: [booking2, ...acct.bookings],
        externalBookings: (acct.externalBookings ?? []).map((x) => x.id === bookingId ? { ...x, dispatchedJobId: job.id } : x),
      });
      dbInsertBookings([booking2]); setJobs((p) => [job, ...p]); dbInsertJobs([job]);
      if (real) void notifyUser(cleaner.id, { id: crypto.randomUUID(), audience: "agent", kind: "booking_new", jobId: job.id, title: auto ? "New cleaning" : "New cleaning request", body: `${prop.nickname} · ${b.checkOut} ${time}.`, read: false, createdAt: Date.now() });
      else notify({ audience: "agent", kind: "booking_new", jobId: job.id, title: "New cleaning", body: `${prop.nickname} · ${b.checkOut} ${time}.` });
    },
```

Note: `api.reconcileDispatch()` — if the store value object is assigned to a const (e.g. `const value = {...}`), call it via that name; if not, refactor the setTimeout to call a hoisted `reconcileDispatch` function reference. Match the file's existing self-reference pattern (check how other actions call sibling actions).

- [ ] **Step 6: Cancel jobs for removed bookings inside reconcile**

Extend `reconcileDispatch` (before the alerts loop) to cancel a dispatched job whose stay vanished. Since `reconcileDispatch` only iterates existing bookings, add a separate sweep: for each job with an `externalBookingId` and status `pending`/`approved`, if no external booking has that id, mark it cancelled.

Add inside `reconcileDispatch`, before `if (!changed && !newJobs.length) return;`:

```ts
      const liveExtIds = new Set(patchedExt.map((b) => b.id));
      const cancelledJobIds: string[] = [];
      jobs.forEach((j) => {
        if (j.externalBookingId && (j.status === "pending" || j.status === "approved") && !liveExtIds.has(j.externalBookingId)) {
          cancelledJobIds.push(j.id);
        }
      });
      if (cancelledJobIds.length) {
        setJobs((p) => p.map((j) => cancelledJobIds.includes(j.id) ? { ...j, status: "cancelled" as const, cancelledAt: Date.now() } : j));
        changed = true;
      }
```

- [ ] **Step 7: Wire triggers**

Find `mockLinkProperties` (~line 1236) and `addManualStay` (~line 1280). At the end of each, after the `patchAcct(...)`, schedule a reconcile:

```ts
      setTimeout(() => api.reconcileDispatch(), 0);
```

(Use the same self-reference pattern confirmed in Step 5.) Also add a one-shot reconcile on load: find the existing hydration `useEffect` in the store hook and call `reconcileDispatch()` once after account data is loaded. If unsure which effect, add a small effect:

```ts
  useEffect(() => { api.reconcileDispatch(); }, [/* run when externalBookings length changes */ acct.externalBookings?.length]);
```

Place it near other `useEffect`s in the hook. Prefer the length-dependency version — it self-heals when mock bookings arrive.

- [ ] **Step 8: Verify compile + build**

Run: `npx tsc --noEmit`
Expected: clean. Fix any mismatch in persistence fn names (`dbInsertBookings`, `dbInsertJobs`, address upsert) against the actual names in the file.

Run: `npx vite build`
Expected: build succeeds.

- [ ] **Step 9: Commit**

```bash
git add src/context/AppStore.tsx
git commit -m "Add dispatch reconcile, config + late setters, and triggers to store"
```

---

## Task 4: Cleaner picker modal

**Files:**
- Create: `src/components/DispatchCleanerPicker.tsx`

- [ ] **Step 1: Create the picker**

Create `src/components/DispatchCleanerPicker.tsx`:

```tsx
import { useMemo } from "react";
import { useStore } from "../context/AppStore";
import { CLEANERS } from "../data/cleaners";
import type { Cleaner } from "../types";

// Picker over the full cleaner pool (real agents + mock directory), filtered to
// the property's city. mode="priority": multi-select toggling ids in `selected`.
// mode="single": tap a cleaner to pick exactly one (onPick).
export default function DispatchCleanerPicker({
  city, mode, selected = [], onToggle, onPick, onClose,
}: {
  city?: string;
  mode: "priority" | "single";
  selected?: string[];
  onToggle?: (id: string) => void;
  onPick?: (id: string) => void;
  onClose: () => void;
}) {
  const { cleaners } = useStore();
  const pool = useMemo(() => {
    const byId = new Map<string, Cleaner>();
    [...cleaners, ...CLEANERS].forEach((c) => { if (!byId.has(c.id)) byId.set(c.id, c); });
    let list = [...byId.values()];
    if (city) list = list.filter((c) => c.serviceCities?.includes(city) || c.city === city);
    return list.sort((a, b) => b.rating - a.rating);
  }, [cleaners, city]);

  return (
    <div className="modal__backdrop" onClick={onClose}>
      <div className="modal tall" onClick={(e) => e.stopPropagation()}>
        <div className="between" style={{ marginBottom: 12 }}>
          <b style={{ fontSize: 16 }}>{mode === "single" ? "Pick a cleaner" : "Add priority cleaners"}</b>
          <button className="iconbtn" onClick={onClose}>✕</button>
        </div>
        {pool.length === 0 && <p className="tiny muted">No cleaners in this city yet.</p>}
        {pool.map((c) => {
          const on = selected.includes(c.id);
          return (
            <button key={c.id} className="dpick" onClick={() => mode === "single" ? onPick?.(c.id) : onToggle?.(c.id)}>
              <span className="dpick__av">{(c.photoUrl ? <img src={c.photoUrl} alt="" className="dpick__avimg" /> : c.name.charAt(0))}</span>
              <span className="dpick__main">
                <b style={{ fontSize: 13.5 }}>{c.name}</b>
                <span className="tiny muted">★ {c.rating.toFixed(1)} · €{c.rateWeekday}/h · {c.city}</span>
              </span>
              {mode === "priority" && <span className={"dpick__check" + (on ? " on" : "")}>{on ? "✓" : "+"}</span>}
            </button>
          );
        })}
        {mode === "priority" && <button className="btn" style={{ marginTop: 12 }} onClick={onClose}>Done</button>}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify compile**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/components/DispatchCleanerPicker.tsx
git commit -m "Add cleaner picker modal for auto-dispatch priority + fallback"
```

---

## Task 5: Cleaning-setup UI on the linked-property card

**Files:**
- Modify: `src/screens/customer/Listings.tsx`

- [ ] **Step 1: Add imports + local state + store hooks**

At the top of `src/screens/customer/Listings.tsx`, extend imports:

```tsx
import { useState } from "react";
import DispatchCleanerPicker from "../../components/DispatchCleanerPicker";
import TimeSelect from "./TimeSelect"; // if TimeSelect is in components, fix path to "../../components/TimeSelect"
```

(Confirm TimeSelect's real path by checking its import in Account.tsx — it's `../../components/TimeSelect`. Use that.)

In the component body, pull the new store actions and existing data:

```tsx
  const { addresses, connectedListings, externalBookings, cleaners,
          setDispatchConfig, setBookingLate, assignDispatchCleaner } = useStore();
  const [expanded, setExpanded] = useState<string | null>(null);       // addressId of open setup
  const [picker, setPicker] = useState<{ addressId: string; mode: "priority" | "single"; bookingId?: string } | null>(null);
```

(Keep the existing `addresses`/`connectedListings` destructure — merge, don't duplicate.)

- [ ] **Step 2: Add a cleaner-name resolver helper (inside component)**

```tsx
  const cleanerName = (id: string) =>
    cleaners.find((c) => c.id === id)?.name
    ?? (id.startsWith("c") ? id : "Cleaner"); // mock ids fall through in the picker anyway
```

- [ ] **Step 3: Render the Cleaning-setup expander inside each linked card**

Inside the `linked.map((a) => { ... })` card, AFTER the `.propcard__top` div (which holds name/logos/share/bin) and BEFORE the card's closing `</div>`, insert:

```tsx
                <div className="dispatch">
                  <button className="dispatch__head" onClick={() => setExpanded(expanded === a.id ? null : a.id)}>
                    <span className={"dispatch__dot" + (a.autoDispatch ? " on" : "")} />
                    <span className="dispatch__summary">
                      {a.autoDispatch
                        ? `Auto-cleaning · ${(a.dispatchCleanerIds?.length ?? 0)} cleaner${(a.dispatchCleanerIds?.length ?? 0) === 1 ? "" : "s"} · ${a.dispatchTime || "11:00"} · ${a.dispatchHours || 2}h`
                        : "Set up auto-cleaning"}
                    </span>
                    <span className="dispatch__chev">{expanded === a.id ? "▾" : "▸"}</span>
                  </button>

                  {expanded === a.id && (
                    <div className="dispatch__body">
                      <label className="dispatch__row">
                        <span>Auto-book cleaning on checkout</span>
                        <span className={"switch" + (a.autoDispatch ? " on" : "")}
                          onClick={() => setDispatchConfig(a.id, { autoDispatch: !a.autoDispatch })}>
                          <span className="switch__dot" />
                        </span>
                      </label>

                      <div className="label" style={{ marginTop: 8 }}>Priority cleaners</div>
                      {(a.dispatchCleanerIds ?? []).map((id, idx) => (
                        <div key={id} className="dispatch__cl">
                          <span className="dispatch__rank">{idx + 1}</span>
                          <span className="grow">{cleanerName(id)}</span>
                          <button className="iconbtn" disabled={idx === 0} title="Up"
                            onClick={() => { const ids = [...(a.dispatchCleanerIds ?? [])]; [ids[idx - 1], ids[idx]] = [ids[idx], ids[idx - 1]]; setDispatchConfig(a.id, { dispatchCleanerIds: ids }); }}>↑</button>
                          <button className="iconbtn" disabled={idx === (a.dispatchCleanerIds!.length - 1)} title="Down"
                            onClick={() => { const ids = [...(a.dispatchCleanerIds ?? [])]; [ids[idx + 1], ids[idx]] = [ids[idx], ids[idx + 1]]; setDispatchConfig(a.id, { dispatchCleanerIds: ids }); }}>↓</button>
                          <button className="iconbtn" title="Remove"
                            onClick={() => setDispatchConfig(a.id, { dispatchCleanerIds: (a.dispatchCleanerIds ?? []).filter((x) => x !== id) })}>✕</button>
                        </div>
                      ))}
                      <button className="btn sm secondary" style={{ marginTop: 6 }}
                        onClick={() => setPicker({ addressId: a.id, mode: "priority" })}>+ Add cleaner</button>

                      <div className="row" style={{ gap: 10, marginTop: 12 }}>
                        <div className="grow">
                          <div className="label">Default start</div>
                          <TimeSelect value={a.dispatchTime || "11:00"} onChange={(t) => setDispatchConfig(a.id, { dispatchTime: t })} />
                        </div>
                        <div className="grow">
                          <div className="label">Hours</div>
                          <input className="input" type="number" min={1} step={0.5} value={a.dispatchHours || 2}
                            onChange={(e) => setDispatchConfig(a.id, { dispatchHours: +e.target.value })} />
                        </div>
                      </div>

                      <p className="tiny muted" style={{ marginTop: 8 }}>
                        First available cleaner in your list is booked automatically when a guest checks out. If none are free, we'll ask you to pick.
                      </p>

                      {/* upcoming checkouts for this property */}
                      {(() => {
                        const todayISO = new Date().toISOString().slice(0, 10);
                        const listingIds = connectedListings.filter((l) => l.addressId === a.id).map((l) => l.id);
                        const ups = (externalBookings ?? [])
                          .filter((b) => (b.addressId === a.id || listingIds.includes(b.listingId)) && b.checkOut >= todayISO)
                          .sort((x, y) => x.checkOut.localeCompare(y.checkOut));
                        if (!ups.length) return null;
                        return (
                          <>
                            <div className="label" style={{ marginTop: 12 }}>Upcoming checkouts</div>
                            {ups.map((b) => {
                              const needs = b.dispatchedJobId === "PENDING_OWNER";
                              const time = (a.dispatchTime || "11:00");
                              return (
                                <div key={b.id} className="dispatch__up">
                                  <div className="grow" style={{ minWidth: 0 }}>
                                    <b style={{ fontSize: 13 }}>{b.guest || "Guest"}</b>
                                    <div className="tiny muted">out {b.checkOut} · cleaning {b.lateCheckout ? dispTimeLabel(time, b.lateHours) : time}</div>
                                  </div>
                                  {needs ? (
                                    <button className="statuspill statuspill--warn" onClick={() => setPicker({ addressId: a.id, mode: "single", bookingId: b.id })}>Needs cleaner</button>
                                  ) : (
                                    <label className="dispatch__late">
                                      <span className={"switch sm" + (b.lateCheckout ? " on" : "")} onClick={() => setBookingLate(b.id, !b.lateCheckout)}><span className="switch__dot" /></span>
                                      <span className="tiny">Late</span>
                                    </label>
                                  )}
                                  {b.lateCheckout && !needs && (
                                    <input className="input dispatch__lh" type="number" min={1} step={1}
                                      value={b.lateHours ?? 3}
                                      onChange={(e) => setBookingLate(b.id, true, +e.target.value)} />
                                  )}
                                </div>
                              );
                            })}
                          </>
                        );
                      })()}
                    </div>
                  )}
                </div>
```

- [ ] **Step 4: Add the `dispTimeLabel` helper near the top of the file (module scope)**

Above the component, add:

```tsx
function dispTimeLabel(base: string, lateHours = 3): string {
  const [h, m] = base.split(":").map(Number);
  const t = h * 60 + m + Math.round(lateHours * 60);
  return `${String(Math.min(23, Math.floor(t / 60))).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}
```

- [ ] **Step 5: Render the picker modal once at the end of the component**

Before the component's final closing `</div>` of the modal (after the `linked.map`), add:

```tsx
        {picker && (
          <DispatchCleanerPicker
            city={addresses.find((a) => a.id === picker.addressId)?.address ? undefined : undefined}
            mode={picker.mode}
            selected={picker.mode === "priority" ? (addresses.find((a) => a.id === picker.addressId)?.dispatchCleanerIds ?? []) : []}
            onToggle={(id) => {
              const a = addresses.find((x) => x.id === picker.addressId); if (!a) return;
              const cur = a.dispatchCleanerIds ?? [];
              const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
              setDispatchConfig(a.id, { dispatchCleanerIds: next });
            }}
            onPick={(id) => { if (picker.bookingId) assignDispatchCleaner(picker.bookingId, id); setPicker(null); }}
            onClose={() => setPicker(null)}
          />
        )}
```

(`city` is left undefined for now so the picker shows all cleaners — property `city` isn't a field on PropertyAddress. If a city becomes available later, pass it. Keeping undefined is intentional, not a placeholder.)

- [ ] **Step 6: Verify compile + build**

Run: `npx tsc --noEmit`
Expected: clean. Fix TimeSelect import path if it errors.

Run: `npx vite build`
Expected: succeeds.

- [ ] **Step 7: Commit**

```bash
git add src/screens/customer/Listings.tsx
git commit -m "Add cleaning-setup UI, upcoming checkouts and late toggle to linked cards"
```

---

## Task 6: Styles

**Files:**
- Modify: `src/theme.css`

- [ ] **Step 1: Add dispatch + picker styles**

Append near the other `.linkedchan` / `.listchan` styles in `src/theme.css`:

```css
/* auto-dispatch setup on a linked-property card */
.dispatch { border-top: 1px solid var(--line); margin-top: 10px; padding-top: 8px; }
.dispatch__head { display: flex; align-items: center; gap: 8px; width: 100%; background: none; border: none; padding: 4px 0; cursor: pointer; color: var(--text); text-align: left; }
.dispatch__dot { width: 8px; height: 8px; border-radius: 999px; background: var(--muted); flex: none; }
.dispatch__dot.on { background: var(--green, #16a34a); }
.dispatch__summary { flex: 1; font-size: 12.5px; font-weight: 600; }
.dispatch__chev { color: var(--muted); font-size: 12px; }
.dispatch__body { padding: 6px 0 2px; }
.dispatch__row { display: flex; align-items: center; justify-content: space-between; font-size: 13px; }
.dispatch__cl { display: flex; align-items: center; gap: 6px; font-size: 13px; padding: 4px 0; }
.dispatch__rank { width: 18px; height: 18px; border-radius: 999px; background: rgba(31,111,235,.12); color: #1f6feb; font-size: 11px; font-weight: 700; display: inline-flex; align-items: center; justify-content: center; flex: none; }
.dispatch__up { display: flex; align-items: center; gap: 8px; padding: 6px 0; border-top: 1px solid var(--line); }
.dispatch__late { display: inline-flex; align-items: center; gap: 4px; }
.dispatch__lh { width: 54px; padding: 4px 6px; }
/* cleaner picker rows */
.dpick { display: flex; align-items: center; gap: 10px; width: 100%; background: none; border: none; border-bottom: 1px solid var(--line); padding: 10px 0; cursor: pointer; color: var(--text); text-align: left; }
.dpick__av { width: 34px; height: 34px; border-radius: 999px; background: var(--surface); display: inline-flex; align-items: center; justify-content: center; font-weight: 700; overflow: hidden; flex: none; }
.dpick__avimg { width: 100%; height: 100%; object-fit: cover; }
.dpick__main { display: flex; flex-direction: column; flex: 1; }
.dpick__check { width: 24px; height: 24px; border-radius: 999px; border: 1px solid var(--line); display: inline-flex; align-items: center; justify-content: center; color: var(--muted); }
.dpick__check.on { background: #1f6feb; color: #fff; border-color: #1f6feb; }
.switch.sm { transform: scale(.85); }
```

(If `.switch` / `.switch__dot` already exist, `.switch.sm` just scales them — verify those base classes exist; they're used elsewhere in Account.tsx, so they do.)

- [ ] **Step 2: Verify build**

Run: `npx vite build`
Expected: succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/theme.css
git commit -m "Style auto-dispatch setup card + cleaner picker"
```

---

## Task 7: Manual browser verification + push

**Files:** none (verification only)

- [ ] **Step 1: Run the app**

Run: `npx vite` (or `npm run dev`) and open the local URL. If the dev server won't run in this environment, rely on the successful `vite build` from prior tasks and note UI could not be exercised live.

- [ ] **Step 2: Golden path**

In the customer Account tab: connect a property (mock, via + Add → Connect accounts → confirm). Open Linked properties → the property's Cleaning setup → enable Auto-book, add 3 priority cleaners, set 11:00, 3h. Confirm mock upcoming checkouts appear and jobs are auto-created (check the agent Jobs tab shows them; customer gets "Cleaning booked").

- [ ] **Step 3: Priority fallback**

Reorder/verify: if cleaner #1's schedule makes them unavailable for a checkout date, cleaner #2 is chosen instead (mock availability uses Sundays + a per-id busy weekday — pick a date that clashes for #1).

- [ ] **Step 4: Needs-cleaner**

Configure priority cleaners whose city/day excludes the checkout so none are free → the upcoming row shows a "Needs cleaner" pill → tap → single picker → assign → job created.

- [ ] **Step 5: Late toggle**

Toggle Late on an upcoming checkout → cleaning time label shifts by 3h; change the hrs field → label updates. If a job already existed, confirm its time updated (agent Jobs).

- [ ] **Step 6: Report result to the user**

State clearly what was exercised live vs only compile-verified. Do not claim UI success for anything not actually seen in the browser.

- [ ] **Step 7: Final push**

```bash
git push
```

Report the deployed commit hash and remind the user to reopen the PWA (service-worker cache) to see it.

---

## Self-Review Notes

- **Spec coverage:** data model (T1) ✓; pure engine + reconcile (T2, T3) ✓; owner setup card w/ priority reorder + time + hours (T5) ✓; picker (T4) ✓; late toggle editable hrs + needs-cleaner pick (T5) ✓; cancel-on-removed-booking (T3 Step 6) ✓; PENDING_OWNER re-evaluation (reconcile skips only bookings with a set `dispatchedJobId`; assign clears it) ✓; triggers (T3 Step 7) ✓; styles (T6) ✓; manual verification (T7) ✓.
- **Open verification during implementation:** confirm exact persistence fn names (`dbInsertBookings`, `dbInsertJobs`, address upsert) and the store's sibling-action self-reference pattern (`api.` vs hoisted fn) in AppStore.tsx — Task 3 Steps 4/5/7 depend on matching them.
- **Known intentional non-placeholders:** picker `city` passed as `undefined` (PropertyAddress has no city field); `_nowMs` rename only if tsc complains.
