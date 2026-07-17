// ============================================================================
// disconnect-property — stop channel-managing a property.
// POST { userId, listingId } -> { ok: true }
//
// The Beds24 API has no property-delete ("coming soon"), so we set the property
// DORMANT (no OTA sync, won't sell) and stop billing. The connected_listings
// row is kept (billing_active=false) so history/audit survives; a later manual
// panel delete removes it from Beds24 entirely.
// ============================================================================
import { createClient } from "jsr:@supabase/supabase-js@2";
import { Beds24 } from "../_beds24/client.ts";
import { json, preflight } from "../_shared/http.ts";
import { bumpPropertyQty } from "../_stripe/stripe.ts";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

Deno.serve(async (req) => {
  const pf = preflight(req);
  if (pf) return pf;
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  let userId = "", listingId = "";
  try {
    const b = await req.json();
    userId = String(b.userId ?? "").trim();
    listingId = String(b.listingId ?? "").trim();
  } catch { return json({ error: "bad json" }, 400); }
  if (!userId || !listingId) return json({ error: "userId and listingId required" }, 400);

  const { data: listing, error } = await admin
    .from("connected_listings").select("*")
    .eq("id", listingId).eq("user_id", userId).single();
  if (error || !listing) return json({ error: "listing not found" }, 404);

  // Beds24 dormant
  if (listing.beds24_property_id) {
    try {
      const beds24 = await Beds24.create();
      await beds24.setPropertyDormant(Number(listing.beds24_property_id));
    } catch (e) {
      return json({ error: `beds24 dormant failed: ${(e as Error).message}` }, 502);
    }
  }

  // stop billing
  if (listing.billing_active) {
    try { await bumpPropertyQty(admin, userId, -1); }
    catch (e) { console.error("stripe decrement failed:", (e as Error).message); }
  }

  await admin.from("connected_listings")
    .update({ billing_active: false }).eq("id", listingId);

  await admin.from("billing_events").insert({
    user_id: userId, kind: "property_disconnected",
    stripe_ref: listing.stripe_subscription_item_id,
    meta: { beds24_property_id: listing.beds24_property_id, listing_id: listingId },
  });

  return json({ ok: true });
});
