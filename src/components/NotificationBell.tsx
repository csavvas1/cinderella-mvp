import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useStore } from "../context/AppStore";
import { useClickOutside } from "../hooks/useClickOutside";
import type { AppNotification } from "../types";

// Relative "2m ago" / "3h ago" / "Yesterday" label from an epoch timestamp.
function timeAgo(ms: number): string {
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return d === 1 ? "yesterday" : `${d}d ago`;
}

// Line-icon per notification kind (no emojis). All 24x24 stroke icons.
function KindIcon({ kind }: { kind: string }) {
  const p = (d: string) => <path d={d} />;
  const svg = (children: React.ReactNode) => (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{children}</svg>
  );
  switch (kind) {
    case "booking_accepted":
    case "job_completed":
      return svg(p("M20 6 9 17l-5-5"));                                  // check
    case "booking_declined":
    case "booking_cancelled":
      return svg(<>{p("M18 6 6 18")}{p("M6 6l12 12")}</>);              // x
    case "booking_modified":
      return svg(<>{p("M12 20h9")}{p("M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z")}</>); // pencil
    case "refund_requested":
    case "refund_resolved":
      return svg(<>{p("M4 3h16v18l-3-2-3 2-3-2-3 2Z")}{p("M9 8h6")}{p("M9 12h6")}</>); // receipt
    case "review_new":
      return svg(p("M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 17l-5.2 2.6 1-5.8L3.5 9.7l5.9-.9Z")); // star
    case "tip_new":
      return svg(p("M20.8 8.6a5 5 0 0 0-8.8-3 5 5 0 0 0-8.8 3c0 4.5 8.8 9.7 8.8 9.7s8.8-5.2 8.8-9.7Z")); // heart
    case "booking_new":
    default:
      return svg(<>{p("M3 4.5h18v16H3Z")}{p("M8 2.5v4M16 2.5v4M3 9h18")}</>); // calendar
  }
}

export default function NotificationBell() {
  const { role, notifications, unreadCount, markNotificationsRead, clearNotifications } = useStore();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useClickOutside<HTMLDivElement>(open, () => setOpen(false));

  function toggle() {
    const next = !open;
    setOpen(next);
    // Opening the panel marks the current side's alerts as read.
    if (next && unreadCount > 0) markNotificationsRead(role);
  }

  function openNotif(n: AppNotification) {
    setOpen(false);
    if (role === "agent") {
      // agent alerts deep-link to the job; fall back to the jobs list
      if (n.jobId) nav("/agent/job/" + n.jobId);
      else nav("/agent/jobs");
    } else {
      // customer alerts deep-link to the specific booking in the calendar. Stash
      // the target so Bookings can highlight/scroll to it, then navigate.
      if (n.bookingId) sessionStorage.setItem("focus-booking", n.bookingId);
      nav("/bookings");
    }
  }

  return (
    <div className="notifbell" ref={ref}>
      <button className="notifbell__btn" onClick={toggle} aria-label="Notifications">
        <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unreadCount > 0 && <span className="notifbadge notifbadge--ondark">{unreadCount > 9 ? "9+" : unreadCount}</span>}
      </button>

      {open && (
        <div className="notifpop">
          <div className="notifpop__head">
            <b>Notifications</b>
            {notifications.length > 0 && (
              <button className="notifpop__clear" onClick={() => clearNotifications(role)}>Clear all</button>
            )}
          </div>
          {notifications.length === 0 ? (
            <div className="notifpop__empty">
              <b style={{ fontSize: 13 }}>You're all caught up</b>
              <div className="tiny muted" style={{ marginTop: 2 }}>New activity will show up here.</div>
            </div>
          ) : (
            <div className="notifpop__list">
              {notifications.map((n) => (
                <button key={n.id} className={"notifitem" + (n.read ? "" : " unread")} onClick={() => openNotif(n)}>
                  <span className="notifitem__ic"><KindIcon kind={n.kind} /></span>
                  <span className="notifitem__body">
                    <span className="notifitem__title">{n.title}</span>
                    <span className="notifitem__text">{n.body}</span>
                    <span className="notifitem__time">{timeAgo(n.createdAt)}</span>
                  </span>
                  {!n.read && <span className="notifitem__dot" />}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
