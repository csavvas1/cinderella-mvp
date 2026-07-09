import { useEffect, useRef, useState } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import PhoneFrame from "./components/PhoneFrame";
import AppBar from "./components/AppBar";
import TabBar from "./components/TabBar";
import { LogoMark } from "./components/Logo";
import { useStore } from "./context/AppStore";

import Login from "./screens/Login";
import ConsentScreen from "./screens/ConsentScreen";
import Book from "./screens/customer/Book";
import CleanerList from "./screens/customer/CleanerList";
import CleanerDetail from "./screens/customer/CleanerDetail";
import AllReviews from "./screens/customer/AllReviews";
import Confirmed from "./screens/customer/Confirmed";
import Bookings from "./screens/customer/Bookings";
import Account from "./screens/customer/Account";

import Jobs from "./screens/agent/Jobs";
import JobDetail from "./screens/agent/JobDetail";
import Calendar from "./screens/agent/Calendar";
import Referrals from "./screens/agent/Referrals";

function Shell() {
  const { role, accountOpen, closeAccount } = useStore();
  const nav = useNavigate();
  const { pathname } = useLocation();
  // Play a slide-down exit while keeping the sheet mounted. We flip accountOpen
  // OFF immediately so the island starts rising in sync with the sheet dropping
  // (otherwise the island only animates after the sheet has fully gone).
  const [acctClosing, setAcctClosing] = useState(false);
  function dismissAccount() {
    setAcctClosing(true);
    closeAccount();
    setTimeout(() => setAcctClosing(false), 300);
  }

  // swipe-down-to-dismiss on the account sheet. Driven by DIRECT DOM transform
  // (no React state per frame) so the sheet tracks the thumb 1:1 with no lag.
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const dragStart = useRef<number | null>(null);
  const dragCur = useRef(0);
  function onDragStart(e: React.TouchEvent) {
    dragStart.current = e.touches[0].clientY;
    dragCur.current = 0;
    if (sheetRef.current) sheetRef.current.style.transition = "none"; // follow the finger, no easing
  }
  function onDragMove(e: React.TouchEvent) {
    if (dragStart.current == null || !sheetRef.current) return;
    const dy = Math.max(0, e.touches[0].clientY - dragStart.current); // down only
    dragCur.current = dy;
    sheetRef.current.style.transform = `translateY(${dy}px)`;
  }
  function onDragEnd() {
    if (dragStart.current == null || !sheetRef.current) return;
    dragStart.current = null;
    const el = sheetRef.current;
    el.style.transition = "transform .28s cubic-bezier(.32,.72,.35,1)";
    if (dragCur.current > 110) {
      el.style.transform = "translateY(100%)";   // fling it out, then unmount
      setTimeout(() => { el.style.transform = ""; el.style.transition = ""; dismissAccount(); }, 200);
    } else {
      el.style.transform = "translateY(0)";       // snap back
    }
  }

  // On (re)entering the app after login, land on the side the launch preference
  // selected (role is set from the account's launchSide at login).
  useEffect(() => {
    nav(role === "agent" ? "/agent/jobs" : "/book");
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the URL on the correct side when the role toggle flips.
  useEffect(() => {
    const onAgent = pathname.startsWith("/agent");
    if (role === "agent" && !onAgent) nav("/agent/jobs");
    if (role === "customer" && onAgent) nav("/book");
  }, [role]); // eslint-disable-line react-hooks/exhaustive-deps

  // The Book form draft only lives inside the Book <-> cleaner-list hop. Leaving
  // that flow (any other tab, or switching to the agent side) discards it so the
  // form is fresh next time the customer starts a booking.
  useEffect(() => {
    const inBookFlow = pathname === "/book"
      || pathname.startsWith("/cleaner")   // /cleaners list + /cleaner/:id detail
      || pathname.startsWith("/reviews")   // all-reviews page reached from a cleaner
      || pathname.startsWith("/confirmed"); // post-book confirmation
    if (!inBookFlow) sessionStorage.removeItem("book-form");
  }, [pathname]);
  useEffect(() => {
    if (role === "agent") sessionStorage.removeItem("book-form");
  }, [role]);

  return (
    <>
      <AppBar />
      <div className="screen">
        <div className="fadein" key={pathname}>
          <Routes>
            {/* customer */}
            <Route path="/book" element={<Book />} />
            <Route path="/cleaners" element={<CleanerList />} />
            <Route path="/cleaner/:id" element={<CleanerDetail />} />
            <Route path="/reviews/:id" element={<AllReviews />} />
            <Route path="/confirmed/:id" element={<Confirmed />} />
            <Route path="/bookings" element={<Bookings />} />
            {/* agent */}
            <Route path="/agent/jobs" element={<Jobs />} />
            <Route path="/agent/job/:id" element={<JobDetail />} />
            <Route path="/agent/calendar" element={<Calendar />} />
            <Route path="/agent/referrals" element={<Referrals />} />
            <Route path="*" element={<Navigate to="/book" replace />} />
          </Routes>
        </div>
      </div>
      <TabBar />

      {/* Account is a Wolt-style slide-up sheet over the current page, not a
          route — the page you were on stays mounted behind it. */}
      {(accountOpen || acctClosing) && (
        <div className={"acctsheet__backdrop" + (acctClosing ? " closing" : "")} onClick={dismissAccount}>
          <div ref={sheetRef} className={"acctsheet" + (acctClosing ? " closing" : "")} onClick={(e) => e.stopPropagation()}>
            {/* grab handle — drag it down to dismiss (tracks the thumb 1:1) */}
            <div className="acctsheet__grabzone"
              onTouchStart={onDragStart} onTouchMove={onDragMove} onTouchEnd={onDragEnd}>
              <div className="acctsheet__grab" />
            </div>
            <button className="acctsheet__close" onClick={dismissAccount} aria-label="Close account">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
            </button>
            <div className="acctsheet__scroll">
              <Account />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function LockScreen({ onUnlock }: { onUnlock: () => void }) {
  // auto-trigger the mock scan on mount — no button to press
  useEffect(() => {
    const t = setTimeout(onUnlock, 1100);
    return () => clearTimeout(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="lockscreen">
      <div className="bioscan">
        <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 8V6.5A2.5 2.5 0 0 1 6.5 4H8" /><path d="M16 4h1.5A2.5 2.5 0 0 1 20 6.5V8" />
          <path d="M20 16v1.5a2.5 2.5 0 0 1-2.5 2.5H16" /><path d="M8 20H6.5A2.5 2.5 0 0 1 4 17.5V16" />
          <path d="M9 9.5v1" /><path d="M15 9.5v1" /><path d="M9.3 15.2a4 4 0 0 0 5.4 0" />
        </svg>
      </div>
      <b style={{ fontSize: 16 }}>Unlocking…</b>
      <p className="sub" style={{ marginTop: 4 }}>Verifying it's you</p>
    </div>
  );
}

function Splash() {
  return (
    <div className="lockscreen">
      <div className="bioscan"><LogoMark size={44} /></div>
      <b style={{ fontSize: 16, marginTop: 12 }}>Loading…</b>
    </div>
  );
}

function RecoveryScreen() {
  const { finishRecovery } = useStore();
  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [show, setShow] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);
  async function save() {
    setErr(""); setOk(false);
    if (pw1.length < 6) { setErr("Password must be at least 6 characters."); return; }
    if (pw1 !== pw2) { setErr("Passwords don't match."); return; }
    setBusy(true);
    const res = await finishRecovery(pw1);
    setBusy(false);
    if (res.error) { setErr(res.error); return; }
    setOk(true);
  }
  return (
    <div className="screen" style={{ padding: "56px 26px 36px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
      <div style={{ textAlign: "center", marginBottom: 18 }}>
        <div style={{ display: "flex", justifyContent: "center" }}><LogoMark size={56} /></div>
        <h1 style={{ fontSize: 24, fontWeight: 900, margin: "12px 0 4px" }}>Set a new password</h1>
        <p className="sub">Choose a new password for your account.</p>
      </div>
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="pwfield">
          <input className="input" type={show ? "text" : "password"} placeholder="New password" autoComplete="new-password"
            value={pw1} onChange={(e) => setPw1(e.target.value)} autoFocus />
          <button type="button" className="pwfield__eye" onClick={() => setShow((s) => !s)}>{show ? "Hide" : "Show"}</button>
        </div>
        <div style={{ height: 10 }} />
        <input className="input" type={show ? "text" : "password"} placeholder="Confirm new password" autoComplete="new-password"
          value={pw2} onChange={(e) => setPw2(e.target.value)} />
        {err && <div className="loginerr">{err}</div>}
        {ok && <div className="refapplied" style={{ marginTop: 10 }}>Password updated. Sign in with your new password.</div>}
      </div>
      <button className="btn" onClick={save} disabled={busy || ok}>
        {busy ? "Saving…" : ok ? "Done" : "Update password"}
      </button>
    </div>
  );
}

export default function App() {
  const { loggedIn, authLoading, recovering, biometricEnabled, needsCustomerConsent } = useStore();
  // App was closed while signed in + biometric on -> require an auto unlock on reopen.
  const [locked, setLocked] = useState(() => loggedIn && biometricEnabled);
  // Password-reset link landing: show the set-new-password screen above everything.
  if (recovering) return <PhoneFrame><RecoveryScreen /></PhoneFrame>;
  // Wait for the initial Supabase session check so a returning session doesn't
  // flash the Login screen before it hydrates.
  if (authLoading && !loggedIn) return <PhoneFrame><Splash /></PhoneFrame>;
  if (loggedIn && locked) return <PhoneFrame><LockScreen onUnlock={() => setLocked(false)} /></PhoneFrame>;
  if (!loggedIn) return <PhoneFrame><Login /></PhoneFrame>;
  // MANDATORY: a logged-in account that hasn't accepted the current customer
  // documents is blocked on the consent screen until they Agree.
  if (needsCustomerConsent) return <PhoneFrame><ConsentScreen /></PhoneFrame>;
  return <PhoneFrame><Shell /></PhoneFrame>;
}
