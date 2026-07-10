import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { marketStats, isCleanerFree, availabilityStatus, occurrenceDates, isWeekend, cleanerBadges } from "../../data/cleaners";
import type { Cleaner } from "../../types";
import { useStore } from "../../context/AppStore";
import BackButton from "../../components/BackButton";
import Avatar from "../../components/Avatar";

type Sort = "rating" | "price" | "reviews" | "favourites";

const SORTS: { key: Sort; label: string }[] = [
  { key: "rating", label: "Top rated" },
  { key: "price", label: "Cheapest" },
  { key: "reviews", label: "Most reviewed" },
  { key: "favourites", label: "♥ Favourites" },
];

const PAGE = 15;

export default function CleanerList() {
  const nav = useNavigate();
  const { bookings, favourites, toggleFavourite, cleaners } = useStore();
  const draft = JSON.parse(sessionStorage.getItem("booking-draft") || "{}");

  // for availability + pricing, sample the first occurrences (perf)
  const dates = occurrenceDates(draft.date || "", draft.recurrence || "none", draft.recurDays || [], draft.endDate || undefined).slice(0, 8);
  const time = draft.time || "11:00";
  const duration = draft.duration || 2;

  // a recurring booking may span both weekday + weekend occurrences
  const hasWeekend = dates.some((d) => isWeekend(d));
  const hasWeekday = dates.some((d) => !isWeekend(d));
  const mixed = hasWeekend && hasWeekday;
  const weekend = hasWeekend && !hasWeekday; // pure weekend
  // Pricing snapshot from the REAL cleaner pool (the live agents), not mock data.
  const stats = marketStats(weekend ? "weekend" : "weekday", cleaners);
  const wkendStats = marketStats("weekend", cleaners);
  // sort/filter use weekday rate as the base when mixed (consistent reference)
  const rateOf = (c: Cleaner) => (weekend ? c.rateWeekend : c.rateWeekday);

  const [sort, setSort] = useState<Sort>("rating");
  const [showFilters, setShowFilters] = useState(false);
  const [minRating, setMinRating] = useState(0);
  const [maxWkday, setMaxWkday] = useState(20);
  const [maxWkend, setMaxWkend] = useState(20);
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [shown, setShown] = useState(PAGE);

  // which price caps are in play depends on the booking's day mix
  const useWkday = mixed || !weekend;   // weekday rate relevant
  const useWkend = mixed || weekend;    // weekend rate relevant
  const activeFilters =
    (minRating > 0 ? 1 : 0) +
    (useWkday && maxWkday < 20 ? 1 : 0) +
    (useWkend && maxWkend < 20 ? 1 : 0) +
    (verifiedOnly ? 1 : 0);

  // When no date/time is chosen yet (browse-only), show ALL cleaners so the user
  // can explore profiles + rates. Availability filtering only applies once they
  // actually pick a slot.
  const hasSlot = !!draft.date || (draft.recurrence && draft.recurrence !== "none" && (draft.recurDays?.length ?? 0) > 0);

  // available + filtered
  const filtered = useMemo(() => {
    return cleaners.filter((c) => {
      // service-area gate: only show cleaners who cover the property's city.
      // Skip when the draft has no city (browse-only) or the cleaner hasn't set
      // a service area yet, so neither case silently hides everyone.
      if (draft.city && c.serviceCities?.length && !c.serviceCities.includes(draft.city)) return false;
      if (hasSlot && !isCleanerFree(c.id, dates, time, duration, bookings, undefined, c)) return false;
      if (c.rating < minRating) return false;
      // 20 = slider max = "Any" (no cap). Only exclude by price when the user
      // actually dragged the cap below 20, otherwise a >€20/hr agent would be
      // silently hidden even though no filter is shown as active.
      if (useWkday && maxWkday < 20 && c.rateWeekday > maxWkday) return false;
      if (useWkend && maxWkend < 20 && c.rateWeekend > maxWkend) return false;
      if (verifiedOnly && !c.verified) return false;
      return true;
    });
  }, [cleaners, dates.join(), time, duration, bookings, minRating, maxWkday, maxWkend, verifiedOnly, weekend, mixed, draft.city, hasSlot]);

  // ranking
  const ranked = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      if (sort === "price") return rateOf(a) - rateOf(b);
      if (sort === "reviews") return b.reviewsCount - a.reviewsCount;
      return b.rating - a.rating;
    });
    return arr;
  }, [filtered, sort, weekend]);

  const page = ranked.slice(0, shown);

  const favMode = sort === "favourites";

  // In favourites mode we show ALL favourites (ignoring the availability +
  // price/rating filters), each tagged with whether they're free for THIS slot.
  const favGroups = useMemo(() => {
    if (!favMode) return { available: [], busy: [] };
    const favs = cleaners.filter((c) => favourites.includes(c.id));
    const withStatus = favs.map((c) => ({ c, status: availabilityStatus(c.id, dates, time, duration, bookings, c) }));
    const available = withStatus.filter((x) => x.status.free).sort((a, b) => b.c.rating - a.c.rating);
    const busy = withStatus.filter((x) => !x.status.free).sort((a, b) => b.c.rating - a.c.rating);
    return { available, busy };
  }, [cleaners, favMode, favourites, dates.join(), time, duration, bookings]);

  return (
    <div className="pad">
      <BackButton to="/book" />
      <h1 className="h1" style={{ marginBottom: 14 }}>Available cleaners</h1>

      {/* market snapshot */}
      <div className="mkt">
        {mixed ? (
          <>
            <div className="mkt__item"><div className="mkt__val">€{stats.avg}</div><div className="mkt__lbl">Avg wkday</div></div>
            <div className="mkt__sep" />
            <div className="mkt__item"><div className="mkt__val">€{wkendStats.avg}</div><div className="mkt__lbl">Avg wknd</div></div>
            <div className="mkt__sep" />
            <div className="mkt__item"><div className="mkt__val">★ {stats.avgRating}</div><div className="mkt__lbl">Avg rating</div></div>
          </>
        ) : (
          <>
            <div className="mkt__item"><div className="mkt__val">€{stats.avg}</div><div className="mkt__lbl">Avg / hr</div></div>
            <div className="mkt__sep" />
            <div className="mkt__item"><div className="mkt__val">€{stats.typical}</div><div className="mkt__lbl">{stats.typicalLabel.replace(" (median)", "")}</div></div>
            <div className="mkt__sep" />
            <div className="mkt__item"><div className="mkt__val">★ {stats.avgRating}</div><div className="mkt__lbl">Avg rating</div></div>
          </>
        )}
      </div>

      {/* sort: all options visible, 2x2 grid */}
      <div className="label" style={{ marginTop: 16 }}>Sort by</div>
      <div className="sortgrid">
        {SORTS.map((s) => (
          <button key={s.key} className={"sortbtn" + (sort === s.key ? " active" : "")} onClick={() => setSort(s.key)}>
            {s.label}
          </button>
        ))}
      </div>

      {!favMode && (
      <button className="filterbtn" style={{ marginTop: 10 }} onClick={() => setShowFilters((s) => !s)}>
        Filters{activeFilters > 0 && <span className="filterbtn__n">{activeFilters}</span>}
        <span style={{ marginLeft: "auto", opacity: .6 }}>{showFilters ? "▲" : "▼"}</span>
      </button>
      )}

      {!favMode && showFilters && (
        <div className="card fadein" style={{ marginTop: 10 }}>
          <div className="between">
            <span className="label" style={{ margin: 0 }}>Min rating</span>
            <b className="tiny">{minRating > 0 ? `★ ${minRating}+` : "Any"}</b>
          </div>
          <input type="range" min={0} max={5} step={0.5} value={minRating}
            onChange={(e) => { setMinRating(+e.target.value); setShown(PAGE); }} style={{ width: "100%" }} />

          {useWkday && (
            <>
              <div className="between" style={{ marginTop: 10 }}>
                <span className="label" style={{ margin: 0 }}>Max {useWkend ? "weekday " : ""}price</span>
                <b className="tiny">{maxWkday < 20 ? `€${maxWkday}/hr` : "Any"}</b>
              </div>
              <input type="range" min={6} max={20} step={1} value={maxWkday}
                onChange={(e) => { setMaxWkday(+e.target.value); setShown(PAGE); }} style={{ width: "100%" }} />
            </>
          )}

          {useWkend && (
            <>
              <div className="between" style={{ marginTop: 10 }}>
                <span className="label" style={{ margin: 0 }}>Max {useWkday ? "weekend " : ""}price</span>
                <b className="tiny">{maxWkend < 20 ? `€${maxWkend}/hr` : "Any"}</b>
              </div>
              <input type="range" min={6} max={20} step={1} value={maxWkend}
                onChange={(e) => { setMaxWkend(+e.target.value); setShown(PAGE); }} style={{ width: "100%" }} />
            </>
          )}

          <div className="row between" style={{ marginTop: 14, cursor: "pointer" }} onClick={() => { setVerifiedOnly((v) => !v); setShown(PAGE); }}>
            <span className="label" style={{ margin: 0 }}>Verified only</span>
            <div className={"switch" + (verifiedOnly ? " on" : "")}><div className="switch__dot" /></div>
          </div>

          {activeFilters > 0 && (
            <button className="btn sm secondary" style={{ marginTop: 14 }}
              onClick={() => { setMinRating(0); setMaxWkday(20); setMaxWkend(20); setVerifiedOnly(false); setShown(PAGE); }}>
              Clear filters
            </button>
          )}
        </div>
      )}

      {favMode ? (
        <FavouritesView
          available={favGroups.available}
          busy={favGroups.busy}
          favourites={favourites}
          toggleFavourite={toggleFavourite}
          rateOf={rateOf}
          mixed={mixed}
          nav={nav}
        />
      ) : (
      <>
      <p className="tiny muted" style={{ margin: "12px 2px 8px" }}>
        {ranked.length} cleaner{ranked.length === 1 ? "" : "s"} match
      </p>

      {ranked.length === 0 ? (
        <div className="empty" style={{ padding: "40px 16px" }}>
          {activeFilters > 0 ? (
            <>
              No cleaners match your filters. Try widening them or picking another time.
              <div style={{ height: 14 }} />
              <button className="btn sm secondary" onClick={() => { setMinRating(0); setMaxWkday(20); setMaxWkend(20); setVerifiedOnly(false); setShown(PAGE); }}>Clear filters</button>
            </>
          ) : (
            hasSlot
              ? "No cleaners available for this city, day and time yet."
              : "No cleaners available yet."
          )}
        </div>
      ) : (
        <>
          {page.map((c) => (
            <div key={c.id} className="clcard" onClick={() => nav("/cleaner/" + c.id)}>
              <Avatar photoUrl={c.photoUrl} emoji={c.photo} name={c.name} className="avatar lg" />
              <div className="clcard__mid">
                <div className="clcard__name">
                  {c.name}
                  <button
                    className={"heart" + (favourites.includes(c.id) ? " on" : "")}
                    onClick={(e) => { e.stopPropagation(); toggleFavourite(c.id); }}
                    title="Favourite"
                  >{favourites.includes(c.id) ? "♥" : "♡"}</button>
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
                {mixed ? (
                  <div className="ratemix">
                    <div><span className="ratemix__lbl">Weekday</span> <b>€{c.rateWeekday}</b></div>
                    <div><span className="ratemix__lbl">Weekend</span> <b>€{c.rateWeekend}</b></div>
                  </div>
                ) : (
                  <>
                    <div className="clcard__rate">€{rateOf(c)}</div>
                    <div className="muted tiny">/ hour</div>
                  </>
                )}
              </div>
            </div>
          ))}

          {shown < ranked.length && (
            <button className="btn secondary" style={{ marginTop: 6 }} onClick={() => setShown((s) => s + PAGE)}>
              Show more ({ranked.length - shown} left)
            </button>
          )}
        </>
      )}
      </>
      )}
    </div>
  );
}

