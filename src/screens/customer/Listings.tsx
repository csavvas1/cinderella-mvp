import { useMemo, useState } from "react";
import { useStore } from "../../context/AppStore";
import PlatformIcon from "../../components/PlatformIcon";
import type { ListingPlatform } from "../../types";

// Full-screen "My Listings" view (opaque sub-view inside the account sheet).
// Groups connected channels BY PROPERTY: each property shown once, with the logos
// of the sites it's connected to, plus add/remove per channel.

const BASE = 12.90, UNIT = 2.60, LINK = 0.55, DISC = 0.65, MARKUP = 2.6;

const ADDABLE: { id: ListingPlatform; name: string }[] = [
  { id: "airbnb", name: "Airbnb" },
  { id: "booking", name: "Booking.com" },
  { id: "vrbo", name: "Vrbo" },
  { id: "expedia", name: "Expedia" },
  { id: "google", name: "Google" },
];

export default function Listings({ onClose }: { onClose: () => void }) {
  const { addresses, connectedListings, mockAddChannel, mockRemoveChannel, mockUnlinkProperty } = useStore();
  const [addFor, setAddFor] = useState<string | null>(null); // addressId being added-to

  // group connected channels by property (addressId)
  const groups = useMemo(() => {
    const byAddr = new Map<string, typeof connectedListings>();
    connectedListings.filter((l) => l.beds24PropertyId).forEach((l) => {
      const k = l.addressId ?? "none";
      if (!byAddr.has(k)) byAddr.set(k, []);
      byAddr.get(k)!.push(l);
    });
    return [...byAddr.entries()].map(([addrId, listings]) => ({
      addrId,
      name: addresses.find((a) => a.id === addrId)?.nickname ?? listings[0]?.name ?? "Property",
      address: addresses.find((a) => a.id === addrId)?.address ?? "",
      listings,
    }));
  }, [connectedListings, addresses]);

  const totalConnections = groups.reduce((n, g) => n + g.listings.length, 0);
  const monthly = groups.length
    ? (BASE + UNIT * groups.length + LINK * totalConnections) * DISC * MARKUP
    : 0;

  return (
    <div className="modal__backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="between" style={{ marginBottom: 14 }}>
          <button className="iconbtn" onClick={onClose} aria-label="Back">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
          </button>
          <b style={{ fontSize: 17 }}>My Listings</b>
          <span style={{ width: 20 }} />
        </div>

        {groups.length === 0 ? (
          <div className="emptyjobs" style={{ padding: "40px 20px" }}>
            <b style={{ fontSize: 14 }}>No connected listings yet</b>
            <p className="tiny muted" style={{ marginTop: 6 }}>Connect a channel to go live and sync your reservations.</p>
          </div>
        ) : (
          <>
            {groups.map((g) => {
              const connected = new Set(g.listings.map((l) => l.platform));
              return (
                <div key={g.addrId} className="listcard">
                  <div className="listcard__head">
                    <div style={{ minWidth: 0 }}>
                      <b style={{ fontSize: 14 }}>{g.name}</b>
                      {g.address && g.address !== g.name && <div className="tiny muted" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{g.address}</div>}
                    </div>
                    <button className="btn btn--ghost tiny" onClick={() => mockUnlinkProperty(g.addrId)}>Disconnect</button>
                  </div>

                  {/* connected channels — logo + remove */}
                  <div className="listcard__chans">
                    {g.listings.map((l) => (
                      <span key={l.id} className="listchan">
                        <PlatformIcon platform={l.platform} size={20} />
                        <span className="listchan__x" onClick={() => mockRemoveChannel(l.id)} title="Remove">✕</span>
                      </span>
                    ))}
                    <button className="listchan__add" onClick={() => setAddFor(addFor === g.addrId ? null : g.addrId)}>
                      + Add
                    </button>
                  </div>

                  {/* add-channel picker */}
                  {addFor === g.addrId && (
                    <div className="listcard__pick">
                      {ADDABLE.filter((p) => !connected.has(p.id)).map((p) => (
                        <button key={p.id} className="listpick" onClick={() => { mockAddChannel(g.addrId, p.id); setAddFor(null); }}>
                          <PlatformIcon platform={p.id} size={18} /> {p.name}
                        </button>
                      ))}
                      {ADDABLE.filter((p) => !connected.has(p.id)).length === 0 && (
                        <span className="tiny muted">All channels connected.</span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            <div className="chan-cost" style={{ marginTop: 16 }}>
              <div>
                <div className="tiny muted">Monthly total</div>
                <div className="chan-cost__val">€{monthly.toFixed(2)}<span className="tiny muted">/mo</span></div>
              </div>
              <div className="tiny muted" style={{ textAlign: "right" }}>
                {groups.length} propert{groups.length === 1 ? "y" : "ies"} · {totalConnections} channel{totalConnections === 1 ? "" : "s"}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
