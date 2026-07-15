import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { useStore } from "../../context/AppStore";
import { CLEANERS, isCleanerFree, estimateCleaningHours, isWeekend } from "../../data/cleaners";
import TimeSelect from "../../components/TimeSelect";
import PaymentPicker from "../../components/PaymentPicker";
import PropertyPicker from "../../components/PropertyPicker";
import DatePicker from "../../components/DatePicker";
import Dropdown from "../../components/Dropdown";
import CameraCapture, { type CapturedPhoto } from "../../components/CameraCapture";
import LinkedCalendar, { hasLinkedReservations } from "../../components/LinkedCalendar";
import { priceJob } from "../../data/platform";
import type { Booking, Review, ListingPlatform, ExternalBooking, PropertyAddress } from "../../types";

const PLATFORMS: { v: ListingPlatform; t: string }[] = [
  { v: "airbnb", t: "Airbnb" },
  { v: "booking", t: "Booking.com" },
];

const platformLabel = (p: ListingPlatform) => PLATFORMS.find((x) => x.v === p)?.t ?? "Listing";

// "2026-07-11" -> "Fri 11"
const fmtDayShort = (iso: string) =>
  new Date(iso + "T00:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric" });

// distinct colors assigned per connected listing (stable by connect order)
const LISTING_COLORS = ["#ff5a5f", "#003b95", "#0ea5e9", "#f59e0b", "#8b5cf6", "#10b981"];

type PropertySummary = {
  addrId?: string; color: string; nick: string; platforms: ListingPlatform[];
  nextCheckout?: string; nextCheckoutId?: string; nextCheckin?: string; cover?: Booking;
};

function statusLabel(s: string) {
  return s === "confirmed" ? "Confirmed"
    : s === "awaiting" ? "Awaiting"
    : s === "completed" ? "Completed"
    : s === "upcoming" ? "Confirmed"
    : s;
}
function statusBadge(s: string) {
  return s === "completed" ? "green"
    : s === "awaiting" ? "amber"
    : "sky";
}

