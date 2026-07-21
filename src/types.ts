export type Role = "customer" | "agent";

export interface Review {
  id: string;
  author: string;
  rating: number;
  text: string;
  date: string;
}

export interface Cleaner {
  id: string;
  name: string;
  photo: string; // emoji avatar fallback for the mock
  photoUrl?: string; // uploaded profile photo (data URL) — preferred if set
  rateWeekday: number; // EUR / hr
  rateWeekend: number;
  rating: number; // 0-5
  reviewsCount: number;
  city: string;              // home / primary city
  serviceCities: string[];   // cities this cleaner will work in; drives matching
  nationality: string;
  distanceKm: number;
  bio: string;
  verified: boolean;
  jobsDone: number; // completed cleanings on the platform
  cancellations?: number; // lifetime cleaner-initiated cancellations (reliability signal)
  reviews: Review[];
  // mock availability: hours of day (0-23) this cleaner is free
  busySlots: string[]; // e.g. ["2026-07-03T11:00"]
  // working window for auto-accept
  workDays: string[];  // ["Mon","Tue",...]
  workStart: string;   // "08:00" (flattened week window — fallback)
  workEnd: string;     // "18:00"
  // per-day hours (real agents). When present, availability checks the specific
  // day's slots instead of the flattened workStart/workEnd window, so a split
  // schedule (e.g. Mon 09-12 + Sat 14-18) doesn't show false midday availability.
  daySchedule?: Record<string, { start: string; end: string }[]>;
  extras: string[];    // ["Ironing","Deep clean","Pet-friendly",...]
}

export interface Card {
  id: string;
  nickname: string;
  last4: string;
  brand: string;
  // JCC tokenisation: the raw PAN is entered ONLY on JCC's hosted page and never
  // touches this app or our storage. We keep the opaque token JCC returns and
  // charge against it. Storing a real PAN here would breach PCI-DSS.
  jccToken?: string;
}

export type PropertyType = "apartment" | "house";

// ---- channel manager (short-let sync) ----
export type ListingPlatform = "airbnb" | "booking" | "vrbo" | "google" | "expedia" | "tripadvisor" | "agoda" | "hostelworld" | "other";

export interface ConnectedListing {
  id: string;
  platform: ListingPlatform;
  name: string;
  icalUrl: string;
  addressId?: string;   // linked saved PropertyAddress
  connectedAt: number;
  // Beds24 channel-manager (absent for legacy iCal-only listings)
  beds24PropertyId?: number | null;
  billingActive?: boolean;
}

export interface ExternalBooking {
  id: string;
  listingId: string;
  platform: ListingPlatform;
  guest: string;
  checkIn: string;      // ISO date
  checkOut: string;     // ISO date
  addressId?: string;
  // ---- auto-dispatch ----
  lateCheckout?: boolean;    // owner flagged this stay as a late checkout
  lateHours?: number;        // hours added to dispatchTime when late (default 3)
  dispatchedJobId?: string;  // idempotency: job id once created, or "PENDING_OWNER"
}

// ---- Pro channel-manager UI (mock; no real API yet) ----
// Richer reservation used by the Reservations calendar + booking detail sheet.
export interface Reservation {
  id: string;
  platform: ListingPlatform;
  guest: string;
  property: string;
  propertyPhoto: string;   // URL / data-URI
  checkIn: string;         // ISO date
  checkOut: string;        // ISO date
  nights: number;
  guests: number;
  status: "booked" | "cancelled" | "completed";
  total?: number;
  currency?: string;
}

// A single message in a guest thread (unified inbox).
export interface ChatMessage {
  id: string;
  threadId: string;
  from: "guest" | "host";
  title?: string;          // e.g. "Booking Confirmation", "Pre-Arrival — 2 Days Before"
  body: string;
  at: number;              // epoch ms
  channel: "email" | "airbnb" | "booking";
  automated?: boolean;
  aiReply?: boolean;
}

// A conversation shown in the unified inbox list. `kind` distinguishes a guest
// (OTA / Pro) thread from a cleaner<->customer chat thread.
export interface ChatThread {
  id: string;
  kind: "guest" | "cleaner";
  guest: string;           // guest name, or cleaner name for kind==="cleaner"
  property: string;
  reservationId?: string;
  cleanerId?: string;      // set for kind==="cleaner"
  platform: ListingPlatform;
  subject: string;         // sub-line in the list ("Day of Arrival — Welcome Email")
  dateRange: string;       // "18 Jul - 24 Jul"
  lastAt: number;
  unread: boolean;
}

