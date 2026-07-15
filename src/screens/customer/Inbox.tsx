import { useMemo, useState } from "react";
import BackButton from "../../components/BackButton";
import PlatformIcon from "../../components/PlatformIcon";
import { SEED_THREADS, SEED_MESSAGES, QUICK_REPLIES } from "../../data/messages";
import type { ChatMessage, ChatThread } from "../../types";

function timeLabel(at: number) {
  return new Date(at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}
function dayLabel(at: number) {
  return new Date(at).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short", year: "numeric" });
}

export default function Inbox() {
  const [openId, setOpenId] = useState<string | null>(null);
  const openThread = SEED_THREADS.find((t) => t.id === openId) || null;

  return (
    <div className="pad">
      <div className="between" style={{ marginBottom: 10 }}>
        {openThread
          ? <button className="backbtn" onClick={() => setOpenId(null)}><span className="backbtn__ic"><svg viewBox="0 0 24 24" width="15" height="15"><path d="M15 4 L7 12 L15 20" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg></span><span>Inbox</span></button>
          : <BackButton />}
      </div>

      {openThread ? <Thread thread={openThread} /> : <ThreadList onOpen={setOpenId} />}
    </div>
  );
}

function ThreadList({ onOpen }: { onOpen: (id: string) => void }) {
  const [q, setQ] = useState("");
  const [autoOpen, setAutoOpen] = useState(false);
  const list = useMemo(
    () => SEED_THREADS.filter((t) => (t.guest + t.subject + t.property).toLowerCase().includes(q.toLowerCase())),
    [q]
  );
  return (
    <>
      <div className="between" style={{ marginBottom: 10 }}>
        <h1 className="h1" style={{ margin: 0 }}>Inbox</h1>
        <button className="btn sm secondary" onClick={() => setAutoOpen(true)}>+ Automation</button>
      </div>
      <input className="input" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 10 }} />
      {list.map((t) => (
        <button key={t.id} className="threadrow" onClick={() => onOpen(t.id)}>
          <span className="threadrow__av"><PlatformIcon platform={t.platform} size={30} /></span>
          <div className="grow" style={{ minWidth: 0 }}>
            <div className="between">
              <b style={{ fontSize: 14 }}>{t.guest}</b>
              <span className="tiny muted">{new Date(t.lastAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>
            </div>
            <div className="tiny muted" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.subject}</div>
            <div className="tiny muted">{t.dateRange}</div>
          </div>
          {t.unread && <span className="threadrow__dot" />}
        </button>
      ))}
      {autoOpen && <AutomationModal onClose={() => setAutoOpen(false)} />}
    </>
  );
}

function Thread({ thread }: { thread: ChatThread }) {
  const [msgs, setMsgs] = useState<ChatMessage[]>(
    () => SEED_MESSAGES.filter((m) => m.threadId === thread.id).sort((a, b) => a.at - b.at)
  );
  const [draft, setDraft] = useState("");
  const [showQuick, setShowQuick] = useState(false);

  function send(text: string) {
    const body = text.trim();
    if (!body) return;
    setMsgs((p) => [...p, { id: crypto.randomUUID(), threadId: thread.id, from: "host", body, at: Date.now(), channel: "email" }]);
    setDraft("");
    setShowQuick(false);
  }
  function generateAI() {
    setMsgs((p) => [...p, { id: crypto.randomUUID(), threadId: thread.id, from: "host", body: "Hi " + thread.guest.split(" ")[0] + ",\n\nThanks for your message — happy to help! Let me know if there's anything else you need for your stay.\n\nWarm regards,\nThe Cinderella Team", at: Date.now(), channel: "email", aiReply: true }]);
  }

  // group by calendar day for the date separators
  let lastDay = "";
  return (
    <>
      <div className="row" style={{ gap: 10, marginBottom: 10 }}>
        <PlatformIcon platform={thread.platform} size={34} />
        <div>
          <b style={{ fontSize: 15 }}>{thread.guest}</b>
          <div className="tiny muted">{thread.property} · {thread.dateRange}</div>
        </div>
      </div>

      <div className="chatscroll inboxscroll">
        {msgs.map((m) => {
          const day = dayLabel(m.at);
          const sep = day !== lastDay; lastDay = day;
          return (
            <div key={m.id}>
              {sep && <div className="msgdaysep">{day}</div>}
              <div className={"bubble " + (m.from === "host" ? "me" : "them")}>
                {m.title && <b style={{ display: "block", marginBottom: 4 }}>{m.title}</b>}
                <span style={{ whiteSpace: "pre-wrap" }}>{m.body}</span>
                <div className="bubble__t">{timeLabel(m.at)}</div>
                <div className="msgtags">
                  {m.channel === "email" && <span className="msgtag msgtag--ok">Email · sent</span>}
                  {m.automated && <span className="msgtag">Automated</span>}
                  {m.aiReply && <span className="msgtag msgtag--ai">AI reply</span>}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {showQuick && (
        <div className="quickreplies">
          {QUICK_REPLIES.map((qr, i) => (
            <button key={i} className="quickreplies__item" onClick={() => send(qr)}>{qr}</button>
          ))}
        </div>
      )}

      <div className="chatbar inboxbar">
        <input className="input" placeholder="Write a message…" value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send(draft); }} />
        <button className="btn sm" onClick={() => send(draft)}>Send</button>
      </div>
      <div className="row" style={{ gap: 16, marginTop: 8 }}>
        <button className="linkbtn" onClick={() => setShowQuick((v) => !v)}>Quick replies</button>
        <button className="linkbtn" onClick={generateAI}>✨ Generate with AI</button>
      </div>
    </>
  );
}

function AutomationModal({ onClose }: { onClose: () => void }) {
  const rows = [
    ["Scheduled messages", "Messages automatically sent for each of your bookings."],
    ["Quick replies", "Pre-written replies for common questions."],
    ["Manage languages", "Languages you can edit for your scheduled and quick messages."],
  ];
  return (
    <div className="modal__backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div style={{ textAlign: "center", marginBottom: 12 }}><b style={{ fontSize: 15, letterSpacing: 0.5 }}>AUTOMATE MESSAGING</b></div>
        {rows.map(([t, d]) => (
          <button key={t} className="card row between" style={{ width: "100%", marginBottom: 10, cursor: "pointer" }} onClick={onClose}>
            <div style={{ textAlign: "left" }}>
              <b style={{ fontSize: 14 }}>{t}</b>
              <div className="tiny muted">{d}</div>
            </div>
            <span className="dayrow__chev">›</span>
          </button>
        ))}
      </div>
    </div>
  );
}
