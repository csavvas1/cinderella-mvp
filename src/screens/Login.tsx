import { useEffect, useState } from "react";
import { useStore } from "../context/AppStore";
import { LogoMark } from "../components/Logo";
import { APP_NAME } from "../data/brand";

// Detect mobile platform to pick the matching biometric icon.
function detectPlatform(): "ios" | "android" | "other" {
  const ua = navigator.userAgent || "";
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  if (/Android/i.test(ua)) return "android";
  return "other";
}

// Apple Face ID logo — official corner-bracket frame with eyes, nose, smile.
function FaceIDIcon({ size = 28 }: { size?: number }) {
  return (
    <svg viewBox="0 0 56 56" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-label="Face ID">
      {/* corner brackets */}
      <path d="M4 18V10a6 6 0 0 1 6-6h8" />
      <path d="M38 4h8a6 6 0 0 1 6 6v8" />
      <path d="M52 38v8a6 6 0 0 1-6 6h-8" />
      <path d="M18 52h-8a6 6 0 0 1-6-6v-8" />
      {/* eyes */}
      <path d="M19 21v6" />
      <path d="M37 21v6" />
      {/* nose */}
      <path d="M28 20v9a3 3 0 0 1-3 3h-1.5" />
      {/* smile */}
      <path d="M20 38a12 12 0 0 0 16 0" />
    </svg>
  );
}

// Android fingerprint glyph.
function FingerprintIcon({ size = 28 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-label="Fingerprint">
      <path d="M12 4.5a7.5 7.5 0 0 0-7.3 9.3" />
      <path d="M19.3 13.8A7.5 7.5 0 0 0 8.6 5.9" />
      <path d="M7 10a5 5 0 0 1 9.9 1c0 3.5-.5 5.5-1.2 7" />
      <path d="M12 9a2.8 2.8 0 0 1 2.8 2.8c0 3.4-.6 5.6-1.5 7.4" />
      <path d="M9.5 19.8c.9-1.8 1.3-3.8 1.3-7.3a1.2 1.2 0 0 1 2.4 0" />
      <path d="M6.5 17.6A12 12 0 0 0 7.4 13" />
    </svg>
  );
}

function BiometricIcon({ size = 28 }: { size?: number }) {
  const plat = detectPlatform();
  if (plat === "android") return <FingerprintIcon size={size} />;
  return <FaceIDIcon size={size} />; // iOS + desktop default
}

/* Official brand marks (accurate paths) */
function GoogleIcon() {
  return (
    <svg className="socbtn__ic" viewBox="0 0 48 48" width="20" height="20" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
    </svg>
  );
}
function AppleIcon() {
  return (
    <svg className="socbtn__ic" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path fill="currentColor" d="M17.05 12.54c-.02-2.07 1.69-3.06 1.77-3.11-.96-1.41-2.46-1.6-3-1.62-1.27-.13-2.49.75-3.14.75-.65 0-1.65-.73-2.71-.71-1.39.02-2.68.81-3.4 2.06-1.45 2.51-.37 6.23 1.04 8.27.69 1 1.51 2.12 2.58 2.08 1.04-.04 1.43-.67 2.69-.67 1.25 0 1.61.67 2.71.65 1.12-.02 1.83-1.02 2.51-2.02.79-1.16 1.12-2.28 1.14-2.34-.03-.01-2.18-.84-2.2-3.32zM15.01 5.79c.57-.69.96-1.65.85-2.61-.83.03-1.83.55-2.42 1.24-.53.61-.99 1.59-.87 2.53.92.07 1.87-.47 2.44-1.16z"/>
    </svg>
  );
}
function FacebookIcon() {
  return (
    <svg className="socbtn__ic" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path fill="#1877F2" d="M24 12c0-6.63-5.37-12-12-12S0 5.37 0 12c0 5.99 4.39 10.95 10.13 11.85v-8.38H7.08V12h3.05V9.36c0-3.01 1.79-4.67 4.53-4.67 1.31 0 2.69.23 2.69.23v2.95h-1.51c-1.49 0-1.96.93-1.96 1.87V12h3.33l-.53 3.47h-2.8v8.38C19.61 22.95 24 17.99 24 12z"/>
    </svg>
  );
}

// Pull a referral code out of the invite link. Supports ?ref=CODE on either the
// normal query string or inside the hash route (e.g. #/login?ref=CODE). Persisted
// to sessionStorage so it survives the redirect into the app.
function captureReferral(): string {
  try {
    const fromSearch = new URLSearchParams(window.location.search).get("ref");
    const hash = window.location.hash;
    const qIdx = hash.indexOf("?");
    const fromHash = qIdx >= 0 ? new URLSearchParams(hash.slice(qIdx + 1)).get("ref") : null;
    const code = (fromSearch || fromHash || "").trim().toUpperCase();
    if (code) sessionStorage.setItem("pendingRef", code);
  } catch { /* ignore */ }
  return sessionStorage.getItem("pendingRef") || "";
}

