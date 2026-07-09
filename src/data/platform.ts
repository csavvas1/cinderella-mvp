// ============================================================================
// Platform configuration — the single source of truth for every tunable
// business rule (commission, tiers, referral, booking gates).
//
// TODAY: the values live in DEFAULT_CONFIG below and are read through
// getConfig(). Everything in the app calls getConfig() — nothing reads raw
// constants — so when a backend + admin panel exist, only getConfig() changes
// (fetch the config from the server / cache it) and the rest of the app is
// untouched.
//
// An admin GUI must NEVER live in the customer/agent app. It is a separate,
// authenticated internal tool that writes this config to the backend. Every
// change should be audit-logged (who / when / old -> new) to satisfy the EU
// Platform-to-Business rules (terms must be disclosed + changes notified).
//
// LEGAL NOTE on commission tiers: different rates are fine ONLY when based on
// objective, published criteria anyone can qualify for (volume, account type,
// promo). NEVER vary by nationality / gender / age or any protected trait, and
// never cut secret per-person deals. Confirm with a Cyprus lawyer before live.
// ============================================================================

export type AccountKind = "residential" | "business";

// A commission tier: applies when the cleaner's qualifying metric meets the
// threshold. Tiers are objective + published — the cleaner can see why they
// qualify. `minMonthlyHours` is the qualifying criterion (volume-based).
export interface CommissionTier {
  id: string;
  label: string;            // shown to cleaners, e.g. "Standard", "High volume"
  minMonthlyHours: number;  // qualify when month hours >= this (0 = base tier)
  rate: number;             // commission rate, e.g. 0.15
}

export interface ReferralConfig {
  enabled: boolean;
  minHours: number;         // hours the referee must work that calendar month
  minRating: number;        // referee's min average rating
  mustBeVerified: boolean;
  maxCancellations: number; // max cleaner cancellations that month to stay eligible
  referrerShare: number;    // share of referee monthly pay paid to referrer
  refereeShare: number;     // share paid to the referee too
}

export interface BookingConfig {
  minAutoAcceptRating: number; // customers below this can't auto-book
  noticeHours: number;         // min hours' notice for auto-accept
}

export interface PlatformConfig {
  version: number;            // bump on every change (audit / cache-busting)
  // Commission tiers per account kind. Evaluated high-threshold-first; the
  // first tier whose criterion is met wins. Always include a 0-hour base tier.
  commissionTiers: Record<AccountKind, CommissionTier[]>;
  referral: ReferralConfig;
  booking: BookingConfig;
}

// ---- DEFAULT (ships in the bundle; replaced by backend config when live) ----
export const DEFAULT_CONFIG: PlatformConfig = {
  version: 1,
  commissionTiers: {
    residential: [
      { id: "res-vol", label: "High volume", minMonthlyHours: 140, rate: 0.12 },
      { id: "res-base", label: "Standard", minMonthlyHours: 0, rate: 0.15 },
    ],
    business: [
      // commercial accounts get a lower rate to win B2B cleaning contracts
      { id: "biz-base", label: "Business", minMonthlyHours: 0, rate: 0.10 },
    ],
  },
  referral: {
    enabled: true,
    minHours: 80,
    minRating: 4.0,
    mustBeVerified: true,
    maxCancellations: 3,
    referrerShare: 0.025,
    refereeShare: 0.025,
  },
  booking: {
    minAutoAcceptRating: 3.5,
    noticeHours: 2,
  },
};

// ---- config access (the backend swap seam) --------------------------------
// Allows an override to be injected (e.g. fetched from the backend at startup
// and set once). Until then it returns the bundled default.
let activeConfig: PlatformConfig = DEFAULT_CONFIG;

export function getConfig(): PlatformConfig {
  return activeConfig;
}

// Called once at app startup after fetching server config (future). Keeping it
// here means the admin-panel/backend path doesn't touch any screen.
export function setConfig(cfg: PlatformConfig): void {
  activeConfig = cfg;
}

// ---- card expiry monitoring -------------------------------------------------
// Parse "MM/YY" and classify so the UI can flag expired / soon-to-expire cards.
export function cardExpiryStatus(mmYY?: string): "none" | "ok" | "soon" | "expired" {
  if (!mmYY) return "none";
  const m = mmYY.match(/^(\d{2})\s*\/\s*(\d{2})$/);
  if (!m) return "none";
  const month = +m[1], yy = +m[2];
  if (month < 1 || month > 12) return "none";
  const exp = new Date(2000 + yy, month, 0, 23, 59, 59); // last day of expiry month
  const now = new Date();
  if (exp < now) return "expired";
  const days = (exp.getTime() - now.getTime()) / 86400000;
  return days <= 60 ? "soon" : "ok";
}

