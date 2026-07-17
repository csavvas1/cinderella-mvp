import { useEffect, useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { useStore } from "../context/AppStore";
import { startCheckout } from "../data/beds24";

// Collect a card to activate the subscription. Called on the FIRST property
// connect (when the user has no active subscription yet). Uses the clientSecret
// returned by the stripe-checkout Edge Function + Stripe PaymentElement.
// Subsequent property connects don't need this (quantity bump auto-prorates).

const PK = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY as string | undefined;
const stripePromise = PK ? loadStripe(PK) : null;

function PayForm({ onDone, onClose }: { onDone: () => void; onClose: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function pay() {
    if (!stripe || !elements) return;
    setErr(null); setBusy(true);
    const { error } = await stripe.confirmPayment({ elements, redirect: "if_required" });
    setBusy(false);
    if (error) { setErr(error.message ?? "Payment failed."); return; }
    onDone();
  }

  return (
    <>
      <PaymentElement />
      {err && <div className="note amber" style={{ marginTop: 10 }}>{err}</div>}
      <button className="btn" style={{ marginTop: 14, opacity: busy ? 0.5 : 1 }}
        disabled={busy} onClick={pay}>
        {busy ? "Processing…" : "Confirm & pay"}
      </button>
      <button className="btn secondary sm" style={{ marginTop: 8 }} onClick={onClose}>Cancel</button>
    </>
  );
}

export default function StripePaymentSheet({
  onDone, onClose,
}: {
  onDone: () => void;   // payment succeeded
  onClose: () => void;
}) {
  const { userId } = useStore();
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        if (!userId) throw new Error("Please sign in first.");
        const { clientSecret } = await startCheckout(userId);
        if (!alive) return;
        if (!clientSecret) throw new Error("Could not start payment. Try again.");
        setClientSecret(clientSecret);
      } catch (e) {
        if (alive) setErr((e as Error).message);
      }
    })();
    return () => { alive = false; };
  }, [userId]);

  return (
    <div className="modal__backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="between" style={{ marginBottom: 8 }}>
          <b style={{ fontSize: 17 }}>Add a payment method</b>
          <button className="iconbtn" onClick={onClose}>✕</button>
        </div>
        <p className="sub" style={{ marginTop: 0, fontSize: 12.5 }}>
          €14.99/mo per connected property. Cancel anytime.
        </p>
        {!PK && <div className="note amber">Payments not configured.</div>}
        {err && <div className="note amber">{err}</div>}
        {PK && clientSecret && stripePromise && (
          <Elements stripe={stripePromise} options={{ clientSecret }}>
            <PayForm onDone={onDone} onClose={onClose} />
          </Elements>
        )}
        {PK && !clientSecret && !err && <div className="tiny muted">Loading…</div>}
      </div>
    </div>
  );
}
