import type { Booking, Card, ConnectedListing, ExternalBooking, Job, PropertyAddress } from "../types";

// ---- stress-test channel-manager data ----
// Multiple overlapping guest stays across 4 properties so the calendar's lane
// bars + checkout corner tabs can be eyeballed at 4+ connected bookings. Dates
// are anchored to the current month so they're always visible on open.
const _d = (dayOffset: number) => {
  const t = new Date();
  const x = new Date(t.getFullYear(), t.getMonth(), t.getDate() + dayOffset);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
};

export const SEED_LISTINGS: ConnectedListing[] = [
  { id: "lstA", platform: "airbnb",  name: "Airbnb listing",     icalUrl: "https://airbnb.com/ical/seaside.ics",   addressId: "a1", connectedAt: Date.now() },
  { id: "lstB", platform: "booking", name: "Booking.com listing", icalUrl: "https://booking.com/ical/studio.ics",   addressId: "a3", connectedAt: Date.now() },
  { id: "lstC", platform: "airbnb",  name: "Airbnb listing",     icalUrl: "https://airbnb.com/ical/marina.ics",    addressId: "a4", connectedAt: Date.now() },
  // second channel on the SAME property as lstA (dual-listed) — shares its colour
  { id: "lstD", platform: "booking", name: "Booking.com listing", icalUrl: "https://booking.com/ical/seaside.ics", addressId: "a1", connectedAt: Date.now() },
];

export const SEED_EXTERNAL_BOOKINGS: ExternalBooking[] = [
  // Seaside (a1) — two overlapping stays from its two channels
  { id: "extA1", listingId: "lstA", platform: "airbnb",  addressId: "a1", guest: "A. Müller",  checkIn: _d(1),  checkOut: _d(6) },
  { id: "extD1", listingId: "lstD", platform: "booking", addressId: "a1", guest: "J. Smith",   checkIn: _d(8),  checkOut: _d(12) },
  // City Studio (a3) — overlaps Seaside's first stay
  { id: "extB1", listingId: "lstB", platform: "booking", addressId: "a3", guest: "L. Rossi",   checkIn: _d(2),  checkOut: _d(6) },  // shares checkout day with extA1 (_d(6))
  { id: "extB2", listingId: "lstB", platform: "booking", addressId: "a3", guest: "K. Novak",   checkIn: _d(9),  checkOut: _d(13) },
  // Marina Loft (a4) — long stay overlapping everything + another checkout collision
  { id: "extC1", listingId: "lstC", platform: "airbnb",  addressId: "a4", guest: "S. Dubois",  checkIn: _d(1),  checkOut: _d(6) },  // triple checkout on _d(6)
  { id: "extC2", listingId: "lstC", platform: "airbnb",  addressId: "a4", guest: "M. García",  checkIn: _d(7),  checkOut: _d(12) },
];

export const SEED_CARDS: Card[] = [
  { id: "card1", nickname: "Personal", last4: "4242", brand: "Visa" },
  { id: "card2", nickname: "Airbnb business", last4: "8210", brand: "Mastercard" },
];

export const SEED_ADDRESSES: PropertyAddress[] = [
  {
    id: "a1",
    nickname: "Seaside Apartment (Airbnb)",
    address: "12 Amathus Ave, Limassol",
    propertyType: "apartment",
    apartmentNumber: "Flat 5B, 3rd floor",
    bedrooms: 2,
    bathrooms: 2,
    kitchens: 1,
    commonRooms: 1,
    linkedCardId: "card2",
  },
  {
    id: "a2",
    nickname: "My Home",
    address: "5 Spyrou Kyprianou, Limassol",
    propertyType: "house",
    bedrooms: 3,
    bathrooms: 2,
    kitchens: 1,
    commonRooms: 2,
    linkedCardId: "card1",
  },
  {
    id: "a3",
    nickname: "City Studio (Booking)",
    address: "30 Anexartisias, Limassol",
    propertyType: "apartment",
    apartmentNumber: "Studio 2, 1st floor",
    bedrooms: 1,
    bathrooms: 1,
    kitchens: 1,
    commonRooms: 1,
    linkedCardId: "card2",
  },
  {
    id: "a4",
    nickname: "Marina Loft (Airbnb)",
    address: "8 Marina Walk, Limassol",
    propertyType: "apartment",
    apartmentNumber: "Loft 12, 4th floor",
    bedrooms: 2,
    bathrooms: 1,
    kitchens: 1,
    commonRooms: 1,
    linkedCardId: "card2",
  },
];

export const SEED_BOOKINGS: Booking[] = [
  {
    id: "b1",
    cleanerId: "c1",
    cleanerName: "Maria Iakovou",
    cleanerPhoto: "",
    addressNickname: "Seaside Apartment (Airbnb)",
    address: "12 Amathus Ave, Limassol",
    date: "2026-06-20",
    time: "11:00",
    durationHours: 3,
    ratePerHour: 9,
    total: 31.05,        // 27 cleaner pay + 15% service fee (4.05)
    commission: 4.05,
    cleanerPay: 27,
    scope: "whole",
    status: "upcoming",
    recurring: false,
    recurrence: "none",
    cardId: "card2",
  },
  {
    id: "b2",
    cleanerId: "c5",
    cleanerName: "Elena Demetriou",
    cleanerPhoto: "",
    addressNickname: "My Home",
    address: "5 Spyrou Kyprianou, Limassol",
    date: "2026-06-10",
    time: "09:00",
    durationHours: 4,
    ratePerHour: 8,
    total: 36.80,        // 32 cleaner pay + 15% service fee (4.80)
    commission: 4.80,
    cleanerPay: 32,
    scope: "whole",
    status: "completed",
    recurring: true,
    recurrence: "weekly",
    cardId: "card1",
    refund: {
      status: "pending",
      reason: "Poor quality",
      note: "Bathroom wasn't cleaned properly, mirror still dirty.",
      hasPhoto: true,
      date: "2026-06-10",
    },
  },
];

