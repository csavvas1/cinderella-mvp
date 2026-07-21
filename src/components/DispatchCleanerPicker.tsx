import { useMemo } from "react";
import { useStore } from "../context/AppStore";
import { CLEANERS } from "../data/cleaners";
import type { Cleaner } from "../types";

// Picker over the full cleaner pool (real agents + mock directory), filtered to
// the property's city. mode="priority": multi-select toggling ids in `selected`.
// mode="single": tap a cleaner to pick exactly one (onPick).
export default function DispatchCleanerPicker({
  city, mode, selected = [], onToggle, onPick, onClose,
}: {
  city?: string;
  mode: "priority" | "single";
  selected?: string[];
  onToggle?: (id: string) => void;
  onPick?: (id: string) => void;
  onClose: () => void;
}) {
  const { cleaners } = useStore();
  const pool = useMemo(() => {
    const byId = new Map<string, Cleaner>();
    [...cleaners, ...CLEANERS].forEach((c) => { if (!byId.has(c.id)) byId.set(c.id, c); });
    let list = [...byId.values()];
    if (city) list = list.filter((c) => c.serviceCities?.includes(city) || c.city === city);
    return list.sort((a, b) => b.rating - a.rating);
  }, [cleaners, city]);

  return (
    <div className="modal__backdrop" onClick={onClose}>
      <div className="modal tall" onClick={(e) => e.stopPropagation()}>
        <div className="between" style={{ marginBottom: 12 }}>
          <b style={{ fontSize: 16 }}>{mode === "single" ? "Pick a cleaner" : "Add priority cleaners"}</b>
          <button className="iconbtn" onClick={onClose}>✕</button>
        </div>
        {pool.length === 0 && <p className="tiny muted">No cleaners in this city yet.</p>}
        {pool.map((c) => {
          const on = selected.includes(c.id);
          return (
            <button key={c.id} className="dpick" onClick={() => mode === "single" ? onPick?.(c.id) : onToggle?.(c.id)}>
              <span className="dpick__av">
                {c.photoUrl ? <img src={c.photoUrl} alt="" className="dpick__avimg" /> : c.name.charAt(0)}
              </span>
              <span className="dpick__main">
                <b style={{ fontSize: 13.5 }}>{c.name}</b>
                <span className="tiny muted">★ {c.rating.toFixed(1)} · €{c.rateWeekday}/h · {c.city}</span>
              </span>
              {mode === "priority" && <span className={"dpick__check" + (on ? " on" : "")}>{on ? "✓" : "+"}</span>}
            </button>
          );
        })}
        {mode === "priority" && <button className="btn" style={{ marginTop: 12 }} onClick={onClose}>Done</button>}
      </div>
    </div>
  );
}
