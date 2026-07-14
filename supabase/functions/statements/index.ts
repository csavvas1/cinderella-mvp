// ============================================================================
// statements Edge Function — professional PDF statements from the caller's own
// server data. Verifies the caller's JWT, queries with the service role, and
// returns an application/pdf body with itemised tables, VAT breakdown, and
// totals suitable for submission to tax authorities.
//
// POST {
//   type:   "expenses" | "earnings",
//   period: { kind: "current" | "month" | "year", month?: 1-12, year?: number },
//   referralTotal?: number   // earnings only: referral-bonus income for the period
// }
//   ->  application/pdf   |   { error }
//
// expenses  = a CUSTOMER's completed bookings (what they paid, VAT-inclusive).
// earnings  = an AGENT's completed jobs (gross value, platform commission, net
//             paid) + a referral-bonus figure, for their tax return.
// ============================================================================
import { createClient } from "jsr:@supabase/supabase-js@2";
import { PDFDocument, rgb, type PDFFont } from "npm:pdf-lib@1.17.1";
import fontkit from "npm:@pdf-lib/fontkit@1.1.1";

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

// --- business constants -----------------------------------------------------
// Cyprus standard VAT rate is 19% and applies to domestic cleaning services
// (the reduced 3% "treatment cleaning" rate is for waste treatment, not home
// cleaning; 9%/5% don't apply). Prices are treated as VAT-inclusive.
const BRAND = "Σταχτοπούτα";
const VAT_RATE = 0.19;
// The platform's VAT registration number is a legal identifier issued to the
// business — it must NOT be faked. Set it via the VAT_NUMBER function secret in
// the Supabase dashboard once registered; until then the line is omitted.
const VAT_NUMBER = Deno.env.get("VAT_NUMBER") || "";

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

type Period = { kind: "current" | "month" | "year"; month?: number; year?: number };

function windowFor(p: Period): { from: string; to: string; label: string } {
  const now = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  if (p.kind === "year") {
    const y = p.year ?? now.getFullYear();
    return { from: `${y}-01-01`, to: `${y + 1}-01-01`, label: `Year ${y}` };
  }
  if (p.kind === "month") {
    const y = p.year ?? now.getFullYear();
    const m = (p.month ?? now.getMonth() + 1);
    return { from: iso(new Date(Date.UTC(y, m - 1, 1))), to: iso(new Date(Date.UTC(y, m, 1))), label: `${MONTHS[m - 1]} ${y}` };
  }
  const y = now.getFullYear(), m = now.getMonth();
  return { from: iso(new Date(Date.UTC(y, m, 1))), to: iso(new Date(Date.UTC(y, m + 1, 1))), label: `${MONTHS[m]} ${y}` };
}

