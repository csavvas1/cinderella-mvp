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

  const { data: addr } = await admin.from("addresses")
    .select("id, nickname, export_token").eq("id", propertyId).maybeSingle();
  if (!addr || addr.export_token !== token) {
    return new Response("forbidden", { status: 403, headers: cors });
  }

  const { data: ext } = await admin.from("external_bookings")
    .select("id, platform, guest, check_in, check_out").eq("address_id", propertyId);

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
