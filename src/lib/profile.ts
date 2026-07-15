import type { AgentProfile } from "../context/AppStore";
import type { AppNotification, Booking, Card, ConnectedListing, CustomerReputation, ExternalBooking, Job, ListingPlatform, NotifAudience, NotifKind, PropertyAddress, Recurrence, Review } from "../types";

// ---- reviews: Review <-> public.reviews row ---------------------------------
export interface ReviewRow {
  id: string;
  author_id: string | null;
  cleaner_id: string;
  author: string;
  rating: number;
  text: string;
  date: string;
}
export function rowToReview(r: ReviewRow): Review {
  return { id: r.id, author: r.author, rating: r.rating, text: r.text, date: r.date };
}
// Review -> row. author_id + cleaner_id are added by the caller (it knows the
// signed-in user id and which cleaner the review is about).
export function reviewToRow(r: Review): Record<string, unknown> {
  return { id: r.id, author: r.author, rating: r.rating, text: r.text, date: r.date };
}

// ---- connected listings: ConnectedListing <-> public.connected_listings ------
export interface ListingRow {
  id: string;
  user_id: string;
  platform: ListingPlatform;
  name: string;
  ical_url: string;
  address_id: string | null;
  connected_at: string;
}
export function rowToListing(r: ListingRow): ConnectedListing {
  return {
    id: r.id, platform: r.platform, name: r.name, icalUrl: r.ical_url,
    addressId: r.address_id ?? undefined, connectedAt: new Date(r.connected_at).getTime(),
  };
}
export function listingToRow(l: ConnectedListing): Record<string, unknown> {
  return {
    id: l.id, platform: l.platform, name: l.name, ical_url: l.icalUrl,
    address_id: l.addressId ?? null, connected_at: new Date(l.connectedAt).toISOString(),
  };
}

// ---- external bookings (guest stays): ExternalBooking <-> public.external_bookings
export interface ExternalBookingRow {
  id: string;
  user_id: string;
  listing_id: string | null;
  platform: ListingPlatform;
  guest: string;
  check_in: string;
  check_out: string;
  address_id: string | null;
}
export function rowToExternalBooking(r: ExternalBookingRow): ExternalBooking {
  return {
    id: r.id, listingId: r.listing_id ?? "", platform: r.platform, guest: r.guest,
    checkIn: r.check_in, checkOut: r.check_out, addressId: r.address_id ?? undefined,
  };
}
export function externalBookingToRow(b: ExternalBooking): Record<string, unknown> {
  return {
    id: b.id, listing_id: b.listingId || null, platform: b.platform, guest: b.guest,
    check_in: b.checkIn, check_out: b.checkOut, address_id: b.addressId ?? null,
  };
}

// ---- notifications: AppNotification <-> public.notifications row -------------
export interface NotifRow {
  id: string;
  user_id: string;
  audience: NotifAudience;
  kind: string;
  title: string;
  body: string;
  read: boolean;
  booking_id: string | null;
  job_id: string | null;
  created_at: string;
}

export function rowToNotif(r: NotifRow): AppNotification {
  return {
    id: r.id,
    audience: r.audience,
    kind: r.kind as NotifKind,
    title: r.title,
    body: r.body,
    read: r.read,
    bookingId: r.booking_id ?? undefined,
    jobId: r.job_id ?? undefined,
    createdAt: new Date(r.created_at).getTime(),
  };
}

export function notifToRow(n: AppNotification): Record<string, unknown> {
  return {
    id: n.id,
    audience: n.audience,
    kind: n.kind,
    title: n.title,
    body: n.body,
    read: n.read,
    booking_id: n.bookingId ?? null,
    job_id: n.jobId ?? null,
    created_at: new Date(n.createdAt).toISOString(),
  };
}

