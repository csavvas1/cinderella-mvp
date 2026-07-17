import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import PlatformIcon from "./PlatformIcon";
import { platformName } from "../data/ical";
import type { ExternalBooking, Reservation } from "../types";

function pad(n: number) { return String(n).padStart(2, "0"); }
function todayISO() { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }

function fmtRange(a: string, b: string) {
  const m = (s: string) => new Date(s + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  return `${m(a)} – ${m(b)}`;
}
function daysBetween(a: string, b: string) {
  return Math.round((new Date(b + "T00:00:00").getTime() - new Date(a + "T00:00:00").getTime()) / 86400000);
}

// Lane pitch: bars overlap slightly so a busy day doesn't blow up the row height.
const BAR_H = 16;
const LANE_PITCH = 18; // thin bars, tiny gap between lanes (no overlap)
const TOP_OFFSET = 24; // clears the day-number

// Same grid/nav as the Standard (cleaning) calendar, with the Pro booking bars
// overlaid. Tap a bar → detail card renders below the grid.
export default function LinkedCalendar({ extra = [], onRemove, onEditDates }: {
  extra?: ExternalBooking[];
  onRemove?: (id: string) => void;
  onEditDates?: (id: string) => void;
}) {
  const nav = useNavigate();
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [sel, setSel] = useState<Reservation | null>(null);
  // scroll the reservation detail into view when a bar is tapped, so it's clear
  // that a card popped below the calendar.
  const rescardRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (sel) requestAnimationFrame(() => rescardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }));
  }, [sel]);
  const manualIds = useMemo(() => new Set(extra.map((b) => b.id)), [extra]);

  // real reservations synced from connected channels (external_bookings)
  const allRes: Reservation[] = useMemo(() => {
    return extra.map((b) => ({
      id: b.id, platform: b.platform, guest: b.guest, property: "Reservation",
      propertyPhoto: "", checkIn: b.checkIn, checkOut: b.checkOut,
      nights: Math.max(1, daysBetween(b.checkIn, b.checkOut)),
      guests: 1, status: "booked",
    }));
  }, [extra]);

  const y = month.getFullYear();
  const m = month.getMonth();
  const startDow = (new Date(y, m, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const monthName = month.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  const today = todayISO();
  const nowD = new Date();
  const atCurrentMonth = y === nowD.getFullYear() && m === nowD.getMonth();

  const flat: (number | null)[] = [...Array(startDow).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  while (flat.length % 7 !== 0) flat.push(null);
  const weeks: (number | null)[][] = [];
  for (let i = 0; i < flat.length; i += 7) weeks.push(flat.slice(i, i + 7));
  const iso = (day: number) => `${y}-${pad(m + 1)}-${pad(day)}`;

  const monthRes = useMemo(
    () => allRes.filter((r) => {
      const s = new Date(r.checkIn + "T00:00:00"), e = new Date(r.checkOut + "T00:00:00");
      const first = new Date(y, m, 1), last = new Date(y, m + 1, 0);
      return e >= first && s <= last;
    }),
    [allRes, y, m]
  );

  function weekBars(week: (number | null)[]) {
    const days = week.filter((d): d is number => d !== null);
    if (!days.length) return [];
    const rowStart = iso(days[0]);
    const rowEnd = iso(days[days.length - 1]);
    type Seg = { r: Reservation; col: number; span: number; clipL: boolean; clipR: boolean; lane: number };
    const segs: Seg[] = [];
    monthRes.forEach((r) => {
      if (r.checkOut < rowStart || r.checkIn > rowEnd) return;
      const startInRow = r.checkIn < rowStart ? rowStart : r.checkIn;
      const endInRow = r.checkOut > rowEnd ? rowEnd : r.checkOut;
      const firstColDay = week.findIndex((d) => d !== null && iso(d) === startInRow);
      const col = firstColDay >= 0 ? firstColDay : week.findIndex((d) => d !== null);
      const span = Math.max(1, daysBetween(startInRow, endInRow) + 1);
      segs.push({ r, col, span: Math.min(span, 7 - col), clipL: r.checkIn < rowStart, clipR: r.checkOut > rowEnd, lane: 0 });
    });
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
    <div style={{ marginTop: 8 }}>
      {/* nav — identical to the Standard calendar */}
      <div className="between" style={{ marginBottom: 10 }}>
        <button className="iconbtn" disabled={atCurrentMonth} style={{ opacity: atCurrentMonth ? 0.35 : 1 }}
          onClick={() => { if (!atCurrentMonth) setMonth(new Date(y, m - 1, 1)); }}>‹</button>
        <b>{monthName}</b>
        <button className="iconbtn" onClick={() => setMonth(new Date(y, m + 1, 1))}>›</button>
      </div>
      <div className="calgrid calhead">
        {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => <div key={i} className="caldow">{d}</div>)}
      </div>

      {(() => {
        // uniform row height across the whole month = tallest week's bar stack,
        // so every day square is the same size (not per-week variable).
        const rowH = weeks.reduce((mx, wk) => {
          const lanes = weekBars(wk).reduce((m, s) => Math.max(m, s.lane + 1), 0);
          const h = lanes ? TOP_OFFSET + (lanes - 1) * LANE_PITCH + BAR_H + 3 : 0;
          return Math.max(mx, h + 6);
        }, 52);
        return weeks.map((week, wi) => (
          <div key={wi} className="lcw">
            <div className="calgrid lcw__cells">
              {week.map((d, di) => (
                <div key={di} className={"calcell lcw__cell"
                    + (d && iso(d) === today ? " today" : "")
                    + (d && iso(d) < today ? " past" : "")
                    + (d ? "" : " lcw__cell--empty")}
                  style={{ minHeight: rowH, height: rowH }}>
                  {d && <span className="calhd"><span className="calnum">{d}</span></span>}
                </div>
              ))}
            </div>
            {/* bar overlay */}
            <div className="lcw__bars">
              {weekBars(week).map((s, i) => (
                <button key={i}
                  className={"lc__bar lc__bar--" + s.r.platform + (s.clipL ? " clipL" : "") + (s.clipR ? " clipR" : "") + (s.r.checkOut < today ? " lc__bar--past" : "")}
                  style={{ left: `calc(${(s.col / 7) * 100}% + 3px)`, width: `calc(${(s.span / 7) * 100}% - 6px)`, top: TOP_OFFSET + s.lane * LANE_PITCH, height: BAR_H, zIndex: 5 + s.lane }}
                  onClick={() => setSel(s.r)}>
                  <PlatformIcon platform={s.r.platform} size={11} />
                  <span className="lc__barname">{s.r.property}</span>
                </button>
              ))}
            </div>
          </div>
        ));
      })()}

      {sel && (
        <div className="rescard" ref={rescardRef}>
          <div className="between" style={{ marginBottom: 8 }}>
            <b style={{ fontSize: 16 }}>Booking</b>
            <button className="iconbtn" onClick={() => setSel(null)}>✕</button>
          </div>
          {sel.propertyPhoto && <img className="rescard__photo" src={sel.propertyPhoto} alt={sel.property} loading="lazy" />}
          <b style={{ fontSize: 17, display: "block", marginTop: 12 }}>{sel.property}</b>
          <div className="tiny muted" style={{ marginBottom: 12 }}>Guest: {sel.guest}</div>
          <div className="rescard__rows">
            <div className="between"><span className="muted">Channel</span><span className="row" style={{ gap: 6 }}><PlatformIcon platform={sel.platform} size={16} />{platformName(sel.platform)}</span></div>
            <div className="between"><span className="muted">Status</span><b style={{ textTransform: "capitalize" }}>{sel.status}</b></div>
            <div className="between"><span className="muted">Nights</span><b>{sel.nights}</b></div>
            <div className="between"><span className="muted">Guests</span><b>{sel.guests}</b></div>
            <div className="between"><span className="muted">Dates</span><b>{fmtRange(sel.checkIn, sel.checkOut)}</b></div>
            {sel.total != null && <div className="between"><span className="muted">Total</span><b>€{sel.total}</b></div>}
          </div>
          {manualIds.has(sel.id) ? (
            <div className="row" style={{ gap: 8, marginTop: 14 }}>
              <button className="btn secondary grow" onClick={() => { onEditDates?.(sel.id); setSel(null); }}>Edit dates</button>
              <button className="btn danger grow" onClick={() => { onRemove?.(sel.id); setSel(null); }}>Remove</button>
            </div>
          ) : (
            <button className="btn" style={{ marginTop: 14 }} onClick={() => nav("/messages")}>Message guest</button>
          )}
        </div>
      )}
    </div>
  );
}

