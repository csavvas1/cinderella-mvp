import { useMemo, useState } from "react";
import type { PropertyAddress } from "../types";

// ── MOCK multi-platform connect view ────────────────────────────────────────
// Front-end only: shows how connecting listings will look + feel. No backend
// calls yet (OAuth sign-in is Beds24 Partner-gated; wired later). Each platform
// mock-connects (Sign in → Connecting… → ✓ Confirmed). A live cost calculator
// sums the fee as connections are confirmed.
//
// Pricing (cost-plus, hidden breakdown — client sees one rate):
//   monthly = (BASE + UNIT×apartments + LINK×connections) × MARKUP
// tuned so a typical 1-apt / 1-2 connection client lands near €9.99 — cheaper
// than competitors (Turno/Doinn €15-30) while ~4-5× our Beds24 cost.

const BASE = 12.90;   // Beds24 base (our cost, per client share)
const UNIT = 2.60;    // per apartment
const LINK = 0.55;    // per OTA connection
const DISC = 0.65;    // Beds24 channel-only −35%
const MARKUP = 2.6;   // our margin multiplier (keeps us cheapest + profitable)

type Status = "idle" | "connecting" | "confirmed";

const PLATFORMS: { id: string; name: string; color: string }[] = [
  { id: "airbnb",       name: "Airbnb",           color: "#ff5a5f" },
  { id: "booking",      name: "Booking.com",      color: "#003b95" },
  { id: "vrbo",         name: "Vrbo",             color: "#0a3d62" },
  { id: "expedia",      name: "Expedia",          color: "#fbc02d" },
  { id: "tripadvisor",  name: "TripAdvisor",      color: "#00aa6c" },
  { id: "google",       name: "Google",           color: "#4285f4" },
  { id: "agoda",        name: "Agoda",            color: "#ff6f00" },
  { id: "hostelworld",  name: "Hostelworld",      color: "#f36f21" },
];

export default function ConnectChannelSheet({
  property, onClose, onConnected,
}: {
  property: PropertyAddress;
  onClose: () => void;
  onConnected: () => void;
}) {
  const [status, setStatus] = useState<Record<string, Status>>({});
  const apartments = 1; // this sheet connects one property; count feeds the calc

  const confirmedCount = useMemo(
    () => Object.values(status).filter((s) => s === "confirmed").length,
    [status],
  );

  const monthly = useMemo(() => {
    const raw = (BASE + UNIT * apartments + LINK * Math.max(confirmedCount, 1)) * DISC * MARKUP;
    return raw;
  }, [confirmedCount]);

  function connect(id: string) {
    if (status[id] === "confirmed" || status[id] === "connecting") return;
    setStatus((s) => ({ ...s, [id]: "connecting" }));
    // MOCK: simulate the OAuth round-trip
    setTimeout(() => setStatus((s) => ({ ...s, [id]: "confirmed" })), 1100);
  }
  function disconnect(id: string) {
    setStatus((s) => { const n = { ...s }; delete n[id]; return n; });
  }

  return (
    <div className="modal__backdrop" onClick={onClose}>
      <div className="modal tall" onClick={(e) => e.stopPropagation()}>
        <div className="between" style={{ marginBottom: 4 }}>
          <b style={{ fontSize: 17 }}>Connect your listings</b>
          <button className="iconbtn" onClick={onClose}>✕</button>
        </div>
        <p className="sub" style={{ marginTop: 0, fontSize: 12.5 }}>
          Link <b>{property.nickname}</b> to the sites you list on. Sign in to each — your
          reservations sync automatically, no copy-pasting.
        </p>

        <div className="chan-grid">
          {PLATFORMS.map((p) => {
            const st = status[p.id] ?? "idle";
            return (
              <div key={p.id} className={"chan-row" + (st === "confirmed" ? " chan-row--on" : "")}>
                <span className="chan-dot" style={{ background: p.color }} />
                <span className="chan-name">{p.name}</span>
                {st === "confirmed" ? (
                  <button className="chan-btn chan-btn--on" onClick={() => disconnect(p.id)}>
                    ✓ Connected
                  </button>
                ) : st === "connecting" ? (
                  <button className="chan-btn" disabled>Connecting…</button>
                ) : (
                  <button className="chan-btn chan-btn--cta" onClick={() => connect(p.id)}>
                    Sign in
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* live cost */}
        <div className="chan-cost">
          <div>
            <div className="tiny muted">Your monthly rate</div>
            <div className="chan-cost__val">€{monthly.toFixed(2)}<span className="tiny muted">/mo</span></div>
          </div>
          <div className="tiny muted" style={{ textAlign: "right", maxWidth: 150 }}>
            {confirmedCount > 0
              ? `${confirmedCount} channel${confirmedCount === 1 ? "" : "s"} connected`
              : "Adjusts as you connect channels"}
          </div>
        </div>

        <button className="btn" style={{ marginTop: 12, opacity: confirmedCount ? 1 : 0.5 }}
          disabled={!confirmedCount} onClick={onConnected}>
          {confirmedCount ? `Confirm · €${monthly.toFixed(2)}/mo` : "Connect a channel to continue"}
        </button>
        <p className="tiny muted" style={{ textAlign: "center", marginTop: 8 }}>
          Cancel anytime. Billing stops when you disconnect.
        </p>
      </div>
    </div>
  );
}
