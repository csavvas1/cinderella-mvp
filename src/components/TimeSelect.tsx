import { useState } from "react";
import { useClickOutside } from "../hooks/useClickOutside";

const SLOTS: string[] = (() => {
  const out: string[] = [];
  for (let h = 6; h <= 22; h++) {
    for (const m of [0, 30]) {
      out.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    }
  }
  return out;
})();

export default function TimeSelect({
  value,
  onChange,
  min,
}: {
  value: string;
  onChange: (v: string) => void;
  min?: string; // only show times strictly after this (e.g. end > start)
}) {
  const [open, setOpen] = useState(false);
  const ref = useClickOutside<HTMLDivElement>(open, () => setOpen(false));
  const filtered = min ? SLOTS.filter((t) => t > min) : SLOTS;
  const opts = value && !filtered.includes(value) ? [value, ...filtered] : filtered;
  const empty = !value;

  return (
    <div className="tpick" ref={ref}>
      <button type="button" className="fieldbox" style={{ width: "100%", cursor: "pointer" }} onClick={() => setOpen((o) => !o)}>
        <span className="fieldbox__ic">
          <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></svg>
        </span>
        <span style={{ flex: 1, textAlign: "left", fontSize: 15, fontWeight: 600, padding: "11px 0", color: empty ? "var(--muted)" : "var(--text)" }}>{empty ? "Select time" : value}</span>
        <span style={{ color: "var(--muted)", fontSize: 11 }}>{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="tpick__pop">
          {opts.map((t) => (
            <button
              key={t}
              type="button"
              className={"tpick__opt" + (t === value ? " sel" : "")}
              onClick={() => { onChange(t); setOpen(false); }}
            >
              {t}
              {t === value && <span className="tpick__tick">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