export default function Bookings() {
  const { bookings, addresses, cancelBooking, addReview, updateBooking, updateSeries, cancelSeries,
    externalBookings, connectedListings, notify, sendEmail, openAccount, dismissBooking, addManualStay, removeExternalBooking,
    pro } = useStore();
  const [manualOpen, setManualOpen] = useState(false);
  const nav = useNavigate();
  // Linked (Pro channel-manager) vs Unlinked (cleaning) calendar. Show the toggle
  // only when BOTH exist; otherwise show whichever applies.
  const hasLinked = pro && hasLinkedReservations();
  const [calMode, setCalMode] = useState<"linked" | "unlinked">(hasLinked ? "linked" : "unlinked");
  const [reviewFor, setReviewFor] = useState<Booking | null>(null);
  const [editFor, setEditFor] = useState<Booking | null>(null);
  const [refundFor, setRefundFor] = useState<Booking | null>(null);
  const [tipFor, setTipFor] = useState<Booking | null>(null);
  const [seriesFor, setSeriesFor] = useState<string | null>(null);
  const [cancelTicket, setCancelTicket] = useState<Booking | null>(null);

  // color + nickname per PROPERTY (asset). Two listings on one home share color.
  const propMeta = useMemo(() => {
    // stable color per distinct property, keyed by first-seen order
    const colorByAddr: Record<string, string> = {};
    const order: string[] = [];
    connectedListings.forEach((l) => {
      const key = l.addressId ?? "unlinked";
      if (!(key in colorByAddr)) { colorByAddr[key] = LISTING_COLORS[order.length % LISTING_COLORS.length]; order.push(key); }
    });
    const nickByAddr = (addrId: string | undefined) =>
      addresses.find((a) => a.id === addrId)?.nickname ?? "Unlinked listing";
    return { colorByAddr, nickByAddr };
  }, [connectedListings, addresses]);
  // guest-stay color resolves via the stay's listing → its property
  const colorForListing = (listingId: string) => {
    const l = connectedListings.find((x) => x.id === listingId);
    return propMeta.colorByAddr[l?.addressId ?? "unlinked"];
  };
  // color + nickname for a guest stay by its property (used in day panel cards)
  const propForAddr = (addrId: string | undefined) => ({
    color: propMeta.colorByAddr[addrId ?? "unlinked"],
    nick: propMeta.nickByAddr(addrId),
  });
  // distinct properties for legend (one swatch per asset, not per listing).
  // Skip listings whose property no longer exists (orphaned) so no "unlinked".
  const legendProps = useMemo(() => {
    const validIds = new Set(addresses.map((a) => a.id));
    const seen = new Set<string>();
    const out: { color: string; nick: string }[] = [];
    connectedListings.forEach((l) => {
      if (!l.addressId || !validIds.has(l.addressId)) return;
      if (seen.has(l.addressId)) return;
      seen.add(l.addressId);
      out.push({ color: propMeta.colorByAddr[l.addressId], nick: propMeta.nickByAddr(l.addressId) });
    });
    return out;
  }, [connectedListings, addresses, propMeta]);

  // Per-property summary for the default (no day selected) panel: next checkout,
  // next check-in, and whether a cleaning already covers that checkout.
  const propertySummaries = useMemo(() => {
    const todayISO = new Date().toISOString().slice(0, 10);
    const validIds = new Set(addresses.map((a) => a.id));
    const byAddr: Record<string, { addrId?: string; color: string; nick: string; platforms: ListingPlatform[] }> = {};
    connectedListings.forEach((l) => {
      if (!l.addressId || !validIds.has(l.addressId)) return; // skip orphaned
      const key = l.addressId;
      const e = (byAddr[key] ??= { addrId: l.addressId, color: propMeta.colorByAddr[key], nick: propMeta.nickByAddr(l.addressId), platforms: [] });
      if (!e.platforms.includes(l.platform)) e.platforms.push(l.platform);
    });
    return Object.values(byAddr).map((p) => {
      const stays = externalBookings.filter((b) => (b.addressId ?? "unlinked") === (p.addrId ?? "unlinked"));
      const nextStay = stays.filter((s) => s.checkOut >= todayISO).sort((a, b) => a.checkOut.localeCompare(b.checkOut))[0];
      const nextCheckout = nextStay?.checkOut;
      const nextCheckoutId = nextStay?.id;
      const nextCheckin = stays.filter((s) => s.checkIn >= todayISO).map((s) => s.checkIn).sort()[0];
      // cleaning covering the checkout = a live booking for this property on that date
      const cover = nextCheckout
        ? bookings.find((b) => b.status !== "cancelled" && b.status !== "declined" && b.addressNickname === p.nick && b.date === nextCheckout)
        : undefined;
      return { ...p, nextCheckout, nextCheckoutId, nextCheckin, cover };
    });
  }, [connectedListings, externalBookings, bookings, addresses, propMeta]);

  // active = not cancelled/declined AND the property still exists. Deleting a
  // property removes its bookings (incl. completed history) from the calendar.
  const liveNicknames = new Set(addresses.map((a) => a.nickname));
  const visible = bookings.filter(
    (b) => b.status !== "cancelled" && b.status !== "declined" && liveNicknames.has(b.addressNickname)
  );

  // Cleaner-driven cancellations / declines the customer hasn't cleared yet —
  // surfaced as crossed-out rows (mirror of the agent's cancelled Jobs) so the
  // customer can't miss that a cleaner dropped their booking. Newest first.
  const cancelledList = bookings
    .filter((b) =>
      !b.dismissedByCustomer &&
      ((b.status === "cancelled" && b.cancelledBy === "cleaner") || b.status === "declined"))
    .sort((a, b) => (b.cancelledAt ?? 0) - (a.cancelledAt ?? 0));

  // group active recurring bookings into series (one row each)
  const seriesList = useMemo(() => {
    const map: Record<string, Booking[]> = {};
    visible.forEach((b) => { if (b.seriesId) (map[b.seriesId] ??= []).push(b); });
    return Object.entries(map).map(([sid, bs]) => ({
      seriesId: sid,
      sample: bs.slice().sort((a, b) => a.date.localeCompare(b.date))[0],
      count: bs.filter((b) => b.status !== "completed").length,
    }));
  }, [bookings]);

  const seriesBooking = seriesFor ? visible.find((b) => b.seriesId === seriesFor) : null;

  // Prefill the Book form for a guest checkout (property + date + suggested time
  // + duration), then land on Book so the host can still change the time before
  // picking a cleaner.
  function bookTurnaround(addressId: string | undefined, date: string, externalBookingId?: string) {
    const prop = addresses.find((a) => a.id === addressId);
    if (!prop) { openAccount(); return; }
    const est = estimateCleaningHours(prop);
    sessionStorage.setItem("book-preset", JSON.stringify({
      addrId: prop.id, date, time: "11:00", duration: est.suggested, externalBookingId,
    }));
    nav("/book");
  }

  // Rebook a cancelled booking: reuse its exact date/time/duration + property,
  // then land on Book so the customer picks a DIFFERENT cleaner.
  function rebookCancelled(b: Booking) {
    const prop = addresses.find((a) => a.nickname === b.addressNickname);
    sessionStorage.setItem("book-preset", JSON.stringify({
      addrId: prop?.id, date: b.date, time: b.time, duration: b.durationHours,
      // when the replacement booking is placed, dismiss this cancelled one so it
      // drops off the cancelled view (a new booking replaced it).
      replacesBookingId: b.id,
    }));
    nav("/book");
  }

  return (
    <div className="pad">
      {manualOpen && (
        <ManualStayModal
          addresses={addresses}
          onClose={() => setManualOpen(false)}
          onSave={(s) => { addManualStay(s); setManualOpen(false); }}
        />
      )}
      {seriesList.length > 0 && (
        <>
          <div className="label" style={{ marginTop: 4 }}>Recurring schedules</div>
          {seriesList.map((s) => (
            <div key={s.seriesId} className="card row between" style={{ cursor: "pointer" }} onClick={() => setSeriesFor(s.seriesId)}>
              <div className="row">
                <div className="avatar sm">{(s.sample.cleanerName || "C").trim().charAt(0).toUpperCase()}</div>
                <div>
                  <b style={{ fontSize: 14 }}>{s.sample.cleanerName}</b>
                  <div className="tiny muted">{s.sample.addressNickname}</div>
                  <div className="tiny muted">
                    {s.sample.recurrence === "biweekly" ? "Every 2 wks" : "Weekly"} · {(s.sample.recurDays || []).join(", ")} · {s.sample.time} · {s.sample.durationHours}h
                  </div>
                </div>
              </div>
              <span className="tiny muted">Manage ›</span>
            </div>
          ))}
          <div style={{ height: 8 }} />
        </>
      )}

      {(() => {
        const showLinked = hasLinked && (calMode === "linked" || visible.length === 0);
        return (
          <>
            {/* toggle + (linked only) compact manual-booking button — same height */}
            {((hasLinked && visible.length > 0) || showLinked) && (
              <div className="calbar-top">
                {hasLinked && visible.length > 0 && (
                  <div className="segmini">
                    <button className={calMode === "linked" ? "active" : ""} onClick={() => setCalMode("linked")}>Pro</button>
                    <button className={calMode === "unlinked" ? "active" : ""} onClick={() => setCalMode("unlinked")}>Standard</button>
                  </div>
                )}
                {showLinked && (
                  <button className="calbar-top__add" onClick={() => setManualOpen(true)}>+ Add booking</button>
                )}
              </div>
            )}

            {showLinked ? (
              <LinkedCalendar extra={externalBookings} />
            ) : (
              <CalendarView
                bookings={visible}
                cancelledBookings={cancelledList}
                onEdit={(b) => setEditFor(b)}
                onReview={(b) => setReviewFor(b)}
                onRefund={(b) => setRefundFor(b)}
                onTip={(b) => setTipFor(b)}
                onAddForDay={(date) => {
                  sessionStorage.setItem("book-preset", JSON.stringify({ date }));
                  nav("/book");
                }}
              />
            )}
          </>
        );
      })()}

      {cancelledList.length > 0 && (
        <>
          <div className="label" style={{ marginTop: 16, color: "var(--red)" }}>
            {cancelledList.length === 1 ? "Cancelled booking" : "Cancelled bookings"}
          </div>
          {cancelledList.map((b) => {
            const bookingDate = new Date(b.date + "T00:00:00")
              .toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
            const cancelledStamp = b.cancelledAt
              ? `${new Date(b.cancelledAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })} at ${new Date(b.cancelledAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`
              : null;
            return (
              <div key={b.id} className="jobrow jobrow--cancelled" style={{ cursor: "pointer" }}
                onClick={() => setCancelTicket(b)}>
                <div className="jobrow__main">
                  <div className="jobrow__name">{b.cleanerName}</div>
                  <div className="jobrow__bookingwhen">{bookingDate} · {b.time} · {b.durationHours}h</div>
                  <div className="tiny muted">{b.addressNickname}</div>
                  {cancelledStamp && (
                    <div className="jobrow__cancelmeta">{cancelledStamp}</div>
                  )}
                </div>
                <div className="jobrow__cancel">
                  <span className="badge red">{b.status === "declined" ? "Declined" : "Cancelled"}</span>
                  <button
                    className="jobrow__dismiss"
                    aria-label="Remove cancelled booking"
                    title="Remove from list"
                    onClick={(e) => { e.stopPropagation(); dismissBooking(b.id); }}
                  >
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
                  </button>
                </div>
              </div>
            );
          })}
        </>
      )}

      {reviewFor && (
        <ReviewModal
          booking={reviewFor}
          onClose={() => setReviewFor(null)}
          onSubmit={(rating, text) => {
            const r: Review = {
              id: "ur" + Date.now(), author: "Savvas (you)", rating, text,
              date: new Date().toISOString().slice(0, 10),
            };
            addReview(reviewFor.cleanerId, r);
            updateBooking(reviewFor.id, { rating, reviewText: text });
            notify({
              audience: "agent", kind: "review_new", jobId: reviewFor.jobId,
              title: "New review", body: `You got a ${rating}★ review for ${reviewFor.addressNickname} (${reviewFor.date}).`,
            });
            // mock email to the cleaner that they were rated
            sendEmail(`You received a ${rating}★ review`,
              `${reviewFor.cleanerName}, a customer rated your cleaning at ${reviewFor.addressNickname} ${rating}★.${text ? `\n"${text}"` : ""}`);
            setReviewFor(null);
          }}
        />
      )}

      {editFor && (
        <EditModal
          booking={editFor}
          onClose={() => setEditFor(null)}
          onSave={(patch) => {
            updateBooking(editFor.id, patch);
            notify({
              audience: "agent", kind: "booking_modified", jobId: editFor.jobId,
              title: "Booking updated",
              body: `${editFor.addressNickname} cleaning changed to ${patch.date ?? editFor.date} at ${patch.time ?? editFor.time}.`,
            });
            setEditFor(null);
          }}
        />
      )}

      {tipFor && (
        <TipModal
          booking={tipFor}
          onClose={() => setTipFor(null)}
          onSubmit={(amt) => {
            updateBooking(tipFor.id, { tip: amt });
            notify({
              audience: "agent", kind: "tip_new", jobId: tipFor.jobId,
              title: "You got a tip", body: `A customer tipped you €${amt} for ${tipFor.addressNickname}.`,
            });
            setTipFor(null);
          }}
        />
      )}

      {refundFor && (
        <RefundModal
          booking={refundFor}
          onClose={() => setRefundFor(null)}
          onSubmit={(reason, note, photos) => {
            updateBooking(refundFor.id, {
              refund: { status: "pending", reason, note, hasPhoto: photos.length > 0, photos, date: new Date().toISOString().slice(0, 10) },
            });
            notify({
              audience: "agent", kind: "refund_requested", jobId: refundFor.jobId,
              title: "Refund requested", body: `A customer opened a refund on ${refundFor.addressNickname} (${refundFor.date}): "${reason}".`,
            });
            setRefundFor(null);
          }}
        />
      )}

      {seriesFor && seriesBooking && (
        <SeriesModal
          sample={seriesBooking}
          onClose={() => setSeriesFor(null)}
          onSave={(patch) => {
            updateSeries(seriesFor, patch);
            notify({
              audience: "agent", kind: "booking_modified", jobId: seriesBooking.jobId,
              title: "Recurring booking updated",
              body: `${seriesBooking.addressNickname} recurring cleaning times were updated.`,
            });
            setSeriesFor(null);
          }}
          onCancelSeries={() => { cancelSeries(seriesFor); setSeriesFor(null); }}
        />
      )}

      {cancelTicket && (
        <CancelledTicketModal
          booking={cancelTicket}
          onClose={() => setCancelTicket(null)}
          onRebook={() => { rebookCancelled(cancelTicket); setCancelTicket(null); }}
          onRemove={() => { dismissBooking(cancelTicket.id); setCancelTicket(null); }}
        />
      )}
    </div>
  );
}

