import type { ConnectedListing, ExternalBooking, ListingPlatform } from "../types";

// MOCK iCal sync. Real version fetches + parses the calendar feed server-side.
// Here we deterministically synthesise a few upcoming guest stays from a hash of
// the pasted URL, so re-pasting the same link yields the same stays.

const PLATFORM_NAME: Record<ListingPlatform, string> = {
  airbnb: "Airbnb", booking: "Booking.com", vrbo: "Vrbo", other: "Listing",
};
const GUESTS = ["A. Müller", "J. Smith", "L. Rossi", "K. Novak", "S. Dubois", "M. García", "T. Andersson", "R. Patel"];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}
function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function syncListing(
  platform: ListingPlatform,
  icalUrl: string,
  addressId: string | undefined,
): { listing: ConnectedListing; bookings: ExternalBooking[] } {
  const seed = hash(icalUrl + platform);
  const id = crypto.randomUUID();
  const listing: ConnectedListing = {
    id, platform, icalUrl, addressId,
    name: PLATFORM_NAME[platform] + " listing",
    connectedAt: Date.now(),
  };

  // 4 guest stays across the next ~6 weeks, non-overlapping.
  const bookings: ExternalBooking[] = [];
  const today = new Date();
  let cursor = 2 + (seed % 4); // first check-in 2-5 days out
  for (let i = 0; i < 4; i++) {
    const nights = 2 + ((seed >> (i * 3)) % 5); // 2-6 nights
    const ci = new Date(today); ci.setDate(today.getDate() + cursor);
    const co = new Date(ci); co.setDate(ci.getDate() + nights);
    bookings.push({
      id: crypto.randomUUID(),
      listingId: id, platform, addressId,
      guest: GUESTS[(seed + i) % GUESTS.length],
      checkIn: iso(ci), checkOut: iso(co),
    });
    cursor += nights + 1 + ((seed >> (i * 2)) % 4); // gap before next stay
  }
  return { listing, bookings };
}
