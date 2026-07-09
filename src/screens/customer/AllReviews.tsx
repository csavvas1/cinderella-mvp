import { useNavigate, useParams } from "react-router-dom";
import { CLEANERS } from "../../data/cleaners";
import { useStore } from "../../context/AppStore";
import BackButton from "../../components/BackButton";

export default function AllReviews() {
  const { id } = useParams();
  const nav = useNavigate();
  const { reviewsFor } = useStore();
  const cleaner = CLEANERS.find((c) => c.id === id);
  if (!cleaner) return <div className="pad">Not found.</div>;
  const reviews = reviewsFor(cleaner.id);

  return (
    <div className="pad">
      <BackButton />
      <div className="row">
        <div className="avatar">{(cleaner.name || "C").trim().charAt(0).toUpperCase()}</div>
        <div>
          <div style={{ fontWeight: 900, fontSize: 17 }}>{cleaner.name}</div>
          <div className="row" style={{ gap: 8, marginTop: 2 }}>
            <span className="stars">★ {cleaner.rating.toFixed(1)}</span>
            <span className="tiny muted">· {reviews.length} reviews</span>
          </div>
        </div>
      </div>

      <div className="h2">All reviews</div>
      {reviews.map((r) => (
        <div key={r.id} className="card">
          <div className="between">
            <b style={{ fontSize: 14 }}>{r.author}</b>
            <span className="stars">★ {r.rating}</span>
          </div>
          <div className="tiny muted" style={{ marginTop: 4 }}>{r.text}</div>
          <div className="tiny muted" style={{ marginTop: 6, opacity: 0.7 }}>{r.date}</div>
        </div>
      ))}
    </div>
  );
}
