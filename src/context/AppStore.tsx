import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { AppNotification, Booking, Card, ConnectedListing, ConsentRecord, CustomerReputation, ExternalBooking, Job, NotifAudience, PropertyAddress, Review, Role } from "../types";
import { CUSTOMER_DOC_IDS, CLEANER_DOC_IDS, getLegalDoc, SUPPLY_TERMS_VERSION } from "../data/legal";
import { SEED_ADDRESSES, SEED_BOOKINGS, SEED_CARDS, SEED_JOBS, SEED_LISTINGS, SEED_EXTERNAL_BOOKINGS } from "../data/seed";
import { CLEANERS, agentRowToCleaner, type PublicAgentRow } from "../data/cleaners";
import type { Cleaner } from "../types";
import { makeReferralCode } from "../data/referral";
import { priceJob } from "../data/platform";
import { supabase } from "../lib/supabase";
import { registerBiometric, verifyBiometric } from "../lib/webauthn";
import { enablePush, syncExistingSubscription } from "../lib/push";
import { rowToProfile, profileToRow, rowToAddress, addressToRow, rowToCard, cardToRow, rowToBooking, bookingToRow, rowToJob, jobToRow, rowToNotif, notifToRow, rowToListing, listingToRow, rowToExternalBooking, externalBookingToRow, rowToReview, reviewToRow, type ProfileFields, type UsersRow, type AddressRow, type CardRow, type BookingRow, type JobRow, type NotifRow, type ListingRow, type ExternalBookingRow, type ReviewRow } from "../lib/profile";

export interface AgentProfile {
  rateWeekday: number;
  rateWeekend: number;
  bio: string;
  photoUrl?: string;  // customer-facing profile photo (data URL); optional
  displayName?: string; // name shown to customers
  city: string;              // home / primary city
  serviceCities: string[];   // cities the cleaner works in; drives matching
  restDays: string[];
  workDays: string[];
  workStart: string;
  workEnd: string;
  workSlots: { start: string; end: string }[];
  // per-day working hours: weekday short name -> slots (empty/absent = day off)
  daySchedule: Record<string, { start: string; end: string }[]>;
  // payout destination
  payoutType: "bank" | "card" | "";
  payoutName: string;   // account holder / card nickname
  payoutNumber: string; // IBAN or card last4-ish (masked display)
  payoutExpiry?: string; // card expiry "MM/YY" (drives expiry alerts)
}

type UserReviews = Record<string, Review[]>;

export type ThemePref = "system" | "light" | "dark";

function systemPrefersDark(): boolean {
  return typeof window !== "undefined" && window.matchMedia
    ? window.matchMedia("(prefers-color-scheme: dark)").matches
    : false;
}
function resolveTheme(pref: ThemePref): boolean {
  return pref === "system" ? systemPrefersDark() : pref === "dark";
}

// Everything that belongs to ONE user account.
interface AccountData {
  name: string;
  phone?: string;
  addresses: PropertyAddress[];
  cards: Card[];
  bookings: Booking[];
  reviews: UserReviews;
  agentActivated?: boolean;
  favourites?: string[]; // cleaner ids
  launchSide?: "customer" | "agent" | "ask"; // which side opens on launch
  agentProfile?: AgentProfile; // per-account; blank for new cleaners
  customerRep?: CustomerReputation; // this account's reputation AS a customer (rated by agents)
  referralCode?: string;        // this account's own code to share
  referredByCode?: string;      // the code this account signed up with (if any)
  connectedListings?: ConnectedListing[]; // channel-manager: synced platforms
  externalBookings?: ExternalBooking[];   // guest stays pulled from platforms
  notifications?: AppNotification[];       // in-app alert feed (both sides)
  consents?: ConsentRecord[];              // legal-document acceptance proof
  supplyWarningAckVersion?: number;        // highest supply-warning version dismissed via "don't show again"
  accountNo?: number;                      // friendly display number (read-only; UUID is the real id)
}

// One cleaner this account referred, with their monthly performance jobs.
// (In a real backend this is derived server-side; mocked here for the dashboard.)
export interface Referee {
  name: string;
  verified: boolean;
  avgRating: number;
  jobs: Job[]; // their completed jobs, used to compute monthly hours/earnings
}

// A brand-new cleaner starts with NOTHING set — no rate, no schedule, no payout
// — so the onboarding checklist drives them to fill it in.
function blankAgentProfile(): AgentProfile {
  return {
    rateWeekday: 0, rateWeekend: 0,
    bio: "", city: "Limassol", serviceCities: [], restDays: [],
    workDays: [], workStart: "", workEnd: "",
    workSlots: [],
    daySchedule: {},
    payoutType: "", payoutName: "", payoutNumber: "", payoutExpiry: "",
  };
}
function seededAgentProfile(): AgentProfile {
  return {
    rateWeekday: 9, rateWeekend: 11,
    bio: "Reliable, detail-focused cleaner. Airbnb turnarounds welcome.",
    city: "Limassol", serviceCities: ["Limassol"], restDays: ["Sunday"],
    workDays: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
    workStart: "08:00", workEnd: "18:00",
    workSlots: [{ start: "08:00", end: "13:00" }, { start: "14:00", end: "18:00" }],
    daySchedule: {
      Mon: [{ start: "09:00", end: "17:00" }],
      Tue: [{ start: "09:00", end: "17:00" }],
      Wed: [{ start: "09:00", end: "17:00" }],
      Thu: [{ start: "09:00", end: "17:00" }],
      Fri: [{ start: "09:00", end: "17:00" }],
      Sat: [{ start: "10:00", end: "14:00" }],
    },
    payoutType: "", payoutName: "", payoutNumber: "", payoutExpiry: "",
  };
}

// Build a notification object (id + timestamp + unread) from the minimal fields.
// id is a uuid so it fits the Postgres notifications.id column.
function makeNotif(n: Omit<AppNotification, "id" | "createdAt" | "read">): AppNotification {
  return { ...n, id: crypto.randomUUID(), createdAt: Date.now(), read: false };
}

// Notification kinds the agent already sees in the Jobs tab (new requests +
// cancellations show up there as rows). These are suppressed from the agent bell
// so the same job event isn't alerted twice. Everything else — reviews, tips,
// refunds, booking modifications — has no Jobs-tab home and stays in the bell.
const AGENT_JOBS_TAB_KINDS = new Set(["booking_new", "booking_cancelled", "booking_modified"]);
function bellHidesForAgent(role: Role, kind: string): boolean {
  return role === "agent" && AGENT_JOBS_TAB_KINDS.has(kind);
}

// Does a booking patch change the schedule the cleaner actually cares about
// (date / time / duration)? Returns a short human summary of the change, or
// null if nothing schedule-relevant moved.
function scheduleChangeNote(before: Booking, patch: Partial<Booking>): string | null {
  const parts: string[] = [];
  if (patch.date != null && patch.date !== before.date) parts.push(`Date ${before.date} → ${patch.date}`);
  if (patch.time != null && patch.time !== before.time) parts.push(`Time ${before.time} → ${patch.time}`);
  if (patch.durationHours != null && patch.durationHours !== before.durationHours)
    parts.push(`Duration ${before.durationHours}h → ${patch.durationHours}h`);
  return parts.length ? parts.join(" · ") : null;
}
// A job that is live-in-the-agent's-schedule (already accepted) is the only kind
// worth flagging as "modified" — a still-pending request just gets edited in place.
function jobIsLive(status: Job["status"]): boolean {
  return status === "approved" || status === "modified";
}

// Mock email — a real app sends via a backend/SMTP. We log it so the flow is
// observable in the prototype without any mail infrastructure.
function sendEmailMock(to: string, subject: string, body: string) {
  // eslint-disable-next-line no-console
  console.info(`[email → ${to}] ${subject}\n${body}`);
}

// Fire a real browser push for a notification whenever the browser supports it
// and permission is granted. In production each side is a different device, so
// the cleaner is pushed the moment a job is assigned regardless of what the
// customer is doing; in this single-device demo that means both sides' pushes
// land here, which is the correct "you were notified immediately" behaviour.
function firePush(n: AppNotification) {
  if (typeof Notification === "undefined") return;
  if (Notification.permission !== "granted") return;
  try { new Notification(n.title, { body: n.body, tag: n.id }); } catch { /* ignore */ }
}

// A couple of demo alerts (one per side) so the bell shows real content on the
// seeded account without waiting for a live event.
function seedNotifications(): AppNotification[] {
  const hr = 60 * 60 * 1000;
  return [
    { id: "seed-n1", audience: "agent", kind: "booking_new", jobId: "j1", read: false,
      createdAt: Date.now() - 2 * hr, title: "New booking request",
      body: "Andreas Pavlou booked a Short-let clean · 12 Amathus Ave · 2026-06-19 11:00." },
    { id: "seed-n2", audience: "customer", kind: "job_completed", bookingId: "b2", read: false,
      createdAt: Date.now() - 26 * hr, title: "Cleaning completed",
      body: "Elena Demetriou marked your cleaning at My Home as done. Leave a review?" },
  ];
}

// Customer-facing notification for an agent's accept/decline/complete decision.
function buildJobStatusNotif(status: Job["status"], bk: Booking | undefined, bookingId: string): AppNotification | null {
  const who = bk?.cleanerName ?? "Your cleaner";
  const when = bk ? ` for ${bk.date} at ${bk.time}` : "";
  if (status === "approved")
    return makeNotif({ audience: "customer", kind: "booking_accepted", bookingId,
      title: "Booking confirmed", body: `${who} accepted your cleaning${when}.` });
  if (status === "declined")
    return makeNotif({ audience: "customer", kind: "booking_declined", bookingId,
      title: "Booking declined", body: `${who} can't take your cleaning${when}. Try another cleaner.` });
  if (status === "completed")
    return makeNotif({ audience: "customer", kind: "job_completed", bookingId,
      title: "Cleaning completed", body: `${who} marked your cleaning${when} as done. Leave a review?` });
  return null;
}

