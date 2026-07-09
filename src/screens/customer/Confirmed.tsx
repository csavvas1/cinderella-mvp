import { useNavigate, useParams } from "react-router-dom";
import { useStore } from "../../context/AppStore";
import { priceJob } from "../../data/platform";

export default function Confirmed() {
  const { id } = useParams();
  const nav = useNavigate();
  const { bookings } = useStore();
  const b = bookings.find((x) => x.id === id);

  const awaiting = b?.status === "awaiting";

  return (
    <div className="pad" style={{ textAlign: "center", paddingTop: 50 }}>
      <h1 className="h1" style={{ marginTop: 8 }}>{awaiting ? "Request sent!" : "You're booked!"}</h1>
      {awaiting && (
        <p className="sub">Waiting for {b?.cleanerName} to accept. You'll be notified once confirmed.</p>
      )}

      {b && (
        <div className="card" style={{ textAlign: "left", marginTop: 14 }}>
          <div className="row">
            <div className="avatar">{(b.cleanerName || "C").trim().charAt(0).toUpperCase()}</div>
            <div className="grow">
              <b>{b.cleanerName}</b>
              <div className="tiny muted">{b.date} · {b.time} · {b.durationHours}h</div>
            </div>
            <div className="price">€{b.total}</div>
          </div>
          {(() => {
            const base = +(b.cleanerPay ?? b.ratePerHour * b.durationHours).toFixed(2) || 0;
            const fee = b.commission ?? priceJob(base).commission;
            const total = b.total ?? priceJob(base).customerTotal;
            return (
              <div style={{ marginTop: 12 }}>
                <div className="between"><span className="muted tiny">Cleaning ({b.ratePerHour} × {b.durationHours}h)</span><b>€{base.toFixed(2)}</b></div>
                <div className="between" style={{ marginTop: 6 }}><span className="muted tiny">Service fee</span><b>€{fee.toFixed(2)}</b></div>
                <div className="divider" />
                <div className="between"><b>Total</b><span className="price">€{total.toFixed(2)}</span></div>
              </div>
            );
          })()}
          {(awaiting || b.recurring) && (
            <div style={{ marginTop: 10 }}>
              {awaiting && <span className="badge amber">Awaiting confirmation</span>}
              {b.recurring && <span className="badge" style={{ marginLeft: awaiting ? 8 : 0 }}>Repeats</span>}
            </div>
          )}
        </div>
      )}

      {b && !b.recurring && (
        <div className="card" style={{ marginTop: 16, textAlign: "left" }}>
          <div className="row between">
            <div>
              <b style={{ fontSize: 14 }}>Make it a routine?</b>
              <div className="tiny muted">Book {b.cleanerName.split(" ")[0]} every week automatically.</div>
            </div>
            <button className="btn sm" onClick={() => {
              sessionStorage.setItem("book-preset", JSON.stringify({ date: b.date }));
              nav("/book");
            }}>Set up</button>
          </div>
        </div>
      )}

      <div style={{ height: 18 }} />
      <button className="btn" onClick={() => nav("/bookings")}>View my bookings</button>
      <div style={{ height: 10 }} />
      <button className="btn secondary" onClick={() => nav("/book")}>Book another</button>
    </div>
  );
}