/* ---------------- Cancelled booking ticket ---------------- */
function CancelledTicketModal({ booking, onClose, onRebook, onRemove }: {
  booking: Booking; onClose: () => void; onRebook: () => void; onRemove: () => void;
}) {
  const b = booking;
  const base = +(b.cleanerPay ?? b.ratePerHour * b.durationHours).toFixed(2) || 0;
  const fee = b.commission ?? priceJob(base).commission;
  const total = b.total ?? priceJob(base).customerTotal;
  const bookingDate = new Date(b.date + "T00:00:00")
    .toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const stamp = b.cancelledAt
    ? `${new Date(b.cancelledAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })} at ${new Date(b.cancelledAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`
    : null;
  const label = b.status === "declined" ? "Declined" : "Cancelled";
  return (
    <Modal title="Cancelled booking" onClose={onClose}>
      <div className="card" style={{ borderLeft: "3px solid var(--red)", marginBottom: 12 }}>
        <div className="between">
          <b style={{ fontSize: 15 }}>{b.cleanerName}</b>
          <span className="badge red">{label}</span>
        </div>
        <div className="tiny muted" style={{ marginTop: 4 }}>{b.addressNickname}</div>
        <div className="divider" />
        <div className="between"><span className="muted tiny">When</span><b>{bookingDate}</b></div>
        <div className="between" style={{ marginTop: 6 }}><span className="muted tiny">Time</span><b>{b.time} · {b.durationHours}h</b></div>
        <div className="divider" />
        <div className="between"><span className="muted tiny">Cleaning</span><b>€{base.toFixed(2)}</b></div>
        <div className="between" style={{ marginTop: 6 }}><span className="muted tiny">Service fee</span><b>€{fee.toFixed(2)}</b></div>
        <div className="between" style={{ marginTop: 6 }}><b>Total</b><span className="price">€{total.toFixed(2)}</span></div>
        {stamp && <div className="jobrow__cancelmeta" style={{ marginTop: 10 }}>{label} on {stamp}</div>}
      </div>
      <button className="btn agent" onClick={onRebook}>Rebook · find another cleaner</button>
      <div style={{ height: 8 }} />
      <button className="btn secondary" onClick={onRemove}>Remove from list</button>
    </Modal>
  );
}