// When guest stays are removed (listing disconnect, property delete, future
// iCal drop), flag any live cleaning that was booked as their turnaround. The
// cleaning is NOT auto-cancelled — the host may still want it — but the customer
// gets a heads-up so they can decide. Returns one notification per affected clean.
function turnaroundOrphanNotifs(
  removedStayIds: string[],
  bookings: Booking[],
): AppNotification[] {
  if (removedStayIds.length === 0) return [];
  const removed = new Set(removedStayIds);
  return bookings
    .filter((b) =>
      b.externalBookingId && removed.has(b.externalBookingId) &&
      (b.status === "confirmed" || b.status === "awaiting" || b.status === "upcoming"))
    .map((b) => makeNotif({
      audience: "customer", kind: "booking_cancelled", bookingId: b.id,
      title: "Guest stay cancelled",
      body: `The guest checkout this cleaning was booked for (${b.addressNickname}, ${b.date}) was cancelled. You may want to cancel the cleaning.`,
    }));
}

export interface IdentityVerification {
  docType: "id" | "passport";
  docNumber?: string;
  expiry?: string;
  photos: string[];
  status: "submitted" | "verified" | "rejected";
}

interface AppState {
  role: Role;
  setRole: (r: Role) => void;
  loggedIn: boolean;
  authLoading: boolean;                              // true until the initial Supabase session resolves
  login: (email: string, password: string) => Promise<{ error?: string }>;   // Supabase sign-in
  signup: (email: string, password: string, name: string, phone?: string, referredByCode?: string) => Promise<{ error?: string }>;   // Supabase sign-up
  loginDemo: () => void;                             // local-only seeded demo account
  logout: () => void;
  changePassword: (newPassword: string) => Promise<{ error?: string }>;  // Supabase password update
  resetPassword: (email: string) => Promise<{ error?: string }>;         // send a password-reset email
  recovering: boolean;                                                    // arrived via a reset link -> show set-new-password screen
  finishRecovery: (newPassword: string) => Promise<{ error?: string }>;  // set the new password + return to login
  userName: string;
  userPhone: string;
  userEmail: string;
  accountNo?: number;   // friendly display account number
  setUserName: (name: string) => void;
  setUserPhone: (phone: string) => void;
  // last account that was signed in (kept after logout for quick re-login)
  lastAccount: { email: string; name: string } | null;

  addresses: PropertyAddress[];
  addAddress: (a: PropertyAddress) => void;
  updateAddress: (a: PropertyAddress) => void;
  deleteAddress: (id: string) => void;
  setAddressCard: (addrId: string, cardId: string | undefined) => void;

  connectedListings: ConnectedListing[];
  externalBookings: ExternalBooking[];
  addListing: (l: ConnectedListing, bookings: ExternalBooking[]) => void;
  removeListing: (id: string) => void;
  addManualStay: (s: ExternalBooking) => void;         // add a booked stay by hand
  removeExternalBooking: (id: string) => void;         // remove a single stay
  joinProperty: (code: string) => Promise<{ error?: string }>; // join a shared property by code

  cards: Card[];
  addCard: (c: Card) => void;
  deleteCard: (id: string) => void;

  bookings: Booking[];
  addBooking: (b: Booking) => void;
  addBookings: (bs: Booking[]) => void;
  cancelBooking: (id: string) => void;
  dismissBooking: (id: string) => void;   // customer hides a cancelled/declined row from their Calendar (record kept)
  // mirror of agentBadge for the customer side: cleaner-cancelled or -declined
  // bookings the customer hasn't dismissed yet. Shown on the Calendar pill (in
  // customer view) + the Customer role-toggle (when in agent view).
  customerBadge: number;
  updateBooking: (id: string, patch: Partial<Booking>) => void;
  updateSeries: (seriesId: string, patch: Partial<Booking>) => void;
  cancelSeries: (seriesId: string) => void;

  reviews: UserReviews;
  addReview: (cleanerId: string, r: Review) => void;
  reviewsFor: (cleanerId: string) => Review[];

  favourites: string[];
  toggleFavourite: (cleanerId: string) => void;

  // browseable cleaners: real agent accounts merged with the mock directory.
  cleaners: Cleaner[];

  jobs: Job[];
  addJob: (j: Job) => void;
  addJobs: (js: Job[]) => void;
  setJobStatus: (id: string, status: Job["status"]) => void;
  saveJobPhotos: (jobId: string, kind: "before" | "after", urls: string[]) => void;
  verification: IdentityVerification | null;
  submitVerification: (v: { docType: "id" | "passport"; docNumber: string; expiry: string; photos: string[] }) => Promise<{ error?: string }>;
  dismissJob: (id: string) => void;          // agent hides a cancelled row from the Jobs list (record kept)
  acknowledgeJob: (id: string) => void;      // agent acknowledges a modified job -> restores its prior status
  markJobSeen: (id: string) => void;         // agent opened an auto-accepted job -> clears its "new" badge

  // persistent agent activity badge — count of jobs needing action (pending +
  // undismissed cancelled). Clears per-item as each is accepted/declined/dismissed.
  agentBadge: number;

  agentProfile: AgentProfile;
  setAgentProfile: (p: AgentProfile) => void;

  agentActivated: boolean;
  activateAgent: () => void;
  deactivateAgent: () => void;

  launchSide: "customer" | "agent" | "ask";
  setLaunchSide: (s: "customer" | "agent" | "ask") => void;

  customerRep: CustomerReputation; // current account's reputation as a customer

  referralCode: string;       // this account's shareable code
  referredByCode?: string;    // code used at signup
  referees: Referee[];        // cleaners this account referred (mock-seeded)

  // legal consent
  consents: ConsentRecord[];
  hasAcceptedCurrent: (docIds: readonly string[]) => boolean;  // all given docs accepted at current version?
  recordConsent: (docIds: readonly string[]) => void;         // accept given docs at their current versions
  needsCustomerConsent: boolean;                              // customer docs pending / outdated
  needsCleanerConsent: boolean;                               // cleaner agreement pending / outdated

  // pre-payment "you supply products/tools" warning
  showSupplyWarning: boolean;                                 // true until dismissed at current version
  dismissSupplyWarning: () => void;                           // "don't show again" at current version

  // in-app notifications (role-scoped feed + unread count for the active side)
  notifications: AppNotification[];
  unreadCount: number;
  notify: (n: Omit<AppNotification, "id" | "createdAt" | "read">) => void;
  markNotificationsRead: (audience?: NotifAudience) => void;
  clearNotifications: (audience?: NotifAudience) => void;
  // mock email (logs) — send a confirmation to the current account's email
  sendEmail: (subject: string, body: string) => void;
  // browser push
  pushEnabled: boolean;
  requestPushPermission: () => Promise<{ granted: boolean; error?: string }>;

  dark: boolean;              // resolved theme (system pref applied)
  toggleDark: () => void;     // quick flip between light/dark (sets explicit pref)
  themePref: ThemePref;       // "system" | "light" | "dark"
  setThemePref: (p: ThemePref) => void;

  // account overlay sheet (Wolt-style slide-up over the current page)
  accountOpen: boolean;
  openAccount: () => void;
  closeAccount: () => void;

  // real biometric (Face ID / Touch ID) via WebAuthn — see src/lib/webauthn.ts
  biometricEnabled: boolean;
  biometricEmail: string | null;     // account tied to biometric unlock
  enableBiometric: (email: string) => Promise<{ error?: string }>;   // registers this device (real prompt)
  disableBiometric: () => void;
  loginWithBiometric: () => Promise<{ error?: string }>; // unlock with the real Face ID prompt
  refresh: () => Promise<void>;      // pull-to-refresh: re-fetch the signed-in account's data
  myUid: string | null;              // the signed-in user's id (uid), for ownership filters
}

const KEY = "cinderella-state-v11";

// Pre-registered demo accounts (so sign-in / social already "have" data).
const DEMO_EMAIL = "savvas@cinderella.cy";
function seededAccount(name: string): AccountData {
  return {
    name,
    phone: "+357 99 000000",
    addresses: SEED_ADDRESSES,
    cards: SEED_CARDS,
    bookings: SEED_BOOKINGS,
    reviews: {},
    agentActivated: true, // demo account already a cleaner
    agentProfile: seededAgentProfile(),
    customerRep: { rating: 4.7, reviewsCount: 12, cancellations: 1 }, // established, good customer
    referralCode: makeReferralCode(DEMO_EMAIL),
    notifications: seedNotifications(),
    connectedListings: SEED_LISTINGS,
    externalBookings: SEED_EXTERNAL_BOOKINGS,
    // demo account already accepted all current docs (customer + cleaner)
    consents: [...CUSTOMER_DOC_IDS, ...CLEANER_DOC_IDS].map((id) => ({
      docId: id, version: getLegalDoc(id)?.version ?? 1, acceptedAt: Date.now() - 86400000,
    })),
  };
}
function emptyAccount(name: string, referredByCode?: string, withCustomerConsent = false, phone = ""): AccountData {
  return {
    name, phone, addresses: [], cards: [], bookings: [], reviews: {},
    agentActivated: false, agentProfile: blankAgentProfile(),
    customerRep: { rating: 0, reviewsCount: 0 },
    referralCode: makeReferralCode(name + Date.now()),
    referredByCode,
    // A new account created via the signup flow has ticked the customer-doc
    // consent box; stamp that acceptance as proof. (Not the cleaner agreement —
    // that's accepted separately when they activate the agent side.)
    consents: withCustomerConsent
      ? CUSTOMER_DOC_IDS.map((id) => ({ docId: id, version: getLegalDoc(id)?.version ?? 1, acceptedAt: Date.now() }))
      : [],
  };
}

