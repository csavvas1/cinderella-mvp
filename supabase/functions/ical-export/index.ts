// ============================================================================
// ical-export Edge Function — publish a COMBINED .ics feed per property so
// Airbnb / Booking.com (and any iCal importer) can block dates the other
// platform, or the host, booked. This is the write-side of channel management,
// done free via iCal (no partner API).
//
// GET /ical-export?property=<addressId>&token=<export_token>
//   -> text/calendar with a VEVENT for every stay on this property:
//      external_bookings (Airbnb + Booking + manual 'other') + own confirmed
//      cleaning bookings.
//
// Airbnb/Booking fetch this anonymously, so there's no user session — the
// per-property export_token is the only guard. Reads via the service role.
// ============================================================================
import { createClient } from "jsr:@supabase/supabase-js@2";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

// YYYY-MM-DD -> YYYYMMDD (iCal all-day DATE value)
function icalDate(iso: string): string {
  return iso.replace(/-/g, "");
}
function esc(s: string): string {
  return String(s).replace(/([,;\\])/g, "\\$1").replace(/\n/g, "\\n");
}
function stamp(): string {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const u = new URL(req.url);
  const propertyId = u.searchParams.get("property") ?? "";
  const token = u.searchParams.get("token") ?? "";
  if (!propertyId || !token) {
    return new Response("missing property or token", { status: 400, headers: cors });
  }

  // verify the token matches this property
  const { data: addr } = await admin.from("addresses")
    .select("id, nickname, export_token").eq("id", propertyId).maybeSingle();
  if (!addr || addr.export_token !== token) {
    return new Response("forbidden", { status: 403, headers: cors });
  }

  // external stays (all platforms, incl. manual 'other') for this property
  const { data: ext } = await admin.from("external_bookings")
    .select("id, platform, guest, check_in, check_out").eq("address_id", propertyId);

  // own confirmed cleaning bookings for this property (block those days too).
  // bookings store the address nickname, not id, so match on nickname.
  const { data: own } = await admin.from("bookings")
    .select("id, date, duration_hours, status, address_nickname")
    .eq("address_nickname", addr.nickname);

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Cinderella//Property Calendar//EN",
    "CALSCALE:GREGORIAN",
    `X-WR-CALNAME:${esc(addr.nickname)} — Cinderella`,
  ];

  for (const b of (ext ?? [])) {
    if (!b.check_in || !b.check_out) continue;
    lines.push(
      "BEGIN:VEVENT",
      `UID:ext-${b.id}@cinderella`,
      `DTSTAMP:${stamp()}`,
      `DTSTART;VALUE=DATE:${icalDate(b.check_in)}`,
      `DTEND;VALUE=DATE:${icalDate(b.check_out)}`,
      `SUMMARY:${esc(b.guest || "Reserved")} (${esc(b.platform || "other")})`,
      "END:VEVENT",
    );
  }

  for (const b of (own ?? [])) {
    if (!b.date) continue;
    if (b.status === "cancelled" || b.status === "declined") continue;
    // a cleaning is a single day; end = next day for an all-day block
    const start = b.date;
    const end = new Date(new Date(b.date + "T00:00:00").getTime() + 86400000).toISOString().slice(0, 10);
    lines.push(
      "BEGIN:VEVENT",
      `UID:clean-${b.id}@cinderella`,
      `DTSTAMP:${stamp()}`,
      `DTSTART;VALUE=DATE:${icalDate(start)}`,
      `DTEND;VALUE=DATE:${icalDate(end)}`,
      "SUMMARY:Cleaning (Cinderella)",
      "END:VEVENT",
    );
  }

  lines.push("END:VCALENDAR");

  return new Response(lines.join("\r\n"), {
    status: 200,
    headers: { ...cors, "content-type": "text/calendar; charset=utf-8" },
  });
});
