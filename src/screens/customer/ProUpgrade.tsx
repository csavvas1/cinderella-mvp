import { useState, type ReactNode } from "react";
import { useStore } from "../../context/AppStore";
import BackButton from "../../components/BackButton";

const PRO_PRICE = "€12.99/mo";

// Gate wrapper: renders `children` when the account is Pro, otherwise the upgrade
// screen. Used by /reservations and /inbox.
export default function ProGate({ title, children }: { title: string; children: ReactNode }) {
  const { pro } = useStore();
  if (pro) return <>{children}</>;
  return <ProUpgrade title={title} />;
}

function ProUpgrade({ title }: { title: string }) {
  const { upgradeToPro } = useStore();
  const [busy, setBusy] = useState(false);

  function buy() {
    // Mock JCC purchase (same pattern as addCardViaJCC). No real charge.
    setBusy(true);
    const _token = "jcc_tok_" + Math.random().toString(36).slice(2, 14);
    void _token;
    setTimeout(() => { upgradeToPro(); setBusy(false); }, 600);
  }

  const feats = [
    ["All your calendars in one place", "Airbnb, Booking.com, Vrbo, Google & Expedia — synced side by side."],
    ["Unified guest inbox", "Read and reply to every guest from one screen — never open the OTA apps."],
    ["Automated messaging", "Welcome, check-in and check-out messages sent for you, in any language."],
    ["No double bookings", "A booking on one channel blocks the dates on all the others."],
  ];

  return (
    <div className="pad">
      <BackButton />
      <div className="upgrade__hero">
        <span className="pro-pill pro-pill--lg">PRO</span>
        <h1 className="h1" style={{ marginTop: 10 }}>{title} is a Pro feature</h1>
        <p className="sub" style={{ marginTop: 4 }}>
          Link your properties to every booking platform and manage them all from Cinderella.
        </p>
      </div>

      {feats.map(([t, d]) => (
        <div className="actfeat" key={t}>
          <div>
            <b>{t}</b>
            <div className="tiny muted">{d}</div>
          </div>
        </div>
      ))}

      <div className="card" style={{ marginTop: 16, textAlign: "center" }}>
        <div className="upgrade__price">{PRO_PRICE}</div>
        <div className="tiny muted" style={{ marginTop: 2 }}>Cancel anytime.</div>
      </div>

      <div style={{ height: 14 }} />
      <button className="btn" disabled={busy} onClick={buy}>
        {busy ? "Processing…" : "Upgrade to Pro"}
      </button>
      <div className="note" style={{ marginTop: 10 }}>Demo — no real charge is made.</div>
    </div>
  );
}
