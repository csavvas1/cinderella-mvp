// ============================================================================
// connect-property — push a saved address to Beds24 as a channel-managed
// property and start per-property billing.
//
// POST { userId, addressId }  ->  { listing }
//
// Steps:
//   1. read the address (name/type/rooms)
//   2. Beds24 POST /properties (1 unit)  [proven this session]
//   3. insert a connected_listings row with the beds24 ids + billing_active
//   4. bump the Stripe "Property Connection" subscription-item quantity so the
//      client is billed 14.99/mo (Stripe auto-prorates a mid-month add).
//      Stripe is OPTIONAL here: if STRIPE_SECRET_KEY is unset we skip billing
//      (channel-manager works without money plumbing during buildout).
//   5. audit into billing_events.
// ============================================================================
import { createClient } from "jsr:@supabase/supabase-js@2";
import { Beds24 } from "../_beds24/client.ts";
import { cors, json, preflight } from "../_shared/http.ts";
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

  let userId = "", addressId = "";
  try {
    const b = await req.json();
    userId = String(b.userId ?? "").trim();
    addressId = String(b.addressId ?? "").trim();
  } catch { return json({ error: "bad json" }, 400); }
  if (!userId || !addressId) return json({ error: "userId and addressId required" }, 400);

  // 1. address
  const { data: addr, error: aerr } = await admin
    .from("addresses").select("*").eq("id", addressId).eq("user_id", userId).single();
  if (aerr || !addr) return json({ error: "address not found" }, 404);

  // guard: already connected?
  const { data: existing } = await admin
    .from("connected_listings")
    .select("id, beds24_property_id, billing_active")
    .eq("user_id", userId).eq("address_id", addressId)
    .not("beds24_property_id", "is", null).maybeSingle();
  if (existing?.beds24_property_id) {
    return json({ error: "property already connected", listingId: existing.id }, 409);
  }

  // 2. Beds24 create property
  let propertyId: number, roomId: number;
  try {
    const beds24 = await Beds24.create();
    ({ propertyId, roomId } = await beds24.createProperty({
      name: addr.nickname || "Property",
      propertyType: addr.property_type ?? "apartment",
      country: "CY",
      roomName: addr.nickname || "Unit",
      maxPeople: Math.max(2, (addr.bedrooms ?? 1) * 2),
    }));
  } catch (e) {
    return json({ error: `beds24 create failed: ${(e as Error).message}` }, 502);
  }

  // 4. Stripe billing (optional) — do before DB insert so we can store item id
  let stripeItemId: string | null = null;
  let billingActive = false;
  try {
    const res = await bumpPropertyQty(admin, userId, +1);
    if (res) { stripeItemId = res.itemId; billingActive = true; }
  } catch (e) {
    // Beds24 property exists but billing failed — record it, don't hard-fail.
    console.error("stripe bump failed:", (e as Error).message);
  }

  // 3. connected_listings row
  const { data: listing, error: lerr } = await admin
    .from("connected_listings").insert({
      user_id: userId,
      platform: "other",
      name: addr.nickname || "Property",
      ical_url: null,
      address_id: addressId,
      beds24_property_id: propertyId,
      beds24_room_id: roomId,
      billing_active: billingActive,
      stripe_subscription_item_id: stripeItemId,
    }).select().single();
  if (lerr) return json({ error: `db insert failed: ${lerr.message}`, beds24PropertyId: propertyId }, 500);

  // 5. audit
  await admin.from("billing_events").insert({
    user_id: userId, kind: "property_connected",
    stripe_ref: stripeItemId, amount: billingActive ? 14.99 : null,
    meta: { beds24_property_id: propertyId, address_id: addressId },
  });

  return json({ listing });
});
