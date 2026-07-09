import { useState } from "react";
import { useClickOutside } from "../hooks/useClickOutside";

function pad(n: number) { return String(n).padStart(2, "0"); }
function iso(y: number, m: number, d: number) { return `${y}-${pad(m + 1)}-${pad(d)}`; }

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function DatePicker({
  value,
  onChange,
  allowedDays,
  openUp,
}: {
  value: string;
  onChange: (v: string) => void;
  allowedDays?: string[]; // e.g. ["Tue","Sat"] — only these weekdays selectable
  openUp?: boolean; // open the calendar above the field (use when low on screen)
}) {
  const [open, setOpen] = useState(false);
  const ref = useClickOutside<HTMLDivElement>(open, () => setOpen(false));
  const sel = value ? new Date(value + "T00:00:00") : new Date();
  const [view, setView] = useState(new Date(sel.getFullYear(), sel.getMonth(), 1));

  const y = view.getFullYear();
  const m = view.getMonth();
  const startDow = (new Date(y, m, 1).getDay() + 6) % 7; // Monday=0
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(startDow).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  const monthName = view.toLocaleDateString("en-GB", { month: "long", year: "numeric" });

  const now = new Date();
  const todayISO = iso(now.getFullYear(), now.getMonth(), now.getDate());
  // don't let the user page back into months entirely in the past
  const canPrev = y > now.getFullYear() || (y === now.getFullYear() && m > now.getMonth());

  const display = value
    ? new Date(value + "T00:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" })
    : "Select date";

  return (
    <div className="dpick" ref={ref}>
      <button type="button" className="fieldbox" style={{ width: "100%", cursor: "pointer" }} onClick={() => setOpen((o) => !o)}>
        <span className="fieldbox__ic">
          <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4.5" width="18" height="16" rx="3" /><path d="M8 2.5v4M16 2.5v4M3 9h18" /></svg>
        </span>
        <span style={{ flex: 1, textAlign: "left", fontSize: 15, fontWeight: 600, padding: "11px 0", color: value ? "var(--text)" : "var(--muted)" }}>{display}</span>
        <span style={{ color: "var(--muted)", fontSize: 11 }}>{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className={"dpick__pop" + (openUp ? " up" : "")}>
          <div className="dpick__head">
            <button type="button" className="iconbtn" disabled={!canPrev} style={{ opacity: canPrev ? 1 : 0.3 }} onClick={() => { if (canPrev) setView(new Date(y, m - 1, 1)); }}>‹</button>
            <b>{monthName}</b>
            <button type="button" className="iconbtn" onClick={() => setView(new Date(y, m + 1, 1))}>›</button>
          </div>
          <div className="dpick__grid dpick__dow">
            {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => <span key={i}>{d}</span>)}
          </div>
          <div className="dpick__grid">
            {cells.map((d, i) => {
              if (d === null) return <span key={i} />;
              const cur = iso(y, m, d);
              const isSel = cur === value;
              const isToday = cur === todayISO;
              const dow = DOW[new Date(y, m, d).getDay()];
              const isPast = cur < todayISO;
              const disabled = isPast || (allowedDays ? !allowedDays.includes(dow) : false);
              return (
                <button
                  key={i}
                  type="button"
                  disabled={disabled}
                  className={"dpick__day" + (isSel ? " sel" : "") + (isToday && !isSel ? " today" : "") + (disabled ? " off" : "")}
                  onClick={() => { if (!disabled) { onChange(cur); setOpen(false); } }}
                >
                  {d}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
