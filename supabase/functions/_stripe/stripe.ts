// ============================================================================
// Shared Stripe helpers (Deno). Everything is GUARDED: if STRIPE_SECRET_KEY is
// not set, helpers no-op / return null so the Beds24 channel-manager works
// during buildout before the Stripe account exists.
//
// Model: ONE subscription per customer with multiple items:
//   - Pro           (price STRIPE_PRICE_PRO,      qty 1)     — optional
//   - Property conn (price STRIPE_PRICE_PROPERTY, qty = #connected properties)
// Adding/removing a property = change the Property item quantity. Stripe
// auto-prorates mid-cycle, which is our "flexible mid-month" requirement.
// ============================================================================
import Stripe from "npm:stripe@17";
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

const KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
export const stripeEnabled = KEY.length > 0;

export const stripe = stripeEnabled
  ? new Stripe(KEY, { apiVersion: "2025-09-30.clover", httpClient: Stripe.createFetchHttpClient() })
  : (null as unknown as Stripe);

const PRICE_PRO = Deno.env.get("STRIPE_PRICE_PRO") ?? "";
const PRICE_PROPERTY = Deno.env.get("STRIPE_PRICE_PROPERTY") ?? "";

/** Get or create the Stripe customer for a user; persists id on users. */
export async function ensureCustomer(
  admin: SupabaseClient, userId: string,
): Promise<string | null> {
  if (!stripeEnabled) return null;
  const { data: u } = await admin.from("users")
    .select("stripe_customer_id, email, name").eq("id", userId).single();
  if (u?.stripe_customer_id) return u.stripe_customer_id;
  const c = await stripe.customers.create({
    email: u?.email ?? undefined, name: u?.name ?? undefined,
    metadata: { userId },
  });
  await admin.from("users").update({ stripe_customer_id: c.id }).eq("id", userId);
  return c.id;
}

/** Get or create the user's subscription; returns { subId, propertyItemId }. */
async function ensureSubscription(
  admin: SupabaseClient, userId: string,
): Promise<{ subId: string; propertyItemId: string | null }> {
  const customer = await ensureCustomer(admin, userId);
  if (!customer) throw new Error("stripe not configured");

  const { data: u } = await admin.from("users")
    .select("stripe_subscription_id").eq("id", userId).single();

  if (u?.stripe_subscription_id) {
    const sub = await stripe.subscriptions.retrieve(u.stripe_subscription_id);
    const propItem = sub.items.data.find((i) => i.price.id === PRICE_PROPERTY);
    return { subId: sub.id, propertyItemId: propItem?.id ?? null };
  }

  // create a fresh subscription containing (at least) the property item @ qty 0→1 later
  const sub = await stripe.subscriptions.create({
    customer,
    items: [{ price: PRICE_PROPERTY, quantity: 0 }],
    proration_behavior: "create_prorations",
    payment_behavior: "default_incomplete",
    metadata: { userId },
  });
  await admin.from("users").update({
    stripe_subscription_id: sub.id,
    subscription_status: sub.status,
  }).eq("id", userId);
  const propItem = sub.items.data.find((i) => i.price.id === PRICE_PROPERTY);
  return { subId: sub.id, propertyItemId: propItem?.id ?? null };
}

/**
 * Change the Property-connection item quantity by delta (+1 connect, -1 disconnect).
 * Returns { itemId } on success, null if Stripe disabled. Stripe auto-prorates.
 */
export async function bumpPropertyQty(
  admin: SupabaseClient, userId: string, delta: number,
): Promise<{ itemId: string } | null> {
  if (!stripeEnabled) return null;
  const { subId, propertyItemId } = await ensureSubscription(admin, userId);

  if (!propertyItemId) {
    // no property item yet — add one at qty max(delta,0)
    const item = await stripe.subscriptionItems.create({
      subscription: subId, price: PRICE_PROPERTY,
      quantity: Math.max(delta, 0),
      proration_behavior: "create_prorations",
    });
    return { itemId: item.id };
  }

  const item = await stripe.subscriptionItems.retrieve(propertyItemId);
  const next = Math.max((item.quantity ?? 0) + delta, 0);
  await stripe.subscriptionItems.update(propertyItemId, {
    quantity: next, proration_behavior: "create_prorations",
  });
  return { itemId: propertyItemId };
}