/* ---------------- Series modal (edit recurring) ---------------- */
function SeriesModal({ sample, onClose, onSave, onCancelSeries }: {
  sample: Booking; onClose: () => void;
  onSave: (patch: Partial<Booking>) => void;
  onCancelSeries: () => void;
}) {
  const [time, setTime] = useState(sample.time);
  const [duration, setDuration] = useState(sample.durationHours);
  const [confirmCancel, setConfirmCancel] = useState(false);
  return (
    <Modal onClose={onClose} title={`${sample.cleanerName} — recurring`}>
      <div className="tiny muted" style={{ marginBottom: 4 }}>{sample.addressNickname}</div>
      <div className="tiny muted" style={{ marginBottom: 12 }}>
        {sample.recurrence === "biweekly" ? "Every 2 weeks" : "Weekly"} · {(sample.recurDays || []).join(", ")} · applies to all upcoming cleans
      </div>
      <div className="label">Time</div>
      <TimeSelect value={time} onChange={setTime} />
      <div className="label">Duration (hours)</div>
      <div className="between card" style={{ padding: 8 }}>
        <button className="iconbtn" onClick={() => setDuration((d) => Math.max(1, +(d - 0.5).toFixed(1)))}>−</button>
        <div style={{ fontWeight: 800, fontSize: 18 }}>{duration}</div>
        <button className="iconbtn" onClick={() => setDuration((d) => Math.min(10, +(d + 0.5).toFixed(1)))}>+</button>
      </div>
      <div style={{ height: 14 }} />
      <button className="btn" onClick={() => {
        // Pass only time + duration; updateSeries recomputes each booking's price
        // from its own per-day rate (weekday vs weekend differ across the series).
        onSave({ time, durationHours: duration });
      }}>Save to all upcoming cleans</button>
      <div style={{ height: 10 }} />
      {confirmCancel ? (
        <div className="cancelconfirm">
          <b style={{ fontSize: 14 }}>Cancel the whole schedule?</b>
          <div className="tiny muted" style={{ margin: "4px 0 12px" }}>
            All upcoming cleans in this recurring series will be cancelled.
          </div>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn sm secondary grow" onClick={() => setConfirmCancel(false)}>Keep schedule</button>
            <button className="btn sm danger grow" onClick={onCancelSeries}>Yes, cancel all</button>
          </div>
        </div>
      ) : (
        <button className="btn danger" onClick={() => setConfirmCancel(true)}>Cancel whole schedule</button>
      )}
    </Modal>
  );
}

/* ---------------- Review modal ---------------- */
function ReviewModal({ booking, onClose, onSubmit }: {
  booking: Booking; onClose: () => void; onSubmit: (rating: number, text: string) => void;
}) {
  const [rating, setRating] = useState(booking.rating ?? 0);
  const [text, setText] = useState(booking.reviewText ?? "");
  return (
    <Modal onClose={onClose} title={`Review ${booking.cleanerName}`}>
      <div className="ratestars" style={{ justifyContent: "center", display: "flex", marginBottom: 12 }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} className={"rstar big" + (n <= rating ? " on" : "")} onClick={() => setRating(n)}>★</button>
        ))}
      </div>
      <textarea className="input" rows={4} placeholder="How was the cleaning?" value={text} onChange={(e) => setText(e.target.value)} />
      <div style={{ height: 12 }} />
      <button className="btn" disabled={rating === 0} style={{ opacity: rating === 0 ? 0.5 : 1 }}
        onClick={() => onSubmit(rating, text)}>Submit review</button>
    </Modal>
  );
}

