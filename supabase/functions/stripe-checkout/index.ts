// ============================================================================
// stripe-checkout — start (or return) the customer's subscription and hand the
// frontend a client secret to complete payment with Stripe PaymentElement.
//
// POST { userId, withPro? }  ->  { clientSecret, subscriptionId }  (or 501 if
// Stripe not yet configured during buildout).
//
// Creates ONE subscription per customer. Property connections are added later
// as a quantity on the Property item (see connect-property). Optionally include
// the flat Pro item.
// ============================================================================
import { createClient } from "jsr:@supabase/supabase-js@2";
import { json, preflight } from "../_shared/http.ts";
import { ensureCustomer, stripe, stripeEnabled } from "../_stripe/stripe.ts";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

const PRICE_PRO = Deno.env.get("STRIPE_PRICE_PRO") ?? "";
const PRICE_PROPERTY = Deno.env.get("STRIPE_PRICE_PROPERTY") ?? "";

Deno.serve(async (req) => {
  const pf = preflight(req);
  if (pf) return pf;
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  if (!stripeEnabled) return json({ error: "stripe not configured yet" }, 501);

  let userId = "", withPro = false;
  try {
    const b = await req.json();
    userId = String(b.userId ?? "").trim();
    withPro = Boolean(b.withPro);
  } catch { return json({ error: "bad json" }, 400); }
  if (!userId) return json({ error: "userId required" }, 400);

  const customer = await ensureCustomer(admin, userId);
  if (!customer) return json({ error: "could not create customer" }, 500);

  // reuse existing subscription if any
  const { data: u } = await admin.from("users")
    .select("stripe_subscription_id").eq("id", userId).single();

  let subId = u?.stripe_subscription_id as string | undefined;
  let clientSecret: string | null = null;

  if (!subId) {
    const items: Array<{ price: string; quantity: number }> = [
      { price: PRICE_PROPERTY, quantity: 0 },
    ];
    if (withPro && PRICE_PRO) items.push({ price: PRICE_PRO, quantity: 1 });

    const sub = await stripe.subscriptions.create({
      customer, items,
      payment_behavior: "default_incomplete",
      proration_behavior: "create_prorations",
      expand: ["latest_invoice.payment_intent"],
      metadata: { userId },
    });
    subId = sub.id;
    await admin.from("users").update({
      stripe_subscription_id: sub.id, subscription_status: sub.status,
    }).eq("id", userId);
    // deno-lint-ignore no-explicit-any
    const pi = (sub.latest_invoice as any)?.payment_intent;
    clientSecret = pi?.client_secret ?? null;
  } else {
    const sub = await stripe.subscriptions.retrieve(subId, {
      expand: ["latest_invoice.payment_intent"],
    });
    // deno-lint-ignore no-explicit-any
    const pi = (sub.latest_invoice as any)?.payment_intent;
    clientSecret = pi?.client_secret ?? null;
  }

  await admin.from("billing_events").insert({
    user_id: userId, kind: "checkout", stripe_ref: subId,
  });

  return json({ clientSecret, subscriptionId: subId });
});
