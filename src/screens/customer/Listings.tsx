import { useState } from "react";
import { useStore } from "../../context/AppStore";
import PlatformIcon from "../../components/PlatformIcon";
import TimeSelect from "../../components/TimeSelect";
import DispatchCleanerPicker from "../../components/DispatchCleanerPicker";
import type { PropertyAddress } from "../../types";

// Full-screen "Linked Properties" view (opaque sub-view inside the account sheet).
// Shows ONLY properties connected to a booking channel: name + platform logos,
// plus a collapsible "Cleaning setup" section (auto-dispatch config, priority
// cleaners, default time/hours) and an upcoming-checkouts list with a per-stay
// late toggle + owner-pick fallback. Remove-property (bin) and share come from
// Account via handlers. Adding a property + the unlinked list live on the
// Account tab, not here.

// Shift a base "HH:MM" by lateHours, for the upcoming-list label.
function dispTimeLabel(base: string, lateHours = 3): string {
  const [h, m] = base.split(":").map(Number);
  const t = h * 60 + m + Math.round(lateHours * 60);
  return `${String(Math.min(23, Math.floor(t / 60))).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

export default function Listings({
  onClose, onRemove, onShare,
}: {
  onClose: () => void;
  onRemove: (a: PropertyAddress) => void;
  onShare: (a: PropertyAddress) => void;
}) {
  const { addresses, connectedListings, externalBookings, cleaners,
          setDispatchConfig, setBookingLate, assignDispatchCleaner } = useStore();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [picker, setPicker] = useState<{ addressId: string; mode: "priority" | "single"; bookingId?: string } | null>(null);

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
            return (
              <div key={a.id} className="propcard">
                <div className="propcard__top">
                  <span className="propcard__ic">
                    {a.propertyType === "house"
                      ? <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 11 12 4l8 7" /><path d="M6 10v9h12v-9" /><path d="M10 19v-5h4v5" /></svg>
                      : <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="3" width="12" height="18" rx="1.5" /><path d="M9.5 7h1M13.5 7h1M9.5 11h1M13.5 11h1M9.5 15h1M13.5 15h1" /></svg>}
                  </span>
                  <div className="grow" style={{ minWidth: 0 }}>
                    <b style={{ fontSize: 14 }}>{a.nickname}</b>
                    {/* platform logos only, no text, right under the name */}
                    <div className="linkedchan__logos">
                      {chans.map((l) => <PlatformIcon key={l.id} platform={l.platform} size={20} />)}
                    </div>
                  </div>
                  {!a.isShared && (
                    <button className="iconbtn" title="Share" onClick={() => onShare(a)}>
                      <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="M8.6 10.5l6.8-4M8.6 13.5l6.8 4" /></svg>
                    </button>
                  )}
                  <button className="iconbtn" title="Remove property" onClick={() => onRemove(a)}>
                    <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13M10 11v6M14 11v6" /></svg>
                  </button>
                </div>

                {/* ---- cleaning setup (auto-dispatch) ---- */}
                <div className="dispatch">
                  <button className="dispatch__head" onClick={() => setExpanded(expanded === a.id ? null : a.id)}>
                    <span className={"dispatch__dot" + (a.autoDispatch ? " on" : "")} />
                    <span className="dispatch__summary">
                      {a.autoDispatch
                        ? `Auto-cleaning · ${(a.dispatchCleanerIds?.length ?? 0)} cleaner${(a.dispatchCleanerIds?.length ?? 0) === 1 ? "" : "s"} · ${a.dispatchTime || "11:00"} · ${a.dispatchHours || 2}h`
                        : "Set up auto-cleaning"}
                    </span>
                    <span className="dispatch__chev">{expanded === a.id ? "▾" : "▸"}</span>
                  </button>

                  {expanded === a.id && (
                    <div className="dispatch__body">
                      <label className="dispatch__row">
                        <span>Auto-book cleaning on checkout</span>
                        <span className={"switch" + (a.autoDispatch ? " on" : "")}
                          onClick={() => setDispatchConfig(a.id, { autoDispatch: !a.autoDispatch })}>
                          <span className="switch__dot" />
                        </span>
                      </label>

                      <div className="label" style={{ marginTop: 8 }}>Priority cleaners</div>
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
                      <button className="btn sm secondary" style={{ marginTop: 6 }}
                        onClick={() => setPicker({ addressId: a.id, mode: "priority" })}>+ Add cleaner</button>

                      <div className="row" style={{ gap: 10, marginTop: 12 }}>
                        <div className="grow">
                          <div className="label">Default start</div>
                          <TimeSelect value={a.dispatchTime || "11:00"} onChange={(t) => setDispatchConfig(a.id, { dispatchTime: t })} />
                        </div>
                        <div className="grow">
                          <div className="label">Hours</div>
                          <input className="input" type="number" min={1} step={0.5} value={a.dispatchHours || 2}
                            onChange={(e) => setDispatchConfig(a.id, { dispatchHours: +e.target.value })} />
                        </div>
                      </div>

                      <p className="tiny muted" style={{ marginTop: 8 }}>
                        First available cleaner in your list is booked automatically when a guest checks out. If none are free, we'll ask you to pick.
                      </p>

                      {/* upcoming checkouts for this property */}
                      {(() => {
                        const todayISO = new Date().toISOString().slice(0, 10);
                        const listingIds = connectedListings.filter((l) => l.addressId === a.id).map((l) => l.id);
                        const ups = (externalBookings ?? [])
                          .filter((b) => (b.addressId === a.id || listingIds.includes(b.listingId)) && b.checkOut >= todayISO)
                          .sort((x, y) => x.checkOut.localeCompare(y.checkOut));
                        if (!ups.length) return null;
                        const baseTime = a.dispatchTime || "11:00";
                        return (
                          <>
                            <div className="label" style={{ marginTop: 12 }}>Upcoming checkouts</div>
                            {ups.map((b) => {
                              const needs = b.dispatchedJobId === "PENDING_OWNER";
                              const cleanTime = b.lateCheckout ? dispTimeLabel(baseTime, b.lateHours ?? 3) : baseTime;
                              return (
                                <div key={b.id} className="dispatch__up">
                                  <div className="grow" style={{ minWidth: 0 }}>
                                    <b style={{ fontSize: 13 }}>{b.guest || "Guest"}</b>
                                    <div className="tiny muted">out {b.checkOut} · cleaning {cleanTime}</div>
                                  </div>
                                  {needs ? (
                                    <button className="statuspill statuspill--warn" onClick={() => setPicker({ addressId: a.id, mode: "single", bookingId: b.id })}>Needs cleaner</button>
                                  ) : (
                                    <label className="dispatch__late">
                                      <span className={"switch sm" + (b.lateCheckout ? " on" : "")} onClick={() => setBookingLate(b.id, !b.lateCheckout)}><span className="switch__dot" /></span>
                                      <span className="tiny">Late</span>
                                    </label>
                                  )}
                                  {b.lateCheckout && !needs && (
                                    <input className="input dispatch__lh" type="number" min={1} step={1}
                                      value={b.lateHours ?? 3}
                                      onChange={(e) => setBookingLate(b.id, true, +e.target.value)} />
                                  )}
                                </div>
                              );
                            })}
                          </>
                        );
                      })()}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}

        {picker && (
          <DispatchCleanerPicker
            mode={picker.mode}
            selected={picker.mode === "priority" ? (addresses.find((a) => a.id === picker.addressId)?.dispatchCleanerIds ?? []) : []}
            onToggle={(id) => {
              const a = addresses.find((x) => x.id === picker.addressId); if (!a) return;
              const cur = a.dispatchCleanerIds ?? [];
              const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
              setDispatchConfig(a.id, { dispatchCleanerIds: next });
            }}
            onPick={(id) => { if (picker.bookingId) assignDispatchCleaner(picker.bookingId, id); setPicker(null); }}
            onClose={() => setPicker(null)}
          />
        )}
      </div>
    </div>
  );
}
