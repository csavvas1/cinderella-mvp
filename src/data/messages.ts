import type { ChatMessage, ChatThread } from "../types";

// Mock unified-inbox data. No real messaging API yet — hand-seeded to look alive.
const H = 3600_000;
const D = 24 * H;
const now = Date.now();

export const SEED_THREADS: ChatThread[] = [
  { id: "t1", guest: "Amelia Walker",  property: "Riverside Retreat", reservationId: "r9", platform: "booking", subject: "Day of Arrival — Welcome Email",  dateRange: "18 Jul - 24 Jul", lastAt: now - 2 * H,  unread: true  },
  { id: "t2", guest: "Harry Thompson", property: "Seaside Apartment", platform: "airbnb",  subject: "Day of Arrival — Welcome Email",  dateRange: "25 Jul - 30 Jul", lastAt: now - 1 * D,  unread: false },
  { id: "t3", guest: "Amelia Walker",  property: "Riverside Retreat", platform: "booking", subject: "Payment Reminder",                 dateRange: "17 Jul - 22 Jul", lastAt: now - 2 * D,  unread: false },
  { id: "t4", guest: "George Clarke",  property: "City Studio",       reservationId: "r6", platform: "expedia", subject: "Check-out — Thanks for Staying",  dateRange: "22 Jun - 25 Jun", lastAt: now - 6 * D,  unread: false },
  { id: "t5", guest: "Isla Robinson",  property: "Marina Loft",       platform: "vrbo",    subject: "Check-out — Thanks for Staying",  dateRange: "20 Jun - 21 Jun", lastAt: now - 7 * D,  unread: false },
  { id: "t6", guest: "Mia Phillips",   property: "Beachfront Loft",   platform: "airbnb",  subject: "Thanks for reaching out",         dateRange: "4 Aug - 7 Aug",   lastAt: now - 9 * D,  unread: false },
  { id: "t7", guest: "Ava Mitchell",   property: "Seaside Apartment", platform: "booking", subject: "Check-out — Thanks for Staying",  dateRange: "16 May - 20 May", lastAt: now - 30 * D, unread: false },
  { id: "t8", guest: "Jack Edwards",   property: "City Studio",       platform: "airbnb",  subject: "Check-out — Thanks for Staying",  dateRange: "16 Apr - 19 Apr", lastAt: now - 60 * D, unread: false },
];

// Full message list for the top thread so the thread view looks real.
export const SEED_MESSAGES: ChatMessage[] = [
  { id: "m1", threadId: "t1", from: "host",  title: "Booking Confirmation", body: "Hi Amelia,\n\nThanks for booking Riverside Retreat Lisbon with WorldNest. Your reservation is confirmed for 18–24 July. We can't wait to host you!\n\nWarm regards,\nThe WorldNest Team", at: now - 5 * D, channel: "email", automated: true },
  { id: "m2", threadId: "t1", from: "guest", body: "Hi! Is there a coffee machine in the apartment? I'm a bit fussy about my morning coffee ☕", at: now - 3 * D, channel: "email" },
  { id: "m3", threadId: "t1", from: "host",  body: "Hi Amelia,\n\nYes — there's a Nespresso in the kitchen and a starter pack of original capsules in the top drawer. Feel free to use it as much as you'd like.\n\nWarm regards,\nThe WorldNest Team", at: now - 3 * D + 2 * 60_000, channel: "email", aiReply: true },
  { id: "m4", threadId: "t1", from: "host",  title: "Pre-Arrival — 2 Days Before Arrival", body: "Hi Amelia,\n\nYour stay at Riverside Retreat Lisbon begins in 2 days. A quick note to help you prepare: check-in is from 15:00, and the door code will be sent on the morning of arrival.", at: now - 2 * H, channel: "email", automated: true },
];

// A couple of canned quick-replies for the composer mock.
export const QUICK_REPLIES = [
  "Hi! Check-in is from 15:00 and the door code will be sent on your arrival morning.",
  "Thanks so much for staying with us — we'd love a review if you enjoyed your stay!",
  "The Wi-Fi name is WorldNest_Guest and the password is on the fridge.",
];
