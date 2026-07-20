import { useMemo, useState } from "react";
import type { PropertyAddress } from "../types";
import { useStore } from "../context/AppStore";
import PlatformIcon from "./PlatformIcon";

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

// MOCK: the properties an account "pulls" once a platform is signed in, so the
// client sees their listings linked. Replaced by real API data under Partner.
const MOCK_PROPERTIES: string[][] = [
  ["Seaside Apartment", "City Centre Studio", "Marina Loft"],
  ["Seaside Apartment", "Old Town Maisonette"],
  ["Marina Loft"],
];

export default function ConnectChannelSheet({
  property, onClose, onConnected,
}: {
  property: PropertyAddress;
  onClose: () => void;
  onConnected: () => void;
}) {
  const { mockLinkProperties } = useStore();
  const [status, setStatus] = useState<Record<string, Status>>({});
  const apartments = 1; // this sheet connects one property; count feeds the calc

  // all unique properties pulled from the connected platforms (mock)
  function confirmAndLink() {
    const names = new Set<string>();
    PLATFORMS.forEach((p, i) => {
      if (status[p.id] === "confirmed") {
        MOCK_PROPERTIES[i % MOCK_PROPERTIES.length].forEach((n) => names.add(n));
      }
    });
    mockLinkProperties([...names]);
    onConnected();
  }

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
        <div className="between" style={{ marginBottom: 10 }}>
          <b style={{ fontSize: 17 }}>Connect your listings</b>
          <button className="iconbtn" onClick={onClose}>✕</button>
        </div>

        <div className="chan-grid">
          {PLATFORMS.map((p, i) => {
            const st = status[p.id] ?? "idle";
            return (
              <div key={p.id}>
                <div className={"chan-row" + (st === "confirmed" ? " chan-row--on" : "")}>
                  <PlatformIcon platform={p.id} size={26} />
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
                {/* pulled properties — so the client sees each listing linked */}
                {st === "confirmed" && (
                  <div className="chan-props">
                    {MOCK_PROPERTIES[i % MOCK_PROPERTIES.length].map((name) => (
                      <div key={name} className="chan-prop">
                        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                        <span>{name}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <button className="btn" style={{ marginTop: 16, opacity: confirmedCount ? 1 : 0.5 }}
          disabled={!confirmedCount} onClick={confirmAndLink}>
          {confirmedCount ? `Confirm · €${monthly.toFixed(2)}/mo` : "Connect a channel to continue"}
        </button>
        <p className="tiny muted" style={{ textAlign: "center", marginTop: 8 }}>
          Cancel anytime. Billing stops when you disconnect.
        </p>
      </div>
    </div>
  );
}
