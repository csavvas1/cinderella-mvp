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
  _nowMs: number = Date.now(),
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
