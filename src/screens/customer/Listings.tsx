import { useState } from "react";
import { useStore } from "../../context/AppStore";
import PlatformIcon from "../../components/PlatformIcon";
import TimeSelect from "../../components/TimeSelect";
import DispatchCleanerPicker from "../../components/DispatchCleanerPicker";
import type { PropertyAddress } from "../../types";

// Full-screen "Linked Properties" view (opaque sub-view inside the account sheet).
// Shows ONLY properties connected to a booking channel. Each property is a
// tappable card (cover photo + name + platform logos) that expands to its
// GENERAL auto-cleaning settings: master toggle, priority cleaners, default
// start time + duration. Per-stay controls (late checkout, owner-pick fallback)
// live on the Calendar reservation detail, not here. Remove/share come from
// Account via handlers.

// stable accent per property for the monogram fallback tile
const TILE_COLORS = ["#ff5a5f", "#003b95", "#0ea5e9", "#f59e0b", "#8b5cf6", "#10b981"];
function tileColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return TILE_COLORS[h % TILE_COLORS.length];
}

export default function Listings({
  onClose, onRemove, onShare,
}: {
  onClose: () => void;
  onRemove: (a: PropertyAddress) => void;
  onShare: (a: PropertyAddress) => void;
}) {
  const { addresses, connectedListings, cleaners, setDispatchConfig } = useStore();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [picker, setPicker] = useState<{ addressId: string } | null>(null);

  const channelsFor = (addrId: string) =>
    connectedListings.filter((l) => l.addressId === addrId && l.beds24PropertyId);

  const cleanerName = (id: string) => cleaners.find((c) => c.id === id)?.name ?? "Cleaner";

  // only properties with at least one connected channel
  const linked = addresses.filter((a) => channelsFor(a.id).length > 0);

  return (
    <div className="modal__backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="between" style={{ marginBottom: 14 }}>
          <button className="iconbtn" onClick={onClose} aria-label="Back">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
          </button>
          <b style={{ fontSize: 17 }}>Linked properties</b>
          <span style={{ width: 34 }} />
        </div>

        {linked.length === 0 ? (
          <div className="emptyjobs" style={{ padding: "44px 20px" }}>
            <b style={{ fontSize: 14 }}>No linked properties</b>
            <p className="tiny muted" style={{ marginTop: 6 }}>Connect a property to a booking site from your properties list to see it here.</p>
          </div>
        ) : (
          linked.map((a) => {
            const chans = channelsFor(a.id);
            const isOpen = expanded === a.id;
            const nCleaners = a.dispatchCleanerIds?.length ?? 0;
            return (
              <div key={a.id} className={"lprop" + (isOpen ? " lprop--open" : "")}>
                {/* whole header is the expand toggle */}
                <button className="lprop__head" onClick={() => setExpanded(isOpen ? null : a.id)}>
                  <span className="lprop__cover" style={a.photoUrl ? undefined : { background: `linear-gradient(135deg, ${tileColor(a.id)}, ${tileColor(a.id)}cc)` }}>
                    {a.photoUrl ? (
                      <img src={a.photoUrl} alt={a.nickname} loading="lazy" />
                    ) : (
                      <span className="lprop__mono">
                        {a.propertyType === "house"
                          ? <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M4 11 12 4l8 7" /><path d="M6 10v9h12v-9" /><path d="M10 19v-5h4v5" /></svg>
                          : <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="3" width="12" height="18" rx="1.5" /><path d="M9.5 7h1M13.5 7h1M9.5 11h1M13.5 11h1M9.5 15h1M13.5 15h1" /></svg>}
                      </span>
                    )}
                  </span>
                  <span className="lprop__meta">
                    <b className="lprop__name">{a.nickname}</b>
                    <span className="lprop__logos">
                      {chans.map((l) => <PlatformIcon key={l.id} platform={l.platform} size={18} />)}
                    </span>
                    <span className={"lprop__status" + (a.autoDispatch ? " on" : "")}>
                      <span className="lprop__dot" />
                      {a.autoDispatch
                        ? `Auto-cleaning · ${nCleaners} cleaner${nCleaners === 1 ? "" : "s"}`
                        : "Auto-cleaning off"}
                    </span>
                  </span>
                  <span className="lprop__chev">{isOpen ? "▾" : "▸"}</span>
                </button>

                {/* header-level actions (don't toggle the card) */}
                <div className="lprop__actions">
                  {!a.isShared && (
                    <button className="iconbtn" title="Share" onClick={(e) => { e.stopPropagation(); onShare(a); }}>
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="M8.6 10.5l6.8-4M8.6 13.5l6.8 4" /></svg>
                    </button>
                  )}
                  <button className="iconbtn" title="Remove property" onClick={(e) => { e.stopPropagation(); onRemove(a); }}>
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13M10 11v6M14 11v6" /></svg>
                  </button>
                </div>

                {isOpen && (
                  <div className="lprop__body">
                    <label className="dispatch__row">
                      <span>Auto-book cleaning on checkout</span>
                      <span className={"switch" + (a.autoDispatch ? " on" : "")}
                        onClick={() => setDispatchConfig(a.id, { autoDispatch: !a.autoDispatch })}>
                        <span className="switch__dot" />
                      </span>
                    </label>

                    <div className="label" style={{ marginTop: 10 }}>Priority cleaners</div>
                    <p className="tiny muted" style={{ marginTop: 0, marginBottom: 6 }}>
                      When a guest checks out, we book the first one who's free — top of the list first.
                    </p>
                    {(a.dispatchCleanerIds ?? []).map((id, idx) => (
                      <div key={id} className="dispatch__cl">
                        <span className="dispatch__rank">{idx + 1}</span>
                        <span className="grow">{cleanerName(id)}</span>
                        <button className="iconbtn" disabled={idx === 0} title="Up"
                          onClick={() => { const ids = [...(a.dispatchCleanerIds ?? [])]; [ids[idx - 1], ids[idx]] = [ids[idx], ids[idx - 1]]; setDispatchConfig(a.id, { dispatchCleanerIds: ids }); }}>↑</button>
                        <button className="iconbtn" disabled={idx === (a.dispatchCleanerIds!.length - 1)} title="Down"
                          onClick={() => { const ids = [...(a.dispatchCleanerIds ?? [])]; [ids[idx + 1], ids[idx]] = [ids[idx], ids[idx + 1]]; setDispatchConfig(a.id, { dispatchCleanerIds: ids }); }}>↓</button>
                        <button className="iconbtn" title="Remove"
                          onClick={() => setDispatchConfig(a.id, { dispatchCleanerIds: (a.dispatchCleanerIds ?? []).filter((x) => x !== id) })}>✕</button>
                      </div>
                    ))}
                    {nCleaners === 0 && (
                      <p className="tiny muted" style={{ margin: "2px 0 6px" }}>No cleaners added yet.</p>
                    )}
                    <button className="btn sm secondary" style={{ marginTop: 6 }}
                      onClick={() => setPicker({ addressId: a.id })}>+ Add cleaner</button>

                    <div className="row" style={{ gap: 10, marginTop: 14 }}>
                      <div className="grow">
                        <div className="label">Cleaning start time</div>
                        <TimeSelect value={a.dispatchTime || "11:00"} onChange={(t) => setDispatchConfig(a.id, { dispatchTime: t })} />
                      </div>
                      <div className="grow">
                        <div className="label">Cleaning length</div>
                        <div className="stepper">
                          <button className="stepper__btn" title="Less"
                            onClick={() => setDispatchConfig(a.id, { dispatchHours: Math.max(1, +(( a.dispatchHours || 2) - 0.5).toFixed(1)) })}>−</button>
                          <span className="stepper__val">{a.dispatchHours || 2}h</span>
                          <button className="stepper__btn" title="More"
                            onClick={() => setDispatchConfig(a.id, { dispatchHours: Math.min(10, +(( a.dispatchHours || 2) + 0.5).toFixed(1)) })}>+</button>
                        </div>
                      </div>
                    </div>
                    <p className="tiny muted" style={{ marginTop: 8 }}>
                      We book the cleaner to arrive at this time on the guest's checkout day. Running late on a specific stay? Set that from the Reservations calendar.
                    </p>
                  </div>
                )}
              </div>
            );
          })
        )}

        {picker && (
          <DispatchCleanerPicker
            mode="priority"
            selected={addresses.find((a) => a.id === picker.addressId)?.dispatchCleanerIds ?? []}
            onToggle={(id) => {
              const a = addresses.find((x) => x.id === picker.addressId); if (!a) return;
              const cur = a.dispatchCleanerIds ?? [];
              const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
              setDispatchConfig(a.id, { dispatchCleanerIds: next });
            }}
            onPick={() => setPicker(null)}
            onClose={() => setPicker(null)}
          />
        )}
      </div>
    </div>
  );
}