// Jobs shown in the AGENT view (as if "you" are the cleaner receiving offers)
export const SEED_JOBS: Job[] = [
  {
    id: "j1",
    customerName: "Andreas Pavlou",
    type: "Short-let",
    address: "12 Amathus Ave, Limassol",
    date: "2026-06-19",
    time: "11:00",
    durationHours: 3,
    ratePerHour: 9,
    bedrooms: 2,
    bathrooms: 2,
    kitchens: 1,
    commonRooms: 1,
    distanceFromHomeKm: 2.4,
    distanceFromPrevKm: null,
    status: "pending",
  },
  {
    id: "j2",
    customerName: "Christina Hadji",
    type: "Residential",
    address: "8 Makariou Ave, Limassol",
    date: "2026-06-19",
    time: "15:00",
    durationHours: 2,
    ratePerHour: 9,
    bedrooms: 1,
    bathrooms: 1,
    kitchens: 1,
    commonRooms: 1,
    distanceFromHomeKm: 5.1,
    distanceFromPrevKm: 3.2,
    status: "pending",
  },
  {
    id: "j3",
    customerName: "Nikos Georgiou",
    type: "Office",
    address: "Office 4, Nikis Court, Limassol",
    date: "2026-06-18",
    time: "18:00",
    durationHours: 2,
    ratePerHour: 9,
    bedrooms: 0,
    bathrooms: 2,
    kitchens: 1,
    commonRooms: 3,
    distanceFromHomeKm: 1.8,
    distanceFromPrevKm: null,
    status: "approved",
  },
  {
    id: "j4", customerName: "Maria Constantinou", type: "Residential",
    address: "20 Griva Digeni, Limassol", date: "2026-06-19", time: "09:00",
    durationHours: 2, ratePerHour: 9, bedrooms: 2, bathrooms: 1, kitchens: 1, commonRooms: 1,
    distanceFromHomeKm: 3.0, distanceFromPrevKm: null, status: "approved",
  },
  {
    id: "j5", customerName: "Petros Louca", type: "Short-let",
    address: "3 Dasoudi, Limassol", date: "2026-06-20", time: "10:30",
    durationHours: 3, ratePerHour: 9, bedrooms: 1, bathrooms: 1, kitchens: 1, commonRooms: 1,
    distanceFromHomeKm: 4.5, distanceFromPrevKm: null, status: "pending",
  },
  {
    id: "j6", customerName: "Eleni Savva", type: "Residential",
    address: "11 Agias Fylaxeos, Limassol", date: "2026-06-20", time: "14:00",
    durationHours: 2, ratePerHour: 9, bedrooms: 3, bathrooms: 2, kitchens: 1, commonRooms: 2,
    distanceFromHomeKm: 2.2, distanceFromPrevKm: 1.5, status: "pending",
  },
  {
    id: "j7", customerName: "Andreas Ky.", type: "Office",
    address: "Office 2, Maximos Plaza, Limassol", date: "2026-06-20", time: "17:00",
    durationHours: 2, ratePerHour: 9, bedrooms: 0, bathrooms: 1, kitchens: 1, commonRooms: 2,
    distanceFromHomeKm: 3.8, distanceFromPrevKm: 2.0, status: "approved",
  },
  {
    id: "j8", customerName: "Sophia Markou", type: "Residential",
    address: "7 Spyrou Araouzou, Limassol", date: "2026-06-22", time: "11:00",
    durationHours: 4, ratePerHour: 9, bedrooms: 3, bathrooms: 2, kitchens: 1, commonRooms: 2,
    distanceFromHomeKm: 1.2, distanceFromPrevKm: null, status: "pending",
  },
  // completed jobs this month — drive the Earnings balance
  {
    id: "jc1", customerName: "Elena Demetriou", type: "Residential",
    address: "5 Spyrou Kyprianou, Limassol", date: "2026-06-03", time: "09:00",
    durationHours: 3, ratePerHour: 9, bedrooms: 2, bathrooms: 1, kitchens: 1, commonRooms: 1,
    distanceFromHomeKm: 2.0, distanceFromPrevKm: null, status: "completed",
  },
  {
    id: "jc2", customerName: "Andreas Pavlou", type: "Short-let",
    address: "12 Amathus Ave, Limassol", date: "2026-06-06", time: "11:00",
    durationHours: 2, ratePerHour: 9, bedrooms: 1, bathrooms: 1, kitchens: 1, commonRooms: 1,
    distanceFromHomeKm: 2.4, distanceFromPrevKm: null, status: "completed",
  },
  {
    id: "jc3", customerName: "Maria Iakovou", type: "Residential",
    address: "20 Griva Digeni, Limassol", date: "2026-06-09", time: "14:00",
    durationHours: 4, ratePerHour: 9, bedrooms: 3, bathrooms: 2, kitchens: 1, commonRooms: 2,
    distanceFromHomeKm: 3.0, distanceFromPrevKm: null, status: "completed",
  },
  {
    id: "jc4", customerName: "Nikos Georgiou", type: "Office",
    address: "Office 4, Nikis Court, Limassol", date: "2026-06-12", time: "18:00",
    durationHours: 2, ratePerHour: 9, bedrooms: 0, bathrooms: 2, kitchens: 1, commonRooms: 3,
    distanceFromHomeKm: 1.8, distanceFromPrevKm: null, status: "completed",
  },
];
