import type { Cleaner } from "../types";
import type { AgentProfile } from "../context/AppStore";
import { getConfig } from "./platform";
import { CY_CITIES } from "./addressPresets";

// A row from the public_agents view (safe, browseable agent fields).
export interface PublicAgentRow {
  id: string;
  name: string | null;          // the agent's real name (from users.name via the view)
  agent_profile: AgentProfile | null;
  customer_rating: number | null;
  customer_reviews_count: number | null;
  account_no: number | null;
}

// Adapt a real agent account into a Cleaner so it flows through the same browse
// / filter / booking pipeline as the mock cleaners. Real agents start with no
// ratings/reviews (0) — they earn them from completed jobs later.
export function agentRowToCleaner(r: PublicAgentRow, fallbackName?: string): Cleaner | null {
  const p = r.agent_profile;
  // skip agents who haven't set a usable profile (no rate = not bookable yet)
  if (!p || !(p.rateWeekday > 0)) return null;
  return {
    id: r.id,
    name: p.displayName || r.name || fallbackName || "Cleaner",
    photo: "",
    photoUrl: p.photoUrl,
    rateWeekday: p.rateWeekday,
    rateWeekend: p.rateWeekend || p.rateWeekday,
    rating: r.customer_rating ?? 0,
    reviewsCount: 0,           // agent's own review count comes from completed jobs (later)
    jobsDone: 0,
    city: p.city || "Limassol",
    serviceCities: p.serviceCities?.length ? p.serviceCities : (p.city ? [p.city] : []),
    nationality: "",
    distanceKm: 0,
    bio: p.bio || "",
    verified: true,            // agents are verified before they can take jobs
    reviews: [],
    busySlots: [],
    workDays: p.workDays ?? [],
    workStart: p.workStart || "08:00",
    workEnd: p.workEnd || "18:00",
    extras: [],
  };
}