// ---- bookings: Booking <-> public.bookings row ------------------------------
export interface BookingRow {
  id: string;
  user_id: string;
  cleaner_id: string;
  cleaner_name: string;
  cleaner_photo: string | null;
  address_nickname: string;
  address: string;
  date: string;
  time: string;
  duration_hours: number;
  rate_per_hour: number;
  total: number;
  commission: number | null;
  cleaner_pay: number | null;
  scope: string;
  status: Booking["status"];
  job_id: string | null;
  external_booking_id: string | null;
  recurring: boolean;
  recurrence: Recurrence;
  recur_days: string[] | null;
  series_id: string | null;
  card_id: string | null;
  payment_method: string | null;
  rating: number | null;
  review_text: string | null;
  tip: number | null;
  urgent: boolean | null;
  cancelled_by: "customer" | "cleaner" | null;
  cancelled_at: string | null;
  confirmed_at: string | null;
  dismissed_by_customer: boolean | null;
  refund: Booking["refund"] | null;
  address_id: string | null;
}

export function rowToBooking(r: BookingRow): Booking {
  return {
    id: r.id,
    cleanerId: r.cleaner_id,
    cleanerName: r.cleaner_name,
    cleanerPhoto: r.cleaner_photo ?? "",
    addressNickname: r.address_nickname,
    address: r.address,
    date: r.date,
    time: r.time,
    durationHours: r.duration_hours,
    ratePerHour: r.rate_per_hour,
    total: r.total,
    commission: r.commission ?? undefined,
    cleanerPay: r.cleaner_pay ?? undefined,
    scope: (r.scope as Booking["scope"]) ?? "whole",
    status: r.status,
    jobId: r.job_id ?? undefined,
    externalBookingId: r.external_booking_id ?? undefined,
    recurring: r.recurring,
    recurrence: r.recurrence,
    recurDays: r.recur_days ?? undefined,
    seriesId: r.series_id ?? undefined,
    cardId: r.card_id ?? r.payment_method ?? undefined,
    rating: r.rating ?? undefined,
    reviewText: r.review_text ?? undefined,
    tip: r.tip ?? undefined,
    urgent: r.urgent ?? undefined,
    cancelledBy: r.cancelled_by ?? undefined,
    cancelledAt: r.cancelled_at ? new Date(r.cancelled_at).getTime() : undefined,
    confirmedAt: r.confirmed_at ? new Date(r.confirmed_at).getTime() : undefined,
    dismissedByCustomer: r.dismissed_by_customer ?? undefined,
    refund: r.refund ?? undefined,
    addressId: r.address_id ?? undefined,
  };
}

// A value is a real uuid (a saved card) vs a payment-method sentinel
// ("applepay", "googlepay", "cash") which is not a card row / not a uuid.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function uuidOrNull(v: string | undefined | null): string | null {
  return v && UUID_RE.test(v) ? v : null;
}

// Booking -> row columns (user_id added by caller). Used for insert + update.
export function bookingToRow(b: Booking): Record<string, unknown> {
  return {
    id: b.id,
    cleaner_id: b.cleanerId,
    cleaner_name: b.cleanerName,
    cleaner_photo: b.cleanerPhoto || null,
    address_nickname: b.addressNickname,
    address: b.address,
    date: b.date,
    time: b.time,
    duration_hours: b.durationHours,
    rate_per_hour: b.ratePerHour,
    total: b.total,
    commission: b.commission ?? null,
    cleaner_pay: b.cleanerPay ?? null,
    scope: b.scope,
    status: b.status,
    job_id: b.jobId ?? null,
    external_booking_id: uuidOrNull(b.externalBookingId),
    recurring: b.recurring,
    recurrence: b.recurrence,
    recur_days: b.recurDays ?? null,
    series_id: uuidOrNull(b.seriesId),
    // card_id column is uuid — payment-method sentinels (applepay/cash) go to the
    // separate payment_method text column instead
    card_id: uuidOrNull(b.cardId),
    payment_method: b.cardId && !UUID_RE.test(b.cardId) ? b.cardId : null,
    rating: b.rating ?? null,
    review_text: b.reviewText ?? null,
    tip: b.tip ?? null,
    urgent: b.urgent ?? null,
    cancelled_by: b.cancelledBy ?? null,
    cancelled_at: b.cancelledAt ? new Date(b.cancelledAt).toISOString() : null,
    confirmed_at: b.confirmedAt ? new Date(b.confirmedAt).toISOString() : null,
    dismissed_by_customer: b.dismissedByCustomer ?? false,
    refund: b.refund ?? null,
    address_id: b.addressId ?? null,
  };
}

