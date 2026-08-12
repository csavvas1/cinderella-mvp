import { Star } from "lucide-react";
import { useParams } from "react-router-dom";
import { CLEANERS } from "../../data/cleaners";
import { useStore } from "../../context/AppStore";
import BackButton from "../../components/BackButton";

export default function AllReviews() {
  const { id } = useParams();
  const { reviewsFor, nameForUid, photoForUid, myUid } = useStore();

  // Resolve the subject: a mock cleaner from the directory, OR a real account
  // (e.g. the signed-in agent viewing their OWN reviews via /reviews/<myUid>).
  const subjectId = id ?? "";
  const mock = CLEANERS.find((c) => c.id === subjectId);
  const name = mock?.name || (subjectId === myUid ? "You" : nameForUid(subjectId)) || "Reviews";
  const photo = mock?.photoUrl || photoForUid(subjectId);

  const reviews = reviewsFor(subjectId);
  const count = reviews.length;
  const avg = count ? reviews.reduce((s, r) => s + (r.rating || 0), 0) / count : (mock?.rating ?? 0);

  return (
    <div className="pad">
      <BackButton />
      <div className="row">
        {photo
          ? <img src={photo} alt="" className="avatar" style={{ objectFit: "cover" }} />
          : <div className="avatar">{(name || "C").trim().charAt(0).toUpperCase()}</div>}
        <div>
          <div style={{ fontWeight: 900, fontSize: 17 }}>{name}</div>
          <div className="row" style={{ gap: 8, marginTop: 2 }}>
            <span className="stars"><Star size={14} fill="currentColor" strokeWidth={0} style={{ verticalAlign: "-2px" }} /> {avg.toFixed(1)}</span>
            <span className="tiny muted">· {count} review{count === 1 ? "" : "s"}</span>
          </div>
        </div>
      </div>

      <div className="h2">All reviews</div>
      {count === 0 && <div className="note">No reviews yet.</div>}
      {reviews.map((r) => (
        <div key={r.id} className="card">
          <div className="between">
            <b style={{ fontSize: 14 }}>{r.author}</b>
            <span className="agentrev__stars">
              {[1, 2, 3, 4, 5].map((n) => (
                <Star key={n} size={13} fill={n <= (r.rating || 0) ? "currentColor" : "none"} />
              ))}
            </span>
          </div>
          {r.text && <div className="tiny muted" style={{ marginTop: 6 }}>{r.text}</div>}
          <div className="tiny muted" style={{ marginTop: 6, opacity: 0.7 }}>{r.date}</div>
        </div>
      ))}
    </div>
  );
}
