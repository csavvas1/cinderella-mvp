import { useState } from "react";
import type { Card } from "../types";
import { useClickOutside } from "../hooks/useClickOutside";

export function BrandIcon({ brand }: { brand: string }) {
  if (brand === "applepay") {
    return (
      <span className="paybrand paybrand--apple">
         Pay
      </span>
    );
  }
  if (brand === "Mastercard") {
    return (
      <svg className="paybrand" viewBox="0 0 36 24" width="32" height="22" aria-label="Mastercard">
        <rect width="36" height="24" rx="4" fill="#fff" stroke="#e7e8ee" />
        <circle cx="15" cy="12" r="6.5" fill="#EB001B" />
        <circle cx="21" cy="12" r="6.5" fill="#F79E1B" fillOpacity="0.9" />
      </svg>
    );
  }
  // Visa default
  return (
    <svg className="paybrand" viewBox="0 0 36 24" width="32" height="22" aria-label="Visa">
      <rect width="36" height="24" rx="4" fill="#fff" stroke="#e7e8ee" />
      <text x="18" y="16" textAnchor="middle" fontFamily="Arial, sans-serif" fontWeight="700" fontStyle="italic" fontSize="9" fill="#1A1F71">VISA</text>
    </svg>
  );
}

interface Option {
  id: string;
  brand: string;
  label: string;
  sub?: string;
}

export default function PaymentPicker({
  cards,
  value,
  onChange,
}: {
  cards: Card[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useClickOutside<HTMLDivElement>(open, () => setOpen(false));

  const options: Option[] = [
    { id: "applepay", brand: "applepay", label: "Apple Pay" },
    ...cards.map((c) => ({ id: c.id, brand: c.brand, label: c.nickname, sub: "•••• " + c.last4 })),
  ];
  const sel = options.find((o) => o.id === value) ?? options[0];

  return (
    <div className="paypick" ref={ref}>
      <button type="button" className="paypick__btn" onClick={() => setOpen((o) => !o)}>
        <BrandIcon brand={sel.brand} />
        <span className="paypick__txt">
          {sel.label}
          {sel.sub && <span className="muted tiny" style={{ marginLeft: 6 }}>{sel.sub}</span>}
        </span>
        <span className="paypick__chev">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="paypick__menu">
          {options.map((o) => (
            <button
              key={o.id}
              type="button"
              className={"paypick__opt" + (o.id === value ? " sel" : "")}
              onClick={() => { onChange(o.id); setOpen(false); }}
            >
              <BrandIcon brand={o.brand} />
              <span className="paypick__txt">
                {o.label}
                {o.sub && <span className="muted tiny" style={{ marginLeft: 6 }}>{o.sub}</span>}
              </span>
              {o.id === value && <span className="paypick__tick">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
