// Frontend client for the Beds24 channel-manager + billing Edge Functions.
// Mirrors src/data/ical.ts (same gateway auth: user JWT, falling back to anon).
import { supabase } from "../lib/supabase";

const BASE = String(import.meta.env.VITE_SUPABASE_URL || "").replace(/\/+$/, "");
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

async function callFn<T>(name: string, body: unknown): Promise<T> {
  const { data: sess } = await supabase.auth.getSession();
  const bearer = sess.session?.access_token || ANON;
  const res = await fetch(`${BASE}/functions/v1/${name}`, {
    method: "POST",
    headers: { "content-type": "application/json", apikey: ANON, authorization: `Bearer ${bearer}` },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || `${name} failed (${res.status})`);
  return data as T;
}

export interface ConnectedListingRow {
  id: string;
  beds24_property_id: number | null;
  billing_active: boolean;
  address_id: string | null;
  name: string;
}

/** Push a saved property to Beds24 + start per-property billing. */
export function connectProperty(userId: string, addressId: string) {
  return callFn<{ listing: ConnectedListingRow }>("connect-property", { userId, addressId });
}

/** Set the Beds24 property dormant + stop billing. */
export function disconnectProperty(userId: string, listingId: string) {
  return callFn<{ ok: true }>("disconnect-property", { userId, listingId });
}

/** Start (or resume) the subscription; returns a Stripe client secret to pay. */
export function startCheckout(userId: string, withPro = false) {
  return callFn<{ clientSecret: string | null; subscriptionId: string }>(
    "stripe-checkout", { userId, withPro },
  );
}
