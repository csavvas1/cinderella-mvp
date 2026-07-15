import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import BackButton from "../../components/BackButton";
import PlatformIcon from "../../components/PlatformIcon";
import { platformName } from "../../data/ical";
import { SEED_RESERVATIONS } from "../../data/reservations";
import type { Reservation } from "../../types";

function pad(n: number) { return String(n).padStart(2, "0"); }
function todayISO() { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function fmtRange(a: string, b: string) {
  const da = new Date(a + "T00:00:00"), db = new Date(b + "T00:00:00");
  const m = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  return `${m(da)} – ${m(db)}`;
}

export default function Reservations() {
  const nav = useNavigate();
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [tab, setTab] = useState<"reservations" | "tasks">("reservations");
  const [sel, setSel] = useState<Reservation | null>(null);

  const y = month.getFullYear();
  const m = month.getMonth();
  const startDow = (new Date(y, m, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const monthName = month.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  const cells: (number | null)[] = [...Array(startDow).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  const iso = (day: number) => `${y}-${pad(m + 1)}-${pad(day)}`;
  const today = todayISO();

  // group reservations by their check-in day (bar renders on the arrival cell)
  const byCheckIn = useMemo(() => {
    const map: Record<string, Reservation[]> = {};
    SEED_RESERVATIONS.forEach((r) => { (map[r.checkIn] ??= []).push(r); });
    return map;
  }, []);

  return (
    <div className="pad">
      <BackButton />
      <div className="between" style={{ marginTop: 6, marginBottom: 12 }}>
        <h1 className="h1" style={{ margin: 0 }}>Reservations</h1>
      </div>

      <div className="segmini" style={{ marginBottom: 12 }}>
        <button className={tab === "reservations" ? "active" : ""} onClick={() => setTab("reservations")}>Reservations</button>
        <button className={tab === "tasks" ? "active" : ""} onClick={() => setTab("tasks")}>Hosting tasks</button>
      </div>

      {tab === "tasks" ? (
        <div className="note" style={{ marginTop: 8 }}>Hosting tasks (cleaning turnovers, check-ins) will appear here.</div>
      ) : (
        <>
          <div className="between" style={{ marginBottom: 10 }}>
            <b style={{ fontSize: 15 }}>{monthName}</b>
            <div className="row" style={{ gap: 6 }}>
              <button className="btn sm secondary" onClick={() => setMonth(new Date(y, m, 1))}>Today</button>
              <button className="iconbtn" onClick={() => setMonth(new Date(y, m - 1, 1))}>‹</button>
              <button className="iconbtn" onClick={() => setMonth(new Date(y, m + 1, 1))}>›</button>
            </div>
          </div>

          <div className="resgrid">
            {WEEKDAYS.map((d) => <div key={d} className="caldow">{d}</div>)}
            {cells.map((day, i) => {
              if (day === null) return <div key={"e" + i} className="rescell rescell--empty" />;
              const dISO = iso(day);
              const list = byCheckIn[dISO] ?? [];
              const isToday = dISO === today;
              return (
                <div key={dISO} className={"rescell" + (isToday ? " today" : "")}>
                  <span className="rescell__num">{isToday ? <span className="rescell__todaydot">{day}</span> : day}</span>
                  {list.map((r) => (
                    <button key={r.id} className={"resbar resbar--" + r.platform} onClick={() => setSel(r)}>
                      <PlatformIcon platform={r.platform} size={14} />
                      <span className="resbar__name">{r.guest}</span>
                    </button>
                  ))}
                </div>
              );
            })}
          </div>

          {/* full list under the grid — easier to scan on a phone */}
          <div className="label" style={{ marginTop: 18 }}>This month</div>
          {SEED_RESERVATIONS
            .filter((r) => { const c = new Date(r.checkIn + "T00:00:00"); return c.getFullYear() === y && c.getMonth() === m; })
            .sort((a, b) => a.checkIn.localeCompare(b.checkIn))
            .map((r) => (
              <button key={r.id} className="reslist card row between" onClick={() => setSel(r)}>
                <div className="row" style={{ gap: 10, minWidth: 0 }}>
                  <PlatformIcon platform={r.platform} size={22} />
                  <div style={{ minWidth: 0 }}>
                    <b style={{ fontSize: 14 }}>{r.guest}</b>
                    <div className="tiny muted" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.property} · {fmtRange(r.checkIn, r.checkOut)}</div>
                  </div>
                </div>
                <div className="row" style={{ gap: 10 }}>
                  <span className="reschip">🕑 {r.nights}</span>
                  <span className="reschip">👤 {r.guests}</span>
                </div>
              </button>
            ))}
        </>
      )}

      {sel && <ReservationSheet r={sel} onClose={() => setSel(null)} onMessage={() => { setSel(null); nav("/inbox"); }} />}
    </div>
  );
}

function ReservationSheet({ r, onClose, onMessage }: { r: Reservation; onClose: () => void; onMessage: () => void }) {
  return (
    <div className="resheet__backdrop" onClick={onClose}>
      <div className="resheet" onClick={(e) => e.stopPropagation()}>
        <div className="resheet__grab" />
        <div className="between" style={{ marginBottom: 10 }}>
          <b style={{ fontSize: 16 }}>Booking</b>
          <button className="iconbtn" onClick={onClose}>✕</button>
        </div>
        <img className="resheet__photo" src={r.propertyPhoto} alt={r.property} loading="lazy" />
        <b style={{ fontSize: 17, display: "block", marginTop: 12 }}>{r.guest}</b>
        <div className="tiny muted" style={{ marginBottom: 12 }}>{r.property}</div>
        <div className="resheet__rows">
          <div className="between"><span className="muted">Channel</span><span className="row" style={{ gap: 6 }}><PlatformIcon platform={r.platform} size={16} />{platformName(r.platform)}</span></div>
          <div className="between"><span className="muted">Status</span><b style={{ textTransform: "capitalize" }}>{r.status}</b></div>
          <div className="between"><span className="muted">Nights</span><b>{r.nights}</b></div>
          <div className="between"><span className="muted">Guests</span><b>{r.guests}</b></div>
          <div className="between"><span className="muted">Dates</span><b>{fmtRange(r.checkIn, r.checkOut)}</b></div>
          {r.total != null && <div className="between"><span className="muted">Total</span><b>€{r.total}</b></div>}
        </div>
        <div className="row" style={{ gap: 10, marginTop: 16 }}>
          <button className="btn grow" onClick={onClose}>View reservation</button>
          <button className="iconbtn resheet__msg" title="Message guest" onClick={onMessage}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.4A8 8 0 1 1 21 12Z" /></svg>
          </button>
        </div>
      </div>
    </div>
  );
}