export const CLEANERS: Cleaner[] = [
  {
    id: "c1",
    name: "Maria Iakovou",
    photo: "",
    rateWeekday: 9,
    rateWeekend: 11,
    rating: 4.9,
    reviewsCount: 214,
    jobsDone: 612,
    cancellations: 4,
    city: "Limassol",
    serviceCities: ["Limassol"],
    nationality: "Cypriot",
    distanceKm: 1.2,
    bio: "Detail-obsessed, 6 years cleaning homes & short-lets. I bring my own eco supplies. Airbnb turnaround specialist.",
    verified: true,
    busySlots: [],
    workDays: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
    workStart: "08:00",
    workEnd: "18:00",
    extras: ["Ironing", "Deep clean", "Airbnb turnaround"],
    reviews: [
      { id: "r1", author: "Andreas P.", rating: 5, text: "Spotless turnaround between guests. Fast and reliable.", date: "2026-06-02" },
      { id: "r2", author: "Elena K.", rating: 5, text: "Honestly the best cleaner I have ever booked through any app. She arrived ten minutes early, brought her own eco-friendly supplies, and worked through the whole apartment methodically — kitchen, two bathrooms, bedrooms and the balcony. Every surface was spotless, she even folded the laundry I had left out and lined up the shoes by the door. My Airbnb guests left a five-star cleanliness review the very next day. I have already booked her as my weekly regular and would recommend her to anyone who wants a genuinely thorough, trustworthy clean.", date: "2026-05-21" },
      { id: "r3", author: "Nikos D.", rating: 4, text: "Great job, slightly late but messaged ahead.", date: "2026-05-10" },
    ],
  },
  {
    id: "c2",
    name: "Sofia Georgiou",
    photo: "",
    rateWeekday: 7,
    rateWeekend: 9,
    rating: 4.6,
    reviewsCount: 88,
    jobsDone: 240,
    cancellations: 22,
    city: "Limassol",
    serviceCities: ["Limassol"],
    nationality: "Greek",
    distanceKm: 3.5,
    bio: "Friendly and efficient. Happy to do laundry & ironing as extras. Flexible hours.",
    verified: true,
    busySlots: [],
    workDays: ["Mon", "Tue", "Wed", "Thu", "Fri"],
    workStart: "09:00",
    workEnd: "17:00",
    extras: ["Ironing", "Laundry", "Pet-friendly"],
    reviews: [
      { id: "r4", author: "Maria L.", rating: 5, text: "Lovely person, great with the ironing add-on.", date: "2026-06-05" },
      { id: "r5", author: "George C.", rating: 4, text: "Solid clean, good value.", date: "2026-05-18" },
    ],
  },
  {
    id: "c3",
    name: "Dmitri Volkov",
    photo: "",
    rateWeekday: 6,
    rateWeekend: 8,
    rating: 4.3,
    reviewsCount: 41,
    jobsDone: 96,
    city: "Nicosia",
    serviceCities: ["Nicosia"],
    nationality: "Russian",
    distanceKm: 5.0,
    bio: "Hard worker, great for big jobs and post-renovation cleans. Cheapest rate in the area.",
    verified: false,
    busySlots: [],
    workDays: ["Mon", "Wed", "Fri", "Sat", "Sun"],
    workStart: "07:00",
    workEnd: "20:00",
    extras: ["Deep clean", "Post-renovation"],
    reviews: [
      { id: "r6", author: "Anna S.", rating: 4, text: "Good for a deep clean. Strong and quick.", date: "2026-05-30" },
      { id: "r7", author: "Petros M.", rating: 5, text: "Did a huge post-reno clean, excellent.", date: "2026-05-12" },
    ],
  },
  {
    id: "c4",
    name: "Christina Pavlou",
    photo: "",
    rateWeekday: 12,
    rateWeekend: 14,
    rating: 5.0,
    reviewsCount: 167,
    jobsDone: 430,
    city: "Larnaca",
    serviceCities: ["Larnaca"],
    nationality: "Cypriot",
    distanceKm: 2.1,
    bio: "Premium service. Hotel-trained, perfect for luxury short-lets and high-standard homes. Worth every cent.",
    verified: true,
    busySlots: [],
    workDays: ["Tue", "Wed", "Thu", "Fri"],
    workStart: "10:00",
    workEnd: "16:00",
    extras: ["Deep clean", "Ironing", "Airbnb turnaround", "Pet-friendly"],
    reviews: [
      { id: "r8", author: "Sophia A.", rating: 5, text: "Five-star hotel level. My Airbnb reviews went up.", date: "2026-06-08" },
      { id: "r9", author: "Marios T.", rating: 5, text: "Flawless. Pricey but the best.", date: "2026-05-25" },
    ],
  },
  {
    id: "c5",
    name: "Elena Demetriou",
    photo: "",
    rateWeekday: 8,
    rateWeekend: 10,
    rating: 4.7,
    reviewsCount: 122,
    jobsDone: 318,
    city: "Paphos",
    serviceCities: ["Paphos"],
    nationality: "Filipino",
    distanceKm: 4.3,
    bio: "Reliable weekly-clean specialist. Build a routine with me and your place stays fresh.",
    verified: true,
    busySlots: [],
    workDays: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
    workStart: "08:00",
    workEnd: "19:00",
    extras: ["Laundry", "Pet-friendly"],
    reviews: [
      { id: "r10", author: "Kyriacos N.", rating: 5, text: "Books in every week, never misses.", date: "2026-06-01" },
      { id: "r11", author: "Despo H.", rating: 4, text: "Consistent and kind.", date: "2026-05-15" },
    ],
  },
  ...makeMockCleaners(),
];

