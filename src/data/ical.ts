import type { ConnectedListing, ExternalBooking, ListingPlatform } from "../types";
import { supabase } from "../lib/supabase";

// Real iCal sync. The .ics feed can't be fetched from the browser (CORS), so we
// call the `ical-sync` Edge Function which fetches + parses it server-side and
// returns the booked/blocked date ranges. See supabase/functions/ical-sync.
//
// Note: an iCal feed only carries availability (dates + a generic summary like
// "Reserved"). It does NOT contain the property address or guest identity —
// those aren't exposed by Airbnb / Booking, so the address is still entered
// once on the property itself.

const PLATFORM_NAME: Record<ListingPlatform, string> = {
  airbnb: "Airbnb", booking: "Booking.com", vrbo: "Vrbo",
  google: "Google", expedia: "Expedia", other: "Listing",
};

export function platformName(p: ListingPlatform): string {
  return PLATFORM_NAME[p] ?? "Listing";
}

const FN_URL = `${String(import.meta.env.VITE_SUPABASE_URL || "").replace(/\/+$/, "")}/functions/v1/ical-sync`;
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

interface RawStay { checkIn: string; checkOut: string; guest: string; uid: string }

export async function syncListing(
  platform: ListingPlatform,
  icalUrl: string,
  addressId: string | undefined,
): Promise<{ listing: ConnectedListing; bookings: ExternalBooking[] }> {
  const id = crypto.randomUUID();
  const listing: ConnectedListing = {
    id, platform, icalUrl, addressId,
    name: PLATFORM_NAME[platform] + " listing",
    connectedAt: Date.now(),
  };

  let stays: RawStay[] = [];
  try {
    // Use the signed-in user's JWT for authorization (the functions gateway
    // accepts it); the publishable anon key alone can 401 on the gateway.
    const { data: sess } = await supabase.auth.getSession();
    const bearer = sess.session?.access_token || ANON;
    const res = await fetch(FN_URL, {
      method: "POST",
      headers: { "content-type": "application/json", apikey: ANON, authorization: `Bearer ${bearer}` },
      body: JSON.stringify({ url: icalUrl }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && Array.isArray(data.stays)) stays = data.stays as RawStay[];
    // a failed/empty sync still connects the listing — it just has no stays yet
  } catch {
    /* offline / unreachable feed — listing connects with no stays */
  }

  const bookings: ExternalBooking[] = stays.map((s) => ({
    id: crypto.randomUUID(),
    listingId: id, platform, addressId,
    guest: s.guest,
    checkIn: s.checkIn, checkOut: s.checkOut,
  }));

  return { listing, bookings };
}