// ---- commission ------------------------------------------------------------
// Pick the commission rate for a job given the account kind and the cleaner's
// hours so far this month (for volume tiers). Highest threshold met wins.
export function commissionRate(
  accountKind: AccountKind = "residential",
  monthlyHours = 0
): number {
  const tiers = getConfig().commissionTiers[accountKind] ?? getConfig().commissionTiers.residential;
  const sorted = [...tiers].sort((a, b) => b.minMonthlyHours - a.minMonthlyHours);
  const tier = sorted.find((t) => monthlyHours >= t.minMonthlyHours) ?? sorted[sorted.length - 1];
  return tier.rate;
}

// The next (better = lower-rate) commission tier the cleaner can still unlock
// this month, plus the current tier. Returns next=null when already at the best.
export function nextCommissionTier(
  accountKind: AccountKind = "residential",
  monthlyHours = 0
): { current: CommissionTier; next: CommissionTier | null; hoursToNext: number } {
  const tiers = getConfig().commissionTiers[accountKind] ?? getConfig().commissionTiers.residential;
  const byThresh = [...tiers].sort((a, b) => a.minMonthlyHours - b.minMonthlyHours);
  const current = [...byThresh].reverse().find((t) => monthlyHours >= t.minMonthlyHours) ?? byThresh[0];
  // candidate higher tiers = lower rate than current, threshold above current hours
  const next = byThresh
    .filter((t) => t.rate < current.rate && t.minMonthlyHours > monthlyHours)
    .sort((a, b) => a.minMonthlyHours - b.minMonthlyHours)[0] ?? null;
  const hoursToNext = next ? Math.max(0, next.minMonthlyHours - monthlyHours) : 0;
  return { current, next, hoursToNext };
}

// Price a job. The commission is added ON TOP and paid BY THE CUSTOMER for the
// convenience of the platform — the cleaner is NOT penalised and receives their
// full rate. `basePay` = rate × hours (what the cleaner takes home).
//   cleanerPay   = basePay                  (full, no deduction)
//   commission   = basePay × rate           (platform fee, paid by customer)
//   customerTotal = basePay + commission     (what the customer is charged)
export function priceJob(
  basePay: number,
  accountKind: AccountKind = "residential",
  monthlyHours = 0
) {
  const rate = commissionRate(accountKind, monthlyHours);
  const commission = +(basePay * rate).toFixed(2);
  const cleanerPay = +basePay.toFixed(2);
  const customerTotal = +(basePay + commission).toFixed(2);
  return { basePay: cleanerPay, cleanerPay, commission, customerTotal, rate };
}

// ---- back-compat shims -----------------------------------------------------
// Existing imports keep working; all now derive from getConfig().
export const COMMISSION_RATE = DEFAULT_CONFIG.commissionTiers.residential
  .find((t) => t.minMonthlyHours === 0)!.rate;

// REFERRAL is read in several screens; expose the live referral config.
export const REFERRAL = getConfig().referral;

// Calendar-month key, e.g. "2026-05", from an ISO date string.
export function monthKey(dateISO: string): string {
  return (dateISO || "").slice(0, 7);
}

// ---- cancellation tracking -------------------------------------------------
// Current calendar-month key from the clock (for "this month" counters).
export function currentMonthKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// How many cleaner-initiated cancellations (accepted-job backouts) happened in a
// given month. Declining a still-pending request is NOT a cancellation and is
// intentionally excluded (jobs only carry cleanerCancelledAt for real backouts).
export function cleanerCancellationsInMonth(
  jobs: { cleanerCancelledAt?: number }[],
  month = currentMonthKey()
): number {
  return jobs.filter((j) => {
    if (!j.cleanerCancelledAt) return false;
    const d = new Date(j.cleanerCancelledAt);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}` === month;
  }).length;
}

// Reliability figure shown to customers: what share of a cleaner's committed
// jobs (completed + cancelled-by-them) they backed out of. Returns null when
// there's too little history to be meaningful.
export function cleanerCancelRate(
  completed: number,
  cancelled: number
): { rate: number; total: number } | null {
  const total = completed + cancelled;
  if (total < 3) return null; // not enough history to judge
  return { rate: cancelled / total, total };
}
