import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useStore } from "../../context/AppStore";
import BackButton from "../../components/BackButton";
import MapPicker from "../../components/MapPicker";
import { ArrowRight, MapPin, MessageCircle, Phone, X } from "lucide-react";

export default function JobDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { jobs, setJobStatus, acknowledgeJob, markJobSeen, myUid, createThread } = useStore();
  // agent side: only surface a job assigned to THIS user as the cleaner. A
  // deep-link to a job the user merely booked as a customer must not open here.
  const j = jobs.find((x) => x.id === id && x.cleanerUid === myUid);
  const [showCancel, setShowCancel] = useState(false);
  // Opening ANY job clears its alert on the Jobs/agent tabs — once the agent has
  // seen the job, the "new" badge shouldn't linger regardless of what they tap
  // next (accepting/declining is still available, just no longer flagged as new).
  useEffect(() => {
    if (j && !j.seenByAgent) markJobSeen(j.id);
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
                <span className="jd__diff-arrow"><ArrowRight size={14} /></span>
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

      {/* exact location pin the customer placed, so the agent finds the door */}
      {hasPin && (
        <div style={{ marginTop: 14 }}>
          <MapPicker value={{ lat: j.lat!, lng: j.lng! }} height={200} readOnly />
        </div>
      )}

      {j.status !== "completed" && (
        <a className="actionbtn" style={{ marginTop: 12 }} href={mapsUrl} target="_blank" rel="noreferrer">
          <span className="actionbtn__ic"><MapPin size={18} /></span>
          <span>Open in Maps</span>
        </a>
      )}

      {/* Message the customer — mirrors the maps button, and (like maps) only
          while the job is still active. After completion, messaging closes. */}
      {j.status !== "completed" && j.customerUid && j.cleanerUid && j.customerUid !== j.cleanerUid && (
        <button className="actionbtn actionbtn--msg" style={{ marginTop: 10 }}
          onClick={async () => {
            const tid = await createThread(j.customerUid!, j.cleanerUid!, j.id, `Cleaning · ${j.date}`);
            if (tid) nav("/messages?thread=" + tid);
          }}>
          <span className="actionbtn__ic"><MessageCircle size={18} /></span>
          <span>Message customer</span>
        </button>
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
        <>
          {/* call only on the day of the job, and only if we have a number */}
          {isJobDay && j.customerPhone && (
            <a className="actionbtn actionbtn--call" style={{ marginBottom: 10 }} href={`tel:${j.customerPhone.replace(/[^\d+]/g, "")}`}>
              <span className="actionbtn__ic"><Phone size={17} /></span>
              <span>Call customer</span>
            </a>
          )}
          <button className="actionbtn actionbtn--cancel" onClick={() => setShowCancel(true)}>
            <span className="actionbtn__ic"><X size={18} /></span>
            <span>Cancel job</span>
          </button>
        </>
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
