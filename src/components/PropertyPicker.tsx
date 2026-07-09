import { useState } from "react";
import type { PropertyAddress } from "../types";
import { useClickOutside } from "../hooks/useClickOutside";

function PropIcon({ type }: { type?: "apartment" | "house" }) {
  if (type === "house") {
    return <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 11 12 4l8 7" /><path d="M6 10v9h12v-9" /><path d="M10 19v-5h4v5" /></svg>;
  }
  return <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="3" width="12" height="18" rx="1.5" /><path d="M9.5 7h1M13.5 7h1M9.5 11h1M13.5 11h1M9.5 15h1M13.5 15h1" /></svg>;
}

export default function PropertyPicker({
  addresses,
  value,
  onChange,
}: {
  addresses: PropertyAddress[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useClickOutside<HTMLDivElement>(open, () => setOpen(false));
  const sel = addresses.find((a) => a.id === value);
  if (addresses.length === 0) return null;

  return (
    <div className="proppick" ref={ref}>
      <button type="button" className="proppick__btn" onClick={() => setOpen((o) => !o)}>
        <span className="proppick__ic"><PropIcon type={sel?.propertyType} /></span>
        <span className="proppick__txt">
          {sel ? (
            <>
              <b>{sel.nickname}</b>
              {sel.nickname !== sel.address && <span className="muted tiny">{sel.address}</span>}
            </>
          ) : (
            <b className="muted">Select a property</b>
          )}
        </span>
        <span className="proppick__chev">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="proppick__menu">
          {addresses.map((a) => (
            <button
              key={a.id}
              type="button"
              className={"proppick__opt" + (a.id === value ? " sel" : "")}
              onClick={() => { onChange(a.id); setOpen(false); }}
            >
              <span className="proppick__ic"><PropIcon type={a.propertyType} /></span>
              <span className="proppick__txt">
                <b>{a.nickname}</b>
                {a.nickname !== a.address && <span className="muted tiny">{a.address}</span>}
              </span>
              {a.id === value && <span className="proppick__tick">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
