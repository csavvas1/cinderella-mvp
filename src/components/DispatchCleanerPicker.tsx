import { useMemo, useState } from "react";
import { useStore } from "../context/AppStore";
import { CLEANERS, cleanerBadges, marketStats } from "../data/cleaners";
import Avatar from "./Avatar";
import type { Cleaner } from "../types";

// Cleaner picker for auto-dispatch. Mirrors the manual-booking cleaner browser
// (CleanerList): avatars, rating, badges, price, favourites + sort — but tapping
// a card SELECTS a cleaner instead of navigating.
//   mode="priority": multi-select, tap toggles membership in `selected`.
//   mode="single":   tap picks exactly one (onPick), used for the owner fallback.
// Pool = real agents + mock directory (deduped), optionally city-filtered.

type Sort = "rating" | "price" | "reviews" | "favourites";
const SORTS: { key: Sort; label: string }[] = [
  { key: "rating", label: "Top rated" },
  { key: "price", label: "Cheapest" },
  { key: "reviews", label: "Most reviewed" },
  { key: "favourites", label: "♥ Favourites" },
];

export default function DispatchCleanerPicker({
  city, mode, selected = [], onToggle, onPick, onClose,
}: {
  city?: string;
  mode: "priority" | "single";
  selected?: string[];
  onToggle?: (id: string) => void;
  onPick?: (id: string) => void;
  onClose: () => void;
}) {
  const { cleaners, favourites, toggleFavourite } = useStore();
  const [sort, setSort] = useState<Sort>("rating");

  const pool = useMemo(() => {
    const byId = new Map<string, Cleaner>();
    [...cleaners, ...CLEANERS].forEach((c) => { if (!byId.has(c.id)) byId.set(c.id, c); });
    let list = [...byId.values()];
    if (city) list = list.filter((c) => c.serviceCities?.includes(city) || c.city === city);
    return list;
  }, [cleaners, city]);

  const stats = useMemo(() => marketStats("weekday", pool), [pool]);

  const ranked = useMemo(() => {
    let list = [...pool];
    if (sort === "favourites") list = list.filter((c) => favourites.includes(c.id));
    list.sort((a, b) => {
      if (sort === "price") return a.rateWeekday - b.rateWeekday;
      if (sort === "reviews") return b.reviewsCount - a.reviewsCount;
      return b.rating - a.rating; // rating (and favourites) default
    });
    return list;
  }, [pool, sort, favourites]);

  function choose(id: string) {
    if (mode === "single") onPick?.(id);
    else onToggle?.(id);
  }

  return (
    <div className="modal__backdrop" onClick={onClose}>
      <div className="modal tall" onClick={(e) => e.stopPropagation()}>
        <div className="between" style={{ marginBottom: 10 }}>
          <b style={{ fontSize: 16 }}>{mode === "single" ? "Pick a cleaner" : "Add priority cleaners"}</b>
          <button className="iconbtn" onClick={onClose}>✕</button>
        </div>

        {/* market snapshot */}
        <div className="mkt">
          <div className="mkt__item"><div className="mkt__val">€{stats.avg}</div><div className="mkt__lbl">Avg / hr</div></div>
          <div className="mkt__sep" />
          <div className="mkt__item"><div className="mkt__val">€{stats.typical}</div><div className="mkt__lbl">{stats.typicalLabel.replace(" (median)", "")}</div></div>
          <div className="mkt__sep" />
          <div className="mkt__item"><div className="mkt__val">★ {stats.avgRating}</div><div className="mkt__lbl">Avg rating</div></div>
        </div>

        {/* sort */}
        <div className="label" style={{ marginTop: 14 }}>Sort by</div>
        <div className="sortgrid">
          {SORTS.map((s) => (
            <button key={s.key} className={"sortbtn" + (sort === s.key ? " active" : "")} onClick={() => setSort(s.key)}>
              {s.label}
            </button>
          ))}
        </div>

        <p className="tiny muted" style={{ margin: "12px 2px 8px" }}>
          {ranked.length} cleaner{ranked.length === 1 ? "" : "s"}
          {mode === "priority" && selected.length > 0 && ` · ${selected.length} selected`}
        </p>

        {ranked.length === 0 ? (
          <div className="empty" style={{ padding: "32px 16px" }}>
            {sort === "favourites" ? "No favourites yet. Tap the heart on any cleaner to save them." : "No cleaners in this area yet."}
          </div>
        ) : (
          ranked.map((c) => {
            const on = selected.includes(c.id);
            return (
              <div key={c.id} className={"clcard" + (on ? " clcard--sel" : "")} onClick={() => choose(c.id)}>
                <Avatar photoUrl={c.photoUrl} emoji={c.photo} name={c.name} className="avatar lg" />
                <div className="clcard__mid">
                  <div className="clcard__name">
                    {c.name}
                    <button className={"heart" + (favourites.includes(c.id) ? " on" : "")}
                      onClick={(e) => { e.stopPropagation(); toggleFavourite(c.id); }}
                      title="Favourite">{favourites.includes(c.id) ? "♥" : "♡"}</button>
                  </div>
                  <div className="clcard__meta">
                    <span className="stars">★ {c.rating.toFixed(1)}</span>
                    <span className="muted tiny">· {c.reviewsCount}</span>
                  </div>
                  <div className="badgerow">
                    {cleanerBadges(c).map((b) => <span key={b.label} className={"minibadge " + b.cls}>{b.label}</span>)}
                  </div>
                </div>
                <div className="clcard__price">
                  <div className="clcard__rate">€{c.rateWeekday}</div>
                  <div className="muted tiny">/ hour</div>
                  {mode === "priority" && (
                    <span className={"dpick__check" + (on ? " on" : "")} style={{ marginTop: 6 }}>{on ? "✓" : "+"}</span>
                  )}
                </div>
              </div>
            );
          })
        )}

        {mode === "priority" && <button className="btn" style={{ marginTop: 12 }} onClick={onClose}>Done</button>}
      </div>
    </div>
  );
}
