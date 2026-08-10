import { useEffect, useMemo, useRef, useState } from "react";
import { X, ChevronRight } from "lucide-react";
import { useLocation } from "react-router-dom";
import BackButton from "../../components/BackButton";
import PlatformIcon from "../../components/PlatformIcon";
import { useStore } from "../../context/AppStore";
import { QUICK_REPLIES } from "../../data/messages";
import type { ChatMessage, ChatThread } from "../../types";

function timeLabel(at: number) { return new Date(at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }); }
function dayLabel(at: number) { return new Date(at).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short", year: "numeric" }); }

function ThreadAvatar({ t, size = 30 }: { t: ChatThread; size?: number }) {
  if (t.kind === "cleaner") {
    return (
      <span className="threadrow__cleaner" style={{ width: size, height: size }}>
        <svg viewBox="0 0 24 24" width={size * 0.6} height={size * 0.6} fill="currentColor"><circle cx="12" cy="8" r="4" /><path d="M4 20c0-3.9 3.6-6.5 8-6.5s8 2.6 8 6.5Z" /></svg>
      </span>
    );
  }
  return <PlatformIcon platform={t.platform} size={size} />;
}

export default function Messages() {
  const { messageThreads, markThreadRead } = useStore();
  const loc = useLocation();
  // allow deep-link: /messages?thread=ID
  const initial = new URLSearchParams(loc.search).get("thread");
  const [openId, setOpenId] = useState<string | null>(initial);
  const openThread = messageThreads.find((t) => t.id === openId) || null;

  function open(id: string) { markThreadRead(id); setOpenId(id); }

  // An open thread renders its own sticky header (back + name + property) and a
  // full-height chat column, so it does NOT use the .pad wrapper — the header
  // must pin to the top without needing to scroll up to reach the back button.
  if (openThread) return <Thread thread={openThread} onBack={() => setOpenId(null)} />;

  return (
    <div className="pad">
      <div className="between" style={{ marginBottom: 10 }}>
        <BackButton />
      </div>
      <ThreadList onOpen={open} />
    </div>
  );
}

function ThreadList({ onOpen }: { onOpen: (id: string) => void }) {
  const { messageThreads, pro } = useStore();
  const [q, setQ] = useState("");
  const [autoOpen, setAutoOpen] = useState(false);
  const list = useMemo(
    () => [...messageThreads]
      .filter((t) => (t.guest + t.subject + t.property).toLowerCase().includes(q.toLowerCase()))
      .sort((a, b) => b.lastAt - a.lastAt),
    [messageThreads, q]
  );
  return (
    <>
      <div className="between" style={{ marginBottom: 10 }}>
        <h1 className="h1" style={{ margin: 0 }}>Messages</h1>
        {pro && <button className="btn sm secondary" onClick={() => setAutoOpen(true)}>+ Automation</button>}
      </div>
      <input className="input" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 10 }} />
      {list.length === 0 && <div className="note">No messages yet.</div>}
      {list.map((t) => (
        <button key={t.id} className="threadrow" onClick={() => onOpen(t.id)}>
          <span className="threadrow__av"><ThreadAvatar t={t} /></span>
          <div className="grow" style={{ minWidth: 0 }}>
            <div className="between">
              <b style={{ fontSize: 14 }}>{t.guest}</b>
              <span className="tiny muted">{new Date(t.lastAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>
            </div>
            <div className="tiny muted" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.subject}</div>
            {t.dateRange && <div className="tiny muted">{t.dateRange}</div>}
          </div>
          {t.unread && <span className="threadrow__dot" />}
        </button>
      ))}
      {autoOpen && <AutomationModal onClose={() => setAutoOpen(false)} />}
    </>
  );
}

