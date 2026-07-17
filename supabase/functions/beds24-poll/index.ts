// ============================================================================
// beds24-poll — scheduled sync of Beds24 reservations into external_bookings.
// Run on a Supabase cron (e.g. hourly). No request body needed.
//
// For every billing-active connected listing, pull bookings checking out in a
// forward window and upsert them into external_bookings (idempotent by
// beds24_booking_id). This is the dispatch feed the app reacts to. Owners get a
// push when a NEW checkout appears so a cleaning can be arranged.
//
// Scope note: this populates the reservation feed + notifies. Auto-creating the
// actual cleaning JOB (which cleaner, auto-assign vs owner-picks) is a separate
// decision (app spec's "hands-off vs choose cleaner") and is intentionally NOT
// done here yet.
// ============================================================================
import { createClient } from "jsr:@supabase/supabase-js@2";
import { Beds24 } from "../_beds24/client.ts";
import { json } from "../_shared/http.ts";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

const WINDOW_DAYS = 14; // look ahead this many days for checkouts

function iso(d: Date) { return d.toISOString().slice(0, 10); }

Deno.serve(async (_req) => {
  // all listings we're actively channel-managing
  const { data: listings, error } = await admin
    .from("connected_listings")
    .select("id, user_id, name, address_id, beds24_property_id")
    .eq("billing_active", true)
    .not("beds24_property_id", "is", null);
  if (error) return json({ error: error.message }, 500);
  if (!listings?.length) return json({ ok: true, listings: 0, upserts: 0 });

  const from = iso(new Date());
  const to = iso(new Date(Date.now() + WINDOW_DAYS * 864e5));

  let beds24: Beds24;
  try { beds24 = await Beds24.create(); }
  catch (e) { return json({ error: `beds24 auth: ${(e as Error).message}` }, 502); }

  // index listings by beds24 property id
  const byProp = new Map<number, typeof listings[number]>();
  for (const l of listings) byProp.set(Number(l.beds24_property_id), l);

  let checkouts;
  try { checkouts = await beds24.checkoutsBetween(from, to); }
  catch (e) { return json({ error: `beds24 bookings: ${(e as Error).message}` }, 502); }

  let upserts = 0, newOnes = 0;
  for (const b of checkouts) {
    const listing = byProp.get(b.propertyId);
    if (!listing) continue; // booking for a property we don't manage

    // was it already known?
    const { data: prior } = await admin.from("external_bookings")
      .select("id").eq("beds24_booking_id", b.id).maybeSingle();

    const row = {
      user_id: listing.user_id,
      listing_id: listing.id,
      platform: "other" as const,
      guest: `${b.firstName ?? ""} ${b.lastName ?? ""}`.trim() || "Guest",
      check_in: b.arrival,
      check_out: b.departure,
      address_id: listing.address_id,
      beds24_booking_id: b.id,
    };
    const { error: uerr } = await admin
      .from("external_bookings")
      .upsert(row, { onConflict: "beds24_booking_id" });
    if (uerr) { console.error("upsert failed", b.id, uerr.message); continue; }
    upserts++;

    if (!prior) {
      newOnes++;
      // notify the owner a checkout is coming (a cleaning will be needed)
      await admin.from("notifications").insert({
        user_id: listing.user_id, audience: "customer", kind: "checkout_upcoming",
        title: "Guest checkout scheduled",
        body: `${row.guest} checks out ${b.departure} at ${listing.name}. Arrange a cleaning.`,
      });
    }
  }

  return json({ ok: true, listings: listings.length, upserts, new: newOnes, window: [from, to] });
});
