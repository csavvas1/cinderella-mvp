import { useStore } from "../../context/AppStore";
import PlatformIcon from "../../components/PlatformIcon";
import type { PropertyAddress } from "../../types";

// Full-screen "Linked Properties" view (opaque sub-view inside the account sheet).
// Shows ONLY properties connected to a booking channel, one card per property with
// the name + a labelled row per platform it's live on, each with its own Remove
// (disconnect that channel). No edit — all detail is pulled from the channel API.
// Remove-property (bin) and share are driven via handlers from Account. Adding a
// property and the unlinked list live on the Account tab, not here.

export default function Listings({
  onClose, onRemove, onShare,
}: {
  onClose: () => void;
  onRemove: (a: PropertyAddress) => void;
  onShare: (a: PropertyAddress) => void;
}) {
  const { addresses, connectedListings } = useStore();

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
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