/* ---------------- Tip modal ---------------- */
function TipModal({ booking, onClose, onSubmit }: {
  booking: Booking; onClose: () => void; onSubmit: (amount: number) => void;
}) {
  const [amount, setAmount] = useState(5);
  const presets = [3, 5, 10, 15];
  return (
    <Modal onClose={onClose} title={`Tip ${booking.cleanerName}`}>
      <p className="sub" style={{ marginTop: 0 }}>100% goes to the cleaner. A little thanks for a great job.</p>
      <div className="row" style={{ gap: 8 }}>
        {presets.map((p) => (
          <button key={p} className={"sortbtn" + (amount === p ? " active" : "")} style={{ flex: 1 }} onClick={() => setAmount(p)}>€{p}</button>
        ))}
      </div>
      <div className="label">Custom amount</div>
      <div className="fieldbox"><span className="fieldbox__ic">€</span>
        <input type="number" value={amount} min={1} onChange={(e) => setAmount(+e.target.value)} />
      </div>
      <div style={{ height: 14 }} />
      <button className="btn" disabled={amount < 1} style={{ opacity: amount < 1 ? 0.5 : 1 }} onClick={() => onSubmit(amount)}>Send €{amount} tip</button>
    </Modal>
  );
}

/* ---------------- Refund modal ---------------- */
const REFUND_REASONS = ["Cleaner didn't show up", "Poor quality", "Didn't finish the job", "Arrived very late", "Damage caused", "Other"];

// Refund request window: 24 hours after the cleaning. Kept short so the window
// closes before the cleaner is paid out — no disputes after payout.
const REFUND_WINDOW_MS = 24 * 60 * 60 * 1000;
// True while a completed booking is still inside its 24h refund window.
function refundOpen(booking: Booking): boolean {
  return (Date.now() - new Date(booking.date + "T23:59:59").getTime()) < REFUND_WINDOW_MS;
}

function RefundModal({ booking, onClose, onSubmit }: {
  booking: Booking; onClose: () => void; onSubmit: (reason: string, note: string, photos: string[]) => void;
}) {
  const [reason, setReason] = useState(REFUND_REASONS[0]);
  const [note, setNote] = useState("");
  const [photos, setPhotos] = useState<CapturedPhoto[]>([]);
  const [cam, setCam] = useState(false);
  const hasPhoto = photos.length > 0;

  // Refunds must be requested within 24h of the cleaning. Measured from the end
  // of the cleaning day so a same-day request always qualifies.
  const withinWindow = (Date.now() - new Date(booking.date + "T23:59:59").getTime()) < REFUND_WINDOW_MS;

  return (
    <Modal onClose={onClose} title="Request a refund">
      {!withinWindow ? (
        <div className="note amber">Refunds can only be requested within 24 hours of the cleaning.</div>
      ) : (
        <>
          <p className="sub" style={{ marginTop: 0 }}>{booking.cleanerName} · {booking.date} · €{booking.total}</p>
          <div className="label">Reason</div>
          <Dropdown value={reason} options={REFUND_REASONS} onChange={setReason} />
          <div className="label">Tell us what happened</div>
          <textarea className="input" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Describe the issue…" />
          <button className={"photoadd" + (hasPhoto ? " on" : "")} onClick={() => setCam(true)}>
            {hasPhoto ? `${photos.length} photo(s) captured` : "Take photos in-app (recommended)"}
          </button>
          <div className="note" style={{ marginTop: 12 }}>
            This is a request, not an instant refund. Our team reviews it with the cleaner and decides within a few days. In-app photos are time-stamped at capture, so they prove when the issue was seen.
          </div>
          <div style={{ height: 14 }} />
          <button className="btn" disabled={!note.trim()} style={{ opacity: !note.trim() ? 0.5 : 1 }}
            onClick={() => onSubmit(reason, note, photos.map((p) => p.url).filter((u): u is string => !!u))}>Submit request</button>
        </>
      )}
      {cam && (
        <CameraCapture
          title="Photograph the issue"
          folder="dispute"
          onClose={() => setCam(false)}
          onDone={(p) => { setPhotos(p); setCam(false); }}
        />
      )}
    </Modal>
  );
}

