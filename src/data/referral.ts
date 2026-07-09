import type { Job } from "../types";
import { getConfig, monthKey, priceJob } from "./platform";

// A cleaner's performance for ONE calendar month, used to decide whether the
// referral reward unlocks that month.
export interface MonthlyPerf {
  month: string;       // "2026-05"
  hours: number;
  earnings: number;    // net pay the cleaner took home that month
  avgRating: number;   // their average rating over the month (or current avg)
  verified: boolean;
  cancellations: number; // cleaner-initiated cancellations that month
}

export interface ReferralReward {
  month: string;
  eligible: boolean;
  reasons: string[];   // why NOT eligible (empty when eligible)
  refereeEarnings: number;
  referrerReward: number; // paid to the person who referred
  refereeReward: number;  // bonus paid to the referred cleaner
  hours: number;
  avgRating: number;
  cancellations: number;
}

// Aggregate a referred cleaner's completed jobs into per-month performance.
// `ratingFor` supplies the cleaner's average rating (until per-month ratings
// exist we pass their overall average).
export function monthlyPerformance(
  refereeJobs: Job[],
  verified: boolean,
  avgRating: number
): Record<string, MonthlyPerf> {
  const out: Record<string, MonthlyPerf> = {};
  const ensure = (m: string) =>
    (out[m] ??= { month: m, hours: 0, earnings: 0, avgRating, verified, cancellations: 0 });
  for (const j of refereeJobs) {
    // count a cleaner-initiated cancellation in the month it happened
    if (j.cleanerCancelledAt) {
      const cd = new Date(j.cleanerCancelledAt);
      ensure(`${cd.getFullYear()}-${String(cd.getMonth() + 1).padStart(2, "0")}`).cancellations += 1;
    }
    if (j.status !== "completed") continue;
    const m = monthKey(j.date);
    if (!m) continue;
    const pay = j.cleanerPay ?? priceJob(j.ratePerHour * j.durationHours).cleanerPay;
    const cur = ensure(m);
    cur.hours += j.durationHours;
    cur.earnings = +(cur.earnings + pay).toFixed(2);
  }
  return out;
}

// Decide the reward for a single month from that month's performance.
export function rewardForMonth(perf: MonthlyPerf): ReferralReward {
  const R = getConfig().referral;
  const reasons: string[] = [];
  if (!R.enabled) reasons.push("Referrals disabled");
  if (R.mustBeVerified && !perf.verified) reasons.push("Cleaner not verified");
  if (perf.hours < R.minHours) reasons.push(`${perf.hours}/${R.minHours}h worked`);
  if (perf.avgRating < R.minRating) reasons.push(`Rating ${perf.avgRating.toFixed(2)} < ${R.minRating.toFixed(2)}`);
  if (perf.cancellations > R.maxCancellations)
    reasons.push(`${perf.cancellations} cancellations (max ${R.maxCancellations})`);
  const eligible = reasons.length === 0;
  return {
    month: perf.month,
    eligible,
    reasons,
    refereeEarnings: perf.earnings,
    referrerReward: eligible ? +(perf.earnings * R.referrerShare).toFixed(2) : 0,
    refereeReward: eligible ? +(perf.earnings * R.refereeShare).toFixed(2) : 0,
    hours: perf.hours,
    avgRating: perf.avgRating,
    cancellations: perf.cancellations,
  };
}

// Generate a stable, human-typable referral code from an email/name.
export function makeReferralCode(seed: string): string {
  const base = seed.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 4) || "CLNR";
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return base + (h % 10000).toString().padStart(4, "0");
}