export interface PropertyAddress {
  id: string;
  nickname: string;
  address: string;
  propertyType: PropertyType;
  apartmentNumber?: string; // required when propertyType === "apartment"
  floor?: string;           // apartment floor (optional)
  bedrooms: number;
  bathrooms: number;
  kitchens: number;
  commonRooms: number;
  linkedCardId?: string;
  lat?: number;   // exact map pin (customer-placed) so the agent finds the door
  lng?: number;
  exportToken?: string; // guards the public combined-iCal export feed for this property
  shareCode?: string;   // invite code to share this property with a partner
  isShared?: boolean;   // true when this property was shared TO me (I'm a partner, not owner)
  memberCount?: number; // how many partners (besides the owner) have access to this property
  // ---- auto-dispatch (short-let checkout -> auto cleaning job) ----
  autoDispatch?: boolean;         // master toggle for this property
  dispatchCleanerIds?: string[];  // priority order; index 0 = first choice
  dispatchTime?: string;          // default cleaning start, e.g. "11:00"
  dispatchHours?: number;         // default cleaning duration (hours)
}

export type Recurrence = "none" | "weekly" | "biweekly";

export interface Booking {
  id: string;
  cleanerId: string;
  cleanerName: string;
  cleanerPhoto: string;
  addressNickname: string;
  address: string;
  date: string; // ISO date
  time: string; // "11:00"
  durationHours: number;
  ratePerHour: number;
  total: number;          // job value the customer pays
  commission?: number;    // platform's 15% cut
  cleanerPay?: number;    // what the cleaner receives (total - commission)
  scope: "whole" | "partial";
  // confirmed = auto-accepted; awaiting = needs cleaner approval;
  // upcoming kept for seed back-compat (treated as confirmed)
  status: "confirmed" | "awaiting" | "upcoming" | "completed" | "cancelled" | "declined";
  jobId?: string;
  // Set when this cleaning was booked as a turnaround for a specific guest stay
  // (channel-manager checkout). Lets us react if that guest stay is later
  // cancelled — the cleaning may no longer be needed.
  externalBookingId?: string;
  createdAt?: number; // epoch ms when booked — drives the modify grace window
  recurring: boolean;
  recurrence: Recurrence;
  recurDays?: string[];
  seriesId?: string;
  cardId?: string;
  rating?: number;
  reviewText?: string;
  tip?: number;
  urgent?: boolean;
  addressId?: string;   // the property this booking is for (enables shared-property RLS)
  // who ended the booking — drives customer-facing wording + which alerts count.
  cancelledBy?: "customer" | "cleaner";
  cancelledAt?: number;
  confirmedAt?: number;   // when the booking became confirmed (audit / lifecycle)
  // customer tapped the X on a cancelled/declined row — hide it from their
  // Calendar list while keeping the record (mirror of Job.dismissedByAgent).
  dismissedByCustomer?: boolean;
  refund?: {
    status: "pending" | "approved" | "declined";
    reason: string;
    note: string;
    hasPhoto: boolean;
    photos?: string[];   // evidence photo URLs (proofs bucket)
    date: string;
    agentResponse?: { stance: "accept" | "dispute"; note: string; hasProof: boolean; proofPhotos?: string[]; date: string };
  };
}