// Demo referees for the seeded account's referral dashboard. Builds completed
// jobs in the current month so hours/earnings compute live.
function demoReferees(): Referee[] {
  const m = new Date();
  const iso = (day: number) => `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const job = (i: number, rate: number, hours: number, day: number): Job => {
    const { cleanerPay } = priceJob(rate * hours);
    return {
      id: `ref-job-${i}`, customerName: "Customer", type: "Residential",
      address: "—", date: iso(day), time: "10:00", durationHours: hours,
      ratePerHour: rate, cleanerPay, bedrooms: 2, bathrooms: 1, kitchens: 1, commonRooms: 1,
      distanceFromHomeKm: 0, distanceFromPrevKm: null, status: "completed",
    };
  };
  // a cleaner-cancelled (accepted-then-backed-out) job stamped this month
  const cancelledJob = (i: number, day: number): Job => ({
    ...job(i, 9, 3, day), status: "cancelled",
    cleanerCancelledAt: new Date(m.getFullYear(), m.getMonth(), day, 10, 0).getTime(),
  });
  // Elena: hits the goal (90h, good rating, verified, 0 cancellations)
  const elenaJobs = Array.from({ length: 18 }, (_, i) => job(i, 9, 5, (i % 27) + 1));
  // Marcus: short of 80h (only 50h) AND over the cancellation cap — clearly not eligible
  const marcusJobs = [
    ...Array.from({ length: 10 }, (_, i) => job(100 + i, 8, 5, (i % 27) + 1)),
    ...Array.from({ length: 4 }, (_, i) => cancelledJob(200 + i, (i % 20) + 1)),
  ];
  return [
    { name: "Elena R.", verified: true, avgRating: 4.6, jobs: elenaJobs },
    { name: "Marcus T.", verified: true, avgRating: 4.2, jobs: marcusJobs },
  ];
}

interface Persisted {
  accounts: Record<string, AccountData>;
  // Map key for the active account: the Supabase user id (uid) for real users,
  // or the demo email for the local-only demo account.
  currentKey: string | null;
  currentEmail: string | null; // the active account's email (session email or demo email)
  loggedIn: boolean;
  role: Role;
  jobs: Job[];
  themePref: ThemePref;
  biometricEnabled: boolean;
  biometricEmail: string | null;
  // last signed-in account, remembered across sign-out so the login screen can
  // offer a quick Face ID unlock instead of forgetting who you are.
  lastAccount: { email: string; name: string } | null;
}

function loadPersisted(): Persisted {
  const fallback: Persisted = {
    accounts: { [DEMO_EMAIL]: seededAccount("Savvas") },
    currentKey: null,
    currentEmail: null,
    loggedIn: false,
    role: "customer",
    jobs: SEED_JOBS,
    themePref: "system",
    biometricEnabled: false,
    biometricEmail: null,
    lastAccount: null,
  };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fallback;
    const obj = JSON.parse(raw) as Partial<Persisted> & { dark?: boolean };
    // migrate legacy boolean `dark` to the new themePref
    const themePref: ThemePref = obj.themePref ?? (obj.dark === true ? "dark" : obj.dark === false ? "light" : "system");
    return {
      ...fallback,
      ...obj,
      themePref,
      accounts: { [DEMO_EMAIL]: seededAccount("Savvas"), ...(obj.accounts ?? {}) },
    };
  } catch {
    return fallback;
  }
}

const AppCtx = createContext<AppState | null>(null);

export function AppStoreProvider({ children }: { children: ReactNode }) {
  const init = useRef(loadPersisted());

  const [accounts, setAccounts] = useState<Record<string, AccountData>>(init.current.accounts);
  // currentKey = localStorage map key (uid for real users, demo email for demo).
  const [currentKey, setCurrentKey] = useState<string | null>(init.current.currentKey);
  // currentEmail = the account's email address (from the Supabase session, or the demo email).
  const [currentEmail, setCurrentEmail] = useState<string | null>(init.current.currentEmail);
  const [loggedIn, setLoggedIn] = useState<boolean>(init.current.loggedIn);
  // true until the initial Supabase session check resolves (avoids a login flash).
  const [authLoading, setAuthLoading] = useState<boolean>(true);
  // true when the user arrived via a password-reset link (show the set-new-password screen).
  const [recovering, setRecovering] = useState<boolean>(false);
  // real agent accounts adapted into Cleaner objects, merged with the mock list.
  const [realCleaners, setRealCleaners] = useState<Cleaner[]>([]);
  // reviews loaded from the shared public.reviews table, grouped by cleaner id.
  // Reviews are globally readable, so this is app-wide (not per-account).
  const [dbReviews, setDbReviews] = useState<UserReviews>({});
  const [role, setRole] = useState<Role>(init.current.role);
  const [jobs, setJobs] = useState<Job[]>(init.current.jobs);
  const [themePref, setThemePref] = useState<ThemePref>(init.current.themePref);
  const [dark, setDark] = useState<boolean>(resolveTheme(init.current.themePref));
  const [biometricEnabled, setBiometricEnabled] = useState<boolean>(init.current.biometricEnabled);
  const [biometricEmail, setBiometricEmail] = useState<string | null>(init.current.biometricEmail);
  const [lastAccount, setLastAccount] = useState<{ email: string; name: string } | null>(init.current.lastAccount);
  const [verification, setVerification] = useState<IdentityVerification | null>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const [pushEnabled, setPushEnabled] = useState<boolean>(
    typeof Notification !== "undefined" && Notification.permission === "granted"
  );

  // current account view (falls back to empty when logged out)
  const acct = (currentKey && accounts[currentKey]) || emptyAccount("Guest");
  // agent profile is per-account now
  const agentProfile = acct.agentProfile ?? blankAgentProfile();

  // A "real" user = a Supabase-authenticated account (not the local demo). Only
  // real users write their profile through to Postgres.
  const isRealUser = !!currentKey && currentKey !== DEMO_EMAIL;

  // Fire-and-forget profile write-through to the Postgres `users` row. Local state
  // is already patched by the caller; this just mirrors the change server-side.
  // Failures are logged, never thrown into render.
  function writeProfile(patch: Partial<ProfileFields>) {
    if (!isRealUser || !currentKey) return;
    const row = profileToRow(patch);
    if (Object.keys(row).length === 0) return;
    supabase.from("users").update(row).eq("id", currentKey).then(({ error }) => {
      // eslint-disable-next-line no-console
      if (error) console.error("profile write-through failed:", error.message);
    });
  }

  // ---- booking / job write-through (real users only) ----
  const logErr = (what: string) => ({ error }: { error: { message: string } | null }) => {
    // eslint-disable-next-line no-console
    if (error) console.error(`${what} failed:`, error.message);
  };
  function dbInsertBookings(bs: Booking[]) {
    if (!isRealUser || !currentKey || bs.length === 0) return;
    supabase.from("bookings").insert(bs.map((b) => ({ ...bookingToRow(b), user_id: currentKey }))).then(logErr("booking insert"));
  }
  function dbUpsertBooking(b: Booking) {
    if (!isRealUser || !currentKey) return;
    supabase.from("bookings").update(bookingToRow(b)).eq("id", b.id).eq("user_id", currentKey).then(logErr("booking update"));
  }
  // patch specific booking columns by id (for status flips etc.)
  function dbPatchBooking(id: string, cols: Record<string, unknown>) {
    if (!isRealUser || !currentKey) return;
    supabase.from("bookings").update(cols).eq("id", id).eq("user_id", currentKey).then(logErr("booking patch"));
  }
  function dbPatchBookingsBySeries(seriesId: string, cols: Record<string, unknown>) {
    if (!isRealUser || !currentKey) return;
    supabase.from("bookings").update(cols).eq("series_id", seriesId).eq("user_id", currentKey).then(logErr("series patch"));
  }
  function dbInsertJobs(js: Job[]) {
    if (!isRealUser || !currentKey || js.length === 0) return;
    supabase.from("jobs").insert(js.map((j) => ({ ...jobToRow(j), customer_uid: currentKey }))).then(logErr("job insert"));
  }
  function dbPatchJob(id: string, cols: Record<string, unknown>) {
    if (!isRealUser || !currentKey) return;
    supabase.from("jobs").update(cols).eq("id", id).eq("customer_uid", currentKey).then(logErr("job patch"));
  }
  function dbPatchJobsByIds(ids: string[], cols: Record<string, unknown>) {
    if (!isRealUser || !currentKey || ids.length === 0) return;
    supabase.from("jobs").update(cols).in("id", ids).eq("customer_uid", currentKey).then(logErr("jobs patch"));
  }
  function dbInsertNotif(n: AppNotification) {
    if (!isRealUser || !currentKey) return;
    supabase.from("notifications").insert({ ...notifToRow(n), user_id: currentKey }).then(logErr("notif insert"));
  }
  // Agent acting on a job they don't own as customer: the plain dbPatch* calls
  // filter by the actor's user_id and would match nothing (and can't write the
  // customer's rows under RLS). Route job status + linked booking + the
  // customer-facing notification through the service-role Edge Function instead.
  async function agentJobUpdate(
    jobId: string,
    jobCols: Record<string, unknown>,
    bookingId: string | undefined,
    bookingCols: Record<string, unknown> | undefined,
    notif: AppNotification | null,
  ) {
    if (!isRealUser) return;
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) return;
      await fetch(`${String(import.meta.env.VITE_SUPABASE_URL || "").replace(/\/+$/, "")}/functions/v1/agent-job-update`, {
        method: "POST",
        headers: { "content-type": "application/json", apikey: import.meta.env.VITE_SUPABASE_ANON_KEY, authorization: `Bearer ${token}` },
        body: JSON.stringify({
          jobId, jobCols, bookingId,
          bookingCols,
          notification: notif ? { ...notifToRow(notif) } : undefined,
        }),
      });
    } catch { /* best-effort */ }
  }
  function dbMarkNotifsRead(audience?: NotifAudience) {
    if (!isRealUser || !currentKey) return;
    let q = supabase.from("notifications").update({ read: true }).eq("user_id", currentKey);
    if (audience) q = q.eq("audience", audience);
    q.then(logErr("notif read"));
  }
  function dbClearNotifs(audience?: NotifAudience) {
    if (!isRealUser || !currentKey) return;
    let q = supabase.from("notifications").delete().eq("user_id", currentKey);
    if (audience) q = q.eq("audience", audience);
    q.then(logErr("notif clear"));
  }

  function patchAcct(patch: Partial<AccountData>) {
    if (!currentKey) return;
    setAccounts((p) => ({ ...p, [currentKey]: { ...p[currentKey], ...patch } }));
  }

  // Prepend a notification using a FUNCTIONAL account read so two notify() calls
  // fired back-to-back in the same tick both survive. A plain patchAcct reads the
  // stale `acct` closure, so the second call's notifications base is pre-first and
  // clobbers the first (this is why a customer+agent pair only kept the last one).
  function pushNotif(notif: AppNotification) {
    if (!currentKey) return;
    setAccounts((p) => {
      const cur = p[currentKey];
      if (!cur) return p;
      return { ...p, [currentKey]: { ...cur, notifications: [notif, ...(cur.notifications ?? [])] } };
    });
    firePush(notif);
    dbInsertNotif(notif);
  }

  useEffect(() => {
    const snapshot: Persisted = { accounts, currentKey, currentEmail, loggedIn, role, jobs, themePref, biometricEnabled, biometricEmail, lastAccount };
    localStorage.setItem(KEY, JSON.stringify(snapshot));
  }, [accounts, currentKey, currentEmail, loggedIn, role, jobs, themePref, biometricEnabled, biometricEmail, lastAccount]);

  // resolve theme whenever the preference changes, and — when following the
  // system — keep it live as the OS scheme flips.
  useEffect(() => {
    setDark(resolveTheme(themePref));
    if (themePref !== "system" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setDark(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [themePref]);

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
  }, [dark]);

  // One-time cleanup: prune orphaned connected listings + synced guest stays
  // left behind by property deletes that happened before delete-cascade existed.
  useEffect(() => {
    if (!currentKey) return;
    const a = accounts[currentKey];
    if (!a) return;
    const ids = new Set(a.addresses.map((x) => x.id));
    const listings = a.connectedListings ?? [];
    const ext = a.externalBookings ?? [];
    const cleanListings = listings.filter((l) => l.addressId && ids.has(l.addressId));
    const cleanExt = ext.filter((b) => b.addressId && ids.has(b.addressId));
    if (cleanListings.length !== listings.length || cleanExt.length !== ext.length) {
      setAccounts((p) => ({ ...p, [currentKey]: { ...p[currentKey], connectedListings: cleanListings, externalBookings: cleanExt } }));
    }
  }, [currentKey, accounts]);

  // Pull the Postgres profile + consents for a signed-in user into a local
  // AccountData shell (bookings/jobs stay local this milestone). Preserves any
  // locally-held bookings/jobs already stored under this uid.
  // applyLaunchSide: only honour the launch-side preference on a fresh login.
  // A pull-to-refresh re-hydrate must NOT reset the role, or it would bounce an
  // agent back to the customer side (their current side is not persisted here).
  async function hydrateProfile(uid: string, sessionEmail: string, applyLaunchSide = true) {
    let profile: ProfileFields | null = null;
    try {
      const { data, error } = await supabase.from("users").select("*").eq("id", uid).maybeSingle();
      if (error) { /* eslint-disable-next-line no-console */ console.error("profile fetch failed:", error.message); }
      if (data) profile = rowToProfile(data as UsersRow);
    } catch (e) { /* eslint-disable-next-line no-console */ console.error(e); }

    // load consent proof rows
    let consents: ConsentRecord[] = [];
    try {
      const { data } = await supabase.from("consents").select("doc_id, version, accepted_at").eq("user_id", uid);
      if (data) consents = data.map((r: { doc_id: string; version: number; accepted_at: string }) =>
        ({ docId: r.doc_id, version: r.version, acceptedAt: new Date(r.accepted_at).getTime() }));
    } catch { /* ignore */ }

    // load saved properties (addresses). RLS returns the user's own properties
    // AND any shared with them (partner). Tag the shared ones so the UI can show
    // a badge + hide owner-only controls. (No user_id filter, so shared rows come
    // through; own rows are user_id === uid.)
    let addresses: PropertyAddress[] | null = null;
    try {
      const { data } = await supabase.from("addresses").select("*");
      if (data) addresses = (data as (AddressRow & { user_id: string })[]).map((r) => ({
        ...rowToAddress(r),
        isShared: r.user_id !== uid,
      }));
      // Count partners per property so the card can show a discrete "N people
      // have access" badge. RLS lets the owner see members of their properties.
      if (addresses?.length) {
        try {
          const { data: members } = await supabase.from("property_members").select("address_id");
          if (members) {
            const counts = new Map<string, number>();
            for (const m of members as { address_id: string }[]) {
              counts.set(m.address_id, (counts.get(m.address_id) ?? 0) + 1);
            }
            addresses = addresses.map((a) => ({ ...a, memberCount: counts.get(a.id) ?? 0 }));
          }
        } catch { /* ignore */ }
      }
    } catch { /* ignore */ }

    // load identity verification (if any)
    try {
      const { data: v } = await supabase.from("identity_verifications")
        .select("doc_type, doc_number, expiry, photos, status").eq("user_id", uid).maybeSingle();
      setVerification(v
        ? { docType: v.doc_type as "id" | "passport", docNumber: v.doc_number ?? undefined, expiry: v.expiry ?? undefined, photos: v.photos ?? [], status: v.status as IdentityVerification["status"] }
        : null);
    } catch { /* ignore */ }

    // load saved payment cards from Postgres
    let cards: Card[] | null = null;
    try {
      const { data } = await supabase.from("cards").select("*").eq("user_id", uid);
      if (data) cards = (data as CardRow[]).map(rowToCard);
    } catch { /* ignore */ }

    // load this customer's bookings from Postgres
    // RLS returns own + shared-property bookings (member path).
    let bookings: Booking[] | null = null;
    try {
      const { data } = await supabase.from("bookings").select("*");
      if (data) bookings = (data as BookingRow[]).map(rowToBooking);
    } catch { /* ignore */ }

    // load jobs this user is involved in — as the booker (customer_uid) OR as the
    // assigned cleaner (cleaner_uid). Dedupe by id.
    let ownedJobs: Job[] | null = null;
    try {
      const { data } = await supabase.from("jobs").select("*").or(`customer_uid.eq.${uid},cleaner_uid.eq.${uid}`);
      if (data) {
        const seen = new Set<string>();
        ownedJobs = (data as JobRow[]).map(rowToJob).filter((j) => (seen.has(j.id) ? false : (seen.add(j.id), true)));
      }
    } catch { /* ignore */ }

    // load in-app notifications
    let notifs: AppNotification[] | null = null;
    try {
      const { data } = await supabase.from("notifications").select("*").eq("user_id", uid);
      if (data) notifs = (data as NotifRow[]).map(rowToNotif);
    } catch { /* ignore */ }

    // load channel-manager listings + synced guest stays
    // RLS returns own + shared-property listings/stays (member path).
    let listings: ConnectedListing[] | null = null;
    try {
      const { data } = await supabase.from("connected_listings").select("*");
      if (data) listings = (data as ListingRow[]).map(rowToListing);
    } catch { /* ignore */ }
    let extBookings: ExternalBooking[] | null = null;
    try {
      const { data } = await supabase.from("external_bookings").select("*");
      if (data) extBookings = (data as ExternalBookingRow[]).map(rowToExternalBooking);
    } catch { /* ignore */ }

    setAccounts((p) => {
      const prev = p[uid];
      const base: AccountData = prev ?? emptyAccount(profile?.name || "New user");
      return {
        ...p,
        [uid]: {
          ...base,
          name: profile?.name ?? base.name,
          phone: profile?.phone ?? base.phone,
          agentActivated: profile?.agentActivated ?? base.agentActivated,
          launchSide: profile?.launchSide ?? base.launchSide,
          agentProfile: profile?.agentProfile ?? base.agentProfile,
          referralCode: profile?.referralCode ?? base.referralCode,
          referredByCode: profile?.referredByCode ?? base.referredByCode,
          customerRep: profile?.customerRep ?? base.customerRep,
          supplyWarningAckVersion: profile?.supplyWarningAckVersion ?? base.supplyWarningAckVersion,
          accountNo: profile?.accountNo ?? base.accountNo,
          favourites: profile?.favourites ?? base.favourites,
          consents: consents.length ? consents : (base.consents ?? []),
          addresses: addresses ?? base.addresses,
          cards: cards ?? base.cards,
          bookings: bookings ?? base.bookings,
          notifications: notifs ?? base.notifications,
          connectedListings: listings ?? base.connectedListings,
          externalBookings: extBookings ?? base.externalBookings,
        },
      };
    });
    // jobs live in top-level state; replace with this customer's owned jobs
    if (ownedJobs) setJobs(ownedJobs);
    setCurrentKey(uid);
    setCurrentEmail(sessionEmail);
    setLoggedIn(true);
    // remember this account across sign-out so the login screen can offer a
    // quick Face ID unlock instead of forgetting who signed in.
    setLastAccount({ email: sessionEmail, name: profile?.name || "" });
    // honour launch preference — only on a fresh login, never on refresh
    if (applyLaunchSide) {
      const pref = profile?.launchSide ?? "customer";
      if (pref === "agent" && profile?.agentActivated) setRole("agent");
      else if (pref === "customer") setRole("customer");
    }
    // if this device already granted push, make sure its subscription is saved
    // under the now-signed-in account
    void syncExistingSubscription();
  }

  // real sign-in
  async function doLogin(email: string, password: string): Promise<{ error?: string }> {
    const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error || !data.user) return { error: error?.message ?? "Sign in failed" };
    await hydrateProfile(data.user.id, data.user.email ?? email.trim());
    return {};
  }

  // real sign-up (email + password). Trigger creates the users row; we then write
  // phone + referral code. Consent is captured later on the mandatory screen.
  async function doSignup(email: string, password: string, name: string, phone?: string, referredByCode?: string): Promise<{ error?: string }> {
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(), password,
      options: { data: { name } },
    });
    if (error || !data.user) return { error: error?.message ?? "Sign up failed" };
    const uid = data.user.id;
    const code = referredByCode?.trim().toUpperCase() || undefined;
    // seed local shell immediately so the app is usable without waiting on the row
    setAccounts((p) => ({ ...p, [uid]: emptyAccount(name || "New user", code, false, phone?.trim() || "") }));
    setCurrentKey(uid);
    setCurrentEmail(data.user.email ?? email.trim());
    setRole("customer");
    setLoggedIn(true);
    // write-through phone + referral + name to the (trigger-created) users row
    supabase.from("users").update({
      name, phone: phone?.trim() || null, referred_by_code: code ?? null,
      referral_code: makeReferralCode(uid),
    }).eq("id", uid).then(({ error: e }) => {
      // eslint-disable-next-line no-console
      if (e) console.error("signup profile write failed:", e.message);
    });
    return {};
  }

  async function doLogout() {
    await supabase.auth.signOut();
    setLoggedIn(false);
    setCurrentKey(null);
    setCurrentEmail(null);
  }

  // local-only demo account — never touches Supabase, full seed data.
  function loginDemo() {
    setAccounts((p) => (p[DEMO_EMAIL] ? p : { ...p, [DEMO_EMAIL]: seededAccount("Savvas") }));
    setCurrentKey(DEMO_EMAIL);
    setCurrentEmail(DEMO_EMAIL);
    setRole("customer");
    setLoggedIn(true);
  }

  // Fetch the public agent directory once the user is signed in (RLS on the view
  // requires an authenticated session). Adapts each real agent into a Cleaner.
  useEffect(() => {
    if (!loggedIn) { setRealCleaners([]); return; }
    let active = true;
    supabase.from("public_agents").select("*").then(({ data, error }) => {
      if (!active) return;
      if (error) { /* eslint-disable-next-line no-console */ console.error("public_agents fetch failed:", error.message); return; }
      const list = (data as PublicAgentRow[])
        .map((r) => agentRowToCleaner(r))
        .filter((c): c is Cleaner => c !== null)
        // never list the current user as a bookable cleaner to themselves
        .filter((c) => c.id !== currentKey);
      setRealCleaners(list);
    });
    // Load the shared reviews table (globally readable) and group by cleaner id
    // so every browsing customer sees the same, persisted reviews.
    supabase.from("reviews").select("*").then(({ data, error }) => {
      if (!active) return;
      if (error) { /* eslint-disable-next-line no-console */ console.error("reviews fetch failed:", error.message); return; }
      const grouped: UserReviews = {};
      for (const row of (data as ReviewRow[])) {
        (grouped[row.cleaner_id] ??= []).push(rowToReview(row));
      }
      // newest first within each cleaner
      for (const k of Object.keys(grouped)) grouped[k].sort((a, b) => (a.date < b.date ? 1 : -1));
      setDbReviews(grouped);
    });
    return () => { active = false; };
  }, [loggedIn, currentKey]);

  // Session bootstrap: resolve any existing Supabase session on load, and keep in
  // sync with auth changes. The demo account (currentKey === DEMO_EMAIL) is local
  // and must survive an initial "no session" result, so we don't clobber it.
  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      const s = data.session;
      if (s?.user) {
        hydrateProfile(s.user.id, s.user.email ?? "");
      } else if (currentKey !== DEMO_EMAIL) {
        // No Supabase session and not the local demo account => any persisted
        // "logged in" state is stale (e.g. a half-finished signup). Force back to
        // the Login screen so the user can't get trapped on the consent gate.
        setLoggedIn(false);
        setCurrentKey(null);
        setCurrentEmail(null);
      }
      setAuthLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      // Arrived via a password-reset link: Supabase creates a temporary recovery
      // session and fires PASSWORD_RECOVERY. Show the set-new-password screen
      // instead of the normal app.
      if (event === "PASSWORD_RECOVERY") { setRecovering(true); setAuthLoading(false); return; }
      if (session?.user) {
        // only re-hydrate if this isn't already the active real user
        if (currentKey !== session.user.id) hydrateProfile(session.user.id, session.user.email ?? "");
      } else if (currentKey && currentKey !== DEMO_EMAIL) {
        // signed out of a real account
        setLoggedIn(false);
        setCurrentKey(null);
        setCurrentEmail(null);
      }
    });
    return () => { active = false; sub.subscription.unsubscribe(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const value: AppState = {
    role,
    setRole,
    loggedIn,
    authLoading,
    login: doLogin,
    signup: doSignup,
    loginDemo,
    logout: doLogout,
    changePassword: async (newPassword) => {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      return error ? { error: error.message } : {};
    },
    resetPassword: async (email) => {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: window.location.origin,
      });
      return error ? { error: error.message } : {};
    },
    recovering,
    finishRecovery: async (newPassword) => {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) return { error: error.message };
      // done — drop the recovery session so the user signs in fresh with the new password
      await supabase.auth.signOut();
      setRecovering(false);
      setLoggedIn(false);
      setCurrentKey(null);
      setCurrentEmail(null);
      return {};
    },
    userName: acct.name,
    userPhone: acct.phone ?? "",
    userEmail: currentEmail ?? "",
    accountNo: acct.accountNo,
    setUserName: (name) => { patchAcct({ name }); writeProfile({ name }); },
    setUserPhone: (phone) => { patchAcct({ phone }); writeProfile({ phone }); },
    // Prefer the live account when signed in; otherwise fall back to the
    // persisted last account so the login screen still offers Face ID unlock
    // after a manual sign-out.
    lastAccount: (currentEmail && currentKey && accounts[currentKey]
      ? { email: currentEmail, name: accounts[currentKey].name }
      : lastAccount),

    addresses: acct.addresses,
    addAddress: (a) => {
      patchAcct({ addresses: [...acct.addresses, a] });
      if (isRealUser && currentKey) {
        supabase.from("addresses").insert({ ...addressToRow(a), user_id: currentKey }).then(({ error }) => {
          // eslint-disable-next-line no-console
          if (error) console.error("address insert failed:", error.message);
        });
      }
    },
    updateAddress: (a) => {
      patchAcct({ addresses: acct.addresses.map((x) => (x.id === a.id ? a : x)) });
      if (isRealUser && currentKey) {
        supabase.from("addresses").update(addressToRow(a)).eq("id", a.id).eq("user_id", currentKey).then(({ error }) => {
          // eslint-disable-next-line no-console
          if (error) console.error("address update failed:", error.message);
        });
      }
    },
    deleteAddress: (id) => {
      const addr = acct.addresses.find((a) => a.id === id);
      // bookings tied to this property that are about to be cancelled
      const affected = addr
        ? acct.bookings.filter((b) => b.addressNickname === addr.nickname && b.status !== "completed" && b.status !== "cancelled")
        : [];
      // cancel any non-completed bookings tied to this property so they drop
      // off the calendar (bookings reference the property by nickname).
      const bookings = addr
        ? acct.bookings.map((b) =>
            b.addressNickname === addr.nickname && b.status !== "completed"
              ? { ...b, status: "cancelled" as const }
              : b)
        : acct.bookings;
      // cascade: drop any connected listings + their synced guest stays for this
      // property so nothing lingers on the calendar as an "unlinked" listing.
      const connectedListings = (acct.connectedListings ?? []).filter((l) => l.addressId !== id);
      const externalBookings = (acct.externalBookings ?? []).filter((b) => b.addressId !== id);
      // one agent alert covering the property deletion (if any live cleaning was cut)
      const notif = affected.length
        ? makeNotif({ audience: "agent", kind: "booking_cancelled", jobId: affected[0].jobId,
            title: affected.length === 1 ? "Booking cancelled" : "Bookings cancelled",
            body: `${affected.length} cleaning${affected.length === 1 ? "" : "s"} at ${addr?.nickname} ${affected.length === 1 ? "was" : "were"} cancelled (property removed by the customer).` })
        : null;
      patchAcct({
        addresses: acct.addresses.filter((a) => a.id !== id),
        bookings, connectedListings, externalBookings,
        ...(notif ? { notifications: [notif, ...(acct.notifications ?? [])] } : {}),
      });
      const jobIds = new Set(affected.map((b) => b.jobId).filter(Boolean));
      const bookingIds = new Set(affected.map((b) => b.id));
      if (jobIds.size || bookingIds.size) setJobs((p) => p.map((j) =>
        (jobIds.has(j.id) || (j.bookingId && bookingIds.has(j.bookingId))) && j.status !== "completed"
          ? { ...j, status: "cancelled", cancelledAt: Date.now() } : j));
      if (notif) firePush(notif);
      // write-through: remove the property + cancel its bookings + flip linked jobs
      if (isRealUser && currentKey) {
        const nowIso = new Date().toISOString();
        supabase.from("addresses").delete().eq("id", id).eq("user_id", currentKey).then(logErr("address delete"));
        affected.forEach((b) => dbPatchBooking(b.id, { status: "cancelled", cancelled_by: "customer", cancelled_at: nowIso }));
        dbPatchJobsByIds(affected.map((b) => b.jobId).filter(Boolean) as string[], { status: "cancelled", cancelled_at: nowIso });
      }
    },
    setAddressCard: (addrId, cardId) => {
      patchAcct({ addresses: acct.addresses.map((a) => (a.id === addrId ? { ...a, linkedCardId: cardId } : a)) });
      if (isRealUser && currentKey) {
        supabase.from("addresses").update({ linked_card_id: cardId ?? null }).eq("id", addrId).eq("user_id", currentKey).then(({ error }) => {
          // eslint-disable-next-line no-console
          if (error) console.error("address card link failed:", error.message);
        });
      }
    },

    connectedListings: acct.connectedListings ?? [],
    externalBookings: acct.externalBookings ?? [],
    addListing: (l, bs) => {
      patchAcct({
        connectedListings: [...(acct.connectedListings ?? []), l],
        externalBookings: [...(acct.externalBookings ?? []), ...bs],
      });
      if (isRealUser && currentKey) {
        supabase.from("connected_listings").insert({ ...listingToRow(l), user_id: currentKey }).then(logErr("listing insert"));
        if (bs.length) supabase.from("external_bookings").insert(bs.map((b) => ({ ...externalBookingToRow(b), user_id: currentKey }))).then(logErr("ext booking insert"));
      }
    },
    removeListing: (id) => {
      const removedStayIds = (acct.externalBookings ?? []).filter((b) => b.listingId === id).map((b) => b.id);
      const orphanNotifs = turnaroundOrphanNotifs(removedStayIds, acct.bookings);
      patchAcct({
        connectedListings: (acct.connectedListings ?? []).filter((l) => l.id !== id),
        externalBookings: (acct.externalBookings ?? []).filter((b) => b.listingId !== id),
        ...(orphanNotifs.length ? { notifications: [...orphanNotifs, ...(acct.notifications ?? [])] } : {}),
      });
      if (isRealUser && currentKey) {
        // external_bookings has FK on listing_id (on delete cascade), so deleting
        // the listing removes its stays too; delete the listing row.
        supabase.from("external_bookings").delete().eq("listing_id", id).eq("user_id", currentKey).then(logErr("ext booking delete"));
        supabase.from("connected_listings").delete().eq("id", id).eq("user_id", currentKey).then(logErr("listing delete"));
        orphanNotifs.forEach((n) => dbInsertNotif(n));
      }
    },
    // Manually add a booked stay (not from Airbnb/Booking) — e.g. a direct guest.
    // Stored as an external booking with platform "other"; it shows on the
    // calendar and flows into the combined export feed, blocking the platforms.
    addManualStay: (s) => {
      patchAcct({ externalBookings: [...(acct.externalBookings ?? []), s] });
      if (isRealUser && currentKey) {
        supabase.from("external_bookings").insert({ ...externalBookingToRow(s), user_id: currentKey }).then(logErr("manual stay insert"));
      }
    },
    removeExternalBooking: (id) => {
      patchAcct({ externalBookings: (acct.externalBookings ?? []).filter((b) => b.id !== id) });
      if (isRealUser && currentKey) {
        supabase.from("external_bookings").delete().eq("id", id).eq("user_id", currentKey).then(logErr("ext booking delete"));
      }
    },
    // Join a property shared by a partner (via its share code). Calls the
    // join-property Edge Function, then re-hydrates so the shared property + its
    // calendar appear.
    joinProperty: async (code) => {
      if (!isRealUser || !currentKey) return { error: "Sign in first." };
      try {
        const { data: sess } = await supabase.auth.getSession();
        const token = sess.session?.access_token;
        if (!token) return { error: "Sign in first." };
        const res = await fetch(`${String(import.meta.env.VITE_SUPABASE_URL || "").replace(/\/+$/, "")}/functions/v1/join-property`, {
          method: "POST",
          headers: { "content-type": "application/json", apikey: import.meta.env.VITE_SUPABASE_ANON_KEY, authorization: `Bearer ${token}` },
          body: JSON.stringify({ code: code.trim() }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) return { error: data.error || "Could not join." };
        await hydrateProfile(currentKey, currentEmail || "");
        return {};
      } catch (e) {
        return { error: (e as Error).message };
      }
    },

    cards: acct.cards,
    addCard: (c) => {
      patchAcct({ cards: [...acct.cards, c] });
      if (isRealUser && currentKey) {
        supabase.from("cards").insert({ ...cardToRow(c), user_id: currentKey }).then(({ error }) => {
          // eslint-disable-next-line no-console
          if (error) console.error("card insert failed:", error.message);
        });
      }
    },
    deleteCard: (id) => {
      patchAcct({ cards: acct.cards.filter((c) => c.id !== id) });
      if (isRealUser && currentKey) {
        supabase.from("cards").delete().eq("id", id).eq("user_id", currentKey).then(({ error }) => {
          // eslint-disable-next-line no-console
          if (error) console.error("card delete failed:", error.message);
        });
      }
    },

    bookings: acct.bookings,
    addBooking: (b) => { patchAcct({ bookings: [b, ...acct.bookings] }); dbInsertBookings([b]); },
    addBookings: (bs) => { patchAcct({ bookings: [...bs, ...acct.bookings] }); dbInsertBookings(bs); },
    dismissBooking: (id) => {
      patchAcct({ bookings: acct.bookings.map((b) => (b.id === id ? { ...b, dismissedByCustomer: true } : b)) });
      dbPatchBooking(id, { dismissed_by_customer: true });
    },
    // cleaner-driven cancellations/declines the customer hasn't cleared yet
    customerBadge: (acct.bookings ?? []).filter((b) =>
      ((b.status === "cancelled" && b.cancelledBy === "cleaner") || b.status === "declined") &&
      !b.dismissedByCustomer).length,
    cancelBooking: (id) => {
      const bk = acct.bookings.find((b) => b.id === id);
      const notif = bk && makeNotif({
        audience: "agent", kind: "booking_cancelled", jobId: bk.jobId,
        title: "Booking cancelled",
        body: `${bk.addressNickname} cleaning on ${bk.date} at ${bk.time} was cancelled by the customer.`,
      });
      patchAcct({
        bookings: acct.bookings.map((b) => (b.id === id ? { ...b, status: "cancelled" } : b)),
        ...(notif ? { notifications: [notif, ...(acct.notifications ?? [])] } : {}),
      });
      // Flip the linked agent job to cancelled IN PLACE — matched by jobId or by
      // bookingId as a fallback — so the pending/approved/modified row for this
      // booking becomes a single "Cancelled" row and never leaves a stale
      // duplicate line behind. (Seed demo jobs carry no bookingId, so unrelated
      // seed rows are untouched.)
      if (bk) setJobs((p) => p.map((j) =>
        (j.id === bk.jobId || (j.bookingId && j.bookingId === bk.id)) && j.status !== "completed"
          ? { ...j, status: "cancelled", cancelledAt: Date.now() } : j));
      if (notif) firePush(notif);
      // write-through: booking cancelled (by customer) + linked job cancelled
      if (bk) {
        const nowIso = new Date().toISOString();
        dbPatchBooking(id, { status: "cancelled", cancelled_by: "customer", cancelled_at: nowIso });
        if (bk.jobId) dbPatchJob(bk.jobId, { status: "cancelled", cancelled_at: nowIso });
      }
    },
    updateBooking: (id, patch) => {
      const before = acct.bookings.find((b) => b.id === id);
      const updated = before ? { ...before, ...patch } : undefined;
      patchAcct({ bookings: acct.bookings.map((b) => (b.id === id ? { ...b, ...patch } : b)) });
      if (updated) dbUpsertBooking(updated);  // persist the booking edit
      // If the customer moved the schedule of an already-accepted job, flip the
      // agent's job to "modified" so they must acknowledge it on the Jobs tab.
      if (!before?.jobId) return;
      const note = scheduleChangeNote(before, patch);
      if (!note) return;
      let flipped: Job | null = null;
      setJobs((p) => p.map((j) => {
        if (j.id !== before.jobId || !jobIsLive(j.status)) return j;
        const firstChange = j.status !== "modified"; // preserve the ORIGINAL across repeat edits
        const next: Job = {
          ...j, ...( "date" in patch ? { date: patch.date! } : {}),
          ...( "time" in patch ? { time: patch.time! } : {}),
          ...( "durationHours" in patch ? { durationHours: patch.durationHours! } : {}),
          status: "modified",
          prevStatus: firstChange ? j.status : (j.prevStatus ?? "approved"),
          prevDate: firstChange ? j.date : j.prevDate,
          prevTime: firstChange ? j.time : j.prevTime,
          prevDurationHours: firstChange ? j.durationHours : j.prevDurationHours,
          modifiedAt: Date.now(), modifiedNote: note,
        };
        flipped = next;
        return next;
      }));
      if (flipped) {
        const f = flipped as Job;
        dbPatchJob(f.id, {
          date: f.date, time: f.time, duration_hours: f.durationHours,
          status: "modified", prev_status: f.prevStatus ?? null,
          prev_date: f.prevDate ?? null, prev_time: f.prevTime ?? null,
          prev_duration_hours: f.prevDurationHours ?? null,
          modified_at: f.modifiedAt ? new Date(f.modifiedAt).toISOString() : null,
          modified_note: f.modifiedNote ?? null,
        });
        const notif = makeNotif({ audience: "agent", kind: "booking_modified", jobId: before.jobId,
          title: "Booking changed", body: `${before.addressNickname}: ${note}. Acknowledge on your Jobs tab.` });
        pushNotif(notif); // bell-hidden for agent, but still fires a browser push
      }
    },
    updateSeries: (seriesId, patch) => {
      // bookings in this series that are about to change + are schedule-relevant
      const touched = acct.bookings.filter((b) =>
        b.seriesId === seriesId &&
        (b.status === "confirmed" || b.status === "awaiting" || b.status === "upcoming") &&
        scheduleChangeNote(b, patch));
      patchAcct({ bookings: acct.bookings.map((b) => {
        if (b.seriesId !== seriesId) return b;
        if (!(b.status === "confirmed" || b.status === "awaiting" || b.status === "upcoming")) return b;
        const merged = { ...b, ...patch };
        // If duration changed, recompute money from THIS booking's own rate so a
        // series spanning weekday+weekend keeps each day's correct price (a flat
        // patch would apply one day's rate to all).
        if (patch.durationHours != null) {
          const priced = priceJob(+(b.ratePerHour * patch.durationHours).toFixed(2));
          merged.total = priced.customerTotal;
          merged.commission = priced.commission;
          merged.cleanerPay = priced.cleanerPay;
        }
        return merged;
      }) });
      // persist each touched booking's edit (prices differ per day)
      touched.forEach((b) => {
        const merged: Booking = { ...b, ...patch };
        if (patch.durationHours != null) {
          const priced = priceJob(+(b.ratePerHour * patch.durationHours).toFixed(2));
          merged.total = priced.customerTotal; merged.commission = priced.commission; merged.cleanerPay = priced.cleanerPay;
        }
        dbUpsertBooking(merged);
      });
      // flip each accepted job in the series to "modified"
      const noteByJob = new Map<string, string>();
      touched.forEach((b) => { if (b.jobId) noteByJob.set(b.jobId, scheduleChangeNote(b, patch)!); });
      if (noteByJob.size) {
        const flippedJobs: Job[] = [];
        setJobs((p) => p.map((j) => {
          if (!noteByJob.has(j.id) || !jobIsLive(j.status)) return j;
          const firstChange = j.status !== "modified";
          const next: Job = {
            ...j, ...( "date" in patch ? { date: patch.date! } : {}),
            ...( "time" in patch ? { time: patch.time! } : {}),
            ...( "durationHours" in patch ? { durationHours: patch.durationHours! } : {}),
            status: "modified",
            prevStatus: firstChange ? j.status : (j.prevStatus ?? "approved"),
            prevDate: firstChange ? j.date : j.prevDate,
            prevTime: firstChange ? j.time : j.prevTime,
            prevDurationHours: firstChange ? j.durationHours : j.prevDurationHours,
            modifiedAt: Date.now(), modifiedNote: noteByJob.get(j.id),
          };
          flippedJobs.push(next);
          return next;
        }));
        flippedJobs.forEach((f) => dbPatchJob(f.id, {
          date: f.date, time: f.time, duration_hours: f.durationHours,
          status: "modified", prev_status: f.prevStatus ?? null,
          prev_date: f.prevDate ?? null, prev_time: f.prevTime ?? null,
          prev_duration_hours: f.prevDurationHours ?? null,
          modified_at: f.modifiedAt ? new Date(f.modifiedAt).toISOString() : null,
          modified_note: f.modifiedNote ?? null,
        }));
        const first = touched[0];
        const notif = makeNotif({ audience: "agent", kind: "booking_modified", jobId: first.jobId,
          title: "Recurring booking changed", body: `${first.addressNickname}: schedule updated. Acknowledge on your Jobs tab.` });
        pushNotif(notif);
      }
    },
    cancelSeries: (seriesId) => {
      const bk = acct.bookings.find((b) => b.seriesId === seriesId && b.status !== "completed" && b.status !== "cancelled");
      const notif = bk && makeNotif({
        audience: "agent", kind: "booking_cancelled", jobId: bk.jobId,
        title: "Recurring booking cancelled",
        body: `${bk.addressNickname} recurring cleaning was cancelled by the customer.`,
      });
      // jobIds + bookingIds of every not-yet-completed booking in this series so
      // the linked jobs flip to a single cancelled row (no stale duplicates).
      const seriesBookings = acct.bookings.filter((b) => b.seriesId === seriesId && b.status !== "completed");
      const seriesJobIds = new Set(seriesBookings.map((b) => b.jobId).filter(Boolean));
      const seriesBookingIds = new Set(seriesBookings.map((b) => b.id));
      patchAcct({
        bookings: acct.bookings.map((b) =>
          b.seriesId === seriesId && b.status !== "completed"
            ? { ...b, status: "cancelled" } : b),
        ...(notif ? { notifications: [notif, ...(acct.notifications ?? [])] } : {}),
      });
      if (seriesJobIds.size || seriesBookingIds.size) setJobs((p) => p.map((j) =>
        (seriesJobIds.has(j.id) || (j.bookingId && seriesBookingIds.has(j.bookingId))) && j.status !== "completed"
          ? { ...j, status: "cancelled", cancelledAt: Date.now() } : j));
      if (notif) firePush(notif);
      // write-through: cancel all series bookings + their linked jobs
      const nowIso = new Date().toISOString();
      dbPatchBookingsBySeries(seriesId, { status: "cancelled", cancelled_by: "customer", cancelled_at: nowIso });
      const jobIdList = seriesBookings.map((b) => b.jobId).filter(Boolean) as string[];
      dbPatchJobsByIds(jobIdList, { status: "cancelled", cancelled_at: nowIso });
    },

    reviews: acct.reviews,
    addReview: (cleanerId, r) => {
      // optimistic: show it immediately in this session
      patchAcct({ reviews: { ...acct.reviews, [cleanerId]: [r, ...(acct.reviews[cleanerId] ?? [])] } });
      // and reflect it in the shared app-wide list so it survives a reopen
      setDbReviews((p) => ({ ...p, [cleanerId]: [r, ...(p[cleanerId] ?? [])] }));
      // persist to the shared reviews table (real users only; RLS: author_id = auth.uid())
      if (isRealUser && currentKey) {
        supabase.from("reviews")
          .insert({ ...reviewToRow(r), cleaner_id: cleanerId, author_id: currentKey })
          .then(logErr("review insert"));
      }
    },
    reviewsFor: (cleanerId) => {
      const base = CLEANERS.find((c) => c.id === cleanerId)?.reviews ?? [];
      // merge session-optimistic + shared-DB + mock base, de-duped by id.
      const seen = new Set<string>();
      const out: Review[] = [];
      for (const r of [...(acct.reviews[cleanerId] ?? []), ...(dbReviews[cleanerId] ?? []), ...base]) {
        if (seen.has(r.id)) continue;
        seen.add(r.id);
        out.push(r);
      }
      return out;
    },

    favourites: acct.favourites ?? [],
    toggleFavourite: (cleanerId) => {
      const cur = acct.favourites ?? [];
      const next = cur.includes(cleanerId) ? cur.filter((x) => x !== cleanerId) : [...cur, cleanerId];
      patchAcct({ favourites: next });
      writeProfile({ favourites: next }); // persist to users.favourites
    },

    // Real agents only — mock CLEANERS are hidden from the browsable list for
    // live testing. (The CLEANERS array still backs isRealAgent detection +
    // helper fallbacks; it's just not shown as bookable cleaners.)
    cleaners: [...realCleaners],

    jobs,
    addJob: (j) => { setJobs((p) => [j, ...p]); dbInsertJobs([j]); },
    addJobs: (js) => { setJobs((p) => [...js, ...p]); dbInsertJobs(js); },
    dismissJob: (id) => { setJobs((p) => p.map((j) => (j.id === id ? { ...j, dismissedByAgent: true } : j))); dbPatchJob(id, { dismissed_by_agent: true }); },
    // Acknowledge a modified job: restore the status it held before the change
    // (usually "approved") and clear the modification markers.
    acknowledgeJob: (id) => {
      let restored: string | null = null;
      setJobs((p) => p.map((j) => {
        if (j.id === id && j.status === "modified") {
          restored = j.prevStatus ?? "approved";
          return { ...j, status: j.prevStatus ?? "approved", prevStatus: undefined, modifiedAt: undefined,
            modifiedNote: undefined, prevDate: undefined, prevTime: undefined, prevDurationHours: undefined };
        }
        return j;
      }));
      if (restored) dbPatchJob(id, {
        status: restored, prev_status: null, modified_at: null, modified_note: null,
        prev_date: null, prev_time: null, prev_duration_hours: null,
      });
    },
    // Outstanding-action / new-item count. Persists until each is acted on:
    // pending clears on accept/decline; cancelled clears when the agent taps X;
    // modified clears when acknowledged; an auto-accepted job counts as NEW until
    // the agent opens it. Shown from either side so the agent stays aware.
    agentBadge: jobs.filter((j) =>
      j.cleanerUid === currentKey &&
      (j.status === "pending" || j.status === "modified" ||
      (j.status === "approved" && j.autoAccepted && !j.seenByAgent) ||
      (j.status === "cancelled" && !j.dismissedByAgent))).length,
    markJobSeen: (id) => { setJobs((p) => p.map((j) => (j.id === id ? { ...j, seenByAgent: true } : j))); dbPatchJob(id, { seen_by_agent: true }); },
    // Persist proof photos onto the job as the cleaner captures them. The cleaner
    // isn't the job's customer, so the write goes through the agent-job-update
    // Edge Function (service role, verifies caller = cleaner_uid).
    saveJobPhotos: (jobId, kind, urls) => {
      const col = kind === "before" ? "beforePhotos" : "afterPhotos";
      setJobs((p) => p.map((j) => (j.id === jobId ? { ...j, [col]: urls } : j)));
      const dbCol = kind === "before" ? "before_photos" : "after_photos";
      const job = jobs.find((j) => j.id === jobId);
      void agentJobUpdate(jobId, { [dbCol]: urls }, job?.bookingId, undefined, null);
    },
    verification,
    submitVerification: async ({ docType, docNumber, expiry, photos }) => {
      if (!isRealUser || !currentKey) return { error: "Sign in to verify." };
      const row = {
        user_id: currentKey, doc_type: docType, doc_number: docNumber,
        expiry, photos, status: "submitted", updated_at: new Date().toISOString(),
      };
      const { error } = await supabase.from("identity_verifications").upsert(row);
      if (error) return { error: error.message };
      setVerification({ docType, docNumber, expiry, photos, status: "submitted" });
      return {};
    },
    setJobStatus: (id, status) => {
      const job = jobs.find((j) => j.id === id);
      // Declining a job the agent had ALREADY accepted (approved/modified) is a
      // cancellation, not a rejection — the customer sees "cancelled by cleaner"
      // and gets the same crossed-out row + badge as their own cancellations.
      const cleanerCancel = status === "declined" && (job?.status === "approved" || job?.status === "modified");
      const now = Date.now();
      const jobCancelIso = cleanerCancel ? new Date(now).toISOString() : null;
      // ---- timeline capture ----
      // A response to a still-pending request (accept/decline) stamps respondedAt.
      const isResponse = job?.status === "pending" && (status === "approved" || status === "declined");
      const response: Job["response"] | undefined = isResponse ? (status === "approved" ? "accepted" : "declined") : undefined;
      // A terminal state stamps the outcome.
      const outcome: Job["outcome"] | undefined =
        status === "completed" ? "completed"
        : cleanerCancel ? "cancelled"
        : status === "declined" ? "declined"
        : undefined;
      const timeline: Partial<Job> = {
        ...(isResponse ? { respondedAt: now, response } : {}),
        ...(outcome ? { outcome, outcomeAt: now } : {}),
      };
      setJobs((p) => p.map((j) => (j.id === id
        ? { ...j, status, ...(cleanerCancel ? { cleanerCancelledAt: now } : {}), ...timeline }
        : j)));
      // Is the actor the assigned cleaner (agent side)? Then the plain dbPatch*
      // calls would match nothing (they filter by customer_uid) — route through
      // the service-role Edge Function so the change persists + the customer is
      // updated/notified. Customer-side status changes keep the direct path.
      const isAgentActor = job?.cleanerUid === currentKey;
      const jobCols: Record<string, unknown> = {
        status,
        ...(cleanerCancel ? { cleaner_cancelled_at: jobCancelIso } : {}),
        ...(isResponse ? { responded_at: new Date(now).toISOString(), response } : {}),
        ...(outcome ? { outcome, outcome_at: new Date(now).toISOString() } : {}),
      };
      if (!isAgentActor) {
        // write-through the job status change + timeline (customer-owned path)
        dbPatchJob(id, jobCols);
      }
      // mirror agent decision back onto the linked customer booking + raise a
      // customer-facing notification. Both go in ONE patch — a second patchAcct
      // would read stale `acct` and clobber the first.
      if (job?.bookingId) {
        const map: Record<string, Booking["status"]> = {
          approved: "confirmed", declined: "declined", completed: "completed", pending: "awaiting",
        };
        const bs = cleanerCancel ? "cancelled" : map[status];
        const bk = acct.bookings.find((b) => b.id === job.bookingId);
        const nowConfirm = bs === "confirmed" ? now : undefined;
        const patch: Partial<AccountData> = {};
        if (bs) patch.bookings = acct.bookings.map((b) => (b.id === job.bookingId
          ? { ...b, status: bs,
              ...(nowConfirm ? { confirmedAt: nowConfirm } : {}),
              ...(cleanerCancel ? { cancelledBy: "cleaner" as const, cancelledAt: now } : {}) }
          : b));
        // cleaner-cancel raises a booking_cancelled alert; otherwise the usual
        // accepted/declined/completed notification.
        const notif = cleanerCancel
          ? makeNotif({ audience: "customer", kind: "booking_cancelled", bookingId: job.bookingId,
              title: "Booking cancelled",
              body: `${bk?.cleanerName ?? "Your cleaner"} cancelled your cleaning${bk ? ` on ${bk.date} at ${bk.time}` : ""}. You can book another cleaner.` })
          : buildJobStatusNotif(status, bk, job.bookingId);
        const bookingCols: Record<string, unknown> | undefined = bs ? {
          status: bs,
          ...(nowConfirm ? { confirmed_at: new Date(nowConfirm).toISOString() } : {}),
          ...(cleanerCancel ? { cancelled_by: "cleaner", cancelled_at: jobCancelIso } : {}),
        } : undefined;
        if (isAgentActor) {
          // Agent side: the customer's booking + notification live on the
          // customer's account. Deliver job + booking + notif via the service
          // role. Do NOT add the customer notif to the agent's own account.
          void agentJobUpdate(id, jobCols, job.bookingId, bookingCols, notif ?? null);
        } else {
          // Customer side: local account holds the booking + notification.
          if (notif) patch.notifications = [notif, ...(acct.notifications ?? [])];
          if (Object.keys(patch).length) patchAcct(patch);
          if (notif) firePush(notif);
          if (bookingCols) dbPatchBooking(job.bookingId, bookingCols);
        }
        // email the customer when the cleaner responds
        const who = bk?.cleanerName ?? "Your cleaner";
        const when = bk ? ` on ${bk.date} at ${bk.time}` : "";
        if (status === "approved")
          sendEmailMock(currentEmail || "you@cinderella.cy", "Your cleaning is confirmed",
            `${who} accepted your cleaning${when}${bk ? ` at ${bk.addressNickname}` : ""}.`);
        else if (cleanerCancel)
          sendEmailMock(currentEmail || "you@cinderella.cy", "Your cleaning was cancelled",
            `${who} cancelled your cleaning${when}. You can book another cleaner.`);
        else if (status === "declined")
          sendEmailMock(currentEmail || "you@cinderella.cy", "Your booking was declined",
            `${who} can't take your cleaning${when}. You can book another cleaner.`);
      }
    },
    agentProfile,
    setAgentProfile: (p) => { patchAcct({ agentProfile: p }); writeProfile({ agentProfile: p }); },
    launchSide: acct.launchSide ?? "customer",
    setLaunchSide: (s) => { patchAcct({ launchSide: s }); writeProfile({ launchSide: s }); },
    customerRep: acct.customerRep ?? { rating: 0, reviewsCount: 0 },
    referralCode: acct.referralCode ?? makeReferralCode(acct.name),
    referredByCode: acct.referredByCode,
    referees: currentKey === DEMO_EMAIL ? demoReferees() : [],
    agentActivated: !!acct.agentActivated,
    activateAgent: () => { patchAcct({ agentActivated: true }); writeProfile({ agentActivated: true }); },
    deactivateAgent: () => {
      // cancel any pending offers + accepted jobs
      setJobs((p) => p.map((j) => (j.status === "pending" || j.status === "approved" ? { ...j, status: "declined" } : j)));
      patchAcct({ agentActivated: false });
      writeProfile({ agentActivated: false });
      setRole("customer");
    },
    consents: acct.consents ?? [],
    hasAcceptedCurrent: (docIds) => {
      const recs = acct.consents ?? [];
      return docIds.every((id) => {
        const doc = getLegalDoc(id);
        if (!doc) return true; // unknown doc = nothing to accept
        return recs.some((r) => r.docId === id && r.version >= doc.version);
      });
    },
    recordConsent: (docIds) => {
      const recs = (acct.consents ?? []).slice();
      const now = Date.now();
      const rows: { user_id: string; doc_id: string; version: number; accepted_at: string }[] = [];
      for (const id of docIds) {
        const doc = getLegalDoc(id);
        if (!doc) continue;
        const existing = recs.findIndex((r) => r.docId === id);
        const rec: ConsentRecord = { docId: id, version: doc.version, acceptedAt: now };
        if (existing >= 0) recs[existing] = rec; else recs.push(rec);
        if (isRealUser && currentKey) rows.push({ user_id: currentKey, doc_id: id, version: doc.version, accepted_at: new Date(now).toISOString() });
      }
      // Write the consent locally. Use a functional update keyed by whatever the
      // active key is; if for some reason there's no key yet, fall back so the
      // mandatory-consent gate can still clear (never trap the user on this screen).
      if (currentKey) {
        setAccounts((p) => ({ ...p, [currentKey]: { ...(p[currentKey] ?? emptyAccount("New user")), consents: recs } }));
      } else {
        // eslint-disable-next-line no-console
        console.error("recordConsent: no active account key — consent not persisted");
      }
      // write-through consent proof (upsert on the user_id+doc_id unique key)
      if (rows.length) {
        supabase.from("consents").upsert(rows, { onConflict: "user_id,doc_id" }).then(({ error }) => {
          // eslint-disable-next-line no-console
          if (error) console.error("consent write-through failed:", error.message);
        });
      }
    },
    needsCustomerConsent: !CUSTOMER_DOC_IDS.every((id) => {
      const doc = getLegalDoc(id);
      return doc ? (acct.consents ?? []).some((r) => r.docId === id && r.version >= doc.version) : true;
    }),
    needsCleanerConsent: !CLEANER_DOC_IDS.every((id) => {
      const doc = getLegalDoc(id);
      return doc ? (acct.consents ?? []).some((r) => r.docId === id && r.version >= doc.version) : true;
    }),

    showSupplyWarning: (acct.supplyWarningAckVersion ?? 0) < SUPPLY_TERMS_VERSION,
    dismissSupplyWarning: () => { patchAcct({ supplyWarningAckVersion: SUPPLY_TERMS_VERSION }); writeProfile({ supplyWarningAckVersion: SUPPLY_TERMS_VERSION }); },

    // Feed for the side currently being viewed (customer vs agent), newest first.
    // No duplicate alerting: kinds the agent already sees in the Jobs tab
    // (new requests + cancellations) are kept OUT of the agent bell — the bell
    // then carries only what the Jobs list doesn't (reviews, tips, refunds,
    // booking modifications).
    notifications: (acct.notifications ?? [])
      .filter((n) => n.audience === role && !bellHidesForAgent(role, n.kind))
      .sort((a, b) => b.createdAt - a.createdAt),
    unreadCount: (acct.notifications ?? [])
      .filter((n) => n.audience === role && !n.read && !bellHidesForAgent(role, n.kind)).length,
    notify: (n) => pushNotif(makeNotif(n)),
    sendEmail: (subject, body) => sendEmailMock(currentEmail || "you@cinderella.cy", subject, body),
    pushEnabled,
    requestPushPermission: async () => {
      // ask permission, subscribe to Web Push, and persist the subscription so
      // notifications arrive even when the app is closed
      const res = await enablePush();
      setPushEnabled(res.granted);
      return res;
    },
    markNotificationsRead: (audience) => {
      patchAcct({
        notifications: (acct.notifications ?? []).map((n) =>
          !audience || n.audience === audience ? { ...n, read: true } : n),
      });
      dbMarkNotifsRead(audience);
    },
    clearNotifications: (audience) => {
      patchAcct({
        notifications: (acct.notifications ?? []).filter((n) =>
          audience ? n.audience !== audience : false),
      });
      dbClearNotifs(audience);
    },

    dark,
    toggleDark: () => setThemePref(dark ? "light" : "dark"),
    themePref,
    setThemePref,
    accountOpen,
    openAccount: () => setAccountOpen(true),
    closeAccount: () => setAccountOpen(false),

    biometricEnabled,
    biometricEmail,
    enableBiometric: async (email) => {
      const e = email.trim().toLowerCase();
      // Demo account keeps the old local shortcut (no real credential to store).
      if (e === DEMO_EMAIL) { setBiometricEnabled(true); setBiometricEmail(e); return {}; }
      try {
        const ok = await registerBiometric(); // real Face ID / Touch ID prompt
        if (!ok) return { error: "Could not enable Face ID." };
        setBiometricEnabled(true); setBiometricEmail(e);
        return {};
      } catch (err) {
        return { error: (err as Error).message };
      }
    },
    disableBiometric: () => { setBiometricEnabled(false); setBiometricEmail(null); },
    // Real biometric unlock: the demo account uses the local shortcut; a real
    // account verifies via WebAuthn (its Supabase session is already persisted,
    // so a successful Face ID check just clears the lock / restores the session).
    loginWithBiometric: async () => {
      if (biometricEmail === DEMO_EMAIL) { loginDemo(); return {}; }
      if (!biometricEmail) return { error: "No Face ID account on this device." };
      try {
        const ok = await verifyBiometric(biometricEmail);
        return ok ? {} : { error: "Face ID verification failed." };
      } catch (err) {
        return { error: (err as Error).message };
      }
    },
    myUid: currentKey,
    // pull-to-refresh: re-pull this account's data from Supabase (no app restart,
    // no white flash). Only meaningful for a real signed-in user; the demo
    // account has nothing to re-fetch, so resolve immediately.
    refresh: async () => {
      if (isRealUser && currentKey && currentEmail) {
        await hydrateProfile(currentKey, currentEmail, false); // keep current side
      } else {
        await new Promise((r) => setTimeout(r, 500)); // demo: brief spinner, then done
      }
    },
  };

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}

export function useStore() {
  const ctx = useContext(AppCtx);
  if (!ctx) throw new Error("useStore must be used within AppStoreProvider");
  return ctx;
}
