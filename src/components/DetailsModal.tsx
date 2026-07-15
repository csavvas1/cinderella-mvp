import { useEffect, useState } from "react";
import { isBiometricAvailable, verifyBiometric } from "../lib/webauthn";

type Editing = null | "phone" | "password";

export default function DetailsModal({
  email, phone, appName, pro, onUpgrade, onCancelPro, onClose, onSavePhone, onChangePassword,
}: {
  email: string;
  phone: string;
  appName: string;
  pro: boolean;
  onUpgrade: () => void;
  onCancelPro: () => void;
  onClose: () => void;
  onSavePhone: (v: string) => void;
  onChangePassword: (newPassword: string) => Promise<{ error?: string }>;
}) {
  const [editing, setEditing] = useState<Editing>(null);
  const [planOpen, setPlanOpen] = useState(false); // expand Pro benefits

  // phone draft — saved directly (no SMS verification)
  const [phoneDraft, setPhoneDraft] = useState(phone);

  // password change — wired to Supabase. A logged-in session can set a new
  // password without re-entering the old one; the real password is never shown
  // (it's stored only as a one-way hash and cannot be retrieved).
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwErr, setPwErr] = useState("");
  const [pwOk, setPwOk] = useState(false);
  const [pwBusy, setPwBusy] = useState(false);
  const [showPw, setShowPw] = useState(false);          // show-while-typing toggle
  const [bioGate, setBioGate] = useState(false);        // biometric prompt before the form
  const [bioScanning, setBioScanning] = useState(false);
  const [bioErr, setBioErr] = useState("");
  const [bioAvail, setBioAvail] = useState(false);
  useEffect(() => { isBiometricAvailable().then(setBioAvail); }, []);

  // Real biometric confirmation before revealing the password-change form. If the
  // device has a platform authenticator, run the actual WebAuthn check; if it
  // fails, block. If no biometric is enrolled/available, fall through — the
  // active Supabase session already proves identity, so we don't lock the user
  // out of changing their password just because they never set up Face ID.
  async function askBiometric() {
    setBioErr("");
    if (!bioAvail) { setEditing("password"); return; }
    setBioGate(true);
    setBioScanning(true);
    try {
      const ok = await verifyBiometric(email);
      setBioScanning(false); setBioGate(false);
      if (ok) setEditing("password");
      else setBioErr("Couldn't verify. Try again.");
    } catch {
      // no enrolled credential for this account (or user cancelled): allow the
      // change to proceed on the strength of the existing session.
      setBioScanning(false); setBioGate(false); setEditing("password");
    }
  }

  async function savePassword() {
    setPwErr(""); setPwOk(false);
    if (newPw.length < 6) { setPwErr("New password must be at least 6 characters."); return; }
    if (newPw !== confirmPw) { setPwErr("New passwords don't match."); return; }
    setPwBusy(true);
    const res = await onChangePassword(newPw);
    setPwBusy(false);
    if (res.error) { setPwErr(res.error); return; }
    setPwOk(true); setNewPw(""); setConfirmPw("");
    setTimeout(() => { setEditing(null); setPwOk(false); }, 1200);
  }

  return (
    <div className="modal__backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="between" style={{ marginBottom: 14 }}>
          <b style={{ fontSize: 16 }}>My details</b>
          <button className="iconbtn" onClick={onClose}>✕</button>
        </div>

        {/* EMAIL — read-only (account identity, not editable) */}
        <div className="detailrow">
          <div className="grow" style={{ minWidth: 0 }}>
            <div className="detailrow__lbl">Email</div>
            <div className="detailrow__val" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{email}</div>
          </div>
        </div>

        {/* PHONE — saved directly, no verification */}
        {editing === "phone" ? (
          <div className="card">
            <div className="label">Phone</div>
            <input className="input" value={phoneDraft} onChange={(e) => setPhoneDraft(e.target.value)} autoFocus />
            <div className="row" style={{ gap: 8, marginTop: 10 }}>
              <button className="btn sm secondary grow" onClick={() => { setPhoneDraft(phone); setEditing(null); }}>Cancel</button>
              <button className="btn sm grow" disabled={!phoneDraft || phoneDraft === phone}
                style={{ opacity: (!phoneDraft || phoneDraft === phone) ? 0.5 : 1 }}
                onClick={() => { onSavePhone(phoneDraft.trim()); setEditing(null); }}>Save</button>
            </div>
          </div>
        ) : (
          <DetailRow label="Phone" value={phone || "Not set"} onEdit={() => { setPhoneDraft(phone); setEditing("phone"); }} />
        )}

        {/* PASSWORD — change only (behind a biometric gate); the current password
            is never displayed (one-way hash). Eye toggle shows what you type. */}
        {bioGate ? (
          <div className="card" style={{ textAlign: "center" }}>
            <div className="bioscan" style={{ margin: "6px auto" }}>
              <svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                <path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2" />
                <circle cx="9" cy="10" r="1" /><circle cx="15" cy="10" r="1" /><path d="M9 14a4 4 0 0 0 6 0" />
              </svg>
            </div>
            <b style={{ fontSize: 14 }}>{bioScanning ? "Verifying…" : "Confirm it's you"}</b>
          </div>
        ) : editing === "password" ? (
          <div className="card">
            <div className="label">New password</div>
            <div className="pwfield">
              <input className="input" type={showPw ? "text" : "password"} value={newPw} onChange={(e) => setNewPw(e.target.value)} placeholder="At least 6 characters" autoComplete="new-password" autoFocus />
              <button type="button" className="pwfield__eye" onClick={() => setShowPw((s) => !s)}>{showPw ? "Hide" : "Show"}</button>
            </div>
            <div className="label">Confirm new password</div>
            <input className="input" type={showPw ? "text" : "password"} value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} autoComplete="new-password" />
            {pwErr && <div className="note amber" style={{ marginTop: 10 }}>{pwErr}</div>}
            {pwOk && <div className="refapplied" style={{ marginTop: 10 }}>Password updated.</div>}
            <div className="row" style={{ gap: 8, marginTop: 12 }}>
              <button className="btn sm secondary grow" onClick={() => { setEditing(null); setPwErr(""); setNewPw(""); setConfirmPw(""); setShowPw(false); }}>Cancel</button>
              <button className="btn sm grow" disabled={pwBusy} onClick={savePassword}>{pwBusy ? "Updating…" : "Update"}</button>
            </div>
          </div>
        ) : (
          <div>
            <div className="detailrow">
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="detailrow__lbl">Password</div>
                <div className="detailrow__val">••••••••••</div>
              </div>
              <button className="detailrow__edit" onClick={askBiometric}>Change</button>
            </div>
            {bioErr && <div className="note amber" style={{ marginTop: 8 }}>{bioErr}</div>}
          </div>
        )}

        {/* PLAN — Standard by default; tap to see Pro benefits + switch */}
        <div className="detailrow" style={{ cursor: "pointer" }} onClick={() => setPlanOpen((o) => !o)}>
          <div className="grow" style={{ minWidth: 0 }}>
            <div className="detailrow__lbl">Plan</div>
            <div className="detailrow__val">{pro ? "Pro" : "Standard"}</div>
          </div>
          {pro
            ? <span className="statuspill statuspill--ok">Active</span>
            : <span className="detailrow__edit">Go Pro ›</span>}
        </div>

        {planOpen && (
          pro ? (
            <div className="card">
              <div className="tiny muted" style={{ marginBottom: 8 }}>€12.99/mo · renews monthly. Cancelling keeps Pro until the period ends.</div>
              <button className="btn danger sm" onClick={onCancelPro}>Cancel subscription</button>
            </div>
          ) : (
            <div className="card">
              <b style={{ fontSize: 14 }}>Go Pro</b>
              <p className="sub" style={{ margin: "4px 0 8px", fontSize: 12.5 }}>Turn {appName} into your whole short-let control room:</p>
              {[
                ["All calendars in one place", "Airbnb, Booking.com, Vrbo, Google & Expedia — synced, no double bookings."],
                ["Unified guest inbox", "Reply to every guest from one screen."],
                ["Automatic messages", "Welcome / check-in / thank-you notes sent for you."],
              ].map(([t, d]) => (
                <div className="actfeat" key={t}><div><b style={{ fontSize: 13 }}>{t}</b><div className="tiny muted">{d}</div></div></div>
              ))}
              <button className="gopro-btn" onClick={onUpgrade}>
                <span className="gopro-btn__txt">
                  <span className="gopro-btn__main">Upgrade to Pro</span>
                  <span className="gopro-btn__sub">€12.99/mo · cancel anytime</span>
                </span>
                <span className="gopro-btn__chev">›</span>
              </button>
            </div>
          )
        )}

      </div>
    </div>
  );
}

function DetailRow({ label, value, onEdit }: { label: string; value: string; onEdit: () => void }) {
  return (
    <div className="detailrow">
      <div className="grow" style={{ minWidth: 0 }}>
        <div className="detailrow__lbl">{label}</div>
        <div className="detailrow__val" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{value}</div>
      </div>
      <button className="detailrow__edit" onClick={onEdit}>Edit</button>
    </div>
  );
}
