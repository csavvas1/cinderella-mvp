import { useEffect, useRef, useState } from "react";
import { useStore } from "../../context/AppStore";
import { BrandIcon } from "../../components/PaymentPicker";
import DetailsModal from "../../components/DetailsModal";
import ConnectChannelSheet from "../../components/ConnectChannelSheet";
import Dropdown from "../../components/Dropdown";
import TimeSelect from "../../components/TimeSelect";
import CameraCapture, { type CapturedPhoto } from "../../components/CameraCapture";
import { APP_NAME, APP_VERSION } from "../../data/brand";
import { marketStats } from "../../data/cleaners";
import { cardExpiryStatus } from "../../data/platform";
import { isBiometricAvailable } from "../../lib/webauthn";
import { downloadStatementPdf, monthNumber } from "../../lib/statements";
import { supabase } from "../../lib/supabase";
import MapPicker from "../../components/MapPicker";
import { CY_CITIES } from "../../data/addressPresets";
import LegalDocModal from "../../components/LegalDocModal";
import ConsentGate from "../../components/ConsentGate";
import { CLEANER_DOC_IDS, LEGAL_DOCS } from "../../data/legal";
import type { Booking, Card, PropertyAddress } from "../../types";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const YEARS = ["2026", "2025", "2024"];
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAY_FULL: Record<string, string> = {
  Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday",
  Fri: "Friday", Sat: "Saturday", Sun: "Sunday",
};


// Statement pickers default to the PREVIOUS month (last complete period).
function prevMonthDefaults() {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return { month: MONTHS[d.getMonth()], year: String(d.getFullYear()) };
}

// Biometric login is called "Face ID" on Apple devices and "Biometric" (usually
// fingerprint) on Android, so the label matches what the user actually sees.
function biometricLabel(): string {
  const ua = navigator.userAgent || "";
  if (/Android/i.test(ua)) return "Biometric login";
  if (/iPhone|iPad|iPod|Mac/i.test(ua)) return "Face ID";
  return "Face ID";
}
const THEME_OPTS = [
  { v: "system", t: "System" },
  { v: "light", t: "Light" },
  { v: "dark", t: "Dark" },
] as const;

