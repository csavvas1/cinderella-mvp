import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useStore } from "../../context/AppStore";
import BackButton from "../../components/BackButton";
import CameraCapture, { type CapturedPhoto } from "../../components/CameraCapture";
import MapPicker from "../../components/MapPicker";

export default function JobDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { jobs, setJobStatus, saveJobPhotos, acknowledgeJob, markJobSeen } = useStore();
  const j = jobs.find((x) => x.id === id);
  const [cam, setCam] = useState<null | "before" | "after">(null);
  // proof photo URLs come straight off the job (persisted), so they survive a
  // reload and are visible to both cleaner and customer.
  const before = j?.beforePhotos ?? [];
  const after = j?.afterPhotos ?? [];
  const [showCancel, setShowCancel] = useState(false);
  // Opening an auto-accepted job clears its "new" badge on the Jobs/agent tabs.
  useEffect(() => {
    if (j && j.autoAccepted && !j.seenByAgent) markJobSeen(j.id);
  }, [j?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!j) return <div className="pad">Not found.</div>;

  // A "modified" job is an accepted job whose schedule the customer changed; it
  // behaves like an approved job here (proof photos, complete/cancel), plus an
  // acknowledge banner for the change.
  const isLive = j.status === "approved" || j.status === "modified";

  // cleaner keeps their full rate — the platform fee is paid by the customer on top
  const earn = (j.cleanerPay ?? j.ratePerHour * j.durationHours).toFixed(2);
  const endTime = (() => {
    const [hh, mm] = j.time.split(":").map(Number);
    const t = hh * 60 + mm + Math.round(j.durationHours * 60);
    return `${String(Math.floor(t / 60) % 24).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
  })();
  const whenStr = `${j.date} · ${j.time} - ${endTime} (${j.durationHours}h)`;
  const todayISO = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; })();
  const isJobDay = j.date === todayISO;
  // for now every home is a house or apartment; default apartment for old jobs
  const propType = j.propertyType ?? "apartment";
  const propLabel = propType === "house" ? "House" : "Apartment";
  const rooms = [
    j.bedrooms && `${j.bedrooms} bed`,
    j.bathrooms && `${j.bathrooms} bath`,
    j.kitchens && `${j.kitchens} kitchen`,
    j.commonRooms && `${j.commonRooms} common`,
  ].filter(Boolean).join(" · ");
  // Prefer the exact customer-placed pin for directions; fall back to the address
  // text when no pin was set.
  const hasPin = j.lat != null && j.lng != null;
  const mapsUrl = hasPin
    ? `https://www.google.com/maps/search/?api=1&query=${j.lat},${j.lng}`
    : "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(j.address);

  return (
    <div className="pad">
      <BackButton to="/agent/jobs" label="Back to jobs" />

      <div className="between" style={{ alignItems: "center" }}>
        <h1 className="jd__name">{j.customerName}</h1>
        <span className={"badge " + (j.status === "approved" ? "green" : j.status === "pending" ? "amber" : j.status === "modified" ? "indigo" : "")}>
          {j.status === "modified" ? "Modified" : j.status}
        </span>
      </div>

      {j.status === "modified" && (
        <div className="card jd__card" style={{ borderLeft: "3px solid var(--indigo)" }}>
          <b style={{ fontSize: 14, color: "var(--indigo)" }}>Customer changed this booking</b>
          <div style={{ height: 10 }} />
          {(() => {
            const rows: { label: string; from: string; to: string }[] = [];
            if (j.prevDate != null && j.prevDate !== j.date) rows.push({ label: "Date", from: j.prevDate, to: j.date });
            if (j.prevTime != null && j.prevTime !== j.time) rows.push({ label: "Time", from: j.prevTime, to: j.time });
            if (j.prevDurationHours != null && j.prevDurationHours !== j.durationHours)
              rows.push({ label: "Duration", from: `${j.prevDurationHours}h`, to: `${j.durationHours}h` });
            return rows.map((r) => (
              <div key={r.label} className="jd__diff">
                <span className="jd__diff-k">{r.label}</span>
                <span className="jd__diff-old">{r.from}</span>
                <span className="jd__diff-arrow">→</span>
                <span className="jd__diff-new">{r.to}</span>
              </div>
            ));
          })()}
          <div style={{ height: 12 }} />
          <button className="btn agent" onClick={() => acknowledgeJob(j.id)}>Acknowledge change</button>
        </div>
      )}

      {(() => {
        const lowRated = j.customerReviewsCount ? (j.customerRating ?? 0) < 3.5 : false;
        const label = !j.customerReviewsCount
          ? "New customer · no ratings yet"
          : `★ ${(j.customerRating ?? 0).toFixed(1)} · ${j.customerReviewsCount} review${j.customerReviewsCount === 1 ? "" : "s"}`;
        const cancels = j.customerCancellations ?? 0;
        // flag a customer who cancels a lot so the cleaner knows before accepting
        const oftenCancels = cancels >= 3;
        return (
          <div className="row" style={{ gap: 6, marginTop: 8, flexWrap: "wrap" }}>
            <span className={"badge " + (lowRated ? "amber" : "")}>
              {label}{lowRated ? " — review before accepting" : ""}
            </span>
            {cancels > 0 && (
              <span className={"badge " + (oftenCancels ? "red" : "")}>
                {cancels} cancellation{cancels === 1 ? "" : "s"}{oftenCancels ? " — cancels often" : ""}
              </span>
            )}
          </div>
        );
      })()}

      <div className="card jd__card">
        <div className="jd__row"><span className="jd__k">When</span><b className="jd__v">{whenStr}</b></div>
        <div className="divider" />
        <div className="jd__row"><span className="jd__k">Property</span><b className="jd__v">{propLabel}</b></div>
        {rooms && (
          <div className="jd__row"><span className="jd__k">Rooms</span><b className="jd__v">{rooms}</b></div>
        )}
        {propType === "apartment" && j.apartmentNumber && (
          <div className="jd__row"><span className="jd__k">Unit</span><b className="jd__v">{j.apartmentNumber}{j.floor ? ` · Floor ${j.floor}` : ""}</b></div>
        )}
        <div className="jd__row"><span className="jd__k">Address</span><b className="jd__v">{j.address}</b></div>
        <div className="divider" />
        <div className="jd__row"><span className="jd__k">You earn</span><span className="price">€{earn}</span></div>
      </div>

      {(() => {
        const fmt = (ms?: number) => ms
          ? new Date(ms).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
          : null;
        const rows: { k: string; v: string }[] = [];
        if (j.alertedAt) rows.push({ k: "Alert received", v: fmt(j.alertedAt)! });
        if (j.respondedAt && j.response) {
          const mins = j.alertedAt ? Math.max(0, Math.round((j.respondedAt - j.alertedAt) / 60000)) : null;
          const dur = mins == null ? "" : mins < 60 ? ` · ${mins}m` : ` · ${Math.floor(mins / 60)}h ${mins % 60}m`;
          rows.push({ k: "Responded", v: `${j.response}${dur} · ${fmt(j.respondedAt)}` });
        }
        if (j.outcome) rows.push({ k: "Outcome", v: `${j.outcome} · ${fmt(j.outcomeAt)}` });
        if (rows.length === 0) return null;
        return (
          <div className="card jd__card" style={{ marginTop: 12 }}>
            <div className="jd__k" style={{ marginBottom: 6, fontWeight: 800 }}>Timeline</div>
            {rows.map((r, i) => (
              <div key={r.k}>
                {i > 0 && <div className="divider" />}
                <div className="jd__row"><span className="jd__k">{r.k}</span><b className="jd__v" style={{ textTransform: "capitalize" }}>{r.v}</b></div>
              </div>
            ))}
          </div>
        );
      })()}

      {/* exact location pin the customer placed, so the agent finds the door */}
      {hasPin && (
        <div style={{ marginTop: 14 }}>
          <MapPicker value={{ lat: j.lat!, lng: j.lng! }} height={200} readOnly />
        </div>
      )}

      {j.status !== "completed" && (
        <a className="maploc__btn" style={{ marginTop: 12 }} href={mapsUrl} target="_blank" rel="noreferrer">
          <span>Open in Maps</span>
          <span className="maploc__arrow">→</span>
        </a>
      )}

      {isLive && (
        <>
          <div className="h2">Proof photos</div>
          <div className="card">
            <p className="tiny muted" style={{ marginTop: 0 }}>Time-stamped before/after photos protect you against false refund claims.</p>
            <div className="row" style={{ gap: 8 }}>
              <button className={"proofbtn grow" + (before.length ? " done" : "")} onClick={() => setCam("before")}>
                {before.length ? `✓ Before (${before.length})` : "Before"}
              </button>
              <button className={"proofbtn grow" + (after.length ? " done" : "")} onClick={() => setCam("after")}>
                {after.length ? `✓ After (${after.length})` : "After"}
              </button>
            </div>
            {(before.length > 0 || after.length > 0) && (
              <div style={{ marginTop: 12 }}>
                {before.length > 0 && <ProofStrip label="Before" urls={before} />}
                {after.length > 0 && <ProofStrip label="After" urls={after} />}
              </div>
            )}
          </div>
        </>
      )}

      {cam && (
        <CameraCapture
          title={cam === "before" ? "Before photos" : "After photos"}
          folder={`job/${j.id}/${cam}`}
          onClose={() => setCam(null)}
          onDone={(p) => {
            const urls = p.map((x) => x.url).filter((u): u is string => !!u);
            const existing = cam === "before" ? before : after;
            saveJobPhotos(j.id, cam!, [...existing, ...urls]);
            setCam(null);
          }}
        />
      )}

      <div style={{ height: 18 }} />
      {j.status === "pending" ? (
        <div className="row" style={{ gap: 10 }}>
          <button className="btn danger grow" onClick={() => { setJobStatus(j.id, "declined"); nav("/agent/jobs"); }}>
            Decline
          </button>
          <button className="btn agent grow" onClick={() => { setJobStatus(j.id, "approved"); nav("/agent/jobs"); }}>
            Accept job
          </button>
        </div>
      ) : isLive ? (
        <div className="row" style={{ gap: 10 }}>
          {/* call only on the day of the job, and only if we have a number */}
          {isJobDay && j.customerPhone && (
            <a className="btn secondary grow" href={`tel:${j.customerPhone.replace(/[^\d+]/g, "")}`} style={{ textAlign: "center" }}>Call</a>
          )}
          <button className="btn danger grow" onClick={() => setShowCancel(true)}>Cancel</button>
        </div>
      ) : null}

      {showCancel && (
        <div className="modal__backdrop" onClick={() => setShowCancel(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div style={{ textAlign: "center", marginBottom: 6 }}>
              <b style={{ fontSize: 17 }}>Cancel this job?</b>
            </div>
            <p className="sub" style={{ textAlign: "center" }}>
              The customer will be notified that you can no longer clean <b>{j.address}</b> on {j.date} at {j.time}. Frequent cancellations can affect your standing.
            </p>
            <div style={{ height: 8 }} />
            <button className="btn danger" onClick={() => { setJobStatus(j.id, "declined"); nav("/agent/jobs"); }}>Cancel the job</button>
            <div style={{ height: 8 }} />
            <button className="btn secondary" onClick={() => setShowCancel(false)}>Keep the job</button>
          </div>
        </div>
      )}
    </div>
  );
}

function ProofStrip({ label, urls }: { label: string; urls: string[] }) {
  return (
    <div style={{ marginTop: 8 }}>
      <div className="tiny muted" style={{ fontWeight: 800, marginBottom: 4 }}>{label}</div>
      <div style={{ display: "flex", gap: 8, overflowX: "auto" }}>
        {urls.map((u) => (
          <a key={u} href={u} target="_blank" rel="noreferrer" style={{ flexShrink: 0 }}>
            <img src={u} alt={label} style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 10, border: "1px solid var(--border)" }} />
          </a>
        ))}
      </div>
    </div>
  );
}
