import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useStore } from "../../context/AppStore";
import { estimateCleaningHours } from "../../data/cleaners";
import { cityFromAddress } from "../../data/addressPresets";
import TimeSelect from "../../components/TimeSelect";
import PropertyPicker from "../../components/PropertyPicker";
import DatePicker from "../../components/DatePicker";
import type { Recurrence } from "../../types";

function finishTime(time: string, hours: number) {
  const [hh, mm] = time.split(":").map(Number);
  const totalMin = hh * 60 + mm + Math.round(hours * 60);
  const eh = Math.floor((totalMin / 60) % 24);
  const em = totalMin % 60;
  return `${String(eh).padStart(2, "0")}:${String(em).padStart(2, "0")}`;
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function Book() {
  const { addresses, userPhone, openAccount } = useStore();
  const nav = useNavigate();
  const location = useLocation();

  // Restore an in-progress form saved when the customer stepped forward to the
  // cleaner list (and pressed Back). Cleared on tab/role switch — see the
  // clearing effect in App.tsx — so it only survives the Book <-> cleaners hop.
  const saved = (() => {
    try { const r = sessionStorage.getItem("book-form"); return r ? JSON.parse(r) : null; }
    catch { return null; }
  })();

  // Empty by default to avoid confusion / wrong bookings. Only auto-select the
  // property when the customer has exactly ONE saved.
  const [addrId, setAddrId] = useState<string>(saved?.addrId ?? (addresses.length === 1 ? addresses[0].id : ""));
  const [date, setDate] = useState<string>(saved?.date ?? "");
  const [time, setTime] = useState<string>(saved?.time ?? "");
  const [duration, setDuration] = useState<number>(saved?.duration ?? 0); // 0 = not chosen yet
  const [recurrence, setRecurrence] = useState<Recurrence>(saved?.recurrence ?? "none");
  const [days, setDays] = useState<string[]>(saved?.days ?? []);
  const [hasEnd, setHasEnd] = useState<boolean>(saved?.hasEnd ?? false);
  const [endDate, setEndDate] = useState<string>(saved?.endDate ?? "");
  // Pass-through: set when arriving from a guest-checkout turnaround so the
  // resulting booking can be linked back to that guest stay.
  const [externalBookingId, setExternalBookingId] = useState<string | undefined>(undefined);

  // If the customer later ends up with exactly one property, default to it.
  useEffect(() => {
    if (addresses.length === 1 && !addrId) setAddrId(addresses[0].id);
  }, [addresses, addrId]);

  // Apply a one-shot calendar preset on every navigation into Book.
  // location.key changes on each nav even when the path is identical, so this
  // fires even though the component stays mounted across tab switches.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("book-preset");
      if (raw) {
        sessionStorage.removeItem("book-preset");
        const p = JSON.parse(raw);
        if (p.addrId) setAddrId(p.addrId);
        if (p.date) setDate(p.date);
        if (p.time) setTime(p.time);
        if (p.duration) setDuration(p.duration);
        setExternalBookingId(p.externalBookingId ?? undefined);
        // carry the "replaces this cancelled booking" id through to CleanerDetail,
        // which dismisses that booking once the replacement is placed.
        if (p.replacesBookingId) sessionStorage.setItem("replaces-booking", p.replacesBookingId);
        else sessionStorage.removeItem("replaces-booking");
      }
    } catch { /* ignore */ }
  }, [location.key]);

  // Keep the in-progress form persisted so a Back from the cleaner list restores
  // everything the customer entered. (Cleared on tab/role switch elsewhere.)
  useEffect(() => {
    sessionStorage.setItem("book-form", JSON.stringify({
      addrId, date, time, duration, recurrence, days, hasEnd, endDate,
    }));
  }, [addrId, date, time, duration, recurrence, days, hasEnd, endDate]);

  // when recurring, keep "first clean on" pinned to a selected weekday
  useEffect(() => {
    if (recurrence === "none" || days.length === 0) return;
    const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const d = new Date(date + "T00:00:00");
    if (days.includes(DOW[d.getDay()])) return; // already valid
    // advance to the next allowed weekday
    for (let i = 0; i < 7; i++) {
      const cand = new Date(d);
      cand.setDate(d.getDate() + i);
      if (days.includes(DOW[cand.getDay()])) {
        const iso = `${cand.getFullYear()}-${String(cand.getMonth() + 1).padStart(2, "0")}-${String(cand.getDate()).padStart(2, "0")}`;
        setDate(iso);
        return;
      }
    }
  }, [recurrence, days, date]);

  const hasProperty = addresses.length > 0;
  const addr = addresses.find((a) => a.id === addrId);
  const timeSet = !!time;
  const durSet = duration > 0;
  const ends = timeSet && durSet ? finishTime(time, duration) : "";

  // cleaning-time estimate from the selected property
  const estimate = addr ? estimateCleaningHours(addr) : null;

  function toggleDay(d: string) {
    setDays((p) => (p.includes(d) ? p.filter((x) => x !== d) : [...p, d]));
  }

  const recurLabel = recurrence === "weekly" ? "every week" : "every two weeks";
  const orderedDays = WEEKDAYS.filter((d) => days.includes(d));

  function findCleaners() {
    // phone is mandatory before an actual BOOKING (a cleaner must be able to
    // reach the customer). But a no-property user is only browsing cleaners +
    // rates, so don't gate the browse path on phone — otherwise "Browse
    // cleaners & rates" just bounces them to Account and never opens the list.
    if (hasProperty && !userPhone.trim()) { openAccount(); return; }
    const draft = {
      addrId,
      addressNickname: addr?.nickname ?? "",
      address: addr?.address ?? "",
      city: cityFromAddress(addr?.address ?? ""),
      scope: "whole",
      date,
      time,
      duration,
      recurrence,
      recurDays: recurrence === "none" ? [] : orderedDays,
      endDate: recurrence !== "none" && hasEnd && endDate ? endDate : "",
      externalBookingId,
    };
    sessionStorage.setItem("booking-draft", JSON.stringify(draft));
    nav("/cleaners");
  }

  const recurInvalid = recurrence !== "none" && days.length === 0;
  // when a customer HAS properties, they must pick one + a date; everyone must
  // pick a time + duration. (No-property users can still browse rates.)
  const propMissing = hasProperty && !addrId;
  const dateMissing = recurrence === "none" ? !date : recurInvalid;
  const incomplete = propMissing || dateMissing || !timeSet || !durSet;
  const canSubmit = hasProperty ? !incomplete : true; // browse-only path always allowed

  return (
    <div className="pad">
      <h1 className="h1">Book a cleaner</h1>

      {!hasProperty && (
        <div className="note" style={{ marginTop: 6 }}>
          Add a property to book a cleaner. You can browse cleaners and rates in the meantime.
          <div style={{ height: 10 }} />
          <button className="btn sm" onClick={openAccount}>Go to Account</button>
        </div>
      )}

      {hasProperty && (
        <>
          <div className="label">Property</div>
          <PropertyPicker addresses={addresses} value={addrId} onChange={setAddrId} />
        </>
      )}

      <div className="label">Booking frequency</div>
      <div className="seg">
        <button className={recurrence === "none" ? "active" : ""} onClick={() => setRecurrence("none")}>One-off</button>
        <button className={recurrence === "weekly" ? "active" : ""} onClick={() => setRecurrence("weekly")}>Weekly</button>
        <button className={recurrence === "biweekly" ? "active" : ""} onClick={() => setRecurrence("biweekly")}>Every two weeks</button>
      </div>

      {recurrence === "none" ? (
        <>
          <div className="label">Date</div>
          <DatePicker value={date} onChange={setDate} />
        </>
      ) : (
        <>
          <div className="label">Repeats on (pick one or more)</div>
          <div className="daypick">
            {WEEKDAYS.map((d) => {
              const weekend = d === "Sat" || d === "Sun";
              return (
                <button
                  key={d}
                  className={"daypick__chip" + (weekend ? " wknd" : "") + (days.includes(d) ? " active" : "")}
                  onClick={() => toggleDay(d)}
                >
                  {d.slice(0, 2)}
                </button>
              );
            })}
          </div>
          <div className="label" style={{ marginTop: 12 }}>First clean on</div>
          <DatePicker value={date} onChange={setDate} allowedDays={days} />

          <div className="label" style={{ marginTop: 12 }}>Ends</div>
          <div className="seg">
            <button className={!hasEnd ? "active" : ""} onClick={() => setHasEnd(false)}>Never</button>
            <button className={hasEnd ? "active" : ""} onClick={() => setHasEnd(true)}>On a date</button>
          </div>
          {hasEnd && (
            <div style={{ marginTop: 8 }}>
              <DatePicker value={endDate || date} onChange={setEndDate} allowedDays={days} openUp />
            </div>
          )}
        </>
      )}

      <div className="row" style={{ gap: 12, marginTop: 6 }}>
        <div className="grow">
          <div className="label">Start time</div>
          <TimeSelect value={time} onChange={setTime} />
        </div>
        <div className="grow">
          <div className="label">Duration</div>
          <Stepper value={duration} setValue={setDuration} min={1} max={10} step={0.5} />
        </div>
      </div>

      {recurInvalid && (
        <div className="note amber" style={{ marginTop: 12 }}>Pick at least one day for a recurring clean.</div>
      )}

      {/* cleaning-time estimate — sits next to duration so it guides the choice */}
      {estimate && (
        <div className="estcard" style={{ marginTop: 12 }}>
          <div className="grow">
            <div className="estcard__top">
              Suggested duration: <b>{estimate.min}–{estimate.max} h</b>
            </div>
            <div className="tiny muted">
              {addr!.bedrooms} bed · {addr!.bathrooms} bath · whole home
            </div>
          </div>
          {duration !== estimate.suggested && (
            <button className="estcard__use" onClick={() => setDuration(estimate.suggested)}>
              Use {estimate.suggested}h
            </button>
          )}
        </div>
      )}

      {/* nice start → end range, only once both time + duration are set */}
      {timeSet && durSet && (
        <div className="timerange">
          <div className="timerange__leg">
            <span className="timerange__lbl">Start</span>
            <span className="timerange__val">{time}</span>
          </div>
          <span className="timerange__arrow">→</span>
          <div className="timerange__leg">
            <span className="timerange__lbl">End</span>
            <span className="timerange__val">{ends}</span>
          </div>
          <div className="timerange__dur">{duration}h</div>
        </div>
      )}

      {recurrence !== "none" && !recurInvalid && (
        <div className="summary" style={{ marginTop: 10 }}>
          <span className="muted tiny">{recurLabel}</span>
          <span className="summary__days">
            {orderedDays.map((d) => <span key={d} className="summary__day">{d}</span>)}
          </span>
        </div>
      )}

      <div style={{ height: 18 }} />
      <button className="btn" onClick={findCleaners} disabled={!canSubmit} style={{ opacity: canSubmit ? 1 : 0.5 }}>
        {hasProperty ? "Find cleaners →" : "Browse cleaners & rates →"}
      </button>
      {hasProperty && incomplete && (
        <p className="tiny muted" style={{ textAlign: "center", marginTop: 8 }}>
          {propMissing ? "Pick a property" : dateMissing ? "Pick a date" : !timeSet ? "Pick a start time" : "Pick a duration"} to continue
        </p>
      )}
      {hasProperty && !incomplete && !userPhone.trim() && (
        <div className="note amber" style={{ marginTop: 10 }}>
          Add your phone number before booking — <button className="linklike" style={{ padding: 0 }} onClick={openAccount}>add it now</button>.
        </div>
      )}
    </div>
  );
}

function Stepper({
  value, setValue, min, max, step = 1,
}: { value: number; setValue: (n: number) => void; min: number; max: number; step?: number; }) {
  const unset = value <= 0;
  return (
    <div className="between card" style={{ padding: 8 }}>
      <button className="iconbtn" onClick={() => setValue(unset ? min : Math.max(min, +(value - step).toFixed(1)))} disabled={unset}>−</button>
      <div style={{ fontWeight: 800, fontSize: 18, color: unset ? "var(--muted)" : "inherit" }}>{unset ? "—" : `${value}h`}</div>
      <button className="iconbtn" onClick={() => setValue(unset ? min : Math.min(max, +(value + step).toFixed(1)))}>+</button>
    </div>
  );
}
