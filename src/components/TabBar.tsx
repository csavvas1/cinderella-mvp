import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useStore } from "../context/AppStore";

// Clean line icons (Instagram/Facebook style). `filled` renders the active state.
function Icon({ name, filled }: { name: string; filled: boolean }) {
  const s = { fill: filled ? "currentColor" : "none", stroke: "currentColor", strokeWidth: filled ? 0 : 1.9, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const P = (d: string) => <path d={d} {...s} />;
  switch (name) {
    case "search": // Book (magnifier)
      return <svg viewBox="0 0 24 24" width="24" height="24"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="1.9" /><path d="M20 20l-3.2-3.2" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" /></svg>;
    case "search-wolt": // Wolt-style chunky magnifier (bolder rings + thick handle)
      return <svg viewBox="0 0 24 24" width="24" height="24"><circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" strokeWidth="2.6" /><path d="M19.5 19.5l-4-4" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" /></svg>;
    case "earn": // plain € symbol — earnings (work + referral)
      return <svg viewBox="0 0 24 24" width="24" height="24">
        <text x="12" y="18" textAnchor="middle" fontSize="19" fontWeight="800" fill="currentColor" fontFamily="-apple-system, Segoe UI, Roboto, sans-serif">€</text>
      </svg>;
    case "calendar":
      return filled
        ? <svg viewBox="0 0 24 24" width="24" height="24"><rect x="3" y="4.5" width="18" height="16" rx="3" fill="currentColor" /><path d="M8 2.5v4M16 2.5v4" stroke="#fff" strokeWidth="1.9" strokeLinecap="round" /><rect x="3" y="8.5" width="18" height="1.6" fill="#fff" /></svg>
        : <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4.5" width="18" height="16" rx="3" /><path d="M8 2.5v4M16 2.5v4M3 9h18" /></svg>;
    case "user": // Account
      return filled
        ? <svg viewBox="0 0 24 24" width="24" height="24"><circle cx="12" cy="8" r="4" fill="currentColor" /><path d="M4 20c0-3.9 3.6-6.5 8-6.5s8 2.6 8 6.5Z" fill="currentColor" /></svg>
        : <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4" /><path d="M4 20c0-3.9 3.6-6.5 8-6.5s8 2.6 8 6.5" /></svg>;
    case "jobs": // Agent jobs (briefcase)
      return filled
        ? <svg viewBox="0 0 24 24" width="24" height="24"><rect x="3" y="7.5" width="18" height="12" rx="2.5" fill="currentColor" /><path d="M9 7.5V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1.5" fill="none" stroke="currentColor" strokeWidth="1.9" /></svg>
        : <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="7.5" width="18" height="12" rx="2.5" /><path d="M9 7.5V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1.5M3 12h18" /></svg>;
    case "refer": // Refer (gift)
      return filled
        ? <svg viewBox="0 0 24 24" width="24" height="24"><rect x="3.5" y="9" width="17" height="11" rx="2" fill="currentColor" /><path d="M3 8h18v3H3z" fill="currentColor" /><path d="M12 8v12" stroke="#fff" strokeWidth="1.6" /><path d="M12 8c-1.5-3-5-3-5-1s2.5 1 5 1Zm0 0c1.5-3 5-3 5-1s-2.5 1-5 1Z" fill="none" stroke="currentColor" strokeWidth="1.7" /></svg>
        : <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3.5" y="9" width="17" height="11" rx="2" /><path d="M3 9h18v3H3zM12 9v11M12 9c-1.5-3-5-3-5-1s2.5 1 5 1Zm0 0c1.5-3 5-3 5-1s-2.5 1-5 1Z" /></svg>;
    default:
      return null;
  }
}

// Account is reached via the top-left profile icon (see AppBar), not a bottom
// tab — so both sides show only their core navigation here.
const AGENT_TABS = [
  { to: "/agent/jobs", ic: "jobs", label: "Jobs" },
  { to: "/agent/calendar", ic: "calendar", label: "Calendar" },
  { to: "/agent/referrals", ic: "refer", label: "Refer" },
];

export default function TabBar() {
  const { role, accountOpen, agentBadge, customerBadge } = useStore();
  const nav = useNavigate();
  const { pathname } = useLocation();
  const agent = role === "agent";
  const isActive = (to: string) => pathname === to || pathname.startsWith(to + "/");

  // Rise the island up from the bottom when the account sheet closes (the page
  // behind — Book/Jobs — comes back into view), Wolt-style.
  const [islandAnim, setIslandAnim] = useState(false);
  const prevOpen = useRef(accountOpen);
  useEffect(() => {
    if (prevOpen.current && !accountOpen) {
      setIslandAnim(true);
      const t = setTimeout(() => setIslandAnim(false), 420);
      prevOpen.current = accountOpen;
      return () => clearTimeout(t);
    }
    prevOpen.current = accountOpen;
  }, [accountOpen]);

  // Note: no role-switch animation — the island changes width (Customer has 2
  // buttons, Agent has 3), so any transform-based swap reflows mid-motion and
  // looks janky. An instant swap is cleaner. Account-close rise + tap feedback
  // remain.

  // scroll the current page back to the top (used when tapping the pill for the
  // page you're already on, so the tap isn't a dead no-op)
  function scrollTop() {
    document.querySelector(".screen")?.scrollTo({ top: 0, behavior: "smooth" });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // Icon pop fires ONLY on a real tab tap (not on the account-close rise or any
  // other re-render). `popped` names the button whose icon should pop right now.
  const [popped, setPopped] = useState<string | null>(null);
  function tap(key: string, go: () => void) {
    setPopped(key);
    setTimeout(() => setPopped((k) => (k === key ? null : k)), 400);
    go();
  }
  const popCls = (key: string) => (popped === key ? " wolt__pop" : "");

  // ---- sliding colour blob ----
  // Position a single accent block under the active pill and, while the user
  // drags (--swipe on :root, set by SwipePager), slide + resize it toward the
  // neighbour pill 1:1 with the finger. Uses a rAF loop reading the CSS var so
  // there are no per-frame React re-renders.
  const islandRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const island = islandRef.current;
    if (!island) return;
    const blob = island.querySelector<HTMLDivElement>(".wolt__blob");
    if (!blob) return;
    const pills = () => Array.from(island.querySelectorAll<HTMLElement>(".wolt__pill, .wolt__round"));

    // rect of a pill relative to the island's content box
    const rectOf = (el: HTMLElement) => {
      const ir = island.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      return { x: r.left - ir.left, w: r.width };
    };
    const activeEl = () => pills().find((p) => p.classList.contains("active")) ?? pills()[0];

    const place = () => {
      const list = pills();
      const active = activeEl();
      if (!active) return;
      const a = rectOf(active);
      const swipe = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--swipe")) || 0;
      let x = a.x, w = a.w;
      if (swipe !== 0) {
        const ai = list.indexOf(active);
        // swipe<0 => toward NEXT (higher index); swipe>0 => toward PREV (lower)
        const targetIdx = swipe < 0 ? ai + 1 : ai - 1;
        const target = list[targetIdx];
        if (target) {
          const t = rectOf(target);
          const f = Math.min(1, Math.abs(swipe));
          x = a.x + (t.x - a.x) * f;
          w = a.w + (t.w - a.w) * f;
        }
      }
      blob.style.setProperty("--blob-x", `${x}px`);
      blob.style.setProperty("--blob-w", `${w}px`);
    };

    place();
    let raf = 0;
    const loop = () => { place(); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [pathname, agent, accountOpen]);

  function CustomerContent() {
    const calActive = isActive("/bookings");
    const bookActive = !calActive;
    // active tab index (Search=0, Calendar=1); data-rel = pill index minus active,
    // clamped to -1/0/1, so the swipe colour handoff knows prev/active/next.
    const activeIdx = calActive ? 1 : 0;
    const rel = (i: number) => Math.max(-1, Math.min(1, i - activeIdx));
    return (
      <>
        <button data-rel={rel(0)} className={"wolt__pill" + (bookActive ? " active" : "") + popCls("c-book")}
          onClick={() => tap("c-book", () => (isActive("/book") ? scrollTop() : nav("/book")))}>
          <span className="ic"><Icon name="search-wolt" filled /></span>
          <span>Search</span>
        </button>
        <button data-rel={rel(1)} className={"wolt__round wolt__round--badged" + (calActive ? " active" : "") + popCls("c-cal")} onClick={() => tap("c-cal", () => nav("/bookings"))} aria-label="Calendar" title="Calendar">
          <span className="ic"><Icon name="calendar" filled={calActive} /></span>
          {customerBadge > 0 && <span className="notifbadge notifbadge--ondark">{customerBadge > 9 ? "9+" : customerBadge}</span>}
        </button>
      </>
    );
  }

  function AgentContent() {
    const jobsActive = isActive("/agent/jobs");
    const calActive = isActive("/agent/calendar");
    const referActive = isActive("/agent/referrals");
    // active tab index (Jobs=0, Calendar=1, Refer=2); data-rel = clamp(i - active).
    const activeIdx = referActive ? 2 : calActive ? 1 : 0;
    const rel = (i: number) => Math.max(-1, Math.min(1, i - activeIdx));
    return (
      <>
        <button data-rel={rel(0)} className={"wolt__pill wolt__pill--agent wolt__pill--badged" + (jobsActive ? " active" : "") + popCls("a-jobs")}
          onClick={() => tap("a-jobs", () => (jobsActive ? scrollTop() : nav("/agent/jobs")))}>
          <span className="ic"><Icon name="jobs" filled /></span>
          <span>Jobs</span>
          {agentBadge > 0 && <span className="notifbadge notifbadge--ondark">{agentBadge > 9 ? "9+" : agentBadge}</span>}
        </button>
        <button data-rel={rel(1)} className={"wolt__round" + (calActive ? " active" : "") + popCls("a-cal")} onClick={() => tap("a-cal", () => nav("/agent/calendar"))} aria-label="Calendar" title="Calendar">
          <span className="ic"><Icon name="calendar" filled={calActive} /></span>
        </button>
        <button data-rel={rel(2)} className={"wolt__round" + (referActive ? " active" : "") + popCls("a-earn")} onClick={() => tap("a-earn", () => nav("/agent/referrals"))} aria-label="Earnings" title="Earnings">
          <span className="ic"><Icon name="earn" filled={referActive} /></span>
        </button>
      </>
    );
  }

  // current island: rise up when the account sheet closes
  const enterAnim = islandAnim ? " woltrise" : "";

  return (
    <div className={"wolt" + enterAnim} ref={islandRef} data-agentside={agent ? "1" : "0"}>
      <div className="wolt__blob" />
      {agent ? <AgentContent /> : <CustomerContent />}
    </div>
  );
}
