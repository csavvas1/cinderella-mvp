import { useNavigate } from "react-router-dom";
import { useStore } from "../../context/AppStore";
import type { Job } from "../../types";

function addHours(time: string, h: number) {
  const [hh, mm] = time.split(":").map(Number);
  const total = hh * 60 + mm + Math.round(h * 60);
  return `${String(Math.floor((total / 60) % 24)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function dayLabel(dateISO: string) {
  const d = new Date(dateISO + "T00:00:00");
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
  const rel = diff === 0 ? "Today" : diff === 1 ? "Tomorrow" : null;
  const nice = d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
  return rel ? `${rel} · ${nice}` : nice;
}

export default function Jobs() {
  const { jobs, dismissJob, acknowledgeJob, myUid } = useStore();
  const nav = useNavigate();

  // Cancelled jobs stay listed (crossed-out, dismissable) until the agent taps
  // the X; modified jobs stay flagged until acknowledged — neither can silently
  // disappear on the agent.
  // Agent side shows ONLY jobs assigned to THIS user as the cleaner. Jobs the
  // user booked as a customer (customer_uid = me, cleaner_uid = someone else)
  // also live in the store, but must not appear in the agent's own Jobs list.
  const relevant = jobs.filter((j) =>
    j.cleanerUid === myUid &&
    (j.status === "pending" || j.status === "approved" || j.status === "modified" ||
      (j.status === "cancelled" && !j.dismissedByAgent)));
  const nPending = relevant.filter((j) => j.status === "pending").length;
  const nAccepted = relevant.filter((j) => j.status === "approved").length;
  const nModified = relevant.filter((j) => j.status === "modified").length;
  const nCancelled = relevant.filter((j) => j.status === "cancelled").length;

  // group by day, nearest first; within a day: pending, then modified, then
  // approved, then cancelled; ties broken by time.
  const map: Record<string, Job[]> = {};
  relevant.forEach((j) => { (map[j.date] ??= []).push(j); });
  const days = Object.keys(map).sort((a, b) => a.localeCompare(b)).map((date) => ({
    date,
    jobs: map[date].sort((a, b) => {
      const rank = (s: Job["status"]) => (s === "pending" ? 0 : s === "modified" ? 1 : s === "cancelled" ? 3 : 2);
      if (rank(a.status) !== rank(b.status)) return rank(a.status) - rank(b.status);
      return a.time.localeCompare(b.time);
    }),
  }));

  return (
    <div className="pad" style={{ paddingTop: 8 }}>
      <div className="jobs__summary">
        <span><b style={{ color: "var(--amber)" }}>{nPending}</b> pending</span>
        <span className="dot-sep">·</span>
        <span><b style={{ color: "var(--green)" }}>{nAccepted}</b> accepted</span>
        {nModified > 0 && <>
          <span className="dot-sep">·</span>
          <span><b style={{ color: "var(--indigo)" }}>{nModified}</b> changed</span>
        </>}
        {nCancelled > 0 && <>
          <span className="dot-sep">·</span>
          <span><b style={{ color: "var(--red)" }}>{nCancelled}</b> cancelled</span>
        </>}
      </div>

      {days.length === 0 && (
        <div className="emptyjobs">
          <div className="emptyjobs__ic">
            <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="6.5" width="18" height="13" rx="2.5" /><path d="M8 6.5V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v1.5M3 11h18" />
            </svg>
          </div>
          <b style={{ fontSize: 15 }}>No jobs yet</b>
          <p className="sub" style={{ marginTop: 4, maxWidth: 240 }}>New booking requests near you will appear here. Keep your schedule and rate up to date to get matched.</p>
        </div>
      )}

      {days.map(({ date, jobs }) => {
        const dayPending = jobs.filter((j) => j.status === "pending").length;
        return (
          <div key={date} style={{ marginBottom: 6 }}>
            <div className="jobs__day">
              <span>{dayLabel(date)}</span>
              <span className="jobs__count">
                {jobs.length} {jobs.length === 1 ? "job" : "jobs"}
                {dayPending > 0 && <span className="jobs__pendtag"> · {dayPending} pending</span>}
              </span>
            </div>
            {jobs.map((j) => {
              const pending = j.status === "pending";
              const cancelled = j.status === "cancelled";
              const modified = j.status === "modified";
              return (
                <div
                  key={j.id}
                  className={"jobrow"
                    + (pending ? " jobrow--pending" : "")
                    + (modified ? " jobrow--modified" : "")
                    + (cancelled ? " jobrow--cancelled" : "")}
                  onClick={cancelled ? undefined : () => nav("/agent/job/" + j.id)}
                >
                  <div className="jobrow__time">
                    <b>{j.time}</b>
                    <span className="tiny muted">{addHours(j.time, j.durationHours)}</span>
                  </div>
                  <div className="jobrow__main">
                    <div className="jobrow__name">
                      {j.customerName}
                      {j.status === "approved" && j.autoAccepted && !j.seenByAgent && (
                        <span className="jobrow__new">New</span>
                      )}
                    </div>
                    <div className="tiny muted">{j.type} · {j.durationHours}h · €{(j.ratePerHour * j.durationHours).toFixed(0)}</div>
                  </div>
                  {cancelled ? (
                    <div className="jobrow__cancel">
                      <span className="badge red">Cancelled</span>
                      <button
                        className="jobrow__dismiss"
                        aria-label="Remove cancelled job"
                        title="Remove from list"
                        onClick={(e) => { e.stopPropagation(); dismissJob(j.id); }}
                      >
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
                      </button>
                    </div>
                  ) : modified ? (
                    <div className="jobrow__cancel">
                      <span className="badge indigo">Modified</span>
                      <button
                        className="badge indigo jobrow__ack"
                        aria-label="Acknowledge change"
                        title="Acknowledge change"
                        onClick={(e) => { e.stopPropagation(); acknowledgeJob(j.id); }}
                      >
                        ✓
                      </button>
                    </div>
                  ) : (
                    <span className={"badge " + (pending ? "amber" : "green")}>
                      {pending ? "Accept" : "✓"}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
