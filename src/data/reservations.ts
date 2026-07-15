import type { Reservation } from "../types";

// Mock reservations for the Pro "Reservations" calendar. No real channel API yet
// — these are hand-seeded across the CURRENT month so bars are always visible.
// Dates anchor to today via _d() (same trick as seed.ts).
const _d = (dayOffset: number) => {
  const t = new Date();
  const x = new Date(t.getFullYear(), t.getMonth(), t.getDate() + dayOffset);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
};

// Small, stable placeholder photos (Unsplash static). Demo-only.
const PHOTO = {
  loft: "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=400&q=60",
  studio: "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=400&q=60",
  seaside: "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=400&q=60",
  marina: "https://images.unsplash.com/photo-1493809842364-78817add7ffb?w=400&q=60",
};

export const SEED_RESERVATIONS: Reservation[] = [
  { id: "r1", platform: "airbnb",  guest: "Noah Hughes",   property: "Seaside Apartment",     propertyPhoto: PHOTO.seaside, checkIn: _d(-14), checkOut: _d(-12), nights: 2, guests: 2, status: "completed", total: 240, currency: "EUR" },
  { id: "r2", platform: "booking", guest: "Lily Bennett",  property: "Beachfront Loft",       propertyPhoto: PHOTO.loft,    checkIn: _d(-11), checkOut: _d(-10), nights: 2, guests: 2, status: "booked",    total: 180, currency: "EUR" },
  { id: "r3", platform: "booking", guest: "Charlie Cooper",property: "City Studio",           propertyPhoto: PHOTO.studio,  checkIn: _d(-9),  checkOut: _d(-6),  nights: 3, guests: 3, status: "booked",    total: 330, currency: "EUR" },
  { id: "r4", platform: "google",  guest: "Sophie Turner", property: "Marina Loft",           propertyPhoto: PHOTO.marina,  checkIn: _d(-5),  checkOut: _d(-2),  nights: 3, guests: 2, status: "booked",    total: 420, currency: "EUR" },
  { id: "r5", platform: "airbnb",  guest: "Henry Bailey",  property: "Seaside Apartment",     propertyPhoto: PHOTO.seaside, checkIn: _d(-2),  checkOut: _d(1),   nights: 3, guests: 2, status: "booked",    total: 360, currency: "EUR" },
  { id: "r6", platform: "expedia", guest: "George Clarke", property: "City Studio",           propertyPhoto: PHOTO.studio,  checkIn: _d(2),   checkOut: _d(5),   nights: 3, guests: 3, status: "booked",    total: 300, currency: "EUR" },
  { id: "r7", platform: "vrbo",    guest: "Oliver Wright", property: "Marina Loft",           propertyPhoto: PHOTO.marina,  checkIn: _d(5),   checkOut: _d(12),  nights: 7, guests: 4, status: "booked",    total: 980, currency: "EUR" },
  { id: "r8", platform: "airbnb",  guest: "Emily Carter",  property: "Beachfront Loft",       propertyPhoto: PHOTO.loft,    checkIn: _d(12),  checkOut: _d(17),  nights: 5, guests: 2, status: "booked",    total: 620, currency: "EUR" },
  { id: "r9", platform: "booking", guest: "Amelia Walker", property: "Seaside Apartment",     propertyPhoto: PHOTO.seaside, checkIn: _d(16),  checkOut: _d(22),  nights: 6, guests: 2, status: "booked",    total: 720, currency: "EUR" },
];
