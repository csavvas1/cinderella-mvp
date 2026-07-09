import { useState } from "react";

export interface CapturedPhoto {
  id: string;
  takenAt: string;   // ISO timestamp stamped at capture
  label?: string;    // e.g. "Front", "Back"
}

// Mock in-app camera. Real version: getUserMedia / native camera.
// `steps` turns it into a guided sequence (e.g. ["Front","Back"]) — one shot
// per step. Without `steps` it's free multi-capture (used for proof photos).
export default function CameraCapture({
  title = "Take photo",
  steps,
  onClose,
  onDone,
}: {
  title?: string;
  steps?: string[];
  onClose: () => void;
  onDone: (photos: CapturedPhoto[]) => void;
}) {
  const [photos, setPhotos] = useState<CapturedPhoto[]>([]);
  const [flash, setFlash] = useState(false);

  const guided = !!steps && steps.length > 0;
  const stepIdx = photos.length;
  const currentLabel = guided ? steps![Math.min(stepIdx, steps!.length - 1)] : undefined;
  const guidedDone = guided && photos.length >= steps!.length;
  const canFinish = guided ? guidedDone : photos.length > 0;

  function capture() {
    if (guided && guidedDone) return;
    setFlash(true);
    setTimeout(() => setFlash(false), 150);
    setPhotos((p) => [...p, { id: "ph" + Date.now() + p.length, takenAt: new Date().toISOString(), label: currentLabel }]);
  }
  function retake() { setPhotos((p) => p.slice(0, -1)); }

  return (
    <div className="modal__backdrop" onClick={onClose}>
      <div className="modal tall" onClick={(e) => e.stopPropagation()}>
        <div className="between" style={{ marginBottom: 12 }}>
          <b style={{ fontSize: 16 }}>{title}</b>
          <button className="iconbtn" onClick={onClose}>✕</button>
        </div>

        {guided && (
          <div className="camsteps">
            {steps!.map((s, i) => (
              <div key={s} className={"camsteps__pill" + (i < photos.length ? " done" : i === photos.length ? " active" : "")}>
                {i < photos.length ? "✓ " : ""}{s}
              </div>
            ))}
          </div>
        )}

        {/* viewfinder */}
        <div className={"camview" + (flash ? " flash" : "")}>
          <div className="camview__frame" />
          {!guidedDone && (
            <span className="camview__guide">{guided ? `Align the ${currentLabel?.toLowerCase()} in the frame` : "Position inside the frame"}</span>
          )}
          {guidedDone && <span className="camview__guide">Captured</span>}
        </div>

        {/* shutter */}
        <div className="cambar">
          {photos.length > 0 ? <button className="cambar__side" onClick={retake}>Retake</button> : <span className="cambar__side" />}
          <div className="shutterwrap">
            <button className="shutter" onClick={capture} disabled={guidedDone} aria-label="Capture">
              <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 8.5a2 2 0 0 1 2-2h1.2l1-1.6a1 1 0 0 1 .85-.47h5.9a1 1 0 0 1 .85.47l1 1.6H18a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z" />
                <circle cx="12" cy="12.5" r="3.2" />
              </svg>
            </button>
            <span className="shutter__lbl">{guidedDone ? "Done" : guided ? `Capture ${currentLabel?.toLowerCase()}` : "Capture"}</span>
          </div>
          {photos.length > 0 && canFinish
            ? <button className="cambar__side primary" onClick={() => onDone(photos)}>Done</button>
            : <span className="cambar__side" />}
        </div>

        {photos.length > 0 && (
          <div className="camthumbs">
            {photos.map((p) => (
              <div key={p.id} className="camthumb">
                <div className="camthumb__img" />
                {p.label && <span className="camthumb__lbl">{p.label}</span>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
