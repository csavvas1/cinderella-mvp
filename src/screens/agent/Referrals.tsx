import { useState } from "react";
import { useStore } from "../../context/AppStore";
import { getConfig, priceJob, currentMonthKey } from "../../data/platform";
import { monthlyPerformance, rewardForMonth, type MonthlyPerf, type ReferralReward } from "../../data/referral";
import { APP_NAME } from "../../data/brand";
import Dropdown from "../../components/Dropdown";
import { useSwipeDownClose } from "../../lib/useSwipeDownClose";
import type { Referee } from "../../context/AppStore";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const YEARS = ["2026", "2025", "2024"];

function monthShort(key: string) {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleString("en-GB", { month: "long" });
}
// Statement pickers default to the PREVIOUS month (the last complete period).
function prevMonthDefaults() {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return { month: MONTHS[d.getMonth()], year: String(d.getFullYear()) };
}

function downloadStatement(period: string) {
  alert(`Downloading earnings statement for ${period} (PDF).`);
}

export default function Referrals() {
  const { referralCode, referees, jobs } = useStore();
  const REFERRAL = getConfig().referral;
  const [copied, setCopied] = useState(false);
  const [showGoal, setShowGoal] = useState(false);
  const goalSwipe = useSwipeDownClose(() => setShowGoal(false));
  const [showStatements, setShowStatements] = useState(false);
  const [openReferee, setOpenReferee] = useState<{ referee: Referee; perf: MonthlyPerf; reward: ReferralReward } | null>(null);

  const pm = prevMonthDefaults();
  const [dlMonth, setDlMonth] = useState(pm.month);
  const [dlYear, setDlYear] = useState(pm.year);
  const [dlYearAnnual, setDlYearAnnual] = useState(String(new Date().getFullYear() - 1));

  const month = currentMonthKey();
  const monthName = monthShort(month);

  const inviteLink = `https://cinderella.cy/?ref=${referralCode}`;
  const inviteText = `Join me cleaning on ${APP_NAME}. Sign up with my link and we both earn a bonus: ${inviteLink}`;

  // --- work earnings this month (net of commission) ---
  const done = jobs.filter((j) => j.status === "completed");
  const workEarn = done.reduce((s, j) => s + (j.cleanerPay ?? priceJob(j.ratePerHour * j.durationHours).cleanerPay), 0);
  const tasks = done.length;
  const hoursWorked = done.reduce((s, j) => s + j.durationHours, 0);

  // --- referral bonus this month ---
  const rows = referees.map((r) => {
    const perf = monthlyPerformance(r.jobs, r.verified, r.avgRating)[month]
      ?? { month, hours: 0, earnings: 0, avgRating: r.avgRating, verified: r.verified, cancellations: 0 };
    return { referee: r, perf, reward: rewardForMonth(perf) };
  });
  const referEarn = rows.reduce((s, x) => s + x.reward.referrerReward, 0);

  const total = workEarn + referEarn;

  function copy() {
    navigator.clipboard?.writeText(inviteText).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }
  function share() {
    if (navigator.share) navigator.share({ title: `Join ${APP_NAME}`, text: inviteText, url: inviteLink }).catch(() => {});
    else copy();
  }

  return (
    <div className="pad">
      <h1 className="h1">Earnings</h1>

      {/* TOTAL THIS MONTH — work + referral combined. This card is the single
          place the referral money is shown as a figure (no duplicate below). */}
      <div className="earncard" style={{ marginTop: 8 }}>
        <div className="earncard__head">
          <span className="earncard__lbl">Total · {monthName}</span>
          <span className="earncard__amt">€{total.toFixed(0)}</span>
        </div>
        <div className="earncard__stats">
          <div><b>€{workEarn.toFixed(0)}</b><span>from work</span></div>
          <div className="earncard__div" />
          <div><b>€{referEarn.toFixed(0)}</b><span>from referrals</span></div>
        </div>
      </div>

      {/* work snapshot */}
      <div className="statgrid" style={{ gridTemplateColumns: "1fr 1fr 1fr", marginTop: 12 }}>
        <div className="statbox">
          <div className="statval">{tasks}</div>
          <div className="statlbl">Jobs</div>
        </div>
        <div className="statbox">
          <div className="statval">{hoursWorked}</div>
          <div className="statlbl">Hours</div>
        </div>
        <div className="statbox">
          <div className="statval">{tasks ? (workEarn / Math.max(1, hoursWorked)).toFixed(1) : "0"}</div>
          <div className="statlbl">€/hr avg</div>
        </div>
      </div>

      {/* statements */}
      <div className="card row between" style={{ marginTop: 12, cursor: "pointer" }} onClick={() => setShowStatements(true)}>
        <b style={{ fontSize: 14 }}>Earnings statements</b>
        <span className="dayrow__chev">›</span>
      </div>

      {/* ---------------- REFER & EARN ---------------- */}
      <div className="referhero">
        <div className="referhero__title">Refer &amp; earn more</div>
        <p className="referhero__sub">
          Invite cleaners you trust. When someone you invited has a good month, you
          <b> both</b> get a bonus on top of your normal pay — every month they keep it up.
        </p>
        <button className="btn invitebtn" onClick={share}>
          {copied ? "Link copied ✓" : "Invite a cleaner"}
        </button>
        <button className="referhero__how" onClick={() => setShowGoal(true)}>See how it works &amp; what you earn</button>
      </div>

      {/* subheading — deliberately NOT the page-title style */}
      <div className="subhead" style={{ marginTop: 18 }}>Your referrals</div>
      {rows.length === 0 && (
        <div className="empty">No referrals yet. Invite a cleaner to start earning.</div>
      )}

      {rows.map(({ referee, perf, reward }) => {
        const pct = Math.min(100, Math.round((perf.hours / REFERRAL.minHours) * 100));
        const color = reward.eligible ? "#1faa59" : "#e6a700";
        return (
          <button key={referee.name} className="refrow refrow--tap" onClick={() => setOpenReferee({ referee, perf, reward })}>
            <span className="refavatar">{referee.name[0]}</span>
            <div className="refrow__mid">
              <div className="refrow__name">
                <span className="refdot" style={{ background: color }} />
                {referee.name}
              </div>
              <div className="refrow__meta">
                {perf.hours}/{REFERRAL.minHours}h · {perf.avgRating.toFixed(2)}★ · {perf.cancellations} cancels
              </div>
              <div className="refrow__bar"><i style={{ width: pct + "%", background: color }} /></div>
            </div>
            <span className="refrow__status">
              <span className={"refstatus " + (reward.eligible ? "ok" : "wait")}>
                {reward.eligible ? "On track" : "Not yet"}
              </span>
              <span className="dayrow__chev">›</span>
            </span>
          </button>
        );
      })}

      {/* statements modal */}
      {showStatements && (
        <div className="modal__backdrop" onClick={() => setShowStatements(false)}>
          <div className="modal tall" onClick={(e) => e.stopPropagation()}>
            <div className="between" style={{ marginBottom: 4 }}>
              <b style={{ fontSize: 16 }}>Earnings statements</b>
              <button className="iconbtn" onClick={() => setShowStatements(false)}>✕</button>
            </div>
            <div className="card row between" style={{ marginBottom: 14 }}>
              <div>
                <div className="earnmonth__name">This month</div>
                <div className="earnmonth__total" style={{ marginTop: 2 }}>€{total.toFixed(0)}</div>
                <div className="tiny muted">{tasks} jobs · work + referrals</div>
              </div>
              <button className="dl" onClick={() => downloadStatement("this month")}>PDF</button>
            </div>
            <div className="label" style={{ marginTop: 0 }}>Monthly statement</div>
            <div className="card">
              <div className="row" style={{ gap: 8 }}>
                <Dropdown value={dlMonth} options={MONTHS} onChange={setDlMonth} />
                <div style={{ width: 110 }}><Dropdown value={dlYear} options={YEARS} onChange={setDlYear} /></div>
              </div>
              <button className="btn agent" style={{ marginTop: 12 }} onClick={() => downloadStatement(`${dlMonth} ${dlYear}`)}>Download</button>
            </div>
            <div className="label">Yearly income statement</div>
            <div className="card">
              <p className="sub" style={{ marginTop: 0 }}>Full-year summary for your tax return.</p>
              <Dropdown value={dlYearAnnual} options={YEARS} onChange={setDlYearAnnual} />
              <button className="btn agent" style={{ marginTop: 12 }} onClick={() => downloadStatement(`full year ${dlYearAnnual}`)}>Download</button>
            </div>
          </div>
        </div>
      )}

      {/* how it works */}
      {showGoal && (
        <div className="modal__backdrop" onClick={() => setShowGoal(false)}>
          <div className="modal tall" onClick={(e) => e.stopPropagation()}
            ref={goalSwipe.ref}
            onTouchStart={goalSwipe.onTouchStart} onTouchMove={goalSwipe.onTouchMove} onTouchEnd={goalSwipe.onTouchEnd}>
            <div className="between" style={{ marginBottom: 12 }}>
              <b style={{ fontSize: 16 }}>How Refer &amp; earn works</b>
              <button className="iconbtn" onClick={() => setShowGoal(false)}>✕</button>
            </div>

            <p className="sub" style={{ marginTop: 0 }}>
              Share your invite link with a cleaner. Once they join and have a good
              month, you <b>both</b> earn a bonus — and it repeats every month they qualify.
            </p>

            <div className="subhead" style={{ marginTop: 14 }}>What they need each month</div>
            <div className="goals">
              <div className="goalrow met"><span className="gck">✓</span> Be verified on {APP_NAME}</div>
              <div className="goalrow met"><span className="gck">✓</span> Work at least {REFERRAL.minHours} hours</div>
              <div className="goalrow met"><span className="gck">✓</span> Keep a {REFERRAL.minRating.toFixed(1)}★ rating or better</div>
              <div className="goalrow met"><span className="gck">✓</span> No more than {REFERRAL.maxCancellations} cancellations</div>
            </div>

            <div className="subhead" style={{ marginTop: 16 }}>Example</div>
            <div className="card examplecard">
              <div className="between"><span className="muted tiny">Cleaner you invited earns</span><b>€2,000</b></div>
              <div className="between" style={{ marginTop: 6 }}><span className="muted tiny">Your bonus ({(REFERRAL.referrerShare * 100).toFixed(1)}%)</span><b style={{ color: "var(--green)" }}>€{(2000 * REFERRAL.referrerShare).toFixed(0)}</b></div>
              <div className="between" style={{ marginTop: 6 }}><span className="muted tiny">Their bonus ({(REFERRAL.refereeShare * 100).toFixed(1)}%)</span><b style={{ color: "var(--green)" }}>€{(2000 * REFERRAL.refereeShare).toFixed(0)}</b></div>
              <div className="divider" />
              <div className="tiny muted">
                So on a €2,000 month you each get €{(2000 * REFERRAL.referrerShare).toFixed(0)} — for as long as they keep hitting the targets.
              </div>
            </div>

            <div className="note" style={{ marginTop: 14 }}>
              <b>Cancellation policy:</b> keeping commitments matters. More than {REFERRAL.maxCancellations} cancellations
              in a month means no bonus that month (for you and for them) — so only accept jobs you can keep.
            </div>
          </div>
        </div>
      )}

      {/* referee detail — criteria only, NO earnings shown */}
      {openReferee && (
        <RefereeModal
          data={openReferee}
          onClose={() => setOpenReferee(null)}
        />
      )}
    </div>
  );
}