// generate extra cleaners so filtering / ranking / pagination is visible at scale
function makeMockCleaners(): Cleaner[] {
  const names = [
    "Anna Charalambous", "Giorgos Pieri", "Nadia Petrova", "Marios Antoniou",
    "Katerina Loizou", "Pavlos Stylianou", "Irina Sokolova", "Costas Michael",
    "Despina Yiannaki", "Andri Kyriakou", "Bogdan Ilic", "Eleni Christou",
    "Stelios Hadji", "Olga Ivanova", "Marina Constanti",
  ];
  const photos = Array(15).fill("");
  const extraPool = [
    ["Ironing", "Deep clean"], ["Pet-friendly"], ["Laundry", "Ironing"],
    ["Deep clean", "Post-renovation"], ["Airbnb turnaround"], ["Ironing", "Pet-friendly", "Laundry"],
    ["Deep clean"], ["Airbnb turnaround", "Ironing"], ["Pet-friendly", "Laundry"], ["Deep clean", "Ironing"],
  ];
  const nationalities = ["Cypriot", "Greek", "Russian", "Filipino", "Bulgarian", "Romanian", "Ukrainian", "Georgian"];
  const dayPresets = [
    ["Mon", "Tue", "Wed", "Thu", "Fri"],
    ["Mon", "Wed", "Fri", "Sat"],
    ["Tue", "Thu", "Sat", "Sun"],
    ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
    ["Wed", "Thu", "Fri", "Sat", "Sun"],
  ];
  return names.map((name, i): Cleaner => {
    const rateWeekday = 6 + ((i * 3) % 9); // 6..14
    const rating = +(3.8 + ((i * 7) % 13) / 10).toFixed(1); // 3.8..5.0
    const reviewsCount = 8 + ((i * 37) % 240);
    const distanceKm = +(0.6 + ((i * 13) % 110) / 10).toFixed(1); // 0.6..11
    // spread cleaners across all cities; every 3rd also covers a neighbouring one
    const homeCity = CY_CITIES[i % CY_CITIES.length];
    const alsoCity = CY_CITIES[(i + 1) % CY_CITIES.length];
    const serviceCities = i % 3 === 0 ? [homeCity, alsoCity] : [homeCity];
    return {
      id: "c" + (6 + i),
      name,
      photo: photos[i % photos.length],
      rateWeekday,
      rateWeekend: rateWeekday + 2,
      rating: Math.min(5, rating),
      reviewsCount,
      city: homeCity,
      serviceCities,
      nationality: nationalities[i % nationalities.length],
      distanceKm,
      bio: `Experienced cleaner available across ${serviceCities.join(" & ")}.`,
      verified: i % 4 !== 0,
      jobsDone: Math.round(reviewsCount * (2.2 + (i % 5) * 0.3)),
      busySlots: [],
      workDays: dayPresets[i % dayPresets.length],
      workStart: i % 2 ? "08:00" : "09:00",
      workEnd: i % 3 ? "18:00" : "20:00",
      extras: extraPool[i % extraPool.length],
      reviews: [
        { id: `gr${i}a`, author: "Client", rating: Math.round(rating), text: "Good, thorough clean.", date: "2026-05-20" },
      ],
    };
  });
}

// Estimate how long a whole-home clean takes, as a range, from the property's
// size + type. Houses get a multiplier (more floors / outdoor / bigger rooms).
// Returns hours rounded to the nearest 0.5, plus a suggested mid-point.
export function estimateCleaningHours(p: {
  propertyType?: "apartment" | "house";
  bedrooms: number;
  bathrooms: number;
  kitchens: number;
  commonRooms: number;
}): { min: number; max: number; suggested: number } {
  // base minutes per room category
  const mins =
    60 +                       // fixed setup / hallway / general
    p.bedrooms * 35 +
    p.bathrooms * 30 +
    p.kitchens * 40 +
    p.commonRooms * 25;
  const houseMult = p.propertyType === "house" ? 1.35 : 1;
  const center = (mins * houseMult) / 60; // hours
  const round = (h: number) => Math.max(1, Math.round(h * 2) / 2);
  const min = round(center * 0.85);
  const max = round(center * 1.15);
  const suggested = round(center);
  return { min, max, suggested };
}