function Thread({ thread, onBack }: { thread: ChatThread; onBack: () => void }) {
  const { messages, addMessage, myUid, nameForUid, jobs } = useStore();
  const msgs = useMemo(
    () => messages.filter((m) => m.threadId === thread.id).sort((a, b) => a.at - b.at),
    [messages, thread.id]
  );
  const [draft, setDraft] = useState("");
  const [showQuick, setShowQuick] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // keep the view pinned to the newest message
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [msgs.length]);

  // resolve the counterparty + the linked job (for property + finished state)
  const otherUid = thread.customerId && thread.cleanerUid
    ? (thread.customerId === myUid ? thread.cleanerUid : thread.customerId)
    : undefined;
  const displayName = (otherUid && nameForUid(otherUid)) || thread.guest || "Chat";
  const job = thread.jobId ? jobs.find((j) => j.id === thread.jobId) : undefined;
  const propertyLine = job?.address || thread.property || "";
  const finished = job ? (job.status === "completed" || job.status === "cancelled" || job.status === "declined") : false;

  function send(text: string) {
    const body = text.trim();
    if (!body || finished) return;
    addMessage(thread.id, { id: crypto.randomUUID(), threadId: thread.id, from: "host", senderUid: myUid ?? undefined, body, at: Date.now(), channel: thread.kind === "cleaner" ? "airbnb" : "email" });
    setDraft(""); setShowQuick(false);
  }

  // "mine" by author uid so both sides see their own on the right (Messenger).
  const isMine = (m: ChatMessage) => (m.senderUid ? m.senderUid === myUid : m.from === "host");

  let lastDay = "";
  return (
    <div className="chatview">
      {/* sticky header — always reachable without scrolling */}
      <div className="chathead">
        <button className="chathead__back" onClick={onBack} aria-label="Back">
          <svg viewBox="0 0 24 24" width="20" height="20"><path d="M15 4 L7 12 L15 20" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
        <span className="chathead__av"><ThreadAvatar t={thread} size={36} /></span>
        <div className="chathead__meta">
          <b className="chathead__name">{displayName}</b>
          {propertyLine && <div className="chathead__sub">{propertyLine}</div>}
        </div>
      </div>

      <div className="chatscroll chatview__scroll" ref={scrollRef}>
        {msgs.map((m) => {
          const day = dayLabel(m.at);
          const sep = day !== lastDay; lastDay = day;
          return (
            <div key={m.id}>
              {sep && <div className="msgdaysep">{day}</div>}
              <div className={"bubble " + (isMine(m) ? "me" : "them")}>
                {m.title && <b style={{ display: "block", marginBottom: 4 }}>{m.title}</b>}
                <span style={{ whiteSpace: "pre-wrap" }}>{m.body}</span>
                <div className="bubble__t">{timeLabel(m.at)}</div>
              </div>
            </div>
          );
        })}
      </div>

      {showQuick && !finished && (
        <div className="quickreplies">
          {QUICK_REPLIES.map((qr, i) => <button key={i} className="quickreplies__item" onClick={() => send(qr)}>{qr}</button>)}
        </div>
      )}

      {finished ? (
        <div className="chatfinished">This booking is finished — messaging is closed.</div>
      ) : (
        <>
          <div className="chatbar chatview__bar">
            <button className="chatbar__quick" onClick={() => setShowQuick((v) => !v)} aria-label="Quick replies">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z" /></svg>
            </button>
            <input className="input" placeholder="Message…" value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(draft); } }} />
            <button className="chatbar__send" onClick={() => send(draft)} disabled={!draft.trim()} aria-label="Send">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M3.4 20.6 21 12 3.4 3.4 3 10l12 2-12 2Z" /></svg>
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function AutomationModal({ onClose }: { onClose: () => void }) {
  const { autoMessageTemplate, setAutoMessageTemplate } = useStore();
  const [editing, setEditing] = useState(false);
  const [tpl, setTpl] = useState(autoMessageTemplate);

  if (editing) {
    return (
      <div className="modal__backdrop" onClick={onClose}>
        <div className="modal tall" onClick={(e) => e.stopPropagation()}>
          <div className="between" style={{ marginBottom: 8 }}>
            <b style={{ fontSize: 15 }}>Auto message on booking</b>
            <button className="iconbtn" onClick={onClose} aria-label="Close"><X size={16} /></button>
          </div>
          <p className="sub" style={{ marginTop: 0 }}>Sent automatically when a booking is created. Use {"{guest}"}, {"{property}"}, {"{date}"}, {"{cleaner}"}.</p>
          <textarea className="input" style={{ minHeight: 160, resize: "vertical" }} value={tpl} onChange={(e) => setTpl(e.target.value)} />
          <div style={{ height: 12 }} />
          <button className="btn" onClick={() => { setAutoMessageTemplate(tpl); onClose(); }}>Save template</button>
        </div>
      </div>
    );
  }

  const rows: [string, string, (() => void)?][] = [
    ["Scheduled messages", "Messages automatically sent for each of your bookings.", () => setEditing(true)],
    ["Quick replies", "Pre-written replies for common questions."],
    ["Manage languages", "Languages you can edit for your scheduled and quick messages."],
  ];
  return (
    <div className="modal__backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div style={{ textAlign: "center", marginBottom: 12 }}><b style={{ fontSize: 15, letterSpacing: 0.5 }}>AUTOMATE MESSAGING</b></div>
        {rows.map(([t, d, fn]) => (
          <button key={t} className="card row between" style={{ width: "100%", marginBottom: 10, cursor: "pointer" }} onClick={fn ?? onClose}>
            <div style={{ textAlign: "left" }}>
              <b style={{ fontSize: 14 }}>{t}</b>
              <div className="tiny muted">{d}</div>
            </div>
            <span className="dayrow__chev"><ChevronRight size={16} /></span>
          </button>
        ))}
      </div>
    </div>
  );
}