/* ---------------- Referee detail (no money shown) ---------------- */
function RefereeModal({ data, onClose }: {
  data: { referee: Referee; perf: MonthlyPerf; reward: ReferralReward };
  onClose: () => void;
}) {
  const R = getConfig().referral;
  const { referee, perf, reward } = data;
  const checks = [
    { label: "Verified", met: referee.verified },
    { label: `Worked ${perf.hours} / ${R.minHours} h`, met: perf.hours >= R.minHours },
    { label: `Rating ${perf.avgRating.toFixed(2)} / ${R.minRating.toFixed(1)}★`, met: perf.avgRating >= R.minRating },
    { label: `${perf.cancellations} / ${R.maxCancellations} max cancellations`, met: perf.cancellations <= R.maxCancellations },
  ];
  return (
    <div className="modal__backdrop" onClick={onClose}>
      <div className="modal tall" onClick={(e) => e.stopPropagation()}>
        <div className="between" style={{ marginBottom: 12 }}>
          <b style={{ fontSize: 16 }}>{referee.name}</b>
          <button className="iconbtn" onClick={onClose}>✕</button>
        </div>

        <div className={"refstatus lg " + (reward.eligible ? "ok" : "wait")} style={{ marginBottom: 14 }}>
          {reward.eligible ? "On track for this month's bonus" : "Not eligible yet this month"}
        </div>

        {/* performance snapshot — deliberately no earnings */}
        <div className="statgrid" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <div className="statbox"><div className="statval">{perf.hours}</div><div className="statlbl">Hours</div></div>
          <div className="statbox"><div className="statval">{perf.avgRating.toFixed(2)}★</div><div className="statlbl">Rating</div></div>
          <div className="statbox"><div className="statval">{referee.jobs.filter((j) => j.status === "completed").length}</div><div className="statlbl">Jobs done</div></div>
          <div className="statbox"><div className="statval" style={{ color: perf.cancellations > R.maxCancellations ? "var(--red)" : undefined }}>{perf.cancellations}</div><div className="statlbl">Cancellations</div></div>
        </div>

        <div className="subhead" style={{ marginTop: 16 }}>Bonus checklist</div>
        <div className="goals">
          {checks.map((c) => (
            <div key={c.label} className={"goalrow " + (c.met ? "met" : "unmet")}>
              <span className="gck">{c.met ? "✓" : "○"}</span> {c.label}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
