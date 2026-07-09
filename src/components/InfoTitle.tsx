import { useState, type ReactNode } from "react";

export default function InfoTitle({ title, info }: { title: string; info: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="infotitle">
        <span className="label" style={{ margin: 0 }}>{title}</span>
        <button className="infobtn" onClick={() => setOpen(true)} aria-label="More info" title="More info">i</button>
      </div>
      {open && (
        <div className="modal__backdrop center" onClick={() => setOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="between" style={{ marginBottom: 10 }}>
              <b style={{ fontSize: 15 }}>{title}</b>
              <button className="iconbtn" onClick={() => setOpen(false)}>✕</button>
            </div>
            <div className="sub" style={{ margin: 0 }}>{info}</div>
          </div>
        </div>
      )}
    </>
  );
}