/* ---------------- Edit modal ---------------- */
function EditModal({ booking, onClose, onSave }: {
  booking: Booking; onClose: () => void; onSave: (patch: Partial<Booking>) => void;
}) {
  const { cards, addresses, cancelBooking, bookings, cleaners } = useStore();
  const [date, setDate] = useState(booking.date);
  const [time, setTime] = useState(booking.time);
  const [duration, setDuration] = useState(booking.durationHours);
  const [cardId, setCardId] = useState(booking.cardId ?? cards[0]?.id ?? "");
  const [cleanerId, setCleanerId] = useState(booking.cleanerId);
  // property: match by nickname (bookings store nickname+address, not id)
  const startAddr = addresses.find((a) => a.nickname === booking.addressNickname);
  const [addrId, setAddrId] = useState(startAddr?.id ?? addresses[0]?.id ?? "");
  const addr = addresses.find((a) => a.id === addrId);

  // Modify grace window: changes allowed for 3 hours after booking, then it
  // locks to cancel-only. Bookings already in the past are always locked.
  // Seed bookings without a createdAt are treated as outside the window.
  const GRACE_MS = 3 * 60 * 60 * 1000;
  const isFuture = new Date(booking.date + "T23:59:59").getTime() > Date.now();
  const graceLeftMs = booking.createdAt ? booking.createdAt + GRACE_MS - Date.now() : -1;
  const editable = isFuture && graceLeftMs > 0;
  const tooLate = !editable;
  const graceMins = Math.max(0, Math.round(graceLeftMs / 60000));

  const [confirmCancel, setConfirmCancel] = useState(false);

  const chosen = cleaners.find((c) => c.id === cleanerId);
  const isRealChosen = !CLEANERS.some((c) => c.id === cleanerId);
  const currentAvailable = isCleanerFree(cleanerId, [date], time, duration, bookings, booking.id, isRealChosen ? chosen : undefined);
  // "switch to another cleaner" alternatives stay within the mock pool for now
  const alternatives = CLEANERS.filter((c) => isCleanerFree(c.id, [date], time, duration, bookings, booking.id));

  function save() {
    const c = CLEANERS.find((x) => x.id === cleanerId)!;
    // rate depends on the booking date (weekday vs weekend)
    const rate = isWeekend(date) ? c.rateWeekend : c.rateWeekday;
    const { commission, cleanerPay, customerTotal } = priceJob(+(rate * duration).toFixed(2));
    onSave({
      date, time, durationHours: duration, cardId, cleanerId,
      cleanerName: c.name, cleanerPhoto: c.photo,
      addressNickname: addr?.nickname ?? booking.addressNickname,
      address: addr?.address ?? booking.address,
      ratePerHour: rate,
      total: customerTotal, commission, cleanerPay,
    });
  }

  function doCancel() {
    cancelBooking(booking.id);
    onClose();
  }

  return (
    <Modal onClose={onClose} title="Modify booking">
      {tooLate ? (
        <div className="note amber">
          The 3-hour window to change this booking has passed{isFuture ? "" : " (the cleaning date is in the past)"}. You can still cancel it below.
        </div>
      ) : (
        <>
          <div className="note" style={{ marginBottom: 12 }}>
            You can edit this booking for {graceMins >= 60 ? `${Math.floor(graceMins / 60)}h ${graceMins % 60}m` : `${graceMins}m`} more. After that it's cancel-only.
          </div>
          <div className="label">Property</div>
          <PropertyPicker addresses={addresses} value={addrId} onChange={setAddrId} />

          <div className="label">Date</div>
          <DatePicker value={date} onChange={setDate} />
          <div className="label">Time</div>
          <TimeSelect value={time} onChange={setTime} />

          <div className="label">Duration (hours)</div>
          <div className="between card" style={{ padding: 8 }}>
            <button className="iconbtn" onClick={() => setDuration((d) => Math.max(1, +(d - 0.5).toFixed(1)))}>−</button>
            <div style={{ fontWeight: 800, fontSize: 18 }}>{duration}</div>
            <button className="iconbtn" onClick={() => setDuration((d) => Math.min(10, +(d + 0.5).toFixed(1)))}>+</button>
          </div>

          {!currentAvailable && (
            <div className="note amber" style={{ marginTop: 12 }}>
              {chosen?.name} isn't available on {date} at {time} for {duration}h (day off or already booked). Please choose another cleaner below.
            </div>
          )}

          <div className="label" style={{ marginTop: 12 }}>Cleaner</div>
          {currentAvailable ? (
            <div className="card row between" style={{ marginTop: 0 }}>
              <div className="row"><div className="avatar sm">{(chosen?.name || "C").trim().charAt(0).toUpperCase()}</div><b style={{ fontSize: 14 }}>{chosen?.name}</b></div>
              <span className="badge green">Available</span>
            </div>
          ) : (
            <select className="input" value={alternatives.find((a) => a.id === cleanerId) ? cleanerId : ""} onChange={(e) => setCleanerId(e.target.value)}>
              <option value="" disabled>Select an available cleaner…</option>
              {alternatives.map((c) => (
                <option key={c.id} value={c.id}>{c.name} · €{c.rateWeekday}/hr · ★{c.rating.toFixed(1)}</option>
              ))}
            </select>
          )}

          <div className="label" style={{ marginTop: 12 }}>Pay with</div>
          <PaymentPicker cards={cards} value={cardId} onChange={setCardId} />

          <div style={{ height: 14 }} />
          {(() => {
            const c = CLEANERS.find((x) => x.id === cleanerId);
            const rate = c ? (isWeekend(date) ? c.rateWeekend : c.rateWeekday) : booking.ratePerHour;
            const subtotal = c ? +(rate * duration).toFixed(2) : booking.cleanerPay ?? booking.total;
            const priced = priceJob(subtotal);
            const newTotal = c ? priced.customerTotal : booking.total;
            const blocked = !currentAvailable && !alternatives.find((a) => a.id === cleanerId);
            return (
              <>
                <div className="card" style={{ marginBottom: 12 }}>
                  <div className="between"><span className="muted tiny">Cleaning ({rate} × {duration}h)</span><b>€{subtotal.toFixed(2)}</b></div>
                  <div className="between" style={{ marginTop: 6 }}><span className="muted tiny">Service fee</span><b>€{priced.commission.toFixed(2)}</b></div>
                  <div className="divider" />
                  <div className="between"><b>Total</b><span className="price">€{newTotal.toFixed(2)}</span></div>
                </div>
                <button className="btn" disabled={blocked} style={{ opacity: blocked ? 0.5 : 1 }} onClick={save}>
                  Save changes · €{newTotal.toFixed(2)}
                </button>
              </>
            );
          })()}
        </>
      )}

      <div style={{ height: 10 }} />
      {confirmCancel ? (
        <div className="cancelconfirm">
          <b style={{ fontSize: 14 }}>Cancel this booking?</b>
          <div className="tiny muted" style={{ margin: "4px 0 12px" }}>
            {booking.cleanerName} · {booking.date} · {booking.time}. This can't be undone.
          </div>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn sm secondary grow" onClick={() => setConfirmCancel(false)}>Keep booking</button>
            <button className="btn sm danger grow" onClick={doCancel}>Yes, cancel</button>
          </div>
        </div>
      ) : (
        <button className="btn danger" onClick={() => setConfirmCancel(true)}>Cancel this booking</button>
      )}
    </Modal>
  );
}

