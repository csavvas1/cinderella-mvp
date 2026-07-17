// ============================================================================
// stripe-webhook — Stripe's push is the SOURCE OF TRUTH for billing state.
// Verifies the signature, then syncs subscription status + Pro flag + per-listing
// billing into Supabase.
//
// Configure the endpoint URL in Stripe dashboard -> Webhooks, and set
// STRIPE_WEBHOOK_SECRET. Events handled:
//   customer.subscription.updated / .deleted
//   invoice.paid / invoice.payment_failed
//
// NOTE: verify_jwt must be OFF for this function (Stripe can't send a Supabase
// JWT). See config.toml.
// ============================================================================
import { createClient } from "jsr:@supabase/supabase-js@2";
import { stripe, stripeEnabled } from "../_stripe/stripe.ts";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

const WH_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";

// map a Stripe subscription -> our users columns + pro flag
async function syncSubscription(sub: {
  id: string; status: string; metadata?: Record<string, string>;
  items?: { data: Array<{ price: { id: string }; quantity?: number }> };
}) {
  const userId = sub.metadata?.userId;
  if (!userId) return;
  const active = sub.status === "active" || sub.status === "trialing";
  const proPrice = Deno.env.get("STRIPE_PRICE_PRO") ?? "";
  const hasPro = active && !!proPrice &&
    (sub.items?.data ?? []).some((i) => i.price.id === proPrice && (i.quantity ?? 0) > 0);

  await admin.from("users").update({
    subscription_status: sub.status,
    stripe_subscription_id: sub.id,
    pro: hasPro,
  }).eq("id", userId);

  // if the whole sub is dead, no listing is billing-active
  if (!active) {
    await admin.from("connected_listings")
      .update({ billing_active: false })
      .eq("user_id", userId).eq("billing_active", true);
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("POST only", { status: 405 });
  if (!stripeEnabled) return new Response("stripe not configured", { status: 501 });

  const sig = req.headers.get("stripe-signature") ?? "";
  const raw = await req.text();

  let event;
  try {
    event = await stripe.webhooks.constructEventAsync(raw, sig, WH_SECRET);
  } catch (e) {
    return new Response(`signature verify failed: ${(e as Error).message}`, { status: 400 });
  }

  try {
    switch (event.type) {
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        // deno-lint-ignore no-explicit-any
        await syncSubscription(event.data.object as any);
        break;
      }
      case "invoice.paid":
      case "invoice.payment_failed": {
        // deno-lint-ignore no-explicit-any
        const inv = event.data.object as any;
        const userId = inv.subscription_details?.metadata?.userId ?? inv.metadata?.userId;
        if (userId) {
          await admin.from("billing_events").insert({
            user_id: userId,
            kind: event.type === "invoice.paid" ? "invoice_paid" : "payment_failed",
            stripe_ref: inv.id,
            amount: inv.amount_paid ? inv.amount_paid / 100 : null,
          });
        }
        break;
      }
    }
  } catch (e) {
    console.error("webhook handler error:", (e as Error).message);
    return new Response("handler error", { status: 500 });
  }

  return new Response("ok", { status: 200 });
});
