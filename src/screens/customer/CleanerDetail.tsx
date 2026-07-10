import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { CLEANERS, autoAcceptDecision, isWeekend, occurrenceDates, cleanerBadges } from "../../data/cleaners";
import { priceJob, cleanerCancelRate } from "../../data/platform";
import { useStore } from "../../context/AppStore";
import { notifyUser } from "../../lib/notify";
import BackButton from "../../components/BackButton";
import PaymentPicker from "../../components/PaymentPicker";
import Avatar from "../../components/Avatar";
import type { Booking, Job, Recurrence } from "../../types";

export default function CleanerDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { addBookings, addJobs, bookings, cards, addresses, reviewsFor, favourites, toggleFavourite, customerRep, userName, notify, sendEmail, openAccount, showSupplyWarning, dismissSupplyWarning, dismissBooking, cleaners } = useStore();
  const cleaner = cleaners.find((c) => c.id === id);
  // a real agent's id is a uuid (present in the fetched real list); mocks are c1/c5
  const isRealAgent = !CLEANERS.some((c) => c.id === id);
  const draft = JSON.parse(sessionStorage.getItem("booking-draft") || "{}");

  const linkedCardId = addresses.find((a) => a.id === draft.addrId)?.linkedCardId;
  const [cardId, setCardId] = useState<string>(linkedCardId ?? cards[0]?.id ?? "applepay");
  const [showReviews, setShowReviews] = useState(false);
  const [supplyWarn, setSupplyWarn] = useState(false);    // pre-pay supply warning modal
  const [dontShow, setDontShow] = useState(false);        // "don't show again" tick
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const toggleReview = (id: string) => setExpanded((p) => ({ ...p, [id]: !p[id] }));

  if (!cleaner) return <div className="pad">Not found.</div>;

  const recurrence: Recurrence = draft.recurrence ?? "none";
  const hours = draft.duration ?? 2;
  const occDates: string[] = occurrenceDates(draft.date || "", recurrence, draft.recurDays || [], draft.endDate || undefined);
  const mixed = recurrence !== "none" && occDates.some(isWeekend) && occDates.some((d) => !isWeekend(d));
  const weekend = isWeekend(draft.date || "");
  const urgent = !!draft.urgent;
  const baseRate = weekend ? cleaner.rateWeekend : cleaner.rateWeekday;
  const rate = urgent ? +(baseRate * 1.2).toFixed(2) : baseRate;
  const subtotal = +(rate * hours).toFixed(2);          // cleaner's pay
  const priced = priceJob(subtotal);                     // adds service fee on top
  const total = priced.customerTotal;                    // what the customer pays
  const allReviews = reviewsFor(cleaner.id);

  const decision = autoAcceptDecision(
    cleaner.id, draft.date || "", draft.time || "11:00", hours, bookings,
    Date.now(), customerRep.rating, customerRep.reviewsCount, cleaner
  );

  function confirm() {
    // safety: never book without a real saved property
    if (!addresses.length || !addresses.some((a) => a.id === draft.addrId)) { openAccount(); return; }
    const time = draft.time || "11:00";
    const seriesId = recurrence !== "none" ? crypto.randomUUID() : undefined;
    const prop = addresses.find((a) => a.id === draft.addrId);
    const newBookings: Booking[] = [];
    const newJobs: Job[] = [];

    occDates.forEach((d, i) => {
      const bid = crypto.randomUUID();
      const jid = crypto.randomUUID();
      const wknd = isWeekend(d);
      const r = urgent ? +((wknd ? cleaner!.rateWeekend : cleaner!.rateWeekday) * 1.2).toFixed(2) : (wknd ? cleaner!.rateWeekend : cleaner!.rateWeekday);
      const dec = autoAcceptDecision(cleaner!.id, d, time, hours, bookings, Date.now(), customerRep.rating, customerRep.reviewsCount, cleaner!);
      const auto = dec.decision === "auto";
      const basePay = +(r * hours).toFixed(2);
      const { commission, cleanerPay, customerTotal } = priceJob(basePay);

      newBookings.push({
        id: bid,
        cleanerId: cleaner!.id,
        cleanerName: cleaner!.name,
        cleanerPhoto: cleaner!.photo,
        addressNickname: draft.addressNickname || "My place",
        address: draft.address || "",
        date: d,
        time,
        durationHours: hours,
        ratePerHour: r,
        total: customerTotal,
        commission,
        cleanerPay,
        scope: draft.scope || "whole",
        status: auto ? "confirmed" : "awaiting",
        jobId: jid,
        // Link to the guest stay only for a single-date turnaround (i === 0);
        // a recurring series isn't tied to one checkout.
        externalBookingId: i === 0 ? draft.externalBookingId : undefined,
        createdAt: Date.now(),
        ...(auto ? { confirmedAt: Date.now() } : {}),
        recurring: recurrence !== "none",
        recurrence,
        recurDays: draft.recurDays || [],
        seriesId,
        cardId,
        urgent,
      });

      newJobs.push({
        id: jid,
        customerName: userName || "You (customer)",
        customerRating: customerRep.reviewsCount > 0 ? customerRep.rating : undefined,
        customerReviewsCount: customerRep.reviewsCount,
        customerCancellations: customerRep.cancellations ?? 0,
        type: "Residential",
        propertyType: prop?.propertyType ?? "apartment",
        apartmentNumber: prop?.apartmentNumber,
        floor: prop?.floor,
        address: draft.address || "",
        date: d,
        time,
        durationHours: hours,
        ratePerHour: r,
        cleanerPay,
        bedrooms: prop?.bedrooms ?? 0, bathrooms: prop?.bathrooms ?? 0,
        kitchens: prop?.kitchens ?? 0, commonRooms: prop?.commonRooms ?? 0,
        distanceFromHomeKm: 0, distanceFromPrevKm: null,
        lat: prop?.lat, lng: prop?.lng,
        status: auto ? "approved" : "pending",
        cleanerId: cleaner!.id,
        // route the job to the real agent account when booking one (mock -> null)
        cleanerUid: isRealAgent ? cleaner!.id : undefined,
        bookingId: bid,
        autoAccepted: auto,
        // timeline: alert raised now; auto-accepted jobs are resolved immediately
        alertedAt: Date.now(),
        ...(auto ? { respondedAt: Date.now(), response: "accepted" as const } : {}),
      });
    });

    addBookings(newBookings);
    addJobs(newJobs);
    // Alert the agent side: auto-accepted = a confirmed job, otherwise a request
    // awaiting their approval.
    const first = newJobs[0];
    const anyAuto = newJobs.some((j) => j.autoAccepted);
    const n = newBookings.length;
    // Alert the agent. For a REAL agent, deliver the notification into THEIR row
    // via the notify-user Edge Function (RLS blocks the customer from writing it
    // directly). For a mock cleaner there's no real account, so keep the local
    // notify (harmless, lands in this session only).
    const agentNotif = {
      id: crypto.randomUUID(),
      audience: "agent" as const, kind: "booking_new" as const, jobId: first.id,
      title: anyAuto ? "New booking" : "New booking request",
      body: `${userName || "A customer"} booked ${n > 1 ? `${n} cleanings` : `a cleaning`} · ${draft.addressNickname || draft.address || "their place"} · ${occDates[0]} ${first.time}.`,
      read: false, createdAt: Date.now(),
    };
    if (isRealAgent && cleaner!.id) {
      void notifyUser(cleaner!.id, agentNotif);
    } else {
      notify({ audience: agentNotif.audience, kind: agentNotif.kind, jobId: agentNotif.jobId, title: agentNotif.title, body: agentNotif.body });
    }

    // customer-facing confirmation (in-app + push) so they know it's placed
    const where = draft.addressNickname || draft.address || "your place";
    const whenTxt = `${occDates[0]} at ${first.time}`;
    notify({
      audience: "customer", kind: anyAuto ? "booking_accepted" : "booking_new",
      bookingId: newBookings[0].id,
      title: anyAuto ? "Booking confirmed" : "Booking requested",
      body: anyAuto
        ? `Your cleaning with ${cleaner!.name} · ${where} · ${whenTxt} is confirmed.`
        : `Request sent to ${cleaner!.name} for ${where} · ${whenTxt}. You'll be notified when they respond.`,
    });
    // mock email confirmation to the customer
    const total = newBookings.reduce((s, b) => s + b.total, 0);
    sendEmail(
      anyAuto ? "Your Cinderella booking is confirmed" : "We received your booking request",
      `${anyAuto ? "Confirmed" : "Requested"}: ${n > 1 ? `${n} cleanings` : "cleaning"} with ${cleaner!.name}.\n` +
      `Where: ${where}\nWhen: ${whenTxt}\nTotal: €${total.toFixed(2)}`
    );
    // mock email to the cleaner that a job was assigned (real app: to their inbox)
    // eslint-disable-next-line no-console
    console.info(`[email → ${cleaner!.name} (cleaner)] ${anyAuto ? "New job assigned to you" : "New booking request for you"}\n` +
      `${userName || "A customer"} ${anyAuto ? "booked" : "requested"} ${n > 1 ? `${n} cleanings` : "a cleaning"} · ${where} · ${whenTxt}.` +
      `${anyAuto ? " It's on your schedule." : " Accept or decline in the app."}`);
    // booking placed — drop the in-progress form so a later Book starts fresh
    sessionStorage.removeItem("book-form");
    // if this was a rebook of a cancelled booking, dismiss that cancelled one so
    // it drops off the cancelled view (a new booking replaced it).
    const replaces = sessionStorage.getItem("replaces-booking");
    if (replaces) {
      sessionStorage.removeItem("replaces-booking");
      dismissBooking(replaces);
      notify({
        audience: "customer", kind: "booking_accepted", bookingId: newBookings[0].id,
        title: "Rebooked",
        body: `Your cancelled cleaning at ${where} was replaced with a new booking · ${whenTxt}.`,
      });
    }
    nav("/confirmed/" + newBookings[0].id);
  }

  // must own a property AND have a valid draft address (not a stale one) to book
  const hasProperty = addresses.length > 0;
  const draftAddrValid = !!draft.address && addresses.some((a) => a.id === draft.addrId);
  const canBook = hasProperty && draftAddrValid;

  return (
    <div className="pad">
      <BackButton />

      <div className="row">
        <Avatar photoUrl={cleaner.photoUrl} emoji={cleaner.photo} name={cleaner.name} className="avatar lg" />
        <div className="grow">
          <div className="between">
            <div style={{ fontWeight: 900, fontSize: 19 }}>{cleaner.name}</div>
            <button className={"heart" + (favourites.includes(cleaner.id) ? " on" : "")} style={{ fontSize: 22 }}
              onClick={() => toggleFavourite(cleaner.id)}>{favourites.includes(cleaner.id) ? "♥" : "♡"}</button>
          </div>
          <div className="tiny muted" style={{ marginTop: 2 }}>{cleaner.nationality}</div>
          <div className="row" style={{ gap: 8, marginTop: 4, flexWrap: "wrap" }}>
            <span className="stars">★ {cleaner.rating.toFixed(1)}</span>
            <span className="tiny muted">· {cleaner.reviewsCount} reviews</span>
            <span className="tiny muted">· {cleaner.jobsDone.toLocaleString()} cleanings</span>
          </div>
          {(() => {
            const cr = cleanerCancelRate(cleaner.jobsDone, cleaner.cancellations ?? 0);
            if (!cr) return null;
            const pct = Math.round(cr.rate * 100);
            return (
              <div className="reliability" style={{ marginTop: 5 }}>{pct}% cancellation rate</div>
            );
          })()}
          <div className="badgerow" style={{ marginTop: 6 }}>
            {cleanerBadges(cleaner).map((b) => <span key={b.label} className={"minibadge " + b.cls}>{b.label}</span>)}
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <div className="between"><span className="muted tiny">Weekday rate</span><b>€{cleaner.rateWeekday}/hr</b></div>
        <div className="between" style={{ marginTop: 6 }}><span className="muted tiny">Weekend rate</span><b>€{cleaner.rateWeekend}/hr</b></div>
      </div>

      <div className="h2" style={{ marginTop: 18 }}>Reviews</div>
      <button className="reviewbar" onClick={() => setShowReviews(true)}>
        <span className="reviewbar__score">
          <span className="stars" style={{ fontSize: 16 }}>★ {cleaner.rating.toFixed(1)}</span>
          <span className="tiny muted">{allReviews.length} review{allReviews.length === 1 ? "" : "s"}</span>
        </span>
        <span className="reviewbar__cta">See reviews <span className="reviewbar__chev">›</span></span>
      </button>

      <div className="h2">Your booking</div>
      <div className="card">
        <div className="between"><span className="muted tiny">Date & time</span><b>{draft.date} · {draft.time}</b></div>
        <div className="between" style={{ marginTop: 6 }}><span className="muted tiny">Duration</span><b>{hours}h</b></div>
        <div className="between" style={{ marginTop: 6 }}><span className="muted tiny">Property</span><b>{draft.addressNickname}</b></div>
        {recurrence !== "none" && (
          <div className="between" style={{ marginTop: 6 }}><span className="muted tiny">Repeats</span><b>{recurrence === "weekly" ? "Weekly" : "Every two weeks"} · {(draft.recurDays || []).join(", ")}</b></div>
        )}
        <div className="divider" />
        {mixed ? (
          <>
            <div className="between"><span className="muted tiny">Weekday clean ({cleaner.rateWeekday} × {hours}h)</span><b>€{(cleaner.rateWeekday * hours).toFixed(2)}</b></div>
            <div className="between" style={{ marginTop: 6 }}><span className="muted tiny">Weekend clean ({cleaner.rateWeekend} × {hours}h)</span><b>€{(cleaner.rateWeekend * hours).toFixed(2)}</b></div>
            <div className="between" style={{ marginTop: 6 }}>
              <span className="muted tiny">Service fee · per clean</span>
              <b>+ shown at checkout</b>
            </div>
          </>
        ) : (
          <>
            <div className="between"><span className="muted tiny">Cleaning ({rate} × {hours}h)</span><b>€{subtotal.toFixed(2)}</b></div>
            <div className="between" style={{ marginTop: 6 }}>
              <span className="muted tiny">Service fee</span>
              <b>€{priced.commission.toFixed(2)}</b>
            </div>
            <div className="divider" />
            <div className="between"><b>Total</b><span className="price">€{total.toFixed(2)}</span></div>
          </>
        )}
      </div>

      <div className="label">Pay with</div>
      <PaymentPicker cards={cards} value={cardId} onChange={setCardId} />

      {canBook ? (
        <>
          <div className="infolines">
            {decision.decision === "auto" ? (
              <div className="infoline">
                <span className="infoline__ic ok">✓</span>
                <span>Instant confirmation</span>
              </div>
            ) : (
              <div className="infoline">
                <span className="infoline__ic wait">○</span>
                <span>Needs {cleaner.name.split(" ")[0]}'s approval — you'll be notified</span>
              </div>
            )}
            <div className="infoline">
              <span className="infoline__ic">€</span>
              <span>Charged on the day, after the clean is done</span>
            </div>
            {urgent && (
              <div className="infoline">
                <span className="infoline__ic wait">!</span>
                <span>Urgent booking · +20% applied</span>
              </div>
            )}
            <div className="infoline">
              <span className="infoline__ic">↩</span>
              <span>Free cancellation up to 24h before · later cancels may incur a fee</span>
            </div>
          </div>
          <div style={{ height: 16 }} />
          <button className="btn" onClick={() => { if (showSupplyWarning) setSupplyWarn(true); else confirm(); }}>
            {decision.decision === "auto" ? "Confirm booking" : "Request booking"} · €{total}
          </button>
        </>
      ) : (
        <>
          <div className="note amber" style={{ marginTop: 12 }}>
            Add a property to book — your cleaner needs to know where to go.
          </div>
          <div style={{ height: 14 }} />
          <button className="btn" onClick={openAccount}>Add a property</button>
        </>
      )}

      {supplyWarn && (
        <div className="modal__backdrop" onClick={() => setSupplyWarn(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="between" style={{ marginBottom: 10 }}>
              <b style={{ fontSize: 16 }}>Before you pay</b>
              <button className="iconbtn" onClick={() => setSupplyWarn(false)}>✕</button>
            </div>
            <div className="note amber" style={{ marginTop: 0 }}>
              You must provide <b>all cleaning products, tools and equipment</b> needed for this clean (detergents, cloths, mop, vacuum, etc.).
            </div>
            <button type="button" className={"dontshow" + (dontShow ? " on" : "")} onClick={() => setDontShow((v) => !v)}>
              <span className="dontshow__box">
                {dontShow && (
                  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                )}
              </span>
              <span>Don't show this again</span>
            </button>
            <button className="btn" onClick={() => { if (dontShow) dismissSupplyWarning(); setSupplyWarn(false); confirm(); }}>
              I understand — continue
            </button>
            <div style={{ height: 8 }} />
            <button className="btn secondary" onClick={() => setSupplyWarn(false)}>Go back</button>
          </div>
        </div>
      )}

      {showReviews && (
        <div className="modal__backdrop" onClick={() => setShowReviews(false)}>
          <div className="modal modal--reviews" onClick={(e) => e.stopPropagation()}>
            <div className="between" style={{ marginBottom: 4 }}>
              <b style={{ fontSize: 16 }}>Reviews</b>
              <button className="iconbtn" onClick={() => setShowReviews(false)}>✕</button>
            </div>
            <div className="row" style={{ gap: 8, marginBottom: 10 }}>
              <span className="stars" style={{ fontSize: 16 }}>★ {cleaner.rating.toFixed(1)}</span>
              <span className="tiny muted">· {allReviews.length} review{allReviews.length === 1 ? "" : "s"}</span>
            </div>
            <div className="reviewlist">
              {allReviews.map((r) => {
                const isOpen = !!expanded[r.id];
                const isLong = r.text.length > 140;
                return (
                  <div key={r.id} className="reviewlist__item">
                    <div className="between">
                      <b style={{ fontSize: 14 }}>{r.author}</b>
                      <span className="stars">★ {r.rating}</span>
                    </div>
                    <div
                      className={"tiny muted reviewtext" + (isOpen ? "" : " clamp")}
                      style={{ marginTop: 4, cursor: isLong ? "pointer" : "default" }}
                      onClick={() => isLong && toggleReview(r.id)}
                    >
                      {r.text}
                    </div>
                    {isLong && (
                      <button className="reviewmore" onClick={() => toggleReview(r.id)}>
                        {isOpen ? "Show less" : "Read more"}
                      </button>
                    )}
                    <div className="tiny muted" style={{ marginTop: 6, opacity: 0.7 }}>{r.date}</div>
                  </div>
                );
              })}
              {allReviews.length === 0 && <div className="empty" style={{ padding: 24 }}>No reviews yet.</div>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