// Fetch a Unicode (Greek-capable) font once per cold start.
let REG: Uint8Array | null = null;
let BLD: Uint8Array | null = null;
async function loadFonts() {
  if (REG && BLD) return;
  const base = "https://cdn.jsdelivr.net/fontsource/fonts/noto-sans@latest/greek-400-normal.ttf";
  const baseB = "https://cdn.jsdelivr.net/fontsource/fonts/noto-sans@latest/greek-700-normal.ttf";
  const [a, b] = await Promise.all([fetch(base), fetch(baseB)]);
  REG = new Uint8Array(await a.arrayBuffer());
  BLD = new Uint8Array(await b.arrayBuffer());
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return json({ error: "not authenticated" }, 401);
  const { data: userData, error: authErr } = await admin.auth.getUser(auth.slice(7));
  if (authErr || !userData.user) return json({ error: "not authenticated" }, 401);
  const uid = userData.user.id;

  let type = "expenses";
  let period: Period = { kind: "current" };
  let referralTotal = 0;
  try {
    const body = await req.json();
    type = body.type === "earnings" ? "earnings" : "expenses";
    if (body.period && typeof body.period === "object") period = body.period as Period;
    referralTotal = Number(body.referralTotal ?? 0) || 0;
  } catch { return json({ error: "bad json" }, 400); }

  const win = windowFor(period);

  // ---- gather rows ---------------------------------------------------------
  // gross = full price; net = gross / (1+VAT); vat = gross - net.
  const splitVat = (gross: number) => {
    const net = gross / (1 + VAT_RATE);
    return { net, vat: gross - net, gross };
  };

  type Row = { date: string; desc: string; net: number; vat: number; gross: number; commission?: number };
  let rows: Row[] = [];
  let title = "";

  if (type === "expenses") {
    title = "Expense Statement";
    const { data } = await admin.from("bookings")
      .select("date, cleaner_name, address_nickname, address, time, total, status")
      .eq("user_id", uid).eq("status", "completed")
      .gte("date", win.from).lt("date", win.to)
      .order("date", { ascending: true });
    rows = (data ?? []).map((b) => {
      const v = splitVat(Number(b.total ?? 0));
      const loc = String(b.address_nickname || b.address || "");
      return { date: `${b.date}${b.time ? " " + b.time : ""}`, desc: `${loc}${b.cleaner_name ? " · " + b.cleaner_name : ""}`, ...v };
    });
  } else {
    title = "Earnings Statement";
    const { data } = await admin.from("jobs")
      .select("date, customer_name, address, time, cleaner_pay, rate_per_hour, duration_hours, status")
      .eq("cleaner_id", uid).eq("status", "completed")
      .gte("date", win.from).lt("date", win.to)
      .order("date", { ascending: true });
    rows = (data ?? []).map((j) => {
      const grossVal = Number(j.rate_per_hour ?? 0) * Number(j.duration_hours ?? 0);
      const income = Number(j.cleaner_pay ?? grossVal);      // what the cleaner actually received
      const commission = Math.max(0, grossVal - income);     // platform commission withheld
      // NOTE: no VAT split on earnings — whether the cleaner charges VAT depends
      // on their own VAT-registration status, so we report gross income only and
      // leave VAT to their own accountant. VAT columns are used for expenses.
      return { date: `${j.date}${j.time ? " " + j.time : ""}`, desc: String(j.customer_name || j.address || ""), net: income, vat: 0, gross: income, commission };
    });
  }

  const sum = (f: (r: Row) => number) => rows.reduce((s, r) => s + f(r), 0);
  const tNet = sum((r) => r.net), tVat = sum((r) => r.vat), tGross = sum((r) => r.gross);
  const tCommission = sum((r) => r.commission ?? 0);

  // ---- build the PDF -------------------------------------------------------
  await loadFonts();
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(REG!);
  const bold = await pdf.embedFont(BLD!);
  pdf.setTitle(`${title} — ${win.label}`);
  pdf.setAuthor(BRAND);

  const A4 = { w: 595, h: 842 };
  const M = 44;                                   // page margin
  const ink = rgb(0.10, 0.11, 0.13);
  const muted = rgb(0.45, 0.47, 0.52);
  const line = rgb(0.87, 0.88, 0.90);
  const zebra = rgb(0.965, 0.968, 0.975);
  const accent = type === "earnings" ? rgb(0.055, 0.647, 0.914) : rgb(0.30, 0.34, 0.90);
  const eur = (n: number) => `€${n.toFixed(2)}`;

  let page = pdf.addPage([A4.w, A4.h]);
  let y = A4.h - M;

  const T = (s: string, x: number, yy: number, size: number, f: PDFFont = font, color = ink) =>
    page.drawText(s, { x, y: yy, size, font: f, color });
  const R = (s: string, xRight: number, yy: number, size: number, f: PDFFont = font, color = ink) =>
    page.drawText(s, { x: xRight - f.widthOfTextAtSize(s, size), y: yy, size, font: f, color });
  const clip = (s: string, size: number, maxW: number) => {
    let out = s;
    while (out.length > 3 && font.widthOfTextAtSize(out, size) > maxW) out = out.slice(0, -2);
    return out === s ? s : out + "…";
  };

  // ---- header band ----
  page.drawRectangle({ x: 0, y: A4.h - 96, width: A4.w, height: 96, color: rgb(0.98, 0.98, 0.99) });
  T(BRAND, M, A4.h - 44, 22, bold, accent);
  T("Home cleaning services", M, A4.h - 62, 9.5, font, muted);
  R(title, A4.w - M, A4.h - 40, 13, bold, ink);
  R(win.label, A4.w - M, A4.h - 56, 10.5, font, muted);
  if (VAT_NUMBER) R(`VAT No.: ${VAT_NUMBER}`, A4.w - M, A4.h - 72, 8.5, font, muted);
  y = A4.h - 118;

  // ---- table header ----
  // Expenses:  Date | Description | Net | VAT 19% | Gross
  // Earnings:  Date | Description | Commission | Income   (no VAT split — see note)
  const isEarn = type === "earnings";
  const xDate = M;
  const xDesc = M + 92;
  const rightEdge = A4.w - M;
  // right-aligned money columns (expenses)
  const colGross = rightEdge;
  const colVat = colGross - 82;
  const colNet = colVat - 82;
  // earnings columns
  const colIncome = rightEdge;
  const colComm = colIncome - 92;
  const descRight = isEarn ? colComm - 16 : colNet - 12;

  const headerRow = (yy: number) => {
    T("Date", xDate, yy, 8.5, bold, muted);
    T("Description", xDesc, yy, 8.5, bold, muted);
    if (isEarn) {
      R("Commission", colComm, yy, 8.5, bold, muted);
      R("Income", colIncome, yy, 8.5, bold, muted);
    } else {
      R("Net", colNet, yy, 8.5, bold, muted);
      R("VAT 19%", colVat, yy, 8.5, bold, muted);
      R("Total", colGross, yy, 8.5, bold, muted);
    }
  };
  headerRow(y);
  y -= 6;
  page.drawLine({ start: { x: M, y }, end: { x: rightEdge, y }, thickness: 1, color: line });
  y -= 16;

  const rowH = 17;
  const newPageIfNeeded = () => {
    if (y < M + 90) {
      page = pdf.addPage([A4.w, A4.h]);
      y = A4.h - M;
      headerRow(y); y -= 6;
      page.drawLine({ start: { x: M, y }, end: { x: rightEdge, y }, thickness: 1, color: line });
      y -= 16;
    }
  };

  if (rows.length === 0) {
    T("No completed activity for this period.", xDate, y, 9.5, font, muted);
    y -= rowH;
  } else {
    rows.forEach((r, i) => {
      newPageIfNeeded();
      if (i % 2 === 1) page.drawRectangle({ x: M - 4, y: y - 4, width: rightEdge - M + 8, height: rowH, color: zebra });
      T(r.date, xDate, y, 9, font, ink);
      T(clip(r.desc, 9, descRight - xDesc), xDesc, y, 9, font, ink);
      if (isEarn) {
        R(eur(r.commission ?? 0), colComm, y, 9, font, muted);
        R(eur(r.net), colIncome, y, 9, font, ink);
      } else {
        R(eur(r.net), colNet, y, 9, font, ink);
        R(eur(r.vat), colVat, y, 9, font, ink);
        R(eur(r.gross), colGross, y, 9, font, ink);
      }
      y -= rowH;
    });
  }

  // ---- totals ----
  y -= 4;
  page.drawLine({ start: { x: M, y }, end: { x: rightEdge, y }, thickness: 1, color: line });
  y -= 18;
  T("Totals", xDesc, y, 10.5, bold, ink);
  if (isEarn) {
    R(eur(tCommission), colComm, y, 10, bold, muted);
    R(eur(tNet), colIncome, y, 11, bold, accent);
  } else {
    R(eur(tNet), colNet, y, 10, bold, ink);
    R(eur(tVat), colVat, y, 10, bold, ink);
    R(eur(tGross), colGross, y, 11, bold, accent);
  }
  y -= 26;

  // ---- summary box ----
  const boxH = isEarn ? 90 : 78;
  page.drawRectangle({ x: M, y: y - boxH, width: rightEdge - M, height: boxH, borderColor: line, borderWidth: 1, color: rgb(0.985, 0.986, 0.99) });
  let by = y - 20;
  const summary = (label: string, val: string, strong = false) => {
    T(label, M + 14, by, 9.5, strong ? bold : font, strong ? ink : muted);
    R(val, rightEdge - 14, by, strong ? 11 : 9.5, strong ? bold : font, strong ? accent : ink);
    by -= 18;
  };
  if (isEarn) {
    summary("Work income", eur(tNet));
    summary("Platform commission", eur(tCommission));
    summary("Referral income", eur(referralTotal));
    summary("Total income", eur(tNet + referralTotal), true);
  } else {
    summary("Net amount", eur(tNet));
    summary("VAT (19%)", eur(tVat));
    summary("Total amount", eur(tGross), true);
  }
  y -= boxH + 20;

  // ---- footer (generated date, item count) ----
  const gen = new Date().toISOString().slice(0, 10);
  T(`Date issued: ${gen}`, M, M - 8, 8.5, font, muted);
  R(`${rows.length} entries`, rightEdge, M - 8, 8.5, font, muted);
  T("This document was generated by the " + BRAND + " platform.", M, M - 20, 7.5, font, muted);

  const bytes = await pdf.save();
  const fname = `${isEarn ? "esoda" : "exoda"}-${win.label.replace(/[^\w]+/g, "-").toLowerCase()}.pdf`;
  return new Response(bytes, {
    status: 200,
    headers: { ...cors, "content-type": "application/pdf", "content-disposition": `attachment; filename="${fname}"` },
  });
});
