import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useStore } from "../../context/AppStore";
import type { Job } from "../../types";

export default function Calendar() {
  const { jobs, agentProfile } = useStore();
  // accepted + pending offers + completed jobs
  const visible = jobs.filter((j) => j.status === "approved" || j.status === "pending" || j.status === "completed");
  return (
    <div className="pad">
      <JobCalendar jobs={visible} daySchedule={agentProfile.daySchedule ?? {}} />
    </div>
  );
}

function pad(n: number) { return String(n).padStart(2, "0"); }
function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function toMin(time: string) {
  const [hh, mm] = time.split(":").map(Number);
  return hh * 60 + mm;
}
function fromMin(total: number) {
  return `${pad(Math.floor((total / 60) % 24))}:${pad(total % 60)}`;
}
function addHours(time: string, h: number) {
  return fromMin(toMin(time) + Math.round(h * 60));
}
// weekday short name (Mon/Tue/...) for a given ISO date — matches daySchedule keys
const DOW_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
function dowShort(dateISO: string) {
  return DOW_SHORT[new Date(dateISO + "T00:00:00").getDay()];
}

function jobEarn(j: Job) {
  return j.cleanerPay ?? +(j.ratePerHour * j.durationHours).toFixed(2);
}

function JobCalendar({ jobs, daySchedule }: { jobs: Job[]; daySchedule: Record<string, { start: string; end: string }[]> }) {
  const nav = useNavigate();
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [selected, setSelected] = useState<string | null>(null);

  const y = month.getFullYear();
  const m = month.getMonth();
  const first = new Date(y, m, 1);
  const startDow = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(y, m + 1, 0).getDate();

  const byDate = useMemo(() => {
    const map: Record<string, Job[]> = {};
    jobs.forEach((j) => { (map[j.date] ??= []).push(j); });
    // keep each day time-sorted so route/gap logic + display are chronological
    Object.values(map).forEach((list) => list.sort((a, b) => toMin(a.time) - toMin(b.time)));
    return map;
  }, [jobs]);

  const monthName = month.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  const cells: (number | null)[] = [...Array(startDow).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  const iso = (day: number) => `${y}-${pad(m + 1)}-${pad(day)}`;
  const today = todayISO();

  // Agents can browse BACK into past months — they need completed-job history
  // and past earnings. (Customers can't; that calendar is forward-only.) Past
  // *days* are still dimmed + non-actionable below.
  const selJobs = selected ? byDate[selected] ?? [] : [];

  // ---- selected-day summary (jobs / hours / km / earnings) ----
  const summary = useMemo(() => {
    if (!selected) return null;
    const live = selJobs.filter((j) => j.status !== "declined");
    if (live.length === 0) return null;
    const hours = live.reduce((s, j) => s + j.durationHours, 0);
    const earn = live.reduce((s, j) => s + jobEarn(j), 0);
    // total travel: distance-from-prev where known, else distance-from-home for the first
    const km = live.reduce((s, j, i) => s + (i === 0 ? j.distanceFromHomeKm : (j.distanceFromPrevKm ?? 0)), 0);
    return { count: live.length, hours, earn, km };
  }, [selected, selJobs]);

  // ---- gap / overlap check between consecutive jobs on the selected day ----
  // Flags a tight turnaround: previous job's end + travel time overruns the next
  // job's start. Rough travel model: 3 min per km (city driving). Purely a
  // heads-up — the agent still decides.
  function turnaroundWarn(prev: Job, next: Job): string | null {
    const prevEnd = toMin(prev.time) + Math.round(prev.durationHours * 60);
    const travelMin = Math.round((next.distanceFromPrevKm ?? 0) * 3);
    const slack = toMin(next.time) - (prevEnd + travelMin);
    if (slack < 0) return `overlaps by ${-slack}m`;
    if (slack < 15) return `only ${slack}m gap`;
    return null;
  }

  const workBands = selected ? (daySchedule[dowShort(selected)] ?? []) : [];

  return (
    <div style={{ marginTop: 8 }}>
      <div className="between" style={{ marginBottom: 10 }}>
        <button className="iconbtn" onClick={() => setMonth(new Date(y, m - 1, 1))}>‹</button>
        <b>{monthName}</b>
        <button className="iconbtn" onClick={() => setMonth(new Date(y, m + 1, 1))}>›</button>
      </div>
      <div className="calgrid calhead">
        {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => <div key={i} className="caldow">{d}</div>)}
      </div>
      <div className="calgrid">
        {cells.map((day, i) => {
          if (day === null) return <div key={i} />;
          const date = iso(day);
          const list = (byDate[date] ?? []).filter((j) => j.status !== "declined");
          const count = list.length;
          const isPast = date < today;
          const dots = list.slice(0, 3).map((j) =>
            j.status === "pending" ? "wait" : j.status === "completed" ? "done" : "up");
          const extra = count - dots.length;
          const cls =
            "calcell" +
            (count ? " has" : "") +
            (date === today ? " today" : "") +
            (isPast ? " past" : "") +
            (selected === date ? " sel" : "");
          return (
            <button key={i} className={cls} disabled={isPast && count === 0}
              onClick={() => { if (!(isPast && count === 0)) setSelected(date); }}>
              <span className="calhd">
                <span className="calnum">{day}</span>
              </span>
              {count > 0 && (
                <span className="caldots">
                  {dots.map((d, k) => <span key={k} className={"cdot " + d} />)}
                  {extra > 0 && <span className="cmore">+{extra}</span>}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="callegend">
        <div className="callegend__grp">
          <span className="callegend__lbl">Job status</span>
          <span><span className="cdot up" /> Accepted</span>
          <span><span className="cdot wait" /> Pending</span>
          <span><span className="cdot done" /> Completed</span>
        </div>
      </div>

      {selected && (
        <>
          <div className="h2">
            {new Date(selected + "T00:00:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}
          </div>

          {/* working hours for this weekday (context from the agent's schedule) */}
          {workBands.length > 0 && (
            <div className="tiny muted" style={{ marginBottom: 8 }}>
              Working hours: {workBands.map((b) => `${b.start}–${b.end}`).join(", ")}
            </div>
          )}
          {workBands.length === 0 && (
            <div className="tiny muted" style={{ marginBottom: 8 }}>Day off (no working hours set)</div>
          )}

          {/* day summary */}
          {summary && (
            <div className="card daysum">
              <div className="daysum__item"><b>{summary.count}</b><span>job{summary.count === 1 ? "" : "s"}</span></div>
              <div className="daysum__item"><b>{summary.hours}h</b><span>work</span></div>
              <div className="daysum__item"><b>{summary.km.toFixed(1)}km</b><span>travel</span></div>
              <div className="daysum__item"><b>€{summary.earn.toFixed(0)}</b><span>earn</span></div>
            </div>
          )}

          {selJobs.length === 0 && <p className="sub">No jobs this day.</p>}
          {selJobs.map((j, idx) => {
            const prev = idx > 0 ? selJobs[idx - 1] : null;
            const warn = prev ? turnaroundWarn(prev, j) : null;
            const travelKm = idx === 0 ? j.distanceFromHomeKm : j.distanceFromPrevKm;
            const travelLabel = idx === 0 ? "from home" : "from previous";
            return (
              <div key={j.id}>
                {warn && <div className="turnwarn">Tight turnaround — {warn}</div>}
                <div className="card" onClick={() => nav("/agent/job/" + j.id)} style={{ cursor: "pointer" }}>
                  <div className="between">
                    <b style={{ fontSize: 14 }}>{j.time} – {addHours(j.time, j.durationHours)}</b>
                    <span className={"badge " + (j.status === "pending" ? "amber" : j.status === "completed" ? "green" : "green")}>
                      {j.status === "pending" ? "Pending" : j.status === "completed" ? "Completed" : "Accepted"}
                    </span>
                  </div>
                  <div className="tiny muted" style={{ marginTop: 4 }}>{j.customerName} · {j.address}</div>
                  <div className="tiny muted">{j.durationHours}h · €{jobEarn(j).toFixed(0)}</div>
                  {travelKm != null && (
                    <div className="tiny muted">{travelKm.toFixed(1)}km {travelLabel}</div>
                  )}
                </div>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
