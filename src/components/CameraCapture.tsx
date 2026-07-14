import { useEffect, useRef, useState } from "react";
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

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const guided = !!steps && steps.length > 0;
  const stepIdx = photos.length;
  const currentLabel = guided ? steps![Math.min(stepIdx, steps!.length - 1)] : undefined;
  const guidedDone = guided && photos.length >= steps!.length;
  const canFinish = (guided ? guidedDone : photos.length > 0) && !uploading;

  // start the camera on mount; stop it on unmount
  useEffect(() => {
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
  }, []);

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

        {/* live viewfinder */}
        <div className={"camview" + (flash ? " flash" : "")}>
          <video ref={videoRef} playsInline muted
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", borderRadius: "inherit" }} />
          <div className="camview__frame" />
          {camErr
            ? <span className="camview__guide">{camErr}</span>
            : !guidedDone
              ? <span className="camview__guide">{guided ? `Align the ${currentLabel?.toLowerCase()} in the frame` : "Position inside the frame"}</span>
              : <span className="camview__guide">Captured</span>}
        </div>

        {/* shutter */}
        <div className="cambar">
          {photos.length > 0 ? <button className="cambar__side" onClick={retake} disabled={uploading}>Retake</button> : <span className="cambar__side" />}
          <div className="shutterwrap">
            <button className="shutter" onClick={capture} disabled={guidedDone || uploading || !!camErr} aria-label="Capture">
              <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 8.5a2 2 0 0 1 2-2h1.2l1-1.6a1 1 0 0 1 .85-.47h5.9a1 1 0 0 1 .85.47l1 1.6H18a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z" />
                <circle cx="12" cy="12.5" r="3.2" />
              </svg>
            </button>
            <span className="shutter__lbl">{uploading ? "Uploading…" : guidedDone ? "Done" : guided ? `Capture ${currentLabel?.toLowerCase()}` : "Capture"}</span>
          </div>
          {photos.length > 0 && canFinish
            ? <button className="cambar__side primary" onClick={() => onDone(photos)}>Done</button>
            : <span className="cambar__side" />}
        </div>

        {photos.length > 0 && (
          <div className="camthumbs">
            {photos.map((p) => (
              <div key={p.id} className="camthumb">
                {p.url
                  ? <img className="camthumb__img" src={p.url} alt={p.label ?? "photo"} style={{ objectFit: "cover" }} />
                  : <div className="camthumb__img" />}
                {p.label && <span className="camthumb__lbl">{p.label}</span>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
