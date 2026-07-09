import { getLegalDoc } from "../data/legal";

// Minimal, safe markdown-ish renderer for the legal doc bodies. Supports
// #/##/### headings, bold **..**, bullet lists, and paragraphs. No raw HTML is
// injected — everything is rendered as React text nodes.
function renderInline(text: string, keyBase: string) {
  // split on **bold**
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) => {
    if (p.startsWith("**") && p.endsWith("**")) {
      return <b key={keyBase + i}>{p.slice(2, -2)}</b>;
    }
    return <span key={keyBase + i}>{p}</span>;
  });
}

function renderBody(body: string) {
  const lines = body.split("\n");
  const out: React.ReactNode[] = [];
  let list: string[] = [];
  const flushList = (k: string) => {
    if (list.length) {
      out.push(
        <ul key={"ul" + k} className="legal__ul">
          {list.map((li, i) => <li key={i}>{renderInline(li, k + "li" + i)}</li>)}
        </ul>
      );
      list = [];
    }
  };
  lines.forEach((raw, idx) => {
    const line = raw.trimEnd();
    const k = "l" + idx;
    if (/^###\s+/.test(line)) { flushList(k); out.push(<h4 key={k} className="legal__h4">{line.replace(/^###\s+/, "")}</h4>); }
    else if (/^##\s+/.test(line)) { flushList(k); out.push(<h3 key={k} className="legal__h3">{line.replace(/^##\s+/, "")}</h3>); }
    else if (/^#\s+/.test(line)) { flushList(k); out.push(<h2 key={k} className="legal__h2">{line.replace(/^#\s+/, "")}</h2>); }
    else if (/^-\s+/.test(line)) { list.push(line.replace(/^-\s+/, "")); }
    else if (line === "") { flushList(k); }
    else if (/^_.*_$/.test(line)) { flushList(k); out.push(<p key={k} className="legal__note">{line.replace(/^_|_$/g, "")}</p>); }
    else { flushList(k); out.push(<p key={k} className="legal__p">{renderInline(line, k)}</p>); }
  });
  flushList("end");
  return out;
}

export default function LegalDocModal({ docId, onClose }: { docId: string; onClose: () => void }) {
  const doc = getLegalDoc(docId);
  if (!doc) return null;
  return (
    <div className="modal__backdrop" onClick={onClose}>
      <div className="modal tall legal" onClick={(e) => e.stopPropagation()}>
        <div className="between" style={{ marginBottom: 8 }}>
          <b style={{ fontSize: 16, color: "var(--text)" }}>{doc.title}</b>
          <button className="iconbtn" onClick={onClose}>✕</button>
        </div>
        <div className="legal__scroll">{renderBody(doc.body)}</div>
        <div style={{ height: 12 }} />
        <button className="btn" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}
