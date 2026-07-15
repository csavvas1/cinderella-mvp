import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import PlatformIcon from "./PlatformIcon";
import { platformName } from "../data/ical";
import { SEED_RESERVATIONS } from "../data/reservations";
import type { Reservation } from "../types";

function pad(n: number) { return String(n).padStart(2, "0"); }
function todayISO() { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function fmtRange(a: string, b: string) {
  const m = (s: string) => new Date(s + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  return `${m(a)} – ${m(b)}`;
}
function daysBetween(a: string, b: string) {
  return Math.round((new Date(b + "T00:00:00").getTime() - new Date(a + "T00:00:00").getTime()) / 86400000);
}

// Screenshot-style calendar: week rows with reservation bars spanning check-in →
// check-out across the row. Tap a bar → detail card renders below the grid.
export default function LinkedCalendar() {
  const nav = useNavigate();
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [sel, setSel] = useState<Reservation | null>(null);

  const y = month.getFullYear();
  const m = month.getMonth();
  const startDow = (new Date(y, m, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const monthName = month.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  const today = todayISO();

  // build flat 42 cells then chunk into week rows of 7
  const flat: (number | null)[] = [...Array(startDow).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  while (flat.length % 7 !== 0) flat.push(null);
  const weeks: (number | null)[][] = [];
  for (let i = 0; i < flat.length; i += 7) weeks.push(flat.slice(i, i + 7));
  const iso = (day: number) => `${y}-${pad(m + 1)}-${pad(day)}`;

  // reservations that intersect this month
  const monthRes = useMemo(
    () => SEED_RESERVATIONS.filter((r) => {
      const s = new Date(r.checkIn + "T00:00:00"), e = new Date(r.checkOut + "T00:00:00");
      const first = new Date(y, m, 1), last = new Date(y, m + 1, 0);
      return e >= first && s <= last;
    }),
    [y, m]
  );

  // For each week row, compute bar segments (col start + span) + lane stacking.
  function weekBars(week: (number | null)[]) {
    const days = week.filter((d): d is number => d !== null);
    if (!days.length) return [];
    const rowStart = iso(days[0]);
    const rowEnd = iso(days[days.length - 1]);
    type Seg = { r: Reservation; col: number; span: number; clipL: boolean; clipR: boolean; lane: number };
    const segs: Seg[] = [];
    monthRes.forEach((r) => {
      if (r.checkOut < rowStart || r.checkIn > rowEnd) return; // no overlap this row
      const startInRow = r.checkIn < rowStart ? rowStart : r.checkIn;
      const endInRow = r.checkOut > rowEnd ? rowEnd : r.checkOut;
      const firstColDay = week.findIndex((d) => d !== null && iso(d) === startInRow);
      const col = firstColDay >= 0 ? firstColDay : week.findIndex((d) => d !== null);
      const span = Math.max(1, daysBetween(startInRow, endInRow) + 1);
      segs.push({ r, col, span: Math.min(span, 7 - col), clipL: r.checkIn < rowStart, clipR: r.checkOut > rowEnd, lane: 0 });
    });
    // greedy lane assignment so overlapping bars stack
    segs.sort((a, b) => a.col - b.col);
    const laneEnds: number[] = [];
    segs.forEach((s) => {
      let lane = laneEnds.findIndex((end) => end <= s.col);
      if (lane === -1) { lane = laneEnds.length; laneEnds.push(0); }
      laneEnds[lane] = s.col + s.span;
      s.lane = lane;
    });
    return segs;
  }

  return (
    <>
      <div className="between" style={{ marginBottom: 10 }}>
        <b style={{ fontSize: 15 }}>{monthName}</b>
        <div className="row" style={{ gap: 6 }}>
          <button className="btn sm secondary" onClick={() => setMonth(new Date(y, m, 1))}>Today</button>
          <button className="iconbtn" onClick={() => setMonth(new Date(y, m - 1, 1))}>‹</button>
          <button className="iconbtn" onClick={() => setMonth(new Date(y, m + 1, 1))}>›</button>
        </div>
      </div>

      <div className="lc">
        <div className="lc__dow">{WEEKDAYS.map((d) => <div key={d} className="caldow">{d}</div>)}</div>
        {weeks.map((week, wi) => {
          const bars = weekBars(week);
          const lanes = bars.reduce((mx, s) => Math.max(mx, s.lane + 1), 0);
          return (
            <div key={wi} className="lc__week">
              {/* day-number layer */}
              <div className="lc__days">
                {week.map((d, di) => (
                  <div key={di} className={"lc__day" + (d && iso(d) === today ? " today" : "")}>
                    {d && <span className="lc__num">{iso(d) === today ? <span className="lc__todaydot">{d}</span> : d}</span>}
                  </div>
                ))}
              </div>
              {/* bar layer */}
              <div className="lc__bars" style={{ height: lanes * 24 + 4 }}>
                {bars.map((s, i) => (
                  <button key={i}
                    className={"lc__bar lc__bar--" + s.r.platform + (s.clipL ? " clipL" : "") + (s.clipR ? " clipR" : "")}
                    style={{ left: `calc(${(s.col / 7) * 100}% + 2px)`, width: `calc(${(s.span / 7) * 100}% - 4px)`, top: s.lane * 24 }}
                    onClick={() => setSel(s.r)}>
                    <PlatformIcon platform={s.r.platform} size={13} />
                    <span className="lc__barname">{s.r.guest}</span>
                    <span className="lc__barstat">🕑{s.r.nights} 👤{s.r.guests}</span>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {sel && (
        <div className="rescard">
          <div className="between" style={{ marginBottom: 8 }}>
            <b style={{ fontSize: 16 }}>Booking</b>
            <button className="iconbtn" onClick={() => setSel(null)}>✕</button>
          </div>
          <img className="rescard__photo" src={sel.propertyPhoto} alt={sel.property} loading="lazy" />
          <b style={{ fontSize: 17, display: "block", marginTop: 12 }}>{sel.guest}</b>
          <div className="tiny muted" style={{ marginBottom: 12 }}>{sel.property}</div>
          <div className="rescard__rows">
            <div className="between"><span className="muted">Channel</span><span className="row" style={{ gap: 6 }}><PlatformIcon platform={sel.platform} size={16} />{platformName(sel.platform)}</span></div>
            <div className="between"><span className="muted">Status</span><b style={{ textTransform: "capitalize" }}>{sel.status}</b></div>
            <div className="between"><span className="muted">Nights</span><b>{sel.nights}</b></div>
            <div className="between"><span className="muted">Guests</span><b>{sel.guests}</b></div>
            <div className="between"><span className="muted">Dates</span><b>{fmtRange(sel.checkIn, sel.checkOut)}</b></div>
            {sel.total != null && <div className="between"><span className="muted">Total</span><b>€{sel.total}</b></div>}
          </div>
          <button className="btn" style={{ marginTop: 14 }} onClick={() => nav("/messages")}>Message guest</button>
        </div>
      )}
    </>
  );
}

export function hasLinkedReservations() { return SEED_RESERVATIONS.length > 0; }
