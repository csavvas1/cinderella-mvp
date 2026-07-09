import { useState } from "react";
import type { Card } from "../types";
import { BrandIcon } from "./PaymentPicker";
import { useClickOutside } from "../hooks/useClickOutside";

export default function LinkedCardPicker({
  cards,
  value,
  onChange,
}: {
  cards: Card[];
  value: string | undefined;
  onChange: (id: string | undefined) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useClickOutside<HTMLDivElement>(open, () => setOpen(false));
  const sel = cards.find((c) => c.id === value);
  const isApple = value === "applepay";

  return (
    <div className="paypick" ref={ref}>
      <button type="button" className="paypick__btn" onClick={() => setOpen((o) => !o)}>
        {isApple ? <BrandIcon brand="applepay" /> : sel ? <BrandIcon brand={sel.brand} /> : (
          <span className="paybrand" style={{ background: "var(--surface)", display: "grid", placeItems: "center", color: "var(--muted)" }}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2.5" /><path d="M2 10h20" /></svg>
          </span>
        )}
        <span className="paypick__txt">
          {isApple ? "Apple Pay" : sel ? <>{sel.nickname} <span className="muted tiny">···· {sel.last4}</span></> : "No default card"}
        </span>
        <span className="paypick__chev">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="paypick__menu">
          <button type="button" className={"paypick__opt" + (!value ? " sel" : "")} onClick={() => { onChange(undefined); setOpen(false); }}>
            <span className="paybrand" style={{ background: "var(--surface)" }}>—</span>
            <span className="paypick__txt">No default card</span>
            {!value && <span className="paypick__tick">✓</span>}
          </button>
          <button type="button" className={"paypick__opt" + (isApple ? " sel" : "")} onClick={() => { onChange("applepay"); setOpen(false); }}>
            <BrandIcon brand="applepay" />
            <span className="paypick__txt">Apple Pay</span>
            {isApple && <span className="paypick__tick">✓</span>}
          </button>
          {cards.map((c) => (
            <button key={c.id} type="button" className={"paypick__opt" + (c.id === value ? " sel" : "")} onClick={() => { onChange(c.id); setOpen(false); }}>
              <BrandIcon brand={c.brand} />
              <span className="paypick__txt">{c.nickname} <span className="muted tiny">···· {c.last4}</span></span>
              {c.id === value && <span className="paypick__tick">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
