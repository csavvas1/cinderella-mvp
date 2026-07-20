import { useStore } from "../../context/AppStore";
import PlatformIcon from "../../components/PlatformIcon";
import type { PropertyAddress } from "../../types";

// Full-screen "Linked Properties" view (opaque sub-view inside the account sheet).
// Shows ONLY properties connected to a booking channel, one card per property with
// the logos of the channels it's linked to. Manage (add/remove a channel), edit,
// share and remove are driven from here via handlers passed in from Account
// (which still owns the property state + modals). Adding a new property and the
// unlinked list both live on the Account tab, not here.

export default function Listings({
  onClose, onEdit, onRemove, onShare, onManage,
}: {
  onClose: () => void;
  onEdit: (a: PropertyAddress) => void;
  onRemove: (a: PropertyAddress) => void;
  onShare: (a: PropertyAddress) => void;
  onManage: (a: PropertyAddress) => void;
}) {
  const { addresses, connectedListings, mockRemoveChannel } = useStore();

  const channelsFor = (addrId: string) =>
    connectedListings.filter((l) => l.addressId === addrId && l.beds24PropertyId);

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
                    {a.nickname !== a.address && (
                      <div className="tiny muted" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.address}</div>
                    )}
                  </div>
                  {!a.isShared && (
                    <button className="iconbtn" title="Share" onClick={() => onShare(a)}>
                      <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="M8.6 10.5l6.8-4M8.6 13.5l6.8 4" /></svg>
                    </button>
                  )}
                  <button className="iconbtn" title="Edit" onClick={() => onEdit(a)}>
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M4 20h4L18.5 9.5a2 2 0 0 0-3-3L5 17v3Z" /><path d="M13.5 6.5l3 3" /></svg>
                  </button>
                  <button className="iconbtn" title="Remove" onClick={() => onRemove(a)}>
                    <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13M10 11v6M14 11v6" /></svg>
                  </button>
                </div>

                {/* connected channels → logos + Add-another */}
                <div className="propcard__connect" style={{ marginTop: 10 }}>
                  <div className="between" style={{ gap: 8 }}>
                    <div className="listcard__chans" style={{ margin: 0 }}>
                      {chans.map((l) => (
                        <span key={l.id} className="listchan">
                          <PlatformIcon platform={l.platform} size={22} />
                          <span className="listchan__x" onClick={() => mockRemoveChannel(l.id)} title="Remove">✕</span>
                        </span>
                      ))}
                    </div>
                    <button className="btn btn--ghost tiny" onClick={() => onManage(a)}>+ Add</button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
