import { useState } from "react";
import { useStore } from "../context/AppStore";
import { CUSTOMER_DOC_IDS, getLegalDoc } from "../data/legal";
import LegalDocModal from "../components/LegalDocModal";

// Full-screen MANDATORY consent shown to a new account at first entry, BEFORE
// the app is usable. The user must open/read each document and tick Agree; only
// then is consent recorded and the app unlocked. There is no skip.
export default function ConsentScreen() {
  const { recordConsent, userName } = useStore();
  const [agreed, setAgreed] = useState(false);
  const [viewDoc, setViewDoc] = useState<string | null>(null);
  const [opened, setOpened] = useState<Set<string>>(new Set());

  const docs = CUSTOMER_DOC_IDS.map(getLegalDoc).filter(Boolean) as NonNullable<ReturnType<typeof getLegalDoc>>[];

  return (
    <div className="screen consentscreen">
      <div className="consentscreen__head">
        <h1 className="h1" style={{ marginBottom: 4 }}>{(() => {
          const first = (userName || "").split(" ")[0];
          const real = first && first.toLowerCase() !== "new";
          return real ? `Welcome, ${first}` : "Welcome";
        })()}</h1>
        <p className="sub" style={{ marginTop: 0 }}>
          Before you start, please read and agree to our policies.
        </p>
      </div>

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        {docs.map((d, i) => {
          const seen = opened.has(d.id);
          return (
            <button key={d.id} className="legalrow"
              onClick={() => { setViewDoc(d.id); setOpened((p) => new Set(p).add(d.id)); }}
              style={{ borderTop: i === 0 ? "none" : "1px solid var(--border)" }}>
              <span className="legalrow__txt">
                <b>{d.title}</b>
                {seen && <span className="tiny muted">✓ Opened</span>}
              </span>
              <span className="dayrow__chev">›</span>
            </button>
          );
        })}
      </div>

      <label className="consentrow" style={{ marginTop: 18 }}>
        <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
        <span>I confirm I have read and agree to all of the documents above.</span>
      </label>

      <button className="btn" disabled={!agreed} style={{ opacity: agreed ? 1 : 0.5 }}
        onClick={() => recordConsent(CUSTOMER_DOC_IDS)}>
        Agree &amp; Confirm
      </button>

      {viewDoc && <LegalDocModal docId={viewDoc} onClose={() => setViewDoc(null)} />}
    </div>
  );
}