// ---- jobs: Job <-> public.jobs row ------------------------------------------
export interface JobRow {
  id: string;
  customer_uid: string | null;
  cleaner_uid: string | null;
  cleaner_id: string | null;
  booking_id: string | null;
  customer_name: string;
  customer_phone: string | null;
  before_photos: string[] | null;
  after_photos: string[] | null;
  type: Job["type"];
  property_type: "apartment" | "house" | null;
  apartment_number: string | null;
  floor: string | null;
  address: string;
  date: string;
  time: string;
  duration_hours: number;
  rate_per_hour: number;
  cleaner_pay: number | null;
  bedrooms: number;
  bathrooms: number;
  kitchens: number;
  common_rooms: number;
  distance_from_home_km: number;
  distance_from_prev_km: number | null;
  lat: number | null;
  lng: number | null;
  status: Job["status"];
  auto_accepted: boolean | null;
  seen_by_agent: boolean | null;
  customer_rating: number | null;
  customer_reviews_count: number | null;
  customer_cancellations: number | null;
  agent_rating_of_customer: number | null;
  agent_rating_note: string | null;
  dismissed_by_agent: boolean | null;
  cancelled_at: string | null;
  cleaner_cancelled_at: string | null;
  prev_status: Job["status"] | null;
  modified_at: string | null;
  modified_note: string | null;
  prev_date: string | null;
  prev_time: string | null;
  prev_duration_hours: number | null;
  alerted_at: string | null;
  responded_at: string | null;
  response: "accepted" | "declined" | null;
  outcome: "completed" | "cancelled" | "declined" | null;
  outcome_at: string | null;
}

export function rowToJob(r: JobRow): Job {
  return {
    id: r.id,
    customerName: r.customer_name,
    customerPhone: r.customer_phone ?? undefined,
    beforePhotos: r.before_photos ?? undefined,
    afterPhotos: r.after_photos ?? undefined,
    type: r.type,
    propertyType: r.property_type ?? undefined,
    apartmentNumber: r.apartment_number ?? undefined,
    floor: r.floor ?? undefined,
    address: r.address,
    date: r.date,
    time: r.time,
    durationHours: r.duration_hours,
    ratePerHour: r.rate_per_hour,
    cleanerPay: r.cleaner_pay ?? undefined,
    bedrooms: r.bedrooms,
    bathrooms: r.bathrooms,
    kitchens: r.kitchens,
    commonRooms: r.common_rooms,
    distanceFromHomeKm: r.distance_from_home_km,
    distanceFromPrevKm: r.distance_from_prev_km,
    lat: r.lat ?? undefined,
    lng: r.lng ?? undefined,
    status: r.status,
    cleanerId: r.cleaner_id ?? undefined,
    cleanerUid: r.cleaner_uid ?? undefined,
    customerUid: r.customer_uid ?? undefined,
    bookingId: r.booking_id ?? undefined,
    autoAccepted: r.auto_accepted ?? undefined,
    seenByAgent: r.seen_by_agent ?? undefined,
    customerRating: r.customer_rating ?? undefined,
    customerReviewsCount: r.customer_reviews_count ?? undefined,
    customerCancellations: r.customer_cancellations ?? undefined,
    agentRatingOfCustomer: r.agent_rating_of_customer ?? undefined,
    agentRatingNote: r.agent_rating_note ?? undefined,
    dismissedByAgent: r.dismissed_by_agent ?? undefined,
    cancelledAt: r.cancelled_at ? new Date(r.cancelled_at).getTime() : undefined,
    cleanerCancelledAt: r.cleaner_cancelled_at ? new Date(r.cleaner_cancelled_at).getTime() : undefined,
    prevStatus: r.prev_status ?? undefined,
    modifiedAt: r.modified_at ? new Date(r.modified_at).getTime() : undefined,
    modifiedNote: r.modified_note ?? undefined,
    prevDate: r.prev_date ?? undefined,
    prevTime: r.prev_time ?? undefined,
    prevDurationHours: r.prev_duration_hours ?? undefined,
    alertedAt: r.alerted_at ? new Date(r.alerted_at).getTime() : undefined,
    respondedAt: r.responded_at ? new Date(r.responded_at).getTime() : undefined,
    response: r.response ?? undefined,
    outcome: r.outcome ?? undefined,
    outcomeAt: r.outcome_at ? new Date(r.outcome_at).getTime() : undefined,
  };
}

