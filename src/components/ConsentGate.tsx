import { useState } from "react";
import { getLegalDoc } from "../data/legal";
import LegalDocModal from "./LegalDocModal";

// Blocking consent screen. Lists the required documents (tap any to read), and
// requires an explicit confirmation before the user can proceed. Used at signup
// (customer docs) and when activating the cleaner side (Service Provider
// Agreement). There is no way past it except Confirm (after ticking) or Cancel.
export default function ConsentGate({
  title, intro, docIds, confirmLabel, onConfirm, onCancel,
}: {
  title: string;
  intro: string;
  docIds: readonly string[];
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [agreed, setAgreed] = useState(false);
  const [opened, setOpened] = useState<Set<string>>(new Set());
  const [viewDoc, setViewDoc] = useState<string | null>(null);

  return (
    <div className="modal__backdrop">
      <div className="modal tall" onClick={(e) => e.stopPropagation()}>
        <div className="between" style={{ marginBottom: 10 }}>
          <b style={{ fontSize: 16 }}>{title}</b>
          <button className="iconbtn" onClick={onCancel}>✕</button>
        </div>
        <p className="sub" style={{ marginTop: 0, fontSize: 13 }}>{intro}</p>

        <div className="card" style={{ padding: 0, overflow: "hidden", marginTop: 4 }}>
          {docIds.map((id, i) => {
            const d = getLegalDoc(id);
            if (!d) return null;
            const seen = opened.has(id);
            return (
              <button key={id} className="legalrow"
                onClick={() => { setViewDoc(id); setOpened((p) => new Set(p).add(id)); }}
                style={{ borderTop: i === 0 ? "none" : "1px solid var(--border)" }}>
                <span className="legalrow__txt">
                  <b>{d.title}</b>
                  {seen && <span className="tiny muted">✓ Opened</span>}
                </span>
                <span className="tiny muted">Read ›</span>
              </button>
            );
          })}
        </div>

        <label className="consentrow" style={{ marginTop: 14 }}>
          <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
          <span>I confirm I have read and agree to the document(s) above.</span>
        </label>

        <button className="btn" disabled={!agreed} style={{ opacity: agreed ? 1 : 0.5 }}
          onClick={onConfirm}>
          {confirmLabel}
        </button>
        <div style={{ height: 8 }} />
        <button className="btn secondary" onClick={onCancel}>Cancel</button>

        {viewDoc && <LegalDocModal docId={viewDoc} onClose={() => setViewDoc(null)} />}
      </div>
    </div>
  );
}
