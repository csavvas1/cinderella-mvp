// ============================================================================
// statements Edge Function — generate a real PDF statement from the caller's
// own data (server-authoritative). Verifies the caller's JWT, queries with the
// service role, and returns an application/pdf body.
//
// POST {
//   type:   "expenses" | "earnings",
//   period: { kind: "current" | "month" | "year", month?: 1-12, year?: number }
// }
//   ->  application/pdf  (a downloadable statement)
//   |   { error }        (json on failure)
//
// expenses  = what a CUSTOMER paid (completed bookings.total).
// earnings  = what an AGENT earned (completed jobs.cleaner_pay + referral bonus
//             is shown separately in-app; here we report work income, which is
//             what the tax statement needs).
// ============================================================================
import { createClient } from "jsr:@supabase/supabase-js@2";
import { PDFDocument, StandardFonts, rgb } from "npm:pdf-lib@1.17.1";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json" } });
}

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

type Period = { kind: "current" | "month" | "year"; month?: number; year?: number };

// Resolve the [from, to) date window (inclusive from, exclusive to) for the
// requested period, plus a human label.
function windowFor(p: Period): { from: string; to: string; label: string } {
  const now = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  if (p.kind === "year") {
    const y = p.year ?? now.getFullYear();
    return { from: `${y}-01-01`, to: `${y + 1}-01-01`, label: `Year ${y}` };
  }
  if (p.kind === "month") {
    const y = p.year ?? now.getFullYear();
    const m = (p.month ?? now.getMonth() + 1);      // 1-12
    const from = new Date(Date.UTC(y, m - 1, 1));
    const to = new Date(Date.UTC(y, m, 1));
    return { from: iso(from), to: iso(to), label: `${MONTHS[m - 1]} ${y}` };
  }
  // current month
  const y = now.getFullYear(), m = now.getMonth();
  return {
    from: iso(new Date(Date.UTC(y, m, 1))),
    to: iso(new Date(Date.UTC(y, m + 1, 1))),
    label: `${MONTHS[m]} ${y} (current)`,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return json({ error: "not authenticated" }, 401);
  const { data: userData, error: authErr } = await admin.auth.getUser(auth.slice(7));
  if (authErr || !userData.user) return json({ error: "not authenticated" }, 401);
  const uid = userData.user.id;
  const email = userData.user.email ?? "";

  let type = "expenses";
  let period: Period = { kind: "current" };
  try {
    const body = await req.json();
    type = body.type === "earnings" ? "earnings" : "expenses";
    if (body.period && typeof body.period === "object") period = body.period as Period;
  } catch { return json({ error: "bad json" }, 400); }

  const win = windowFor(period);

  // display name for the header
  const { data: profile } = await admin.from("users").select("name").eq("id", uid).maybeSingle();
  const who = (profile?.name as string) || email || "Account holder";

  // ---- rows ----------------------------------------------------------------
  type Row = { date: string; desc: string; amount: number };
  let rows: Row[] = [];
  let title = "";
  let amountHeader = "";

  if (type === "expenses") {
    title = "Expense statement";
    amountHeader = "Paid";
    const { data } = await admin.from("bookings")
      .select("date, cleaner_name, address_nickname, total, status")
      .eq("user_id", uid).eq("status", "completed")
      .gte("date", win.from).lt("date", win.to)
      .order("date", { ascending: true });
    rows = (data ?? []).map((b) => ({
      date: String(b.date),
      desc: `Cleaning · ${b.address_nickname ?? ""}${b.cleaner_name ? " · " + b.cleaner_name : ""}`.trim(),
      amount: Number(b.total ?? 0),
    }));
  } else {
    title = "Earnings statement";
    amountHeader = "Earned";
    const { data } = await admin.from("jobs")
      .select("date, customer_name, address, cleaner_pay, rate_per_hour, duration_hours, status")
      .eq("cleaner_id", uid).eq("status", "completed")
      .gte("date", win.from).lt("date", win.to)
      .order("date", { ascending: true });
    rows = (data ?? []).map((j) => ({
      date: String(j.date),
      desc: `Cleaning · ${j.customer_name ?? ""}`.trim(),
      amount: Number(j.cleaner_pay ?? (Number(j.rate_per_hour ?? 0) * Number(j.duration_hours ?? 0))),
    }));
  }

  const totalAmount = rows.reduce((s, r) => s + r.amount, 0);

  // ---- build the PDF -------------------------------------------------------
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${title} — ${win.label}`);
  pdf.setAuthor("Cinderella");
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const A4 = { w: 595, h: 842 };
  const margin = 48;
  const ink = rgb(0.08, 0.09, 0.11);
  const muted = rgb(0.45, 0.47, 0.52);
  const line = rgb(0.85, 0.86, 0.88);
  const accent = type === "earnings" ? rgb(0.055, 0.647, 0.914) : rgb(0.30, 0.34, 0.90);

  let page = pdf.addPage([A4.w, A4.h]);
  let y = A4.h - margin;

  const text = (s: string, x: number, yy: number, size: number, f = font, color = ink) =>
    page.drawText(s, { x, y: yy, size, font: f, color });
  const eur = (n: number) => `EUR ${n.toFixed(2)}`;

  // header
  text("Cinderella", margin, y, 20, bold, accent);
  text(title, A4.w - margin - bold.widthOfTextAtSize(title, 14), y + 3, 14, bold, ink);
  y -= 26;
  text(win.label, margin, y, 11, font, muted);
  y -= 16;
  text(`Prepared for: ${who}`, margin, y, 10, font, muted);
  y -= 8;
  page.drawLine({ start: { x: margin, y }, end: { x: A4.w - margin, y }, thickness: 1, color: line });
  y -= 22;

  // column headers
  const colDate = margin;
  const colDesc = margin + 90;
  const colAmt = A4.w - margin;
  text("Date", colDate, y, 9, bold, muted);
  text("Description", colDesc, y, 9, bold, muted);
  const ah = amountHeader;
  text(ah, colAmt - bold.widthOfTextAtSize(ah, 9), y, 9, bold, muted);
  y -= 6;
  page.drawLine({ start: { x: margin, y }, end: { x: A4.w - margin, y }, thickness: 0.5, color: line });
  y -= 16;

  const clip = (s: string, size: number, maxW: number) => {
    let out = s;
    while (out.length > 4 && font.widthOfTextAtSize(out, size) > maxW) out = out.slice(0, -2);
    return out === s ? s : out + "…";
  };

  if (rows.length === 0) {
    text("No completed activity in this period.", colDate, y, 10, font, muted);
    y -= 18;
  } else {
    for (const r of rows) {
      if (y < margin + 70) { page = pdf.addPage([A4.w, A4.h]); y = A4.h - margin; }
      text(r.date, colDate, y, 9.5, font, ink);
      text(clip(r.desc, 9.5, colAmt - colDesc - 70), colDesc, y, 9.5, font, ink);
      const a = eur(r.amount);
      text(a, colAmt - font.widthOfTextAtSize(a, 9.5), y, 9.5, font, ink);
      y -= 15;
    }
  }

  // total
  y -= 6;
  page.drawLine({ start: { x: margin, y }, end: { x: A4.w - margin, y }, thickness: 1, color: line });
  y -= 20;
  text("Total", colDesc, y, 12, bold, ink);
  const tot = eur(totalAmount);
  text(tot, colAmt - bold.widthOfTextAtSize(tot, 12), y, 12, bold, accent);

  // footer
  const foot = `Generated ${new Date().toISOString().slice(0, 10)} · ${rows.length} item(s)`;
  text(foot, margin, margin - 12, 8, font, muted);

  const bytes = await pdf.save();

  const fname = `${type === "earnings" ? "earnings" : "expenses"}-${win.label.replace(/[^\w]+/g, "-").toLowerCase()}.pdf`;
  return new Response(bytes, {
    status: 200,
    headers: {
      ...cors,
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${fname}"`,
    },
  });
});