type FavRow = { c: Cleaner; status: { free: boolean; reason: string } };

function FavouritesView({
  available, busy, favourites, toggleFavourite, rateOf, mixed, nav,
}: {
  available: FavRow[];
  busy: FavRow[];
  favourites: string[];
  toggleFavourite: (id: string) => void;
  rateOf: (c: Cleaner) => number;
  mixed: boolean;
  nav: ReturnType<typeof useNavigate>;
}) {
  const total = available.length + busy.length;

  if (total === 0) {
    return (
      <div className="empty" style={{ padding: "40px 16px" }}>
        <div className="big">♡</div>
        No favourites yet. Tap the heart on any cleaner to save them here.
      </div>
    );
  }

  return (
    <div style={{ marginTop: 12 }}>
      <p className="tiny muted" style={{ margin: "0 2px 10px" }}>
        {available.length} of your {total} favourite{total === 1 ? "" : "s"} free for this slot
      </p>

      {available.length > 0 && (
        <>
          <div className="favhdr"><span className="favdot favdot--free" /> Available for this slot</div>
          {available.map(({ c }) => (
            <div key={c.id} className="clcard" onClick={() => nav("/cleaner/" + c.id)}>
              <Avatar photoUrl={c.photoUrl} emoji={c.photo} name={c.name} className="avatar lg" />
              <div className="clcard__mid">
                <div className="clcard__name">
                  {c.name}
                  <button
                    className={"heart" + (favourites.includes(c.id) ? " on" : "")}
                    onClick={(e) => { e.stopPropagation(); toggleFavourite(c.id); }}
                    title="Favourite"
                  >{favourites.includes(c.id) ? "♥" : "♡"}</button>
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
                {mixed ? (
                  <div className="ratemix">
                    <div><span className="ratemix__lbl">Weekday</span> <b>€{c.rateWeekday}</b></div>
                    <div><span className="ratemix__lbl">Weekend</span> <b>€{c.rateWeekend}</b></div>
                  </div>
                ) : (
                  <>
                    <div className="clcard__rate">€{rateOf(c)}</div>
                    <div className="muted tiny">/ hour</div>
                  </>
                )}
              </div>
            </div>
          ))}
        </>
      )}

      {busy.length > 0 && (
        <>
          <div className="favhdr" style={{ marginTop: available.length > 0 ? 18 : 4 }}>
            <span className="favdot favdot--busy" /> Not available for this slot
          </div>
          {busy.map(({ c, status }) => (
            <div key={c.id} className="clcard clcard--busy">
              <Avatar photoUrl={c.photoUrl} emoji={c.photo} name={c.name} className="avatar lg" grayscale />
              <div className="clcard__mid">
                <div className="clcard__name">
                  {c.name}
                  <button
                    className={"heart" + (favourites.includes(c.id) ? " on" : "")}
                    onClick={(e) => { e.stopPropagation(); toggleFavourite(c.id); }}
                    title="Favourite"
                  >{favourites.includes(c.id) ? "♥" : "♡"}</button>
                </div>
                <div className="clcard__meta">
                  <span className="stars">★ {c.rating.toFixed(1)}</span>
                  <span className="muted tiny">· {c.reviewsCount}</span>
                </div>
                <span className="busytag">{status.reason}</span>
              </div>
              <div className="clcard__price">
                <div className="clcard__rate" style={{ opacity: .5 }}>€{rateOf(c)}</div>
                <div className="muted tiny">/ hour</div>
              </div>
            </div>
          ))}
          <p className="tiny muted" style={{ margin: "10px 2px 0", textAlign: "center" }}>
            Change the date or time to free these up.
          </p>
        </>
      )}
    </div>
  );
}
