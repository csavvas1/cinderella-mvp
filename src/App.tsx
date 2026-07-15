import { useEffect, useRef, useState } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import PhoneFrame from "./components/PhoneFrame";
import AppBar from "./components/AppBar";
import TabBar from "./components/TabBar";
import PullToRefresh from "./components/PullToRefresh";
import SwipePager from "./components/SwipePager";
import { LogoMark } from "./components/Logo";
import { useStore } from "./context/AppStore";

// A property-share invite link is ?join=CODE. Capture it as soon as the app
// loads (before any auth redirect strips the query) and stash it so it survives
// the trip through login/signup. Consumed once the user is signed in (see Shell).
function captureJoinCode(): string {
  try {
    const fromSearch = new URLSearchParams(window.location.search).get("join");
    const hash = window.location.hash;
    const qIdx = hash.indexOf("?");
    const fromHash = qIdx >= 0 ? new URLSearchParams(hash.slice(qIdx + 1)).get("join") : null;
    const code = (fromSearch || fromHash || "").trim();
    if (code) sessionStorage.setItem("pendingJoin", code);
  } catch { /* ignore */ }
  return sessionStorage.getItem("pendingJoin") || "";
}
captureJoinCode();

// Tab order per side — swipe navigation cycles within the current side only.
const CUSTOMER_TABS = ["/book", "/bookings", "/messages"];
const AGENT_TABS = ["/agent/jobs", "/agent/calendar", "/agent/referrals"];

// The page component shown for each swipeable tab path.
const TAB_PAGE: Record<string, () => JSX.Element> = {
  "/book": () => <Book />,
  "/bookings": () => <Bookings />,
  "/messages": () => <Messages />,
  "/agent/jobs": () => <Jobs />,
  "/agent/calendar": () => <Calendar />,
  "/agent/referrals": () => <Referrals />,
};

import Login from "./screens/Login";
import ConsentScreen from "./screens/ConsentScreen";
import Book from "./screens/customer/Book";
import CleanerList from "./screens/customer/CleanerList";
import CleanerDetail from "./screens/customer/CleanerDetail";
import AllReviews from "./screens/customer/AllReviews";
import Confirmed from "./screens/customer/Confirmed";
import Bookings from "./screens/customer/Bookings";
import Account from "./screens/customer/Account";
import Messages from "./screens/customer/Messages";

import Jobs from "./screens/agent/Jobs";
import JobDetail from "./screens/agent/JobDetail";
import Calendar from "./screens/agent/Calendar";
import Referrals from "./screens/agent/Referrals";