/* ---------------- generic modal ---------------- */
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: any }) {
  return (
    <div className="modal__backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="between" style={{ marginBottom: 12 }}>
          <b style={{ fontSize: 16 }}>{title}</b>
          <button className="iconbtn" onClick={onClose}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ---------------- calendar ---------------- */
function CalendarView({
  bookings, cancelledBookings, onEdit, onReview, onRefund, onTip, onAddForDay,
}: {
  bookings: Booking[];
  cancelledBookings: Booking[];
  onEdit: (b: Booking) => void;
  onReview: (b: Booking) => void;
  onRefund: (b: Booking) => void;
  onTip: (b: Booking) => void;
  onAddForDay: (date: string) => void;
}) {
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [selected, setSelected] = useState<string | null>(null);

  // Deep-link from a notification: jump to the tapped booking's day + month.
  useEffect(() => {
    const focusId = sessionStorage.getItem("focus-booking");
    if (!focusId) return;
    sessionStorage.removeItem("focus-booking");
    const bk = bookings.find((b) => b.id === focusId);
    if (!bk?.date) return;
    const d = new Date(bk.date + "T00:00:00");
    if (isNaN(d.getTime())) return;
    setMonth(new Date(d.getFullYear(), d.getMonth(), 1));
    setSelected(bk.date);
  }, [bookings]);

  const y = month.getFullYear();
  const m = month.getMonth();
  const first = new Date(y, m, 1);
  const startDow = (first.getDay() + 6) % 7; // make Monday=0
  const daysInMonth = new Date(y, m + 1, 0).getDate();

  const byDate = useMemo(() => {
    const map: Record<string, Booking[]> = {};
    bookings.forEach((b) => { (map[b.date] ??= []).push(b); });
    return map;
  }, [bookings]);

  // cleaner-cancelled/declined bookings the customer hasn't cleared, keyed by
  // the booking's DATE — drives the red day dot + the selected-day cancelled card.
  const cancelledByDate = useMemo(() => {
    const map: Record<string, Booking[]> = {};
    cancelledBookings.forEach((b) => { (map[b.date] ??= []).push(b); });
    return map;
  }, [cancelledBookings]);

  const nowD = new Date();
  const atCurrentMonth = y === nowD.getFullYear() && m === nowD.getMonth();
  const monthName = month.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  const cells: (number | null)[] = [...Array(startDow).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];

  function iso(day: number) {
    return `${y}-${String(m + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  const todayD = new Date();
  const today = `${todayD.getFullYear()}-${String(todayD.getMonth() + 1).padStart(2, "0")}-${String(todayD.getDate()).padStart(2, "0")}`;

  const selBookings = selected ? byDate[selected] ?? [] : [];

  return (
    <div style={{ marginTop: 8 }}>
      <div className="between" style={{ marginBottom: 10 }}>
        <button className="iconbtn" disabled={atCurrentMonth} style={{ opacity: atCurrentMonth ? 0.35 : 1 }}
          onClick={() => { if (!atCurrentMonth) setMonth(new Date(y, m - 1, 1)); }}>‹</button>
        <b>{monthName}</b>
        <button className="iconbtn" onClick={() => setMonth(new Date(y, m + 1, 1))}>›</button>
      </div>
      <div className="calgrid calhead">
        {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => <div key={i} className="caldow">{d}</div>)}
      </div>
      <div className="calgrid">
        {cells.map((day, i) => {
          if (day === null) return <div key={i} />;
          const date = iso(day);
          const dayBookings = byDate[date] ?? [];
          const cleanStatus = dayBookings.length
            ? (dayBookings.some((b) => b.status === "confirmed" || b.status === "upcoming") ? "up"
              : dayBookings.some((b) => b.status === "awaiting") ? "wait" : "done")
            : null;
          const hasCancelled = (cancelledByDate[date] ?? []).length > 0;
          const isPast = date < today;
          const cls =
            "calcell" +
            (dayBookings.length || hasCancelled ? " has" : "") +
            (date === today ? " today" : "") +
            (isPast ? " past" : "") +
            (selected === date ? " sel" : "");
          const clickable = !isPast || hasCancelled;
          return (
            <button key={i} className={cls} disabled={!clickable} onClick={() => { if (clickable) setSelected((cur) => (cur === date ? null : date)); }}>
              <span className="calhd">
                <span className="calnum">{day}</span>
              </span>
              <span className="caldots">
                {cleanStatus && <span className={"cdot " + cleanStatus} />}
                {hasCancelled && <span className="cdot cancelled" />}
              </span>
            </button>
          );
        })}
      </div>

      <div className="callegend">
        <div className="callegend__grp">
          <span className="callegend__lbl">Cleaning status</span>
          <span><span className="cdot up" /> Confirmed</span>
          <span><span className="cdot wait" /> Awaiting</span>
          <span><span className="cdot done" /> Completed</span>
          <span><span className="cdot cancelled" /> Cancelled</span>
        </div>
      </div>

      {selected && (
        <>
          <div className="between" style={{ marginTop: 18, marginBottom: 6 }}>
            <div className="h2" style={{ margin: 0 }}>
              {new Date(selected + "T00:00:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}
            </div>
            <button className="btn sm" onClick={() => onAddForDay(selected)}>+ Add</button>
          </div>

          {selBookings.length === 0 && (
            <div className="emptyday">
              <div className="emptyday__ic">
                <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4.5" width="18" height="16" rx="3" /><path d="M8 2.5v4M16 2.5v4M3 9h18" />
                </svg>
              </div>
              <b style={{ fontSize: 14 }}>Nothing booked</b>
              <p className="sub" style={{ margin: "3px 0 0", fontSize: 12.5 }}>This day is free. Book a cleaner whenever you're ready.</p>
              <button className="btn sm" style={{ marginTop: 12 }} onClick={() => onAddForDay(selected!)}>Book a cleaner</button>
            </div>
          )}

          {selBookings.length > 0 && <div className="label" style={{ marginTop: 4 }}>Cleanings</div>}
          {selBookings.map((b) => (
            <div key={b.id} className="card">
              <div className="row">
                <div className="avatar">{(b.cleanerName || "C").trim().charAt(0).toUpperCase()}</div>
                <div className="grow">
                  <div className="between">
                    <b style={{ fontSize: 14 }}>{b.cleanerName}</b>
                    <span className={"badge " + statusBadge(b.status)}>{statusLabel(b.status)}</span>
                  </div>
                  <div className="tiny muted">{b.addressNickname}</div>
                  {(() => {
                    // Always show the fee split. Older bookings/seed may lack the
                    // commission field — derive it from cleaner pay (or rate×hours)
                    // so the breakdown is consistent everywhere.
                    const base = +(b.cleanerPay ?? b.ratePerHour * b.durationHours).toFixed(2) || 0;
                    const fee = b.commission ?? priceJob(base).commission;
                    const total = b.total ?? priceJob(base).customerTotal;
                    return (
                      <>
                        <div className="tiny muted">{b.time} · {b.durationHours}h</div>
                        <div className="tiny muted">Cleaning €{base.toFixed(2)} + service fee €{fee.toFixed(2)}</div>
                        <div className="tiny" style={{ fontWeight: 700 }}>Total €{total.toFixed(2)}</div>
                      </>
                    );
                  })()}
                </div>
              </div>
              {(b.status === "upcoming" || b.status === "confirmed" || b.status === "awaiting") && (
                <div className="row" style={{ gap: 8, marginTop: 10 }}>
                  <button className="btn sm secondary grow" onClick={() => onEdit(b)}>Modify</button>
                </div>
              )}
              {b.status === "completed" && (
                <>
                  {b.refund && (
                    <div className={"refundtag " + b.refund.status}>
                      {b.refund.status === "pending" ? "Refund under review"
                        : b.refund.status === "approved" ? "Refund approved"
                        : "Refund declined"}
                    </div>
                  )}
                  {b.tip ? (
                    <div className="refundtag approved" style={{ marginTop: 10 }}>You tipped €{b.tip}</div>
                  ) : null}
                  <div className="row" style={{ gap: 8, marginTop: 10 }}>
                    <button className="btn sm secondary grow" onClick={() => onReview(b)}>
                      {b.rating ? "Edit review" : "Leave a review"}
                    </button>
                    {!b.tip && (
                      <button className="btn sm secondary grow" onClick={() => onTip(b)}>Tip</button>
                    )}
                  </div>
                  {!b.refund && (
                    refundOpen(b) ? (
                      <button className="btn sm secondary" style={{ marginTop: 8 }} onClick={() => onRefund(b)}>Request refund</button>
                    ) : (
                      <div className="tiny muted" style={{ marginTop: 8 }}>Refund window closed (24h after the cleaning).</div>
                    )
                  )}
                </>
              )}
            </div>
          ))}

        </>
      )}
    </div>
  );
}

// Add a booked stay by hand (e.g. a direct guest, not via Airbnb/Booking).
// Saves as an external booking with platform "other" so it shows on the calendar
// and blocks the other platforms via the combined export feed.
function ManualStayModal({
  addresses, onClose, onSave,
}: {
  addresses: PropertyAddress[];
  onClose: () => void;
  onSave: (s: ExternalBooking) => void;
}) {
  const [addrId, setAddrId] = useState(addresses[0]?.id ?? "");
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [guest, setGuest] = useState("");
  const valid = addrId && checkIn && checkOut && checkOut > checkIn;
  function save() {
    if (!valid) return;
    onSave({
      id: crypto.randomUUID(),
      listingId: "",
      platform: "other",
      guest: guest.trim() || "Direct booking",
      checkIn, checkOut,
      addressId: addrId,
    });
  }
  // Render into document.body via a portal so the modal escapes the swipe-pager's
  // transformed track. A position:fixed element inside a transformed ancestor is
  // positioned relative to that ancestor, not the viewport — that's why the popup
  // was landing on the wrong (Search) page slot. The portal fixes it.
  return createPortal(
    <div className="modal__backdrop" onClick={onClose}
      style={{ position: "fixed", alignItems: "flex-start", paddingTop: "calc(env(safe-area-inset-top) + 40px)", overflowY: "auto" }}>
      <div className="modal" onClick={(e) => e.stopPropagation()}
        style={{ borderRadius: 18, maxHeight: "none", width: "calc(100% - 32px)", maxWidth: 420 }}>
        <div className="between" style={{ marginBottom: 8 }}>
          <b style={{ fontSize: 17 }}>Add a booking</b>
          <button className="iconbtn" onClick={onClose}>✕</button>
        </div>

        <div className="label">Property</div>
        <PropertyPicker addresses={addresses} value={addrId} onChange={setAddrId} />

        <div className="label" style={{ marginTop: 12 }}>Check-in</div>
        <DatePicker value={checkIn} onChange={setCheckIn} />

        <div className="label" style={{ marginTop: 12 }}>Check-out</div>
        <DatePicker value={checkOut} onChange={setCheckOut} />
        {checkIn && checkOut && checkOut <= checkIn && (
          <div className="loginerr" style={{ marginTop: 6 }}>Check-out must be after check-in.</div>
        )}

        <div className="label" style={{ marginTop: 12 }}>Guest name (optional)</div>
        <input className="input" value={guest} placeholder="e.g. John S." onChange={(e) => setGuest(e.target.value)} />

        <div style={{ height: 14 }} />
        <button className="btn" disabled={!valid} style={{ opacity: valid ? 1 : 0.5 }} onClick={save}>Add booking</button>
      </div>
    </div>,
    document.body,
  );
}