export default function Account() {
  const {
    userName, userEmail, userPhone, setUserPhone, accountNo,
    addresses, addAddress, updateAddress, deleteAddress,
    cards, addCard, deleteCard, logout, themePref, setThemePref,
    agentActivated, activateAgent, deactivateAgent, bookings, updateBooking, notify,
    launchSide, setLaunchSide, setRole, changePassword,
    biometricEnabled, biometricEmail, enableBiometric, disableBiometric, lastAccount,
    connectedListings, disconnectPropertyFromBeds24,
    recordConsent, consents, hasAcceptedCurrent,
    agentProfile, setAgentProfile,
    pushEnabled, requestPushPermission, disablePushNotifications,
    verification, submitVerification,
  } = useStore();

  const [pushBusy, setPushBusy] = useState(false);
  const [pushErr, setPushErr] = useState("");
  async function togglePush() {
    setPushErr(""); setPushBusy(true);
    if (pushEnabled) {
      const res = await disablePushNotifications();
      setPushBusy(false);
      if (res.error) setPushErr(res.error);
      return;
    }
    const res = await requestPushPermission();
    setPushBusy(false);
    if (!res.granted && res.error) setPushErr(res.error);
  }

  const bioOn = biometricEnabled && biometricEmail === lastAccount?.email;
  const [bioBusy, setBioBusy] = useState(false);
  const [bioErr, setBioErr] = useState("");
  const [bioAvail, setBioAvail] = useState(true);
  useEffect(() => { isBiometricAvailable().then(setBioAvail); }, []);
  async function toggleBio() {
    setBioErr("");
    if (bioOn) { disableBiometric(); return; }
    if (!lastAccount) return;
    setBioBusy(true);
    const res = await enableBiometric(lastAccount.email); // real Face ID prompt
    setBioBusy(false);
    if (res.error) setBioErr(res.error);
  }

  // shared profile
  const [editProfile, setEditProfile] = useState(false);

  // customer: properties + payment
  const [showAdd, setShowAdd] = useState(false);
  const [addChoice, setAddChoice] = useState(false);       // manual vs connect chooser
  const [connectNew, setConnectNew] = useState(false);     // connect-accounts view (no property yet)
  const [editId, setEditId] = useState<string | null>(null);
  const [showAddCard, setShowAddCard] = useState(false);
  const [cardForm, setCardForm] = useState({ nickname: "", number: "" });
  // Beds24 channel-manager connect/disconnect: which property is busy + last error
  const [beds24Busy, setBeds24Busy] = useState<string | null>(null);
  const [beds24Err, setBeds24Err] = useState<string | null>(null);

  const handleDisconnectBeds24 = async (listingId: string, addressId: string) => {
    setBeds24Err(null); setBeds24Busy(addressId);
    try { await disconnectPropertyFromBeds24(listingId); }
    catch (e) { setBeds24Err((e as Error).message); }
    finally { setBeds24Busy(null); }
  };
  const [removeProp, setRemoveProp] = useState<PropertyAddress | null>(null);
  const [showExp, setShowExp] = useState(false);
  const _pm = prevMonthDefaults();
  const [expMonth, setExpMonth] = useState(_pm.month);
  const [expYear, setExpYear] = useState(_pm.year);
  const [expYearAnnual, setExpYearAnnual] = useState(String(new Date().getFullYear() - 1));
  const [dlBusy, setDlBusy] = useState<string | null>(null); // which download is in flight
  const [dlErr, setDlErr] = useState("");
  async function downloadExpenses(key: string, period: Parameters<typeof downloadStatementPdf>[1]) {
    setDlErr(""); setDlBusy(key);
    const res = await downloadStatementPdf("expenses", period);
    setDlBusy(null);
    if (res.error) setDlErr(res.error);
  }

  // cleaner activation + legal
  const [showActivate, setShowActivate] = useState(false);
  const [showOff, setShowOff] = useState(false);
  const [showCleanerConsent, setShowCleanerConsent] = useState(false);
  const [showReferHint, setShowReferHint] = useState(false);
  const [viewDoc, setViewDoc] = useState<string | null>(null);
  const [showLegal, setShowLegal] = useState(false);

  // cleaner: earnings / payout / rates / disputes / verification
  const [showPayout, setShowPayout] = useState(false);
  const [payType, setPayType] = useState<"bank" | "card">(agentProfile.payoutType || "bank");
  const [payName, setPayName] = useState(agentProfile.payoutName || "");
  const [payNum, setPayNum] = useState("");
  const [payExp, setPayExp] = useState(agentProfile.payoutExpiry || "");
  const [payCvc, setPayCvc] = useState("");
  const [showRates, setShowRates] = useState(false);
  const [editDay, setEditDay] = useState<string | null>(null);
  const [showDisputes, setShowDisputes] = useState(false);
  const [disputeFor, setDisputeFor] = useState<Booking | null>(null);
  const [showVerify, setShowVerify] = useState(false);
  // verification status is server-backed (store); "none" when no submission
  const verifyStatus: "none" | "submitted" | "verified" =
    verification?.status === "verified" ? "verified" : verification?.status === "submitted" ? "submitted" : "none";
  const [idUp, setIdUp] = useState(false);
  const [idPhotos, setIdPhotos] = useState<string[]>([]);   // uploaded doc photo URLs
  const [idName, setIdName] = useState("");
  const [idNumber, setIdNumber] = useState("");
  const [idExpiry, setIdExpiry] = useState("");
  const [idBusy, setIdBusy] = useState(false);
  const [idErr, setIdErr] = useState("");
  const [docType, setDocType] = useState<"id" | "passport">("id");
  const idInput = useRef<HTMLInputElement>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  // upload a profile face photo -> Supabase Storage -> save publicUrl to profile
  async function uploadPhoto(f: File) {
    try {
      const { data: sess } = await supabase.auth.getSession();
      const uid = sess.session?.user.id ?? "anon";
      const path = `${uid}/profile/${Date.now()}-${f.name.replace(/[^\w.]+/g, "_")}`;
      const { error } = await supabase.storage.from("proofs").upload(path, f, { upsert: false });
      if (error) throw error;
      const { data: pub } = supabase.storage.from("proofs").getPublicUrl(path);
      setAgentProfile({ ...agentProfile, photoUrl: pub.publicUrl });
    } catch { /* ignore upload failure */ }
  }
  const [idCam, setIdCam] = useState(false);
  const verified = verifyStatus === "verified";

  const spentThisMonth = bookings.filter((b) => b.status === "completed").reduce((s, b) => s + b.total, 0);
  const spentCount = bookings.filter((b) => b.status === "completed").length;

  const [form, setForm] = useState<{ nickname: string; address: string; propertyType: "apartment" | "house"; apartmentNumber: string; floor: string; bedrooms: number; bathrooms: number; kitchens: number; commonRooms: number }>({ nickname: "", address: "", propertyType: "apartment", apartmentNumber: "", floor: "", bedrooms: 1, bathrooms: 1, kitchens: 1, commonRooms: 1 });
  const [addrFocus, setAddrFocus] = useState(false);
  // Connect sheet: which property is being connected (null = closed)
  const [connectProp, setConnectProp] = useState<PropertyAddress | null>(null);

  // live address autocomplete via OpenStreetMap Nominatim (free, no key)
  const [suggestions, setSuggestions] = useState<{ label: string; lat: number; lng: number }[]>([]);
  // exact map pin for the property being added/edited, + the searched-address
  // center used to recentre the map when a suggestion is picked.
  const [pin, setPin] = useState<{ lat: number; lng: number } | undefined>(undefined);
  const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number } | undefined>(undefined);
  // share a property with a partner (co-manage). Holds the property being shared.
  const [shareProp, setShareProp] = useState<PropertyAddress | null>(null);
  const [shareCopied, setShareCopied] = useState(false);
  // Build the invite link. A co-worker opening it is sent to login/signup and the
  // property is auto-added to their profile once authenticated (see Login ?join).
  function shareLink(code: string) {
    return `${window.location.origin}/?join=${code}`;
  }
  async function doShare(a: PropertyAddress) {
    if (!a.shareCode) return;
    const url = shareLink(a.shareCode);
    const text = `Help me co-manage "${a.nickname}" on Cinderella. Open this link to get access to its calendar and cleaning schedule: ${url}`;
    if (navigator.share) {
      try { await navigator.share({ title: "Co-manage a property", text, url }); return; } catch { /* cancelled → fall through to copy */ }
    }
    try { await navigator.clipboard?.writeText(url); setShareCopied(true); setTimeout(() => setShareCopied(false), 1500); } catch { /* ignore */ }
  }
  const [acLoading, setAcLoading] = useState(false);
  const acSeq = useRef(0);
  useEffect(() => {
    const q = form.address.trim();
    if (q.length < 3) { setSuggestions([]); setAcLoading(false); return; }
    const seq = ++acSeq.current;
    setAcLoading(true);
    const t = setTimeout(async () => {
      try {
        const r = await fetch(
          // countrycodes=cy restricts results to Cyprus only (the platform's
          // service area). addressdetails=1 gives structured parts so we can
          // build a SHORT, readable label instead of the long full chain.
          `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=6&countrycodes=cy&q=${encodeURIComponent(q)}`,
          { headers: { "Accept-Language": "en" } }
        );
        const data = await r.json();
        if (seq !== acSeq.current) return;
        type NomAddr = { road?: string; house_number?: string; neighbourhood?: string; suburb?: string; village?: string; town?: string; city?: string; municipality?: string };
        const shortLabel = (a: NomAddr, full: string) => {
          const street = [a.road, a.house_number].filter(Boolean).join(" ");
          const area = a.neighbourhood || a.suburb || a.village;
          const town = a.town || a.city || a.municipality;
          const parts = [street, area, town].filter(Boolean);
          // fall back to the first 2 comma-segments of the full name if structured
          // parts are missing, so a label is always shown.
          return (parts.length ? parts.join(", ") : full.split(",").slice(0, 2).join(",").trim());
        };
        setSuggestions((data as { display_name: string; lat: string; lon: string; address: NomAddr }[])
          .map((d) => ({ label: shortLabel(d.address, d.display_name), lat: parseFloat(d.lat), lng: parseFloat(d.lon) })));
      } catch {
        if (seq === acSeq.current) setSuggestions([]);
      } finally {
        if (seq === acSeq.current) setAcLoading(false);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [form.address]);

  function resetForm() {
    setForm({ nickname: "", address: "", propertyType: "apartment", apartmentNumber: "", floor: "", bedrooms: 1, bathrooms: 1, kitchens: 1, commonRooms: 1 });
    setPin(undefined); setMapCenter(undefined);
  }

  function openEditProperty(a: PropertyAddress) {
    setForm({
      nickname: a.nickname === a.address ? "" : a.nickname,
      address: a.address, propertyType: a.propertyType, apartmentNumber: a.apartmentNumber ?? "", floor: a.floor ?? "",
      bedrooms: a.bedrooms, bathrooms: a.bathrooms, kitchens: a.kitchens, commonRooms: a.commonRooms,
    });
    // restore the saved pin (if any) so editing shows the marker in place
    if (a.lat != null && a.lng != null) { setPin({ lat: a.lat, lng: a.lng }); setMapCenter({ lat: a.lat, lng: a.lng }); }
    else { setPin(undefined); setMapCenter(undefined); }
    setEditId(a.id);
    setShowAdd(true);
  }

  function saveProperty() {
    if (!form.address) return;
    if (form.propertyType === "apartment" && !form.apartmentNumber.trim()) return;
    const a: PropertyAddress = {
      id: editId ?? crypto.randomUUID(), ...form,
      nickname: form.nickname.trim() || form.address.trim(),
      apartmentNumber: form.propertyType === "apartment" ? form.apartmentNumber.trim() : undefined,
      floor: form.propertyType === "apartment" ? (form.floor.trim() || undefined) : undefined,
      lat: pin?.lat,
      lng: pin?.lng,
    };
    if (editId) updateAddress(a); else addAddress(a);
    // Adding a property is free; channel connection happens from the property card.
    setShowAdd(false); setEditId(null);
    resetForm();
  }

  function addCardViaJCC() {
    if (!cardForm.nickname) return;
    const jccToken = "jcc_tok_" + Math.random().toString(36).slice(2, 14);
    const last4 = String(Math.floor(1000 + Math.random() * 9000));
    const brand = Math.random() > 0.5 ? "Mastercard" : "Visa";
    const c: Card = { id: crypto.randomUUID(), nickname: cardForm.nickname, last4, brand, jccToken };
    addCard(c);
    setShowAddCard(false);
    setCardForm({ nickname: "", number: "" });
  }

  // ---- cleaner-side derived data + helpers ----
  const wkdayStats = marketStats("weekday");
  const wkendStats = marketStats("weekend");
  function position(rate: number, s: ReturnType<typeof marketStats>) {
    if (rate <= s.min) return { label: "Cheapest", cls: "green" };
    if (rate >= s.max) return { label: "Premium", cls: "amber" };
    return { label: "Around average", cls: "sky" };
  }
  const posWkday = position(agentProfile.rateWeekday, wkdayStats);
  const posWkend = position(agentProfile.rateWeekend, wkendStats);

  const serviceCities = agentProfile.serviceCities ?? [];
  function toggleCity(city: string) {
    const next = serviceCities.includes(city) ? serviceCities.filter((c) => c !== city) : [...serviceCities, city];
    setAgentProfile({ ...agentProfile, serviceCities: next });
  }

  const sched = agentProfile.daySchedule ?? {};
  function setSched(next: Record<string, { start: string; end: string }[]>) {
    setAgentProfile({ ...agentProfile, daySchedule: next });
  }
  function toggleDay(d: string) {
    const next = { ...sched };
    if (next[d] && next[d].length) delete next[d];
    else next[d] = [{ start: "09:00", end: "17:00" }];
    setSched(next);
  }
  function setDaySlot(d: string, i: number, key: "start" | "end", v: string) {
    const slots = (sched[d] ?? []).map((s, k) => {
      if (k !== i) return s;
      const next = { ...s, [key]: v };
      if (key === "start" && next.end <= v) {
        const [h, m] = v.split(":").map(Number);
        const t = h * 60 + m + 30;
        next.end = `${String(Math.min(23, Math.floor(t / 60))).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
      }
      return next;
    });
    setSched({ ...sched, [d]: slots });
  }
  function addDaySlot(d: string) {
    const slots = sched[d] ?? [];
    const last = slots[slots.length - 1];
    setSched({ ...sched, [d]: [...slots, { start: last?.end || "14:00", end: "18:00" }] });
  }
  function removeDaySlot(d: string, i: number) {
    setSched({ ...sched, [d]: (sched[d] ?? []).filter((_, k) => k !== i) });
  }

  const disputes = bookings.filter((b) => b.refund);
  const disputesActionNeeded = disputes.filter((b) => b.refund!.status === "pending" && !b.refund!.agentResponse).length;

  return (
    <div className="pad">
      <h1 className="h1">Hi {(agentProfile.displayName || userName || "there").split(" ")[0]}!</h1>

      {/* ===================== PROFILE ===================== */}
      <div className="pcard">
        <div className="pcard__top">
          <input ref={photoInput} type="file" accept="image/*" hidden
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadPhoto(f); e.target.value = ""; }} />
          <button type="button" className="pcard__avatar"
            onClick={(e) => { e.stopPropagation(); e.preventDefault(); photoInput.current?.click(); }}
            title="Change photo">
            {agentProfile.photoUrl
              ? <img src={agentProfile.photoUrl} alt="Profile" className="pcard__avatarimg" />
              : (agentProfile.displayName || userName || userEmail || "U").trim().charAt(0).toUpperCase()}
            <span className="pcard__avataredit">
              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
            </span>
          </button>
          <div className="pcard__id">
            <div className="pcard__name">{agentProfile.displayName || userName || "Your account"}</div>
            {accountNo && <div className="pcard__member">Member #{accountNo}</div>}
          </div>
        </div>
        <div className="pcard__rows" onClick={() => setEditProfile(true)} style={{ cursor: "pointer" }}>
          <div className="pcard__row">
            <svg className="pcard__ic" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="2.5" /><path d="m3.5 7 8.5 6 8.5-6" /></svg>
            <span className="pcard__val">{userEmail}</span>
            <span className="pcard__chev" style={{ marginLeft: "auto" }}>›</span>
          </div>
          <div className="pcard__row">
            <svg className="pcard__ic" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L20 13l1 4v2a1 1 0 0 1-1 1A16 16 0 0 1 4 5a1 1 0 0 1 1-1Z" /></svg>
            {userPhone
              ? <span className="pcard__val">{userPhone}</span>
              : <span className="pcard__val pcard__val--warn">Add your phone number</span>}
          </div>
        </div>
      </div>

      {editProfile && (
        <DetailsModal
          email={userEmail} phone={userPhone}
          onClose={() => setEditProfile(false)}
          onSavePhone={setUserPhone}
          onChangePassword={changePassword}
        />
      )}


      {/* ===================== CUSTOMER ===================== */}
      <div className="acct-sec">Customer</div>

      {/* PROPERTIES */}
      <div className="between" style={{ marginTop: 16, marginBottom: 10 }}>
        <div className="label" style={{ margin: 0 }}>My properties</div>
        <button className="btn sm secondary" onClick={() => setAddChoice(true)}>+ Add</button>
      </div>

      {/* ADD CHOICE — small centered popup: link accounts (auto) or add manually */}
      {addChoice && (
        <div className="modal__backdrop center" onClick={() => setAddChoice(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="between" style={{ marginBottom: 12 }}>
              <b style={{ fontSize: 16 }}>Add a property</b>
              <button className="iconbtn" onClick={() => setAddChoice(false)}>✕</button>
            </div>
            <div className="addchoice">
              <button className="addchoice__opt" onClick={() => { setAddChoice(false); setConnectNew(true); }}>
                <span className="addchoice__ic addchoice__ic--brand">
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1" /><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" /></svg>
                </span>
                <span className="addchoice__t">Connect accounts</span>
                <span className="addchoice__s">Import from Airbnb & more</span>
              </button>
              <button className="addchoice__opt" onClick={() => { setAddChoice(false); setEditId(null); resetForm(); setShowAdd(true); }}>
                <span className="addchoice__ic">
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
                </span>
                <span className="addchoice__t">Add manually</span>
                <span className="addchoice__s">Enter property details</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONNECT ACCOUNTS (no property yet) — reuses the multi-platform view */}
      {connectNew && (
        <ConnectChannelSheet
          property={{ id: "new", nickname: "your listings", address: "", propertyType: "apartment", bedrooms: 1, bathrooms: 1, kitchens: 1, commonRooms: 1 } as PropertyAddress}
          onClose={() => setConnectNew(false)}
          onConnected={() => setConnectNew(false)}
        />
      )}


      {showAdd && (
        <div className="modal__backdrop" onClick={() => { setShowAdd(false); setEditId(null); resetForm(); }}>
          <div className="modal tall" onClick={(e) => e.stopPropagation()}>
            <div className="between" style={{ marginBottom: 12 }}>
              <b style={{ fontSize: 16 }}>{editId ? "Edit property" : "Add a property"}</b>
              <button className="iconbtn" onClick={() => { setShowAdd(false); setEditId(null); resetForm(); }}>✕</button>
            </div>
            <div className="label">Nickname (optional)</div>
            <input className="input" value={form.nickname} placeholder="e.g. Seaside Apartment" onChange={(e) => setForm({ ...form, nickname: e.target.value })} />
            <div className="label">Address</div>
            <div className="ac">
              <input className="input" value={form.address} placeholder="Start typing your address…"
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                onFocus={() => setAddrFocus(true)}
                onBlur={() => setTimeout(() => setAddrFocus(false), 150)} />
              {addrFocus && (acLoading || suggestions.length > 0) && (
                <div className="ac__list">
                  {acLoading && suggestions.length === 0 && (
                    <div className="ac__item" style={{ color: "var(--muted)" }}><span className="ac__addr">Searching…</span></div>
                  )}
                  {suggestions.map((s) => (
                    <button key={s.label} className="ac__item" onMouseDown={() => {
                      setForm({ ...form, address: s.label });
                      setSuggestions([]); setAddrFocus(false);
                      // drop the pin on the picked address + recentre the map
                      setPin({ lat: s.lat, lng: s.lng });
                      setMapCenter({ lat: s.lat, lng: s.lng });
                    }}>
                      <span className="ac__addr">{s.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* exact map pin — appears once an address is chosen. Drag it to the
                precise door so the agent knows exactly where to go. */}
            {(pin || mapCenter) && (
              <>
                <div className="label" style={{ marginTop: 12 }}>Pin the exact spot</div>
                <p className="sub" style={{ margin: "0 0 8px", fontSize: 12 }}>Drag the marker to the precise entrance — this is what the cleaner sees.</p>
                <MapPicker value={pin} center={mapCenter} onChange={setPin} />
              </>
            )}

            <div className="label" style={{ marginTop: 12 }}>Property type</div>
            <div className="ptype">
              {([{ v: "apartment", t: "Apartment" }, { v: "house", t: "House" }] as const).map((o) => (
                <button key={o.v} type="button" className={"ptype__opt" + (form.propertyType === o.v ? " sel" : "")}
                  onClick={() => setForm({ ...form, propertyType: o.v })}>
                  <span className="ptype__ic">
                    {o.v === "house"
                      ? <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M4 11 12 4l8 7" /><path d="M6 10v9h12v-9" /><path d="M10 19v-5h4v5" /></svg>
                      : <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="3" width="12" height="18" rx="1.5" /><path d="M9.5 7h1M13.5 7h1M9.5 11h1M13.5 11h1M9.5 15h1M13.5 15h1" /></svg>}
                  </span>
                  <span className="ptype__t">{o.t}</span>
                  <span className="ptype__check">{form.propertyType === o.v ? "✓" : ""}</span>
                </button>
              ))}
            </div>

            {form.propertyType === "apartment" && (
              <>
                <div className="row" style={{ gap: 10 }}>
                  <div className="grow">
                    <div className="label">Apartment no.</div>
                    <input className="input" value={form.apartmentNumber} placeholder="e.g. 3B" onChange={(e) => setForm({ ...form, apartmentNumber: e.target.value })} />
                  </div>
                  <div className="grow">
                    <div className="label">Floor</div>
                    <input className="input" value={form.floor} placeholder="e.g. 2nd" onChange={(e) => setForm({ ...form, floor: e.target.value })} />
                  </div>
                </div>
                <div className="tiny muted" style={{ marginTop: 4 }}>So your cleaner knows exactly which unit to go to.</div>
              </>
            )}

            <div className="row wrap" style={{ gap: 10, marginTop: 8 }}>
              {(["bedrooms", "bathrooms", "kitchens", "commonRooms"] as const).map((k) => (
                <div key={k} style={{ flex: "1 1 44%" }}>
                  <div className="label" style={{ margin: "6px 0 4px" }}>{k}</div>
                  <input className="input" type="number" min={0} value={form[k]} onChange={(e) => setForm({ ...form, [k]: +e.target.value })} />
                </div>
              ))}
            </div>

            <div style={{ height: 14 }} />
            {(() => {
              const apt = form.propertyType === "apartment";
              const blocked = !form.address || (apt && !form.apartmentNumber.trim());
              return (
                <button className="btn" disabled={blocked} style={{ opacity: blocked ? 0.5 : 1 }} onClick={saveProperty}>
                  {editId ? "Save changes" : "Save property"}
                </button>
              );
            })()}
          </div>
        </div>
      )}

      {addresses.map((a) => (
        <div key={a.id} className="propcard">
          <div className="propcard__top">
            {/* tint the house icon (sky) whenever the property is shared — either
                shared TO me (partner) or shared out to at least one co-worker */}
            {/* tint the house icon (sky) whenever the property is shared; a small
                count badge on the icon corner shows how many co-workers have access */}
            <span className={"propcard__ic" + (a.isShared || (a.memberCount ?? 0) > 0 ? " propcard__ic--shared" : "")}
              title={a.isShared ? "Shared with you by a partner" : ((a.memberCount ?? 0) > 0 ? `Shared with ${a.memberCount} ${a.memberCount === 1 ? "person" : "people"}` : undefined)}>
              {a.propertyType === "house"
                ? <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 11 12 4l8 7" /><path d="M6 10v9h12v-9" /><path d="M10 19v-5h4v5" /></svg>
                : <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="3" width="12" height="18" rx="1.5" /><path d="M9.5 7h1M13.5 7h1M9.5 11h1M13.5 11h1M9.5 15h1M13.5 15h1" /></svg>}
              {(a.memberCount ?? 0) > 0 && (
                <span className="propcard__count">
                  <svg viewBox="0 0 24 24" width="9" height="9" fill="currentColor" aria-hidden="true"><circle cx="12" cy="8" r="4" /><path d="M4 20c0-3.9 3.6-6.5 8-6.5s8 2.6 8 6.5Z" /></svg>
                  {a.memberCount}
                </span>
              )}
            </span>
            <div className="grow" style={{ minWidth: 0 }}>
              <b style={{ fontSize: 14 }}>{a.nickname}</b>
              {a.nickname !== a.address && (
                <div className="tiny muted" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.address}</div>
              )}
            </div>
            {/* Share (owner only — a partner can't re-share someone else's home) */}
            {!a.isShared && (
              <button className="iconbtn" title="Share property" onClick={() => { setShareCopied(false); setShareProp(a); }}>
                <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="M8.6 10.5l6.8-4M8.6 13.5l6.8 4" /></svg>
              </button>
            )}
            <button className="iconbtn" title="Edit property" onClick={() => openEditProperty(a)}>
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M4 20h4L18.5 9.5a2 2 0 0 0-3-3L5 17v3Z" /><path d="M13.5 6.5l3 3" /></svg>
            </button>
            <button className="iconbtn" title="Remove property" onClick={() => setRemoveProp(a)}>
              <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13M10 11v6M14 11v6" /></svg>
            </button>
          </div>
          {/* Channel connect */}
          {(() => {
            const cmListing = connectedListings.find((l) => l.addressId === a.id && l.beds24PropertyId);
            const busy = beds24Busy === a.id;
            if (cmListing?.billingActive) {
              return (
                <div className="propcard__connect" style={{ marginTop: 10 }}>
                  <button className="connect-cta connect-cta--on" onClick={() => setConnectProp(a)}>
                    <span className="connect-cta__ic">
                      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                    </span>
                    <span className="connect-cta__txt">
                      <span>Channels connected</span>
                      <span className="connect-cta__sub">Manage your listings</span>
                    </span>
                    <span className="connect-cta__chev">›</span>
                  </button>
                  <button className="btn btn--ghost tiny" style={{ marginTop: 6 }} disabled={busy}
                    onClick={() => handleDisconnectBeds24(cmListing.id, a.id)}>
                    {busy ? "Disconnecting…" : "Disconnect"}
                  </button>
                </div>
              );
            }
            return (
              <div className="propcard__connect" style={{ marginTop: 10 }}>
                <button className="connect-cta" onClick={() => setConnectProp(a)}>
                  <span className="connect-cta__ic">
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1" /><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" /></svg>
                  </span>
                  <span className="connect-cta__txt">
                    <span>Go live on booking sites</span>
                    <span className="connect-cta__sub">Airbnb, Booking.com & more</span>
                  </span>
                  <span className="connect-cta__chev">›</span>
                </button>
              </div>
            );
          })()}
          {beds24Err && beds24Busy === null && (
            <div className="tiny" style={{ color: "var(--danger, #dc2626)", marginTop: 4 }}>{beds24Err}</div>
          )}
        </div>
      ))}

      {/* CONNECT A CHANNEL — link Airbnb / Booking.com to a property. Behind the
          scenes this syncs the calendar + registers the property with the channel
          manager and starts billing. */}
      {connectProp && (
        <ConnectChannelSheet
          property={connectProp}
          onClose={() => setConnectProp(null)}
          onConnected={() => setConnectProp(null)}
        />
      )}

      {/* SHARE A PROPERTY — send a co-worker an invite link. They open it, sign
          in, and the property is auto-added to their profile (see Login ?join). */}
      {shareProp && (
        <div className="modal__backdrop" onClick={() => setShareProp(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="between" style={{ marginBottom: 8 }}>
              <b style={{ fontSize: 17 }}>Share this property</b>
              <button className="iconbtn" onClick={() => setShareProp(null)}>✕</button>
            </div>
            <p className="sub" style={{ marginTop: 0 }}>
              Give a co-worker access to <b>{shareProp.nickname}</b>. They'll be able to see and edit its calendar, cleaning schedule and bookings. Anyone opening the link and signing in gets access automatically.
            </p>
            {(shareProp.memberCount ?? 0) > 0 && (
              <div className="tiny muted" style={{ marginBottom: 10 }}>
                {shareProp.memberCount} {shareProp.memberCount === 1 ? "person has" : "people have"} access.
              </div>
            )}
            <div className="label">Invite link</div>
            <input className="input" readOnly value={shareProp.shareCode ? shareLink(shareProp.shareCode) : ""} onFocus={(e) => e.currentTarget.select()} style={{ fontSize: 12 }} />
            <div style={{ height: 12 }} />
            <button className="btn" onClick={() => doShare(shareProp)}>
              {shareCopied ? "Link copied ✓" : (typeof navigator !== "undefined" && "share" in navigator ? "Share via message, email…" : "Copy invite link")}
            </button>
          </div>
        </div>
      )}

      {removeProp && (() => {
        const affected = bookings.filter(
          (b) => b.addressNickname === removeProp.nickname && b.status !== "completed" && b.status !== "cancelled" && b.status !== "declined"
        ).length;
        return (
          <div className="modal__backdrop" onClick={() => setRemoveProp(null)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <div style={{ textAlign: "center", marginBottom: 6 }}><b style={{ fontSize: 17 }}>Remove property?</b></div>
              <p className="sub" style={{ textAlign: "center" }}>Remove <b>{removeProp.nickname}</b> from your saved properties? This can't be undone.</p>
              {affected > 0 && (
                <div className="note amber" style={{ marginTop: 4 }}>
                  This property has <b>{affected} active booking{affected === 1 ? "" : "s"}</b> (including any recurring schedule). Removing it will <b>cancel them all</b> and clear them from your calendar.
                </div>
              )}
              <div style={{ height: 12 }} />
              <button className="btn danger" onClick={() => { deleteAddress(removeProp.id); setRemoveProp(null); }}>
                {affected > 0 ? `Remove & cancel ${affected} booking${affected === 1 ? "" : "s"}` : "Remove property"}
              </button>
              <div style={{ height: 8 }} />
              <button className="btn secondary" onClick={() => setRemoveProp(null)}>Keep</button>
            </div>
          </div>
        );
      })()}

      {/* PAYMENT */}
      <div className="between" style={{ marginTop: 18 }}>
        <div className="label" style={{ margin: 0 }}>Payment methods</div>
        <button className="btn sm secondary" onClick={() => setShowAddCard(true)}>+ Add</button>
      </div>

      {showAddCard && (
        <div className="modal__backdrop" onClick={() => setShowAddCard(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="between" style={{ marginBottom: 12 }}>
              <b style={{ fontSize: 16 }}>Add a card</b>
              <button className="iconbtn" onClick={() => setShowAddCard(false)}>✕</button>
            </div>
            <div className="label">Card nickname</div>
            <input className="input" value={cardForm.nickname} placeholder="e.g. Personal" onChange={(e) => setCardForm({ ...cardForm, nickname: e.target.value })} />
            <p className="tiny muted" style={{ marginTop: 10, lineHeight: 1.4 }}>You'll enter your card on JCC's secure page. Charged only after a completed cleaning.</p>
            <div style={{ height: 14 }} />
            <button className="btn" onClick={addCardViaJCC}>Continue to secure checkout →</button>
          </div>
        </div>
      )}

      {cards.map((c) => (
        <div key={c.id} className="card row between">
          <div className="row">
            <BrandIcon brand={c.brand} />
            <div>
              <b style={{ fontSize: 14 }}>{c.nickname}</b>
              <div className="tiny muted">•••• {c.last4}</div>
            </div>
          </div>
          <button className="iconbtn" title="Remove" onClick={() => deleteCard(c.id)}>✕</button>
        </div>
      ))}

      {/* EXPENSE STATEMENTS */}
      <div className="card row between" style={{ marginTop: 12, cursor: "pointer" }} onClick={() => setShowExp(true)}>
        <b style={{ fontSize: 14 }}>Expense statements</b>
        <span className="dayrow__chev">›</span>
      </div>

      {showExp && (
        <div className="modal__backdrop" onClick={() => setShowExp(false)}>
          <div className="modal tall" onClick={(e) => e.stopPropagation()}>
            <div className="between" style={{ marginBottom: 4 }}>
              <b style={{ fontSize: 16 }}>Expense statements</b>
              <button className="iconbtn" onClick={() => setShowExp(false)}>✕</button>
            </div>
            <div className="card row between" style={{ marginBottom: 14 }}>
              <div>
                <div className="earnmonth__name">This month</div>
                <div className="earnmonth__total" style={{ marginTop: 2 }}>€{spentThisMonth.toFixed(0)}</div>
                <div className="tiny muted">{spentCount} cleanings</div>
              </div>
              <button className="dl" disabled={dlBusy === "cur"} onClick={() => downloadExpenses("cur", { kind: "current" })}>{dlBusy === "cur" ? "…" : "PDF"}</button>
            </div>
            {dlErr && <div className="loginerr" style={{ marginBottom: 12 }}>{dlErr}</div>}
            <div className="label" style={{ marginTop: 0 }}>Monthly statement</div>
            <div className="card">
              <div className="row" style={{ gap: 8 }}>
                <Dropdown value={expMonth} options={MONTHS} onChange={setExpMonth} />
                <div style={{ width: 110 }}><Dropdown value={expYear} options={YEARS} onChange={setExpYear} /></div>
              </div>
              <button className="btn" style={{ marginTop: 12 }} disabled={dlBusy === "mon"}
                onClick={() => downloadExpenses("mon", { kind: "month", month: monthNumber(expMonth), year: Number(expYear) })}>
                {dlBusy === "mon" ? "Preparing…" : "Download"}
              </button>
            </div>
            <div className="label">Yearly statement</div>
            <div className="card">
              <p className="sub" style={{ marginTop: 0 }}>Full-year expense summary.</p>
              <Dropdown value={expYearAnnual} options={YEARS} onChange={setExpYearAnnual} />
              <button className="btn" style={{ marginTop: 12 }} disabled={dlBusy === "yr"}
                onClick={() => downloadExpenses("yr", { kind: "year", year: Number(expYearAnnual) })}>
                {dlBusy === "yr" ? "Preparing…" : "Download"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pro lives in the profile box (My details → Plan). No separate section. */}

      {/* ===================== CLEANER (only when activated) ===================== */}
      {agentActivated && (
        <>
          <div className="acct-sec acct-sec--agent">Cleaner</div>

          {/* RATES & AVAILABILITY */}
          <div className="card row between" style={{ marginTop: 12, cursor: "pointer" }} onClick={() => setShowRates(true)}>
            <b style={{ fontSize: 14 }}>Rates & availability</b>
            {(() => {
              const rateSet = agentProfile.rateWeekday > 0 && agentProfile.rateWeekend > 0;
              const schedSet = Object.values(sched).some((s) => s && s.length);
              const citySet = serviceCities.length > 0;
              return rateSet && schedSet && citySet
                ? <span className="statuspill statuspill--ok">Set</span>
                : <span className="statuspill statuspill--warn">Set up</span>;
            })()}
          </div>

          {/* Warn the agent when their profile is incomplete — without a rate,
              a service city AND a work schedule they won't appear to customers. */}
          {(() => {
            const rateSet = agentProfile.rateWeekday > 0 && agentProfile.rateWeekend > 0;
            const schedSet = Object.values(sched).some((s) => s && s.length);
            const citySet = serviceCities.length > 0;
            if (rateSet && schedSet && citySet) return null;
            const missing = [
              !rateSet && "your rates",
              !citySet && "at least one city you work in",
              !schedSet && "a work schedule",
            ].filter(Boolean);
            return (
              <div className="note amber" style={{ marginTop: 8 }}>
                You won't appear to customers yet. Add {missing.join(", ")} under Rates &amp; availability so people can find and book you.
              </div>
            );
          })()}

          {/* GET PAID */}
          <div className="card row between" style={{ marginTop: 12, cursor: "pointer" }} onClick={() => setShowPayout(true)}>
            <b style={{ fontSize: 14 }}>Get paid</b>
            {(() => {
              if (!agentProfile.payoutType) return <span className="statuspill statuspill--warn">Add card</span>;
              const last4 = (agentProfile.payoutNumber || "").slice(-4);
              if (agentProfile.payoutType === "card") {
                const st = cardExpiryStatus(agentProfile.payoutExpiry);
                if (st === "expired") return <span className="statuspill statuspill--warn">Card expired</span>;
                if (st === "soon") return <span className="statuspill statuspill--warn">Expires {agentProfile.payoutExpiry}</span>;
                return <span className="statuspill statuspill--ok">Card •{last4}</span>;
              }
              return <span className="statuspill statuspill--ok">Bank •{last4}</span>;
            })()}
          </div>

          {/* DISPUTES */}
          <div className="card row between" style={{ marginTop: 12, cursor: "pointer" }} onClick={() => setShowDisputes(true)}>
            <b style={{ fontSize: 14 }}>Disputes</b>
            {disputesActionNeeded > 0
              ? <span className="statuspill statuspill--warn">{disputesActionNeeded} to review</span>
              : <span className="statuspill statuspill--ok">All clear</span>}
          </div>

          {/* VERIFICATION */}
          <div className="card row between" style={{ marginTop: 12, cursor: "pointer" }} onClick={() => setShowVerify(true)}>
            <b style={{ fontSize: 14 }}>Identity verification</b>
            {verified
              ? <span className="verbadge"><svg viewBox="0 0 24 24" width="20" height="20" aria-label="Verified"><path d="M12 2 14.9 4.1 18.5 4 19.6 7.4 22.5 9.5 21 12.8 22.5 16.1 19.6 18.2 18.5 21.6 14.9 21.5 12 23.6 9.1 21.5 5.5 21.6 4.4 18.2 1.5 16.1 3 12.8 1.5 9.5 4.4 7.4 5.5 4 9.1 4.1Z" fill="#1d9bf0" /><path d="M9.6 12.4 11.3 14.1 14.8 10.2" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
              : verifyStatus === "submitted"
                ? <span className="statuspill statuspill--warn">Under review</span>
                : <span className="verpill">Verify</span>}
          </div>
        </>
      )}

      {/* BECOME A CLEANER — single toggle. Requires a phone first (customers
          must be able to reach the cleaner). */}
      <div className="card row between" style={{ marginTop: 18, cursor: "pointer" }}
        onClick={() => {
          if (agentActivated) { setShowOff(true); return; }
          if (!userPhone.trim()) { setEditProfile(true); return; }
          setShowActivate(true);
        }}>
        <b style={{ fontSize: 14 }}>Become a cleaner</b>
        <div className={"switch" + (agentActivated ? " on" : "")}><div className="switch__dot" /></div>
      </div>

      {/* ===================== SETTINGS (shared) ===================== */}
      <div className="acct-sec">Settings</div>

      {agentActivated && (
        <div className="card row between">
          <b style={{ fontSize: 14 }}>Open on launch</b>
          <div className="segmini">
            {([{ v: "customer", t: "Customer" }, { v: "agent", t: "Cleaner" }] as const).map((o) => (
              <button key={o.v} className={launchSide === o.v ? "active" : ""} onClick={() => setLaunchSide(o.v)}>{o.t}</button>
            ))}
          </div>
        </div>
      )}

      {bioAvail && (
        <>
          <div className="card row between" style={{ marginTop: 12, cursor: bioBusy ? "default" : "pointer", opacity: bioBusy ? 0.6 : 1 }}
            onClick={() => { if (!bioBusy) toggleBio(); }}>
            <b style={{ fontSize: 14 }}>{bioBusy ? "Waiting for Face ID…" : biometricLabel()}</b>
            <div className={"switch" + (bioOn ? " on" : "")}><div className="switch__dot" /></div>
          </div>
          {bioErr && <div className="loginerr" style={{ marginTop: 8 }}>{bioErr}</div>}
        </>
      )}

      <div className="card row between" style={{ marginTop: 12, cursor: pushBusy ? "default" : "pointer", opacity: pushBusy ? 0.6 : 1 }}
        onClick={() => { if (!pushBusy) togglePush(); }}>
        <b style={{ fontSize: 14 }}>{pushBusy ? (pushEnabled ? "Disabling…" : "Enabling…") : "Push notifications"}</b>
        <div className={"switch" + (pushEnabled ? " on" : "")}><div className="switch__dot" /></div>
      </div>
      {pushErr && <div className="loginerr" style={{ marginTop: 8 }}>{pushErr}</div>}
      {typeof Notification !== "undefined" && Notification.permission === "denied" && (
        <div className="note amber" style={{ marginTop: 8 }}>
          Notifications are blocked in your browser. Click the lock/site icon in the address bar → allow Notifications, then try again.
        </div>
      )}
      {(() => {
        // iOS only allows Web Push once the app is INSTALLED to the home screen
        // (not in a Safari tab). Tell the user instead of failing silently.
        const ua = navigator.userAgent || "";
        const isIOS = /iPhone|iPad|iPod/i.test(ua);
        const standalone = window.matchMedia?.("(display-mode: standalone)").matches
          || (navigator as unknown as { standalone?: boolean }).standalone === true;
        if (isIOS && !standalone) {
          return (
            <div className="note amber" style={{ marginTop: 8 }}>
              On iPhone, notifications work only after you add the app to your Home Screen: tap the <b>Share</b> icon → <b>Add to Home Screen</b>, then open it from the icon and turn this on.
            </div>
          );
        }
        return null;
      })()}

      <div className="card row between" style={{ marginTop: 12 }}>
        <b style={{ fontSize: 14 }}>Appearance</b>
        <div className="segmini">
          {THEME_OPTS.map((o) => (
            <button key={o.v} className={themePref === o.v ? "active" : ""} onClick={() => setThemePref(o.v)}>{o.t}</button>
          ))}
        </div>
      </div>

      <div className="card row between" style={{ marginTop: 12, cursor: "pointer" }} onClick={() => setShowLegal(true)}>
        <b style={{ fontSize: 14 }}>Legal & policies</b>
        <span className="dayrow__chev">›</span>
      </div>

      <div style={{ height: 18 }} />
      <button className="btn danger" onClick={logout}>Sign out</button>

      <div style={{ height: 14 }} />
      <p className="tiny muted" style={{ textAlign: "center" }}>{APP_NAME} demo · {APP_VERSION}</p>

      {/* ===================== MODALS ===================== */}

      {/* cleaner activation */}
      {showActivate && (
        <div className="modal__backdrop" onClick={() => setShowActivate(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div style={{ textAlign: "center", marginBottom: 8 }}><b style={{ fontSize: 18 }}>Become a cleaner</b></div>
            <p className="sub" style={{ textAlign: "center" }}>Turn {APP_NAME} into income. Pick up cleaning jobs near you, on your own schedule.</p>
            <div className="actfeat"><div><b>Work when you want</b><div className="tiny muted">Set your days, hours and breaks.</div></div></div>
            <div className="actfeat"><div><b>Set your own rate</b><div className="tiny muted">Weekday and weekend prices, your call.</div></div></div>
            <div className="actfeat"><div><b>Get paid weekly</b><div className="tiny muted">Earnings transfer straight to your bank.</div></div></div>
            <div className="actfeat"><div><b>Earn more by referring</b><div className="tiny muted">Invite cleaners you trust — when they have a good month, you both get a bonus, every month.</div></div></div>
            <div className="actfeat"><div><b>Quick verification</b><div className="tiny muted">EU citizens verified instantly. Others upload a work permit.</div></div></div>
            <div className="note" style={{ marginTop: 14 }}>You'll join as an <b>independent, self-employed</b> service provider. You're responsible for your own income tax and social insurance.</div>
            <div style={{ height: 14 }} />
            <button className="btn" onClick={() => {
              setShowActivate(false);
              // Skip the legal gate if the cleaner agreement was already accepted
              // at its current version — re-activating shouldn't re-prompt.
              if (hasAcceptedCurrent(CLEANER_DOC_IDS)) { activateAgent(); setShowReferHint(true); }
              else { setShowCleanerConsent(true); }
            }}>Continue</button>
            <div style={{ height: 8 }} />
            <button className="btn secondary" onClick={() => setShowActivate(false)}>Maybe later</button>
          </div>
        </div>
      )}

      {showReferHint && (
        <div className="modal__backdrop" onClick={() => setShowReferHint(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div style={{ textAlign: "center", marginBottom: 8 }}><b style={{ fontSize: 18 }}>You're a cleaner now 🎉</b></div>
            <p className="sub" style={{ textAlign: "center" }}>One more way to earn: invite other cleaners you trust.</p>
            <div className="referhero" style={{ marginTop: 6 }}>
              <div className="referhero__title">Refer &amp; earn more</div>
              <p className="referhero__sub">
                When a cleaner you invited has a good month, you <b>both</b> get a bonus on top of
                your pay — and it repeats every month they keep it up.
              </p>
            </div>
            <div style={{ height: 14 }} />
            <button className="btn agent" onClick={() => { setShowReferHint(false); setRole("agent"); }}>
              Go to Refer &amp; earn
            </button>
            <div style={{ height: 8 }} />
            <button className="btn secondary" onClick={() => setShowReferHint(false)}>Later</button>
          </div>
        </div>
      )}

      {showCleanerConsent && (
        <ConsentGate
          title="Cleaner (Service Provider) Agreement"
          intro="You're joining as an independent, self-employed provider. Please read and accept before activating."
          docIds={CLEANER_DOC_IDS}
          confirmLabel="I agree — activate cleaner mode"
          onCancel={() => setShowCleanerConsent(false)}
          onConfirm={() => {
            recordConsent(CLEANER_DOC_IDS);
            activateAgent();
            setShowCleanerConsent(false);
            setShowReferHint(true);
            // stay on the account page — the Cleaner section simply appears
          }}
        />
      )}

      {showOff && (
        <div className="modal__backdrop" onClick={() => setShowOff(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div style={{ textAlign: "center", marginBottom: 6 }}><b style={{ fontSize: 17 }}>Deactivate cleaner mode?</b></div>
            <p className="sub" style={{ textAlign: "center" }}>You'll stop receiving jobs and return to the customer app. <b>Any pending offers and accepted jobs will be cancelled.</b> Your rate, schedule and reviews are kept — reactivate anytime.</p>
            <div style={{ height: 8 }} />
            <button className="btn danger" onClick={() => { deactivateAgent(); setShowOff(false); }}>Deactivate</button>
            <div style={{ height: 8 }} />
            <button className="btn secondary" onClick={() => setShowOff(false)}>Keep active</button>
          </div>
        </div>
      )}

      {/* earnings statements */}
      {/* rates & availability */}
      {showRates && (
        <div className="modal__backdrop" onClick={() => setShowRates(false)}>
          <div className="modal tall" onClick={(e) => e.stopPropagation()}>
            <div className="between" style={{ marginBottom: 14 }}>
              <b style={{ fontSize: 16 }}>Rates & availability</b>
              <button className="iconbtn" onClick={() => setShowRates(false)}>✕</button>
            </div>

            <div className="label" style={{ marginTop: 0 }}>Your rate</div>
            <RateCard title="Weekday" rate={agentProfile.rateWeekday} stats={wkdayStats} pos={posWkday}
              onChange={(r) => setAgentProfile({ ...agentProfile, rateWeekday: r })} />
            <RateCard title="Weekend" rate={agentProfile.rateWeekend} stats={wkendStats} pos={posWkend}
              onChange={(r) => setAgentProfile({ ...agentProfile, rateWeekend: r })} />

            <div className="label" style={{ marginTop: 16 }}>Cities you work in</div>
            <div className="citychips">
              {CY_CITIES.map((city) => (
                <button key={city} type="button"
                  className={"citychip" + (serviceCities.includes(city) ? " active" : "")}
                  onClick={() => toggleCity(city)}>
                  {city}
                </button>
              ))}
            </div>
            {serviceCities.length === 0 && (
              <div className="note amber" style={{ marginTop: 8 }}>Pick at least one city, or customers won't find you.</div>
            )}

            <div className="label" style={{ marginTop: 16 }}>Work schedule</div>
            <div className="card" style={{ padding: "2px 0" }}>
              {WEEKDAYS.map((d, idx) => {
                const on = !!(sched[d] && sched[d].length);
                const summary = on ? sched[d].map((s) => `${s.start}–${s.end}`).join(", ") : "Day off";
                return (
                  <div key={d} className="dayrow" style={{ borderTop: idx ? "1px solid var(--border)" : "none" }}>
                    <div className={"switch sm" + (on ? " on" : "")} onClick={() => toggleDay(d)}><div className="switch__dot" /></div>
                    <span className="dayrow__name">{d}</span>
                    <button className="dayrow__sum" disabled={!on} onClick={() => on && setEditDay(d)}>
                      <span className={on ? "" : "muted"}>{summary}</span>
                      {on && <span className="dayrow__chev">›</span>}
                    </button>
                  </div>
                );
              })}
            </div>

            <div style={{ height: 14 }} />
            <button className="btn" onClick={() => setShowRates(false)}>Done</button>
          </div>
        </div>
      )}

      {editDay && (
        <div className="modal__backdrop" onClick={() => setEditDay(null)}>
          <div className="modal tall" onClick={(e) => e.stopPropagation()}>
            <div className="between" style={{ marginBottom: 12 }}>
              <b style={{ fontSize: 16 }}>{DAY_FULL[editDay]} hours</b>
              <button className="iconbtn" onClick={() => setEditDay(null)}>✕</button>
            </div>
            {(sched[editDay] ?? []).map((s, i) => {
              const prevEnd = i > 0 ? (sched[editDay] ?? [])[i - 1].end : undefined;
              return (
                <div key={i} className="slotrow">
                  <div className="grow"><TimeSelect value={s.start} min={prevEnd} onChange={(v) => setDaySlot(editDay, i, "start", v)} /></div>
                  <span className="slotdash">–</span>
                  <div className="grow"><TimeSelect value={s.end} min={s.start} onChange={(v) => setDaySlot(editDay, i, "end", v)} /></div>
                  {(sched[editDay] ?? []).length > 1 && (
                    <button className="iconbtn" title="Remove" onClick={() => removeDaySlot(editDay, i)}>✕</button>
                  )}
                </div>
              );
            })}
            <button className="addslot" onClick={() => addDaySlot(editDay)}>+ Add another time range</button>
            <div style={{ height: 14 }} />
            <button className="btn" onClick={() => setEditDay(null)}>Done</button>
          </div>
        </div>
      )}

      {/* payout */}
      {showPayout && (
        <div className="modal__backdrop" onClick={() => setShowPayout(false)}>
          <div className="modal tall" onClick={(e) => e.stopPropagation()}>
            <div className="between" style={{ marginBottom: 12 }}>
              <b style={{ fontSize: 16 }}>Payout method</b>
              <button className="iconbtn" onClick={() => setShowPayout(false)}>✕</button>
            </div>
            <div className="seg" style={{ marginBottom: 12 }}>
              <button className={payType === "bank" ? "active" : ""} onClick={() => setPayType("bank")}>Bank</button>
              <button className={payType === "card" ? "active" : ""} onClick={() => setPayType("card")}>Card</button>
            </div>
            <div className="label">{payType === "card" ? "Cardholder name" : "Account holder name"}</div>
            <input className="input" value={payName} onChange={(e) => setPayName(e.target.value)} placeholder="Full name" />
            <div className="label">{payType === "card" ? "Card number" : "IBAN"}</div>
            <input className="input" value={payNum} onChange={(e) => setPayNum(e.target.value)} inputMode="numeric"
              placeholder={payType === "card" ? "•••• •••• •••• ••••" : "CY00 0000 0000 0000 0000 0000 0000"} />
            {payType === "card" && (
              <div className="row" style={{ gap: 10 }}>
                <div className="grow">
                  <div className="label">Expiry (MM/YY)</div>
                  <input className="input" value={payExp} inputMode="numeric" placeholder="MM/YY"
                    onChange={(e) => { let v = e.target.value.replace(/[^\d]/g, "").slice(0, 4); if (v.length >= 3) v = v.slice(0, 2) + "/" + v.slice(2); setPayExp(v); }} />
                </div>
                <div className="grow">
                  <div className="label">CVC</div>
                  <input className="input" value={payCvc} inputMode="numeric" placeholder="•••" onChange={(e) => setPayCvc(e.target.value.replace(/[^\d]/g, "").slice(0, 4))} />
                </div>
              </div>
            )}
            <div className="note" style={{ marginTop: 12 }}>Used only to send you your earnings. Payouts transfer a few days after each job.</div>
            <div style={{ height: 14 }} />
            {(() => {
              const cardValid = payName && payNum && /^\d{2}\/\d{2}$/.test(payExp) && payCvc.length >= 3;
              const bankValid = payName && payNum;
              const valid = payType === "card" ? cardValid : bankValid;
              return (
                <button className="btn" disabled={!valid} style={{ opacity: valid ? 1 : 0.5 }}
                  onClick={() => {
                    const masked = payType === "card"
                      ? "•••• " + payNum.replace(/\s/g, "").slice(-4)
                      : payNum.replace(/\s/g, "").replace(/.(?=.{4})/g, "•").replace(/(.{4})/g, "$1 ").trim();
                    setAgentProfile({ ...agentProfile, payoutType: payType, payoutName: payName, payoutNumber: masked, payoutExpiry: payType === "card" ? payExp : "" });
                    setShowPayout(false);
                  }}>
                  {payType === "card" ? "Save card" : "Save bank account"}
                </button>
              );
            })()}
            {agentProfile.payoutType && (
              <>
                <div style={{ height: 8 }} />
                <button className="btn danger" onClick={() => { setAgentProfile({ ...agentProfile, payoutType: "", payoutName: "", payoutNumber: "", payoutExpiry: "" }); setShowPayout(false); }}>Remove</button>
              </>
            )}
          </div>
        </div>
      )}

      {/* disputes list */}
      {showDisputes && (
        <div className="modal__backdrop" onClick={() => setShowDisputes(false)}>
          <div className="modal tall" onClick={(e) => e.stopPropagation()}>
            <div className="between" style={{ marginBottom: 14 }}>
              <b style={{ fontSize: 16 }}>Disputes</b>
              <button className="iconbtn" onClick={() => setShowDisputes(false)}>✕</button>
            </div>
            {disputes.length === 0 ? (
              <p className="sub" style={{ margin: "8px 0" }}>No refund requests right now.</p>
            ) : (
              disputes.map((b) => {
                const r = b.refund!;
                return (
                  <div key={b.id} className="card" style={{ cursor: "pointer", borderColor: r.status === "pending" && !r.agentResponse ? "var(--amber)" : "var(--border)" }}
                    onClick={() => { setShowDisputes(false); setDisputeFor(b); }}>
                    <div className="between">
                      <b style={{ fontSize: 14 }}>{b.addressNickname}</b>
                      <span className={"badge " + (r.status === "approved" ? "green" : r.status === "declined" ? "" : "amber")}>
                        {r.agentResponse ? (r.agentResponse.stance === "dispute" ? "You disputed" : "You accepted") : "Action needed"}
                      </span>
                    </div>
                    <div className="tiny muted" style={{ marginTop: 4 }}>{r.reason} · €{b.total} · {r.date}</div>
                    <div className="tiny" style={{ marginTop: 4 }}>“{r.note}”</div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {disputeFor && disputeFor.refund && (
        <DisputeModal
          booking={disputeFor}
          onClose={() => setDisputeFor(null)}
          onRespond={(stance, note, proofPhotos) => {
            updateBooking(disputeFor.id, {
              refund: { ...disputeFor.refund!, agentResponse: { stance, note, hasProof: proofPhotos.length > 0, proofPhotos, date: new Date().toISOString().slice(0, 10) } },
            });
            notify({
              audience: "customer", kind: "refund_resolved", bookingId: disputeFor.id,
              title: stance === "accept" ? "Cleaner accepted your refund" : "Cleaner disputed your refund",
              body: stance === "accept"
                ? `${disputeFor.cleanerName} accepted your refund for ${disputeFor.addressNickname}. Our team will finalise it.`
                : `${disputeFor.cleanerName} disputed your refund for ${disputeFor.addressNickname}. Our team will review both sides.`,
            });
            setDisputeFor(null);
          }}
        />
      )}

      {/* verification */}
      {showVerify && (
        <div className="modal__backdrop" onClick={() => setShowVerify(false)}>
          <div className="modal tall" onClick={(e) => e.stopPropagation()}>
            <div className="between" style={{ marginBottom: 14 }}>
              <b style={{ fontSize: 16 }}>Identity verification</b>
              <button className="iconbtn" onClick={() => setShowVerify(false)}>✕</button>
            </div>
            {verified ? (
              <div style={{ textAlign: "center", padding: "16px 0 6px" }}>
                <span className="verbadge verbadge--lg">
                  <svg viewBox="0 0 24 24" width="52" height="52"><path d="M12 2 14.9 4.1 18.5 4 19.6 7.4 22.5 9.5 21 12.8 22.5 16.1 19.6 18.2 18.5 21.6 14.9 21.5 12 23.6 9.1 21.5 5.5 21.6 4.4 18.2 1.5 16.1 3 12.8 1.5 9.5 4.4 7.4 5.5 4 9.1 4.1Z" fill="#1d9bf0" /><path d="M9.6 12.4 11.3 14.1 14.8 10.2" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </span>
                <b style={{ display: "block", marginTop: 12, fontSize: 16 }}>Verified</b>
                <p className="sub" style={{ marginTop: 4 }}>Your identity is confirmed.</p>
                <div style={{ height: 14 }} />
                <button className="btn secondary" onClick={() => setShowVerify(false)}>Close</button>
              </div>
            ) : verifyStatus === "submitted" ? (
              <div style={{ textAlign: "center", padding: "16px 0 6px" }}>
                <div className="reviewspin" />
                <b style={{ display: "block", marginTop: 14, fontSize: 16 }}>Submitted for review</b>
                <p className="sub" style={{ marginTop: 4, maxWidth: 280, margin: "4px auto 0" }}>We're checking your document. This usually takes up to 24 hours — you'll be notified once approved.</p>
                <div style={{ height: 16 }} />
                <button className="btn secondary" onClick={() => setShowVerify(false)}>Close</button>
              </div>
            ) : (
              <>
                <div className="label" style={{ marginTop: 0 }}>Profile photo</div>
                <div className="vdoc" style={{ marginBottom: 12 }}>
                  <div className="row" style={{ gap: 12, alignItems: "center" }}>
                    <div className="vdoc__photo">
                      {agentProfile.photoUrl
                        ? <img src={agentProfile.photoUrl} alt="Profile" />
                        : <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="var(--muted)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4" /><path d="M4 20c0-3.9 3.6-6.5 8-6.5s8 2.6 8 6.5" /></svg>}
                    </div>
                    <div className="grow">
                      <b style={{ fontSize: 13.5 }}>Your face photo</b>
                      <div className="tiny muted" style={{ marginTop: 2 }}>Shown to customers browsing cleaners.</div>
                    </div>
                    <button className="btn sm secondary" onClick={() => photoInput.current?.click()}>{agentProfile.photoUrl ? "Change" : "Add photo"}</button>
                  </div>
                </div>

                <div className="label" style={{ marginTop: 0 }}>Document type</div>
                <div className="seg" style={{ marginBottom: 12 }}>
                  <button className={docType === "id" ? "active" : ""} onClick={() => { if (docType !== "id") { setDocType("id"); setIdUp(false); setIdName(""); } }}>ID card</button>
                  <button className={docType === "passport" ? "active" : ""} onClick={() => { if (docType !== "passport") { setDocType("passport"); setIdUp(false); setIdName(""); } }}>Passport</button>
                </div>
                <input ref={idInput} type="file" accept="image/*,application/pdf" hidden
                  onChange={async (e) => {
                    const f = e.target.files?.[0]; if (!f) return;
                    setIdErr(""); setIdBusy(true);
                    try {
                      const { data: sess } = await supabase.auth.getSession();
                      const uid = sess.session?.user.id ?? "anon";
                      const path = `${uid}/id/${Date.now()}-${f.name.replace(/[^\w.]+/g, "_")}`;
                      const { error } = await supabase.storage.from("proofs").upload(path, f, { upsert: false });
                      if (error) throw error;
                      const { data: pub } = supabase.storage.from("proofs").getPublicUrl(path);
                      setIdPhotos([pub.publicUrl]); setIdUp(true); setIdName(f.name);
                    } catch (err) { setIdErr((err as Error).message || "Upload failed."); }
                    finally { setIdBusy(false); }
                  }} />
                <div className="vdoc">
                  <div className="between">
                    <b style={{ fontSize: 13.5 }}>{docType === "passport" ? "Passport photo page" : "ID card (front & back)"}</b>
                    {idUp && <span className="statuspill statuspill--ok">Added</span>}
                  </div>
                  <div className="row" style={{ gap: 8, marginTop: 12 }}>
                    <button className="btn sm secondary grow" onClick={() => idInput.current?.click()}>{idUp ? "Re-upload document" : "Upload document"}</button>
                  </div>
                </div>
                <div className="label" style={{ marginTop: 14 }}>{docType === "passport" ? "Passport number" : "ID number"}</div>
                <input className="input" value={idNumber} onChange={(e) => setIdNumber(e.target.value.toUpperCase())} />
                <div className="label">Expiry date</div>
                <input className="input expiryinput" value={idExpiry} inputMode="numeric" placeholder="MM / YY" maxLength={5}
                  onChange={(e) => { let v = e.target.value.replace(/[^\d]/g, "").slice(0, 4); if (v.length >= 3) v = v.slice(0, 2) + "/" + v.slice(2); setIdExpiry(v); }} />
                {idErr && <div className="note amber" style={{ marginTop: 12 }}>{idErr}</div>}
                <div style={{ height: 16 }} />
                {(() => {
                  const ok = idUp && idPhotos.length > 0 && idNumber.trim() && /^\d{2}\/\d{2}$/.test(idExpiry);
                  return (
                    <button className="btn" disabled={!ok || idBusy} style={{ opacity: ok && !idBusy ? 1 : .5 }}
                      onClick={async () => {
                        setIdErr(""); setIdBusy(true);
                        const res = await submitVerification({ docType, docNumber: idNumber.trim(), expiry: idExpiry, photos: idPhotos });
                        setIdBusy(false);
                        if (res.error) setIdErr(res.error);
                      }}>
                      {idBusy ? "Submitting…" : "Submit for review"}
                    </button>
                  );
                })()}
              </>
            )}
          </div>
        </div>
      )}

      {idCam && (
        <CameraCapture
          title={docType === "passport" ? "Photograph your passport" : "Photograph your ID"}
          steps={docType === "passport" ? ["Photo page"] : ["Front", "Back"]}
          folder="id"
          onClose={() => setIdCam(false)}
          onDone={(p) => {
            const urls = p.map((x) => x.url).filter((u): u is string => !!u);
            setIdPhotos(urls); setIdUp(urls.length > 0); setIdName(""); setIdCam(false);
          }}
        />
      )}


      {/* legal document list */}
      {showLegal && (
        <div className="modal__backdrop" onClick={() => setShowLegal(false)}>
          <div className="modal tall" onClick={(e) => e.stopPropagation()}>
            <div className="between" style={{ marginBottom: 12 }}>
              <b style={{ fontSize: 16 }}>Legal & policies</b>
              <button className="iconbtn" onClick={() => setShowLegal(false)}>✕</button>
            </div>
            <div className="card" style={{ padding: 0, overflow: "hidden" }}>
              {LEGAL_DOCS.map((d, i) => {
                const rec = consents.find((r) => r.docId === d.id);
                const accepted = !!rec && rec.version >= d.version;
                return (
                  <button key={d.id} className="legalrow" onClick={() => setViewDoc(d.id)}
                    style={{ borderTop: i === 0 ? "none" : "1px solid var(--border)" }}>
                    <span className="legalrow__txt">
                      <b>{d.title}</b>
                      <span className="tiny muted">
                        {accepted
                          ? `Accepted · ${new Date(rec!.acceptedAt).toLocaleDateString("en-GB")}`
                          : "Not yet accepted"}
                      </span>
                    </span>
                    <span className="tiny muted">View ›</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {viewDoc && <LegalDocModal docId={viewDoc} onClose={() => setViewDoc(null)} />}
    </div>
  );
}

function DisputeModal({ booking, onClose, onRespond }: {
  booking: Booking;
  onClose: () => void;
  onRespond: (stance: "accept" | "dispute", note: string, proofPhotos: string[]) => void;
}) {
  const r = booking.refund!;
  const [note, setNote] = useState(r.agentResponse?.note ?? "");
  const [proof, setProof] = useState<CapturedPhoto[]>([]);
  const [cam, setCam] = useState(false);

  return (
    <div className="modal__backdrop" onClick={onClose}>
      <div className="modal tall" onClick={(e) => e.stopPropagation()}>
        <div className="between" style={{ marginBottom: 12 }}>
          <b style={{ fontSize: 16 }}>Refund request</b>
          <button className="iconbtn" onClick={onClose}>✕</button>
        </div>
        <div className="card" style={{ marginBottom: 12 }}>
          <div className="between"><b style={{ fontSize: 14 }}>{booking.addressNickname}</b><span className="tiny muted">{r.date}</span></div>
          <div className="tiny muted" style={{ marginTop: 4 }}>Reason: <b>{r.reason}</b> · €{booking.total}</div>
          <div className="tiny" style={{ marginTop: 6 }}>“{r.note}”</div>
          {r.photos && r.photos.length > 0 ? (
            <div style={{ display: "flex", gap: 8, overflowX: "auto", marginTop: 10 }}>
              {r.photos.map((u) => (
                <a key={u} href={u} target="_blank" rel="noreferrer" style={{ flexShrink: 0 }}>
                  <img src={u} alt="evidence" style={{ width: 60, height: 60, objectFit: "cover", borderRadius: 9, border: "1px solid var(--border)" }} />
                </a>
              ))}
            </div>
          ) : (
            <div className="tiny muted" style={{ marginTop: 6 }}>No customer photos</div>
          )}
        </div>
        {r.agentResponse ? (
          <div className={"note" + (r.agentResponse.stance === "dispute" ? " amber" : "")}>
            You {r.agentResponse.stance === "dispute" ? "disputed" : "accepted"} this on {r.agentResponse.date}.
            {r.agentResponse.note && <> “{r.agentResponse.note}”</>}
          </div>
        ) : (
          <>
            <div className="label">Your response</div>
            <textarea className="input" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Explain your side…" />
            <button className={"proofbtn" + (proof.length ? " done" : "")} style={{ width: "100%", marginTop: 10 }} onClick={() => setCam(true)}>
              {proof.length ? `✓ ${proof.length} proof photo(s)` : "Add your before/after proof"}
            </button>
            <div className="note" style={{ marginTop: 12 }}>Our team weighs both sides + the time-stamped photos, then decides.</div>
            <div className="row" style={{ gap: 8, marginTop: 14 }}>
              <button className="btn secondary grow" onClick={() => onRespond("accept", note, proof.map((p) => p.url).filter((u): u is string => !!u))}>Accept refund</button>
              <button className="btn agent grow" disabled={!note.trim()} style={{ opacity: !note.trim() ? 0.5 : 1 }} onClick={() => onRespond("dispute", note, proof.map((p) => p.url).filter((u): u is string => !!u))}>Dispute it</button>
            </div>
          </>
        )}
      </div>
      {cam && <CameraCapture title="Your proof photos" folder="dispute" onClose={() => setCam(false)} onDone={(p) => { setProof(p); setCam(false); }} />}
    </div>
  );
}

function RateCard({ title, rate, stats, pos, onChange }: {
  title: string;
  rate: number;
  stats: { min: number; max: number; avg: number };
  pos: { label: string; cls: string };
  onChange: (r: number) => void;
}) {
  const span = Math.max(1, stats.max - stats.min);
  const clamp = Math.min(stats.max, Math.max(stats.min, rate));
  const pct = ((clamp - stats.min) / span) * 100;
  const avgPct = ((stats.avg - stats.min) / span) * 100;
  const dec = (v: number) => onChange(Math.max(1, +(v - 0.5).toFixed(2)));
  const inc = (v: number) => onChange(Math.min(50, +(v + 0.5).toFixed(2)));
  const unset = rate <= 0;
  return (
    <div className="ratecard ratecard--mini">
      <div className="ratecard__head">
        <span className="ratecard__title">{title}</span>
        <div className="ratestep">
          <button className="stepbtn sm" onClick={() => dec(rate)}>−</button>
          {unset
            ? <span className="ratecard__amt sm" style={{ color: "var(--muted)" }}>Set</span>
            : <span className="ratecard__amt sm">€{rate % 1 === 0 ? rate.toFixed(0) : rate.toFixed(1)}</span>}
          <button className="stepbtn sm" onClick={() => inc(rate)}>+</button>
        </div>
        {unset
          ? <span className="badge amber">Not set</span>
          : <span className={"badge " + pos.cls}>{pos.label}</span>}
      </div>
      <div className="rangebar" style={{ marginTop: 8 }}>
        <div className="rangebar__track">
          <div className="rangebar__avg" style={{ left: `${avgPct}%` }} />
          {!unset && <div className="rangebar__you" style={{ left: `${pct}%` }} />}
        </div>
        <div className="rangebar__labels">
          <span>€{stats.min}</span>
          <span className="rangebar__avglbl">avg €{stats.avg}</span>
          <span>€{stats.max}</span>
        </div>
      </div>
    </div>
  );
}