export default function Login() {
  const { login, signup, resetPassword, biometricEnabled, biometricEmail, loginWithBiometric, lastAccount } = useStore();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [name, setName] = useState("");
  const [surname, setSurname] = useState("");
  const fullName = `${name.trim()} ${surname.trim()}`.trim();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [resetMode, setResetMode] = useState(false);   // "Forgot password?" panel
  const [resetSent, setResetSent] = useState(false);

  // ---- client-side attempt throttle ----
  // After MAX_ATTEMPTS failed sign-in/up attempts, lock the button for a cooldown.
  // This is a UX guardrail only — the REAL rate limiting is server-side (Supabase
  // Auth rate limits + CAPTCHA). Attackers hitting the API directly bypass this.
  // State persists in localStorage so a page refresh can't reset the counter.
  const MAX_ATTEMPTS = 5;
  const COOLDOWN_MS = 60_000; // 1 minute lockout
  const THROTTLE_KEY = "login-throttle";
  const [lockUntil, setLockUntil] = useState<number>(() => {
    try { return JSON.parse(localStorage.getItem(THROTTLE_KEY) || "{}").lockUntil ?? 0; } catch { return 0; }
  });
  const [cooldown, setCooldown] = useState(0); // seconds remaining, for the label

  useEffect(() => {
    if (lockUntil <= Date.now()) { setCooldown(0); return; }
    const tick = () => setCooldown(Math.max(0, Math.ceil((lockUntil - Date.now()) / 1000)));
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, [lockUntil]);
  const locked = cooldown > 0;

  function readAttempts(): number {
    try { return JSON.parse(localStorage.getItem(THROTTLE_KEY) || "{}").attempts ?? 0; } catch { return 0; }
  }
  function recordFailure() {
    const attempts = readAttempts() + 1;
    if (attempts >= MAX_ATTEMPTS) {
      const until = Date.now() + COOLDOWN_MS;
      localStorage.setItem(THROTTLE_KEY, JSON.stringify({ attempts: 0, lockUntil: until }));
      setLockUntil(until);
    } else {
      localStorage.setItem(THROTTLE_KEY, JSON.stringify({ attempts, lockUntil: 0 }));
    }
  }
  function clearThrottle() {
    localStorage.removeItem(THROTTLE_KEY);
    setLockUntil(0);
  }

  async function sendReset() {
    setErr("");
    if (!email.trim()) { setErr("Enter your email first."); return; }
    setBusy(true);
    const res = await resetPassword(email);
    setBusy(false);
    if (res.error) { setErr(res.error); return; }
    setResetSent(true);
  }
  // referral code auto-captured from the invite link (never typed manually)
  const refCode = captureReferral();
  const [scanning, setScanning] = useState(false);
  // returning-account quick screen vs the full sign-in/up form
  const [useDifferent, setUseDifferent] = useState(false);
  const bioForLast = biometricEnabled && biometricEmail === lastAccount?.email;
  // quick screen only makes sense when Face ID / biometric is set for the last
  // account; otherwise show the normal sign-in form (no lone arrow button).
  const showQuick = bioForLast && !useDifferent && !refCode;

  async function submit() {
    setErr("");
    if (locked) { setErr(`Too many attempts. Try again in ${cooldown}s.`); return; }
    if (!email.trim() || !password) { setErr("Enter your email and password."); return; }
    if (mode === "up") {
      if (!fullName) { setErr("Enter your name."); return; }
      if (password.length < 6) { setErr("Password must be at least 6 characters."); return; }
      if (password !== confirm) { setErr("Passwords don't match."); return; }
    }
    setBusy(true);
    const res = mode === "up"
      ? await signup(email, password, fullName, "", refCode || undefined)
      : await login(email, password);
    setBusy(false);
    if (res.error) {
      recordFailure();  // count the failed attempt toward the lockout
      setErr(res.error);
    } else {
      clearThrottle();  // success resets the counter
    }
    // on success App.tsx swaps to the app (consent screen first if needed)
  }

  // real Face ID / Touch ID → verify + unlock the saved account
  async function bioLogin() {
    setErr("");
    setScanning(true);
    const res = await loginWithBiometric(); // triggers the real biometric prompt
    setScanning(false);
    if (res.error) setErr(res.error);
    // on success App.tsx swaps to the app
  }


  return (
    <div
      className="screen"
      style={{
        display: "flex", flexDirection: "column", justifyContent: "space-between",
        padding: "56px 26px 36px",
        background: "radial-gradient(700px 400px at 50% 0%, rgba(79,70,229,0.18), transparent 60%), var(--bg)",
      }}
    >
      <div style={{ textAlign: "center", marginTop: 18 }}>
        {!showQuick && <div style={{ display: "flex", justifyContent: "center" }}><LogoMark size={64} /></div>}
        <h1 style={{ fontSize: 32, fontWeight: 900, letterSpacing: -1, margin: showQuick ? "0 0 6px" : "12px 0 6px" }}>{APP_NAME}</h1>
        {!showQuick && (
          <p className="sub" style={{ fontSize: 14.5 }}>Find a trusted cleaner in a few taps. Or earn as one.</p>
        )}
      </div>

      {showQuick ? (
        /* ---- returning account: one tap to unlock ---- */
        <div style={{ margin: "auto 0", display: "flex", flexDirection: "column", alignItems: "center" }}>
          <button className="biotap" onClick={bioLogin} aria-label="Log in with Face ID">
            <BiometricIcon size={52} />
          </button>
          <div className="biotap__lbl">Log in with Face ID</div>
          <button className="acctile__other" onClick={() => { setUseDifferent(true); setMode("in"); setEmail(""); }}>
            Sign in with password
          </button>
        </div>
      ) : resetMode ? (
        /* ---- forgot password: email a reset link ---- */
        <div>
          <div className="card" style={{ marginBottom: 16 }}>
            <b style={{ fontSize: 15 }}>Reset your password</b>
            <p className="sub" style={{ marginTop: 4 }}>Enter your account email and we'll send you a reset link.</p>
            <div style={{ height: 8 }} />
            <input className="input" placeholder="Email" type="email" autoComplete="email"
              value={email} onChange={(e) => setEmail(e.target.value)} />
            {err && <div className="loginerr">{err}</div>}
            {resetSent && <div className="refapplied" style={{ marginTop: 10 }}>If that email has an account, a reset link is on its way. Check your inbox.</div>}
          </div>
          <button className="btn" onClick={sendReset} disabled={busy || resetSent}>
            {busy ? "Sending…" : resetSent ? "Link sent" : "Send reset link"}
          </button>
          <button className="btn secondary" style={{ marginTop: 10 }}
            onClick={() => { setResetMode(false); setResetSent(false); setErr(""); }}>
            Back to sign in
          </button>
        </div>
      ) : (
        /* ---- full sign-in / sign-up ---- */
        <div>
          <div className="card" style={{ marginBottom: 16 }}>
            {mode === "up" && (
              <>
                <div className="row" style={{ gap: 10 }}>
                  <input className="input grow" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
                  <input className="input grow" placeholder="Surname" value={surname} onChange={(e) => setSurname(e.target.value)} />
                </div>
                <div style={{ height: 10 }} />
              </>
            )}
            <input className="input" placeholder="Email" type="email" autoComplete="email"
              value={email} onChange={(e) => setEmail(e.target.value)} />
            <div style={{ height: 10 }} />
            <input className="input" placeholder="Password" type="password"
              autoComplete={mode === "in" ? "current-password" : "new-password"}
              value={password} onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && mode === "in") submit(); }} />
            {mode === "up" && (
              <>
                <div style={{ height: 10 }} />
                <input className="input" placeholder="Confirm password" type="password" autoComplete="new-password"
                  value={confirm} onChange={(e) => setConfirm(e.target.value)} />
                {refCode && (
                  <div className="refapplied">
                    Referral applied — you and your inviter both earn a bonus once you're active.
                  </div>
                )}
              </>
            )}
            {err && <div className="loginerr">{err}</div>}
          </div>

          <button className="btn" onClick={submit} disabled={busy || locked}>
            {locked ? `Locked · ${cooldown}s` : busy ? "Please wait…" : mode === "in" ? "Sign in" : "Create account"}
          </button>

          <button className="btn secondary" style={{ marginTop: 10 }} disabled={busy}
            onClick={() => { setErr(""); setPassword(""); setConfirm(""); if (mode === "in") { setMode("up"); setEmail(""); setName(""); setSurname(""); } else { setMode("in"); setEmail(""); } }}>
            {mode === "in" ? "Create a new account" : "I already have an account"}
          </button>

          {mode === "in" && (
            <button className="linklike" style={{ marginTop: 12, display: "block", width: "100%", textAlign: "center" }}
              onClick={() => { setErr(""); setResetMode(true); setResetSent(false); }}>
              Forgot password?
            </button>
          )}
        </div>
      )}

      {/* mock face-scan overlay */}
      {scanning && (
        <div className="modal__backdrop">
          <div className="modal" style={{ textAlign: "center" }}>
            <div className="bioscan">
              <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                <path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2" />
                <circle cx="9" cy="10" r="1" /><circle cx="15" cy="10" r="1" />
                <path d="M9 14a4 4 0 0 0 6 0" />
              </svg>
            </div>
            <b style={{ fontSize: 16 }}>Scanning…</b>
            <p className="sub" style={{ marginTop: 4 }}>Look at your device</p>
          </div>
        </div>
      )}
    </div>
  );
}