// Mock availability: a cleaner is unavailable on Sundays, and on a
// deterministic "busy" weekday derived from their id, so changing a booking
// date can realistically clash and force picking another cleaner.
export function isCleanerAvailable(cleanerId: string, dateISO: string): boolean {
  const d = new Date(dateISO + "T00:00:00");
  if (isNaN(d.getTime())) return true;
  const dow = d.getDay(); // 0 = Sunday
  if (dow === 0) return false;
  const seed = cleanerId.split("").reduce((s, ch) => s + ch.charCodeAt(0), 0);
  const busyDow = (seed % 5) + 1; // Mon..Fri
  // unavailable on their busy weekday only on odd weeks (adds variety)
  const week = Math.floor(d.getDate() / 7);
  if (dow === busyDow && week % 2 === 1) return false;
  return true;
}

/* ---- booking-aware availability ---- */

interface SlotBooking {
  cleanerId: string;
  date: string;     // ISO yyyy-mm-dd
  time: string;     // "HH:MM"
  durationHours: number;
  status: string;
  id?: string;
}

function toMin(t: string) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

// two [start,end) minute ranges overlap?
function rangesOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number) {
  return aStart < bEnd && bStart < aEnd;
}

// Minimum gap (minutes) a cleaner needs between two jobs for travel/turnaround.
// An existing booking blocks not just its own time but this buffer either side,
// so back-to-back requests with no breathing room don't show as available.
export const BOOKING_BUFFER_MIN = 30;

const WDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Expand a requested booking into the concrete dates it occupies.
// One-off -> [date]. weekly/biweekly -> the chosen weekdays for the next ~8 weeks
// starting from `date`.
// endDate optional. If omitted, treat as "indefinite" and generate a long
// horizon (26 weeks) — a real backend would roll these forward continuously.
const INDEFINITE_WEEKS = 26;