// Job -> row columns. customer_uid added by caller.
export function jobToRow(j: Job): Record<string, unknown> {
  return {
    id: j.id,
    cleaner_uid: j.cleanerUid ?? null,  // real agent this job is assigned to (uuid) or null for mocks
    cleaner_id: null,  // mock cleaner ids (c1, c5) aren't real users; keep null in DB
    booking_id: j.bookingId ?? null,
    customer_name: j.customerName,
    customer_phone: j.customerPhone ?? null,
    before_photos: j.beforePhotos ?? null,
    after_photos: j.afterPhotos ?? null,
    type: j.type,
    property_type: j.propertyType ?? null,
    apartment_number: j.apartmentNumber ?? null,
    floor: j.floor ?? null,
    address: j.address,
    date: j.date,
    time: j.time,
    duration_hours: j.durationHours,
    rate_per_hour: j.ratePerHour,
    cleaner_pay: j.cleanerPay ?? null,
    bedrooms: j.bedrooms,
    bathrooms: j.bathrooms,
    kitchens: j.kitchens,
    common_rooms: j.commonRooms,
    distance_from_home_km: j.distanceFromHomeKm,
    distance_from_prev_km: j.distanceFromPrevKm,
    lat: j.lat ?? null,
    lng: j.lng ?? null,
    status: j.status,
    auto_accepted: j.autoAccepted ?? null,
    seen_by_agent: j.seenByAgent ?? false,
    customer_rating: j.customerRating ?? null,
    customer_reviews_count: j.customerReviewsCount ?? null,
    customer_cancellations: j.customerCancellations ?? null,
    agent_rating_of_customer: j.agentRatingOfCustomer ?? null,
    agent_rating_note: j.agentRatingNote ?? null,
    dismissed_by_agent: j.dismissedByAgent ?? false,
    cancelled_at: j.cancelledAt ? new Date(j.cancelledAt).toISOString() : null,
    cleaner_cancelled_at: j.cleanerCancelledAt ? new Date(j.cleanerCancelledAt).toISOString() : null,
    prev_status: j.prevStatus ?? null,
    modified_at: j.modifiedAt ? new Date(j.modifiedAt).toISOString() : null,
    modified_note: j.modifiedNote ?? null,
    prev_date: j.prevDate ?? null,
    prev_time: j.prevTime ?? null,
    prev_duration_hours: j.prevDurationHours ?? null,
    alerted_at: j.alertedAt ? new Date(j.alertedAt).toISOString() : null,
    responded_at: j.respondedAt ? new Date(j.respondedAt).toISOString() : null,
    response: j.response ?? null,
    outcome: j.outcome ?? null,
    outcome_at: j.outcomeAt ? new Date(j.outcomeAt).toISOString() : null,
  };
}

// ---- cards: Card <-> public.cards row ---------------------------------------
export interface CardRow {
  id: string;
  user_id: string;
  nickname: string;
  last4: string;
  brand: string;
  jcc_token: string | null;
}

export function rowToCard(r: CardRow): Card {
  return { id: r.id, nickname: r.nickname, last4: r.last4, brand: r.brand, jccToken: r.jcc_token ?? undefined };
}

export function cardToRow(c: Card): Record<string, unknown> {
  return { id: c.id, nickname: c.nickname, last4: c.last4, brand: c.brand, jcc_token: c.jccToken ?? null };
}

// ---- addresses: PropertyAddress <-> public.addresses row --------------------
export interface AddressRow {
  id: string;
  user_id: string;
  nickname: string;
  address: string;
  property_type: "apartment" | "house";
  apartment_number: string | null;
  floor: string | null;
  bedrooms: number;
  bathrooms: number;
  kitchens: number;
  common_rooms: number;
  linked_card_id: string | null;
  lat: number | null;
  lng: number | null;
  export_token: string | null;
  share_code: string | null;
}

export function rowToAddress(r: AddressRow): PropertyAddress {
  return {
    id: r.id,
    nickname: r.nickname,
    address: r.address,
    propertyType: r.property_type,
    apartmentNumber: r.apartment_number ?? undefined,
    floor: r.floor ?? undefined,
    bedrooms: r.bedrooms,
    bathrooms: r.bathrooms,
    kitchens: r.kitchens,
    commonRooms: r.common_rooms,
    linkedCardId: r.linked_card_id ?? undefined,
    lat: r.lat ?? undefined,
    lng: r.lng ?? undefined,
    exportToken: r.export_token ?? undefined,
    shareCode: r.share_code ?? undefined,
  };
}

