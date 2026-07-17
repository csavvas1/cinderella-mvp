import { useState } from "react";
import type { ListingPlatform, PropertyAddress } from "../types";
import { useStore } from "../context/AppStore";
import { syncListing } from "../data/ical";
import StripePaymentSheet from "./StripePaymentSheet";

// Connect a property to a booking channel (Airbnb / Booking.com).
// The client sees a clean flow; behind the scenes we sync the property's
// calendar (so reservations flow in) AND register it with the channel manager
// (Beds24) which starts the €14.99/mo billing. The word "iCal" is never shown —
// it's presented as "your calendar link". When OAuth (Partner) lands later, the
// paste step is swapped for a one-click authorize behind this same sheet.

const PLATFORMS: { id: ListingPlatform; name: string; help: string[] }[] = [
  {
    id: "airbnb", name: "Airbnb",
    help: [
      "Open airbnb.com and sign in.",
      "Menu → Listings → pick this property.",
      "Availability → Connect calendars → Export calendar.",
      "Copy the link and paste it below.",
    ],
  },
  {
    id: "booking", name: "Booking.com",
    help: [
      "Sign in at admin.booking.com.",
      "Open the property → Calendar → Sync calendars.",
      "Under Export, copy the link.",
      "Paste it below.",
    ],
  },
];

export default function ConnectChannelSheet({
  property, onClose, onConnected,
}: {
  property: PropertyAddress;
  onClose: () => void;
  onConnected: () => void;
}) {
  const { addListing, connectPropertyToBeds24, connectedListings } = useStore();
  const [platform, setPlatform] = useState<ListingPlatform | null>(null);
  const [url, setUrl] = useState("");
  const [showHow, setShowHow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [payOpen, setPayOpen] = useState(false);

  const chosen = PLATFORMS.find((p) => p.id === platform);
  // first-ever connection = no other property is billing yet -> need a card
  const isFirstConnection = !connectedListings.some((l) => l.billingActive);

  async function connect() {
    if (!platform || !url.trim()) return;
    setErr(null); setBusy(true);
    try {
      // 1. sync the calendar (pull existing reservations, behind the scenes)
      const { listing, bookings } = await syncListing(platform, url.trim(), property.id);
      addListing(listing, bookings);
      // 2. register with the channel manager + start billing (quantity bump)
      await connectPropertyToBeds24(property.id);
      // 3. first connection needs a card to activate the subscription
      if (isFirstConnection) { setPayOpen(true); setBusy(false); return; }
      onConnected();
    } catch (e) {
      setErr((e as Error).message || "Couldn't connect. Check the link and try again.");
    } finally {
      setBusy(false);
    }
  }

  if (payOpen) {
    return <StripePaymentSheet onDone={onConnected} onClose={onConnected} />;
  }

  return (
    <div className="modal__backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="between" style={{ marginBottom: 6 }}>
          <b style={{ fontSize: 17 }}>Connect a channel</b>
          <button className="iconbtn" onClick={onClose}>✕</button>
        </div>
        <p className="sub" style={{ marginTop: 0, fontSize: 12.5 }}>
          Link <b>{property.nickname}</b> to a booking site. We'll auto-schedule a cleaning
          after every guest checkout. <b>€14.99/mo</b> per connected property.
        </p>

        {/* platform picker */}
        <div className="row" style={{ gap: 8, marginTop: 4 }}>
          {PLATFORMS.map((p) => (
            <button key={p.id} type="button"
              className={"btn grow" + (platform === p.id ? "" : " secondary")}
              onClick={() => { setPlatform(p.id); setErr(null); }}>
              {p.name}
            </button>
          ))}
        </div>

        {chosen && (
          <>
            <div className="label" style={{ marginTop: 14 }}>{chosen.name} calendar link</div>
            <input className="input" value={url} autoFocus
              placeholder={`Paste your ${chosen.name} calendar link`}
              onChange={(e) => setUrl(e.target.value)} />

            <button type="button" className="linklike tiny"
              style={{ marginTop: 8, background: "none", border: "none", color: "var(--brand, #2563eb)", cursor: "pointer", padding: 0 }}
              onClick={() => setShowHow((s) => !s)}>
              {showHow ? "Hide" : "Where do I find this?"}
            </button>
            {showHow && (
              <div className="note" style={{ marginTop: 8 }}>
                <ol style={{ margin: 0, paddingLeft: 18, lineHeight: 1.5 }}>
                  {chosen.help.map((s, i) => <li key={i} style={{ fontSize: 12 }}>{s}</li>)}
                </ol>
              </div>
            )}

            {err && <div className="note amber" style={{ marginTop: 10 }}>{err}</div>}

            <button className="btn" style={{ marginTop: 14, opacity: (!url.trim() || busy) ? 0.5 : 1 }}
              disabled={!url.trim() || busy} onClick={connect}>
              {busy ? "Connecting…" : "Connect · €14.99/mo"}
            </button>
            <p className="tiny muted" style={{ textAlign: "center", marginTop: 8 }}>
              You can disconnect anytime. Billing stops when you do.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
