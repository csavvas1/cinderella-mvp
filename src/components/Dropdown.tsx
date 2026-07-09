import { useState } from "react";
import { useClickOutside } from "../hooks/useClickOutside";

export default function Dropdown({
  value,
  options,
  onChange,
  icon,
}: {
  value: string;
  options: string[];
  onChange: (v: string) => void;
  icon?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useClickOutside<HTMLDivElement>(open, () => setOpen(false));

  return (
    <div className="tpick" ref={ref} style={{ flex: 1 }}>
      <button type="button" className="fieldbox" style={{ width: "100%", cursor: "pointer" }} onClick={() => setOpen((o) => !o)}>
        {icon && <span className="fieldbox__ic">{icon}</span>}
        <span style={{ flex: 1, textAlign: "left", fontSize: 15, fontWeight: 600, padding: "11px 0" }}>{value}</span>
        <span style={{ color: "var(--muted)", fontSize: 11 }}>{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="tpick__pop">
          {options.map((o) => (
            <button
              key={o}
              type="button"
              className={"tpick__opt" + (o === value ? " sel" : "")}
              onClick={() => { onChange(o); setOpen(false); }}
            >
              {o}
              {o === value && <span className="tpick__tick">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