export interface Job {
  id: string;
  customerName: string;
  customerPhone?: string;   // so the cleaner can call the customer on the job day
  beforePhotos?: string[];  // proof photo URLs (proofs bucket)
  afterPhotos?: string[];
  type: "Residential" | "Office" | "Short-let";
  propertyType?: PropertyType; // "apartment" | "house" — pulled from customer property
  apartmentNumber?: string;
  floor?: string;
  address: string;
  date: string;
  time: string;
  durationHours: number;
  ratePerHour: number;
  cleanerPay?: number;   // what the cleaner earns from this job (after commission)
  bedrooms: number;
  bathrooms: number;
  kitchens: number;
  commonRooms: number;
  distanceFromHomeKm: number;
  distanceFromPrevKm: number | null;
  lat?: number;   // exact map pin from the booked property, for the agent
  lng?: number;
  status: "pending" | "approved" | "declined" | "completed" | "cancelled" | "modified";
  cleanerId?: string;
  cleanerUid?: string;   // the real agent account this job is assigned to (null for mock cleaners)
  customerUid?: string;  // the booker's account id (target for agent->customer alerts)
  bookingId?: string;
  externalBookingId?: string;  // the guest stay that generated this cleaning job
  autoAccepted?: boolean;
  // an auto-accepted job lands already "approved" (no accept needed) but is still
  // NEW to the agent — badges until they open it. Cleared when they view the job.
  seenByAgent?: boolean;
  // ---- agent response timeline (audit / SLA) ----
  alertedAt?: number;    // when the job alert was raised (job created)
  respondedAt?: number;  // when the agent accepted/declined a pending request
  response?: "accepted" | "declined";  // the agent's decision
  outcome?: "completed" | "cancelled" | "declined";  // final resolution
  outcomeAt?: number;    // when the final state was reached
  // agent tapped the X on a cancelled row — hide it from the Jobs list while
  // keeping the record everywhere else (calendar, notifications, history).
  dismissedByAgent?: boolean;
  // epoch ms the customer cancelled — drives the "Cancelled" row + sort.
  cancelledAt?: number;
  // epoch ms the CLEANER backed out of a job they had already accepted. This is
  // the countable event for the cleaner's monthly cancellation cap (declining a
  // still-pending request does NOT count).
  cleanerCancelledAt?: number;
  // when the customer changes a confirmed job's date/time/duration, status flips
  // to "modified" so the agent must acknowledge the change on the Jobs tab.
  // prevStatus restores the job (usually "approved") once acknowledged.
  prevStatus?: "pending" | "approved" | "declined" | "completed" | "cancelled" | "modified";
  modifiedAt?: number;
  modifiedNote?: string;   // human summary of what changed (e.g. "Time 11:00 → 14:00")
  // original schedule captured at the FIRST unacknowledged change, so the detail
  // page can show a full before/after even after several edits.
  prevDate?: string;
  prevTime?: string;
  prevDurationHours?: number;
  // two-way rating: snapshot of the customer's reputation at booking time so the
  // agent sees who they're letting into a home before accepting.
  customerRating?: number;       // 0-5
  customerReviewsCount?: number;
  customerCancellations?: number; // snapshot: customer's lifetime cancellations at booking time
  // agent's rating of the customer after the job (cleanliness, access, behaviour)
  agentRatingOfCustomer?: number;
  agentRatingNote?: string;
}

// Reputation a customer carries on the platform (rated BY agents). New customers
// start unrated; below MIN_AUTO_ACCEPT_RATING they cannot auto-book — the agent
// must manually approve.
export interface CustomerReputation {
  rating: number;        // 0-5 average
  reviewsCount: number;
  cancellations?: number; // lifetime customer-initiated cancellations (reliability signal)
}

// ---- in-app notifications ----
// Which side of the app a notification is for. A single account can be both a
// customer and an agent, so the bell shows only the alerts for the side you're
// currently viewing.
export type NotifAudience = "customer" | "agent";

export type NotifKind =
  | "booking_new"        // agent: a customer booked / requested you
  | "booking_accepted"   // customer: the cleaner accepted
  | "booking_declined"   // customer: the cleaner declined
  | "booking_cancelled"  // both: the other side cancelled
  | "booking_modified"   // both: a booking's details changed
  | "refund_requested"   // agent: customer opened a refund
  | "refund_resolved"    // customer: refund approved/declined
  | "job_completed"      // customer: cleaner marked the job done
  | "review_new"         // agent: customer left a review
  | "tip_new"            // agent: customer tipped
  | "property_shared";   // customer: a partner shared a property with you

// ---- legal consent proof ----
// One acceptance record per legal document the user agreed to. Stores the exact
// version + timestamp so there is evidence of consent to that text. If a doc's
// version later increases, the stored version no longer matches and the app can
// re-prompt for fresh consent.
export interface ConsentRecord {
  docId: string;
  version: number;
  acceptedAt: number;   // epoch ms
}

export interface AppNotification {
  id: string;
  audience: NotifAudience;
  kind: NotifKind;
  title: string;
  body: string;
  createdAt: number;     // epoch ms
  read: boolean;
  bookingId?: string;    // deep-link target (customer side)
  jobId?: string;        // deep-link target (agent side)
}
