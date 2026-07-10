// ============================================================================
// iCal sync Edge Function — fetch + parse an Airbnb / Booking.com .ics calendar
// feed server-side (browsers can't fetch it directly: CORS) and return the
// booked/blocked date ranges as guest "stays".
//
// POST { url: string }  ->  { stays: [{ checkIn, checkOut, guest, uid }] }
//
// The .ics feed only exposes availability (DTSTART/DTEND + a generic SUMMARY
// like "Reserved" / "CLOSED - Not available"). No address, no guest identity —
// those aren't in the feed. We surface the SUMMARY as the "guest" label.
// ============================================================================

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json" } });
}

// Unfold RFC-5545 folded lines (a leading space/tab continues the previous line).
function unfold(text: string): string[] {
  const raw = text.split(/\r?\n/);
  const out: string[] = [];
  for (const line of raw) {
    if ((line.startsWith(" ") || line.startsWith("\t")) && out.length) {
      out[out.length - 1] += line.slice(1);
    } else {
      out.push(line);
    }
  }
  return out;
}

// "20260714" or "20260714T110000Z" -> "2026-07-14"
function toISODate(v: string): string | null {
  const m = v.match(/^(\d{4})(\d{2})(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

// pull the value part of a line like "DTSTART;VALUE=DATE:20260714"
function value(line: string): string {
  const i = line.indexOf(":");
  return i === -1 ? "" : line.slice(i + 1).trim();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  let url = "";
  try { url = String((await req.json()).url ?? "").trim(); } catch { return json({ error: "bad json" }, 400); }
  if (!/^https?:\/\//i.test(url)) return json({ error: "invalid url" }, 400);

  let text: string;
  try {
    const res = await fetch(url, { headers: { "user-agent": "Cinderella-iCal/1.0" } });
    if (!res.ok) return json({ error: `feed fetch failed (${res.status})` }, 502);
    text = await res.text();
  } catch (e) {
    return json({ error: `feed unreachable: ${(e as Error).message}` }, 502);
  }

  if (!text.includes("BEGIN:VCALENDAR")) return json({ error: "not an iCal feed" }, 422);

  const lines = unfold(text);
  const stays: { checkIn: string; checkOut: string; guest: string; uid: string }[] = [];
  let cur: { start?: string; end?: string; summary?: string; uid?: string } | null = null;

  for (const line of lines) {
    if (line === "BEGIN:VEVENT") { cur = {}; continue; }
    if (line === "END:VEVENT") {
      if (cur?.start && cur.end) {
        stays.push({
          checkIn: cur.start,
          checkOut: cur.end,
          guest: cur.summary || "Reserved",
          uid: cur.uid || crypto.randomUUID(),
        });
      }
      cur = null;
      continue;
    }
    if (!cur) continue;
    if (line.startsWith("DTSTART")) { const d = toISODate(value(line)); if (d) cur.start = d; }
    else if (line.startsWith("DTEND")) { const d = toISODate(value(line)); if (d) cur.end = d; }
    else if (line.startsWith("SUMMARY")) { cur.summary = value(line); }
    else if (line.startsWith("UID")) { cur.uid = value(line); }
  }

  // only future / current stays are useful for scheduling cleanings
  const todayISO = new Date().toISOString().slice(0, 10);
  const upcoming = stays.filter((s) => s.checkOut >= todayISO)
    .sort((a, b) => (a.checkIn < b.checkIn ? -1 : 1));

  return json({ stays: upcoming });
});
