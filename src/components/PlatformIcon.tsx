import type { ListingPlatform } from "../types";

// Small rounded channel badge (Airbnb / Booking.com / Vrbo / Google / Expedia).
// Same inline-SVG convention as BrandIcon in PaymentPicker.tsx.
const META: Record<ListingPlatform, { bg: string; fg: string; letter: string }> = {
  airbnb:  { bg: "#ff5a5f", fg: "#fff", letter: "A" },
  booking: { bg: "#003b95", fg: "#fff", letter: "B" },
  vrbo:    { bg: "#1668e3", fg: "#fff", letter: "V" },
  google:  { bg: "#ffffff", fg: "#4285f4", letter: "G" },
  expedia: { bg: "#ffc72c", fg: "#191e3b", letter: "E" },
  other:   { bg: "#8a8f9c", fg: "#fff", letter: "•" },
};

export default function PlatformIcon({ platform, size = 18 }: { platform: ListingPlatform; size?: number }) {
  const m = META[platform] ?? META.other;
  return (
    <span
      className="platicon"
      title={platform}
      style={{
        width: size, height: size, background: m.bg, color: m.fg,
        border: platform === "google" ? "1px solid #e3e5ec" : "none",
        fontSize: Math.round(size * 0.6),
      }}
    >
      {m.letter}
    </span>
  );
}