// PropertyAddress -> row columns for insert/update (user_id added by caller).
export function addressToRow(a: PropertyAddress): Record<string, unknown> {
  return {
    id: a.id,
    nickname: a.nickname,
    address: a.address,
    property_type: a.propertyType,
    apartment_number: a.apartmentNumber ?? null,
    floor: a.floor ?? null,
    bedrooms: a.bedrooms,
    bathrooms: a.bathrooms,
    kitchens: a.kitchens,
    common_rooms: a.commonRooms,
    linked_card_id: a.linkedCardId ?? null,
    lat: a.lat ?? null,
    lng: a.lng ?? null,
  };
}

// The subset of an account that lives in the Postgres `users` table (the profile).
// Bookings / jobs / cards / addresses / notifications stay in localStorage for now.
export interface ProfileFields {
  name: string;
  phone: string;
  agentActivated: boolean;
  launchSide: "customer" | "agent" | "ask";
  agentProfile?: AgentProfile;
  referralCode?: string;
  referredByCode?: string;
  customerRep: CustomerReputation;
  supplyWarningAckVersion?: number;
  accountNo?: number;   // friendly display number (read-only; UUID stays the real id)
  favourites?: string[]; // saved cleaner ids
  pro?: boolean;         // paid Pro tier (channel-manager access)
}

// Shape of a row from public.users (snake_case columns).
export interface UsersRow {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  is_agent: boolean | null;
  launch_side: string | null;
  customer_rating: number | null;
  customer_reviews_count: number | null;
  customer_cancellations: number | null;
  referral_code: string | null;
  referred_by_code: string | null;
  agent_profile: AgentProfile | null;
  supply_warning_ack_version: number | null;
  account_no: number | null;
  favourites: string[] | null;
  pro: boolean | null;
}

// Postgres row -> local profile fields.
export function rowToProfile(row: UsersRow): ProfileFields {
  return {
    name: row.name ?? "",
    phone: row.phone ?? "",
    agentActivated: !!row.is_agent,
    launchSide: (row.launch_side as ProfileFields["launchSide"]) ?? "customer",
    agentProfile: row.agent_profile ?? undefined,
    referralCode: row.referral_code ?? undefined,
    referredByCode: row.referred_by_code ?? undefined,
    customerRep: {
      rating: row.customer_rating ?? 0,
      reviewsCount: row.customer_reviews_count ?? 0,
      cancellations: row.customer_cancellations ?? 0,
    },
    supplyWarningAckVersion: row.supply_warning_ack_version ?? undefined,
    accountNo: row.account_no ?? undefined,
    favourites: row.favourites ?? undefined,
    pro: row.pro ?? false,
  };
}

// A partial local-profile change -> the snake_case columns to write to `users`.
// Only maps keys present in the patch, so callers can update one field at a time.
export function profileToRow(patch: Partial<ProfileFields>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (patch.name !== undefined) out.name = patch.name;
  if (patch.phone !== undefined) out.phone = patch.phone;
  if (patch.agentActivated !== undefined) out.is_agent = patch.agentActivated;
  if (patch.launchSide !== undefined) out.launch_side = patch.launchSide;
  if (patch.agentProfile !== undefined) out.agent_profile = patch.agentProfile;
  if (patch.referralCode !== undefined) out.referral_code = patch.referralCode;
  if (patch.referredByCode !== undefined) out.referred_by_code = patch.referredByCode;
  if (patch.customerRep !== undefined) {
    out.customer_rating = patch.customerRep.rating;
    out.customer_reviews_count = patch.customerRep.reviewsCount;
    out.customer_cancellations = patch.customerRep.cancellations ?? 0;
  }
  if (patch.supplyWarningAckVersion !== undefined) out.supply_warning_ack_version = patch.supplyWarningAckVersion;
  if (patch.favourites !== undefined) out.favourites = patch.favourites;
  if (patch.pro !== undefined) out.pro = patch.pro;
  return out;
}
