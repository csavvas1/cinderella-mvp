import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "../lib/supabase";

export interface CapturedPhoto {
  id: string;
  takenAt: string;   // ISO timestamp stamped at capture
  label?: string;    // e.g. "Front", "Back"
  url?: string;      // public URL of the uploaded image in Storage
  path?: string;     // storage object path (for later deletion if needed)
}

// Real in-app camera: getUserMedia (rear camera) -> capture a frame to a canvas
// -> JPEG blob -> upload to the Supabase Storage `proofs` bucket -> keep the
// public URL. `folder` namespaces uploads (e.g. "job/<id>", "id", "dispute").
//
// `steps` turns it into a guided sequence (e.g. ["Front","Back"]) — one shot per
// step. Without `steps` it's free multi-capture (used for proof photos).
export default function CameraCapture({
  title = "Take photo",
  steps,
  folder = "misc",
  onClose,
  onDone,
}: {
  title?: string;
  steps?: string[];
  folder?: string;
  onClose: () => void;
  onDone: (photos: CapturedPhoto[]) => void;
}) {
  const [photos, setPhotos] = useState<CapturedPhoto[]>([]);
  const [flash, setFlash] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [camErr, setCamErr] = useState("");

  // App-side camera-permission memory (separate from the browser's own grant):
  // "always" -> open the camera without asking, "never" -> don't open it,
  // "ask" -> show our pre-prompt first. Stored in localStorage.
  const PERM_KEY = "cam-perm";
  const savedPerm = (typeof localStorage !== "undefined" ? localStorage.getItem(PERM_KEY) : null) as "always" | "never" | null;
  const [perm, setPerm] = useState<"ask" | "always" | "never" | "granted">(savedPerm ?? "ask");
  // "granted" = allowed for this open only (This time). "always"/"granted" both start the camera.
  const active = perm === "always" || perm === "granted";

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const guided = !!steps && steps.length > 0;
  const stepIdx = photos.length;
  const currentLabel = guided ? steps![Math.min(stepIdx, steps!.length - 1)] : undefined;
  const guidedDone = guided && photos.length >= steps!.length;
  const canFinish = (guided ? guidedDone : photos.length > 0) && !uploading;

  // hide the floating tab island while the full-screen camera is open
  useEffect(() => {
    document.documentElement.setAttribute("data-camera-open", "1");
    return () => document.documentElement.removeAttribute("data-camera-open");
  }, []);

  // start the camera once allowed (perm always/granted); stop it on unmount
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } }, audio: false,
        });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play().catch(() => {}); }
      } catch {
        if (!cancelled) setCamErr("Camera unavailable. Allow camera access and try again.");
      }
    })();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [active]);

  function choose(p: "granted" | "always" | "never") {
    if (p === "always") localStorage.setItem(PERM_KEY, "always");
    if (p === "never") localStorage.setItem(PERM_KEY, "never");
    setPerm(p);
  }

  async function capture() {
    if ((guided && guidedDone) || uploading) return;
    const video = videoRef.current;
    if (!video || !video.videoWidth) { setCamErr("Camera not ready yet."); return; }
    setFlash(true);
    setTimeout(() => setFlash(false), 150);

    // draw the current frame to a canvas, downscale to a sane max width
    const maxW = 1280;
    const scale = Math.min(1, maxW / video.videoWidth);
    const w = Math.round(video.videoWidth * scale);
    const h = Math.round(video.videoHeight * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    canvas.getContext("2d")!.drawImage(video, 0, 0, w, h);
    const blob: Blob = await new Promise((res) => canvas.toBlob((b) => res(b!), "image/jpeg", 0.82));

    const label = currentLabel;
    const id = "ph" + Date.now() + photos.length;
    const takenAt = new Date().toISOString();

    setUploading(true);
    setCamErr("");
    try {
      const { data: sess } = await supabase.auth.getSession();
      const uid = sess.session?.user.id ?? "anon";
      const path = `${uid}/${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
      const { error } = await supabase.storage.from("proofs").upload(path, blob, {
        contentType: "image/jpeg", upsert: false,
      });
      if (error) throw error;
      const { data: pub } = supabase.storage.from("proofs").getPublicUrl(path);
      setPhotos((p) => [...p, { id, takenAt, label, url: pub.publicUrl, path }]);
    } catch (e) {
      setCamErr((e as Error).message || "Upload failed. Try again.");
    } finally {
      setUploading(false);
    }
  }

  function retake() { setPhotos((p) => p.slice(0, -1)); }

  // Render into the phone frame so the full-screen overlay is anchored to the
  // viewport (not a tall, scrollable tab page) — no scrolling to reach the X.
  const host = (typeof document !== "undefined" && document.querySelector(".phone")) || (typeof document !== "undefined" ? document.body : null);
  const ui = (
    <div className={"camfull" + (flash ? " flash" : "")}>
      {/* full-bleed live camera */}
      <video ref={videoRef} playsInline muted className="camfull__video" />

      {/* close button — absolutely pinned top-right, always visible */}
      <button className="camfull__close" onClick={onClose} aria-label="Close">
        <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>
      </button>

      {/* app-side permission pre-prompt (remembers the choice) */}
      {perm === "ask" && (
        <div className="camperm">
          <div className="camperm__card">
            <b style={{ fontSize: 16 }}>Use the camera?</b>
            <p className="sub" style={{ margin: "8px 0 14px" }}>{title} needs the camera to take a photo.</p>
            <button className="btn" onClick={() => choose("granted")}>Allow this time</button>
            <div style={{ height: 8 }} />
            <button className="btn secondary" onClick={() => choose("always")}>Always allow</button>
            <div style={{ height: 8 }} />
            <button className="btn secondary" onClick={() => choose("never")}>Don't allow</button>
          </div>
        </div>
      )}
      {perm === "never" && (
        <div className="camperm">
          <div className="camperm__card">
            <b style={{ fontSize: 16 }}>Camera turned off</b>
            <p className="sub" style={{ margin: "8px 0 14px" }}>You chose not to use the camera. You can re-enable it here.</p>
            <button className="btn" onClick={() => { localStorage.removeItem(PERM_KEY); setPerm("granted"); }}>Turn camera on</button>
            <div style={{ height: 8 }} />
            <button className="btn secondary" onClick={onClose}>Close</button>
          </div>
        </div>
      )}

      {/* title bar */}
      <div className="camfull__top">
        <span className="camfull__title">{title}</span>
      </div>

      {guided && (
        <div className="camfull__steps">
          {steps!.map((s, i) => (
            <div key={s} className={"camsteps__pill" + (i < photos.length ? " done" : i === photos.length ? " active" : "")}>
              {i < photos.length ? "✓ " : ""}{s}
            </div>
          ))}
        </div>
      )}

      {/* framing guide / status */}
      <div className="camfull__hint">
        {camErr
          ? camErr
          : uploading ? "Uploading…"
          : !guidedDone ? (guided ? `Align the ${currentLabel?.toLowerCase()} in the frame` : "Position inside the frame")
          : "Captured"}
      </div>

      {/* bottom controls over the video */}
      <div className="camfull__bottom">
        {photos.length > 0 && (
          <div className="camfull__thumbs">
            {photos.map((p) => (
              <div key={p.id} className="camthumb">
                {p.url
                  ? <img className="camthumb__img" src={p.url} alt={p.label ?? "photo"} />
                  : <div className="camthumb__img" />}
                {p.label && <span className="camthumb__lbl">{p.label}</span>}
              </div>
            ))}
          </div>
        )}
        <div className="camfull__bar">
          <div className="camfull__slot">
            {photos.length > 0 && <button className="camfull__text" onClick={retake} disabled={uploading}>Retake</button>}
          </div>
          <button className="camfull__shutter" onClick={capture} disabled={guidedDone || uploading || !!camErr} aria-label="Capture">
            <span className="camfull__shutter-ring" />
          </button>
          <div className="camfull__slot">
            {photos.length > 0 && canFinish && <button className="camfull__done" onClick={() => onDone(photos)}>Done</button>}
          </div>
        </div>
      </div>
    </div>
  );

  return host ? createPortal(ui, host) : ui;
}