function Shell() {
  const { role, accountOpen, closeAccount, refresh, joinProperty, notify } = useStore();
  const nav = useNavigate();
  const { pathname } = useLocation();

  // Consume a pending property-share invite (?join=CODE). Runs once now that the
  // user is authenticated: joins the property, then clears the code so a refresh
  // doesn't retry. joinProperty re-hydrates so the shared property appears.
  const joinTried = useRef(false);
  useEffect(() => {
    if (joinTried.current) return;
    const code = sessionStorage.getItem("pendingJoin");
    if (!code) return;
    joinTried.current = true;
    sessionStorage.removeItem("pendingJoin");
    (async () => {
      const res = await joinProperty(code);
      notify({
        audience: "customer",
        kind: "property_shared",
        title: res.error ? "Couldn't add shared property" : "Property shared with you",
        body: res.error
          ? res.error
          : "You now have access to a property a partner shared — find it under My properties.",
      });
    })();
  }, [joinProperty, notify]);

  // scroll container ref — pull-to-refresh only arms when this is at the top.
  const screenRef = useRef<HTMLDivElement | null>(null);

  // Instagram-style swipe pager between the current side's tabs. Only the tab
  // pages (Book/Bookings, Jobs/Calendar/Refer) are swipeable; detail pages
  // (cleaner, job, reviews, confirmed) fall through to the router below.
  const tabs = role === "agent" ? AGENT_TABS : CUSTOMER_TABS;
  const tabIndex = tabs.indexOf(pathname);
  const onTab = tabIndex !== -1;
  // Play a slide-down exit while keeping the sheet mounted. We flip accountOpen
  // OFF immediately so the island starts rising in sync with the sheet dropping
  // (otherwise the island only animates after the sheet has fully gone).
  const [acctClosing, setAcctClosing] = useState(false);
  function dismissAccount() {
    setAcctClosing(true);
    closeAccount();
    setCloseHidden(false);
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
    // clamp to >= 0: dragging back UP past the start just holds at the top
    // (lets the user pull down then change their mind and keep it open).
    const dy = Math.max(0, e.touches[0].clientY - dragStart.current);
    dragCur.current = dy;
    sheetRef.current.style.transform = `translateY(${dy}px)`;
    // stop the browser's own pull-to-refresh / rubber-band fighting the drag
    if (dy > 0 && e.cancelable) e.preventDefault();
  }
  function onDragEnd() {
    if (dragStart.current == null || !sheetRef.current) return;
    dragStart.current = null;
    const el = sheetRef.current;
    const dy = dragCur.current;
    dragCur.current = 0;
    if (dy > 120) {
      // close: slower, softer glide out (ease-out) so it feels natural, then unmount
      el.style.transition = "transform .42s cubic-bezier(.22,.61,.36,1)";
      el.style.transform = "translateY(100%)";
      setTimeout(() => { closeAccount(); }, 400);
    } else {
      // cancel / snap back to fully open — gentle settle
      el.style.transition = "transform .34s cubic-bezier(.22,.61,.36,1)";
      el.style.transform = "translateY(0)";
    }
  }

  // Same swipe-down-to-dismiss, but driven from the scrollable body: it only
  // arms when the content is already scrolled to the very top, so a normal
  // scroll still scrolls and only an over-pull at the top closes the sheet.
  const scrollElRef = useRef<HTMLDivElement | null>(null);
  // hide the close arrow once the sheet is scrolled (it overlaps content); show
  // again at the top.
  const [closeHidden, setCloseHidden] = useState(false);
  function onSheetScroll() {
    setCloseHidden((scrollElRef.current?.scrollTop ?? 0) > 8);
  }
  const scrollArmed = useRef(false);
  function onScrollTouchStart(e: React.TouchEvent) {
    // Only allow swipe-to-close on the main account view. If a sub-panel is open
    // (Rates & availability, Add property, etc. — rendered as .modal__backdrop
    // over the sheet), don't arm the close gesture.
    const subViewOpen = !!document.querySelector(".acctsheet .modal__backdrop");
    scrollArmed.current = !subViewOpen && (scrollElRef.current?.scrollTop ?? 0) <= 0;
    if (scrollArmed.current) onDragStart(e);
  }
  function onScrollTouchMove(e: React.TouchEvent) {
    if (!scrollArmed.current) return;
    // if they've scrolled down in the meantime, hand control back to scrolling
    if ((scrollElRef.current?.scrollTop ?? 0) > 0) { scrollArmed.current = false; return; }
    onDragMove(e);
  }
  function onScrollTouchEnd() {
    if (!scrollArmed.current) return;
    scrollArmed.current = false;
    onDragEnd();
  }

  // On (re)entering the app after login, land on the side the launch preference
  // selected (role is set from the account's launchSide at login). Only redirect
  // if we're NOT already on a valid route for this side — otherwise a Shell
  // remount (e.g. after a pull-to-refresh re-hydrate) would yank the user back
  // to the default tab instead of leaving them where they were.
  useEffect(() => {
    const onAgent = pathname.startsWith("/agent");
    const onValidSide = role === "agent" ? onAgent : !onAgent;
    if (!onValidSide) nav(role === "agent" ? "/agent/jobs" : "/book");
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
      <div className="screen" ref={screenRef}>
        <PullToRefresh onRefresh={refresh} scrollRef={screenRef}>
          {onTab ? (
            // Swipeable tab pages — drag left/right to move between this side's
            // tabs, Instagram-style (finger-tracking, snap on release).
            <SwipePager
              index={tabIndex}
              count={tabs.length}
              onIndexChange={(next) => nav(tabs[next])}
              onProgress={(f) => {
                const r = document.documentElement;
                r.style.setProperty("--swipe", String(f));
                // "dragging" = mid-drag (0 < |f| < 1): suppress the colour
                // transition for 1:1 tracking. At |f|==1 (committed on release)
                // or 0 (rest/cancel) let the transition run so the colour glides
                // to the target in sync with the page settle.
                if (Math.abs(f) > 0 && Math.abs(f) < 1) r.setAttribute("data-dragging", "1");
                else r.removeAttribute("data-dragging");
                // data-swiping = any active swipe incl. the committed settle, used
                // to keep the OLD pill's solid .active background hidden until the
                // route swaps (otherwise it flashes back on for the settle window).
                if (f !== 0) r.setAttribute("data-swiping", "1");
                else r.removeAttribute("data-swiping");
              }}
              renderPage={(i) => TAB_PAGE[tabs[i]]()}
            />
          ) : (
            // Detail / flow pages keep the router + fade transition.
            <div className="fadein" key={pathname}>
              <Routes>
                <Route path="/cleaners" element={<CleanerList />} />
                <Route path="/cleaner/:id" element={<CleanerDetail />} />
                <Route path="/reviews/:id" element={<AllReviews />} />
                <Route path="/confirmed/:id" element={<Confirmed />} />
                <Route path="/agent/job/:id" element={<JobDetail />} />
                <Route path="*" element={<Navigate to="/book" replace />} />
              </Routes>
            </div>
          )}
        </PullToRefresh>
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
            <button className={"acctsheet__close" + (closeHidden ? " hidden" : "")} onClick={dismissAccount} aria-label="Close account">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
            </button>
            <div className="acctsheet__scroll" ref={scrollElRef} onScroll={onSheetScroll}
              onTouchStart={onScrollTouchStart} onTouchMove={onScrollTouchMove} onTouchEnd={onScrollTouchEnd}>
              <Account />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function LockScreen({ onUnlock }: { onUnlock: () => void }) {
  const { loginWithBiometric, biometricEmail } = useStore();
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  // Guard so the Face ID prompt fires AT MOST once — StrictMode double-effects or
  // a re-mount during auth hydration were triggering it twice in a row.
  const scanned = useRef(false);

  async function scan() {
    if (scanned.current) return;
    scanned.current = true;
    setErr(""); setBusy(true);
    // Demo account has no real credential — resolve instantly like before.
    if (biometricEmail === "savvas@cinderella.cy") { onUnlock(); return; }
    const res = await loginWithBiometric(); // real Face ID / Touch ID prompt
    setBusy(false);
    if (res.error) { setErr(res.error); scanned.current = false; } // allow retry
    else onUnlock();
  }
  // auto-trigger the real prompt on mount (once)
  useEffect(() => { scan(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="lockscreen">
      <div className="bioscan">
        <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 8V6.5A2.5 2.5 0 0 1 6.5 4H8" /><path d="M16 4h1.5A2.5 2.5 0 0 1 20 6.5V8" />
          <path d="M20 16v1.5a2.5 2.5 0 0 1-2.5 2.5H16" /><path d="M8 20H6.5A2.5 2.5 0 0 1 4 17.5V16" />
          <path d="M9 9.5v1" /><path d="M15 9.5v1" /><path d="M9.3 15.2a4 4 0 0 0 5.4 0" />
        </svg>
      </div>
      <b style={{ fontSize: 16 }}>{busy ? "Unlocking…" : "Locked"}</b>
      <p className="sub" style={{ marginTop: 4 }}>{err || "Verifying it's you"}</p>
      {err && <button className="btn" style={{ marginTop: 16 }} onClick={scan}>Try Face ID again</button>}
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