export function occurrenceDates(
  date: string,
  recurrence: "none" | "weekly" | "biweekly",
  recurDays: string[],
  endDate?: string
): string[] {
  if (recurrence === "none" || !recurDays || recurDays.length === 0) return [date];
  const start = new Date(date + "T00:00:00");
  if (isNaN(start.getTime())) return [date];
  const end = endDate ? new Date(endDate + "T23:59:59") : null;
  const step = recurrence === "biweekly" ? 14 : 7;
  const maxWeeks = end ? 520 : INDEFINITE_WEEKS; // cap loop if an end date is set
  const out: string[] = [];
  for (let w = 0; w < maxWeeks; w++) {
    for (let off = 0; off < 7; off++) {
      const d = new Date(start);
      d.setDate(start.getDate() + w * step + off);
      if (w === 0 && d < start) continue;
      if (end && d > end) return out.length ? out : [date];
      if (recurDays.includes(WDAY[d.getDay()])) {
        out.push(
          `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
        );
      }
    }
  }
  return out.length ? out : [date];
}

// Is the cleaner free for ALL requested dates at the given time/duration,
// given the existing bookings? Ignores the booking being edited (excludeId).
export function isCleanerFree(
  cleanerId: string,
  dates: string[],
  time: string,
  durationHours: number,
  bookings: SlotBooking[],
  excludeId?: string,
  // Pass the resolved cleaner (real agent OR mock) so working-hours checks apply
  // to real agents too; falls back to the mock list when omitted.
  cleanerObj?: Cleaner
): boolean {
  const reqStart = toMin(time);
  const reqEnd = reqStart + Math.round(durationHours * 60);
  const cleaner = cleanerObj ?? CLEANERS.find((c) => c.id === cleanerId);
  const isReal = !!cleanerObj; // real agents use their real schedule, not the mock rng
  for (const date of dates) {
    // Mock cleaners get the pseudo-random busy-day rule; real agents rely purely
    // on their declared working days + actual bookings.
    if (!isReal && !isCleanerAvailable(cleanerId, date)) return false;
    // must be within the cleaner's working days AND hours — a slot outside these
    // would otherwise show as bookable but only ever go to "pending", so exclude
    // it up front to avoid guaranteed rejections.
    if (cleaner) {
      const dow = WDAY[new Date(date + "T00:00:00").getDay()];
      if (!cleaner.workDays.includes(dow)) return false;
      if (reqStart < toMin(cleaner.workStart) || reqEnd > toMin(cleaner.workEnd)) return false;
    }
    // clash with an existing booking for this cleaner on this date
    const clash = bookings.some((b) => {
      if (b.id && excludeId && b.id === excludeId) return false;
      if (b.cleanerId !== cleanerId) return false;
      if (b.date !== date) return false;
      if (b.status === "cancelled") return false;
      const bStart = toMin(b.time) - BOOKING_BUFFER_MIN;
      const bEnd = toMin(b.time) + Math.round(b.durationHours * 60) + BOOKING_BUFFER_MIN;
      return rangesOverlap(reqStart, reqEnd, bStart, bEnd);
    });
    if (clash) return false;
  }
  return true;
}

// Availability for a slot WITH a short human reason when unavailable.
// Used by the Favourites view so we can show busy favourites with context
// instead of hiding them.
export function availabilityStatus(
  cleanerId: string,
  dates: string[],
  time: string,
  durationHours: number,
  bookings: SlotBooking[],
  cleanerObj?: Cleaner
): { free: boolean; reason: string } {
  const reqStart = toMin(time);
  const reqEnd = reqStart + Math.round(durationHours * 60);
  const cleaner = cleanerObj ?? CLEANERS.find((c) => c.id === cleanerId);
  const isReal = !!cleanerObj;
  for (const date of dates) {
    const d = new Date(date + "T00:00:00");
    const dow = d.getDay();
    if (dow === 0) return { free: false, reason: "Off on Sundays" };
    if (!isReal && !isCleanerAvailable(cleanerId, date)) {
      return { free: false, reason: `Day off on ${WDAY[dow]}` };
    }
    if (cleaner) {
      if (!cleaner.workDays.includes(WDAY[dow])) {
        return { free: false, reason: `Day off on ${WDAY[dow]}` };
      }
      if (reqStart < toMin(cleaner.workStart) || reqEnd > toMin(cleaner.workEnd)) {
        return { free: false, reason: `Outside hours (${cleaner.workStart}–${cleaner.workEnd})` };
      }
    }
    const clash = bookings.some((b) => {
      if (b.cleanerId !== cleanerId) return false;
      if (b.date !== date) return false;
      if (b.status === "cancelled") return false;
      const bStart = toMin(b.time) - BOOKING_BUFFER_MIN;
      const bEnd = toMin(b.time) + Math.round(b.durationHours * 60) + BOOKING_BUFFER_MIN;
      return rangesOverlap(reqStart, reqEnd, bStart, bEnd);
    });
    if (clash) return { free: false, reason: "Too close to another job" };
  }
  return { free: true, reason: "" };
}

// Decide whether a booking auto-confirms or needs cleaner approval.
// Auto when: within the cleaner's work days + hours, no clash, and >= 2h notice.
// Otherwise pending (cleaner must accept). Travel-buffer check is noted as a
// future addition (needs maps).
// Customers below this average rating cannot auto-book — the cleaner must
// manually approve so they can decline a low-rated household. Kept as a
// back-compat export; the live value comes from getConfig().booking.
export const MIN_AUTO_ACCEPT_RATING = getConfig().booking.minAutoAcceptRating;

export function autoAcceptDecision(
  cleanerId: string,
  date: string,
  time: string,
  durationHours: number,
  bookings: SlotBooking[],
  nowMs: number = Date.now(),
  customerRating?: number,        // undefined = unrated (new customer)
  customerReviewsCount: number = 0,
  cleanerObj?: Cleaner            // resolved cleaner (real agent or mock)
): { decision: "auto" | "pending"; reason: string } {
  const cleaner = cleanerObj ?? CLEANERS.find((c) => c.id === cleanerId);
  if (!cleaner) return { decision: "pending", reason: "Unknown cleaner" };

  const cfg = getConfig().booking;
  // two-way rating gate: a rated customer below the floor must be manually
  // approved. Unrated customers (no reviews yet) are allowed to auto-book.
  if (customerReviewsCount > 0 && customerRating !== undefined && customerRating < cfg.minAutoAcceptRating) {
    return { decision: "pending", reason: `Customer rating ${customerRating.toFixed(1)} — needs your approval` };
  }

  // clash / day-off
  if (!isCleanerFree(cleanerId, [date], time, durationHours, bookings, undefined, cleaner)) {
    return { decision: "pending", reason: "Time clashes with another job" };
  }

  const d = new Date(date + "T00:00:00");
  const dow = WDAY[d.getDay()];
  if (!cleaner.workDays.includes(dow)) {
    return { decision: "pending", reason: `Outside ${cleaner.name.split(" ")[0]}'s working days` };
  }

  const start = toMin(time);
  const end = start + Math.round(durationHours * 60);
  if (start < toMin(cleaner.workStart) || end > toMin(cleaner.workEnd)) {
    return { decision: "pending", reason: `Outside working hours (${cleaner.workStart}–${cleaner.workEnd})` };
  }

  // notice window from config
  const startMs = new Date(`${date}T${time}:00`).getTime();
  if (!isNaN(startMs) && startMs - nowMs < cfg.noticeHours * 60 * 60 * 1000) {
    return { decision: "pending", reason: `Short-notice booking (under ${cfg.noticeHours}h)` };
  }

  return { decision: "auto", reason: "Within working hours and free" };
}

// true if the ISO date is Sat/Sun
export function isWeekend(dateISO: string): boolean {
  const d = new Date(dateISO + "T00:00:00");
  if (isNaN(d.getTime())) return false;
  const dow = d.getDay();
  return dow === 0 || dow === 6;
}

export const ALL_EXTRAS = ["Ironing", "Laundry", "Deep clean", "Pet-friendly", "Airbnb turnaround", "Post-renovation"];

// derived trust badges from cleaner stats
export function cleanerBadges(c: Cleaner): { label: string; cls: string }[] {
  const out: { label: string; cls: string }[] = [];
  // Verified is a hard requirement to work on the platform, so it carries no
  // signal in the list — omitted. Reliability lives on the detail page as a
  // plain cancellation-rate figure, not a badge.
  if (c.rating >= 4.8) out.push({ label: "★ Top rated", cls: "amber" });
  if (c.reviewsCount >= 100) out.push({ label: "100+ jobs", cls: "sky" });
  return out;
}

export function marketStats(period: "weekday" | "weekend" = "weekday") {
  const pick = (c: (typeof CLEANERS)[number]) => (period === "weekend" ? c.rateWeekend : c.rateWeekday);
  const rates = CLEANERS.map(pick).sort((a, b) => a - b);
  const n = rates.length;
  const median = n % 2 ? rates[(n - 1) / 2] : (rates[n / 2 - 1] + rates[n / 2]) / 2;
  // mode = most frequently charged rate; if every rate is unique, there is no
  // meaningful mode, so fall back to median for the "typical" figure.
  const counts: Record<number, number> = {};
  rates.forEach((r) => (counts[r] = (counts[r] ?? 0) + 1));
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  const hasRealMode = Number(top[1]) > 1;
  const avgRating =
    Math.round((CLEANERS.reduce((a, c) => a + c.rating, 0) / CLEANERS.length) * 10) / 10;
  return {
    min: Math.min(...rates),
    max: Math.max(...rates),
    avg: Math.round((rates.reduce((a, b) => a + b, 0) / rates.length) * 10) / 10,
    median,
    mode: hasRealMode ? Number(top[0]) : null,
    typical: hasRealMode ? Number(top[0]) : median,
    typicalLabel: hasRealMode ? "Most common" : "Typical (median)",
    count: CLEANERS.length,
    avgRating,
    period,
  };
}
