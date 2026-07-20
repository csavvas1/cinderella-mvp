// Official-brand channel logo. Renders a recognizable inline-SVG brand mark on a
// rounded tile per platform, with a coloured-letter fallback for unknown ids.
// Accepts any platform id string (the connect sheet uses a wider set than the
// ListingPlatform union), so the prop is a plain string.

type Brand = { bg: string; fg: string; letter: string; mark?: (c: string) => React.ReactNode };

// simplified, on-brand glyphs (single-colour, drawn in the tile's fg colour)
const BRANDS: Record<string, Brand> = {
  airbnb: {
    bg: "#ff5a5f", fg: "#fff", letter: "A",
    mark: (c) => (
      <svg viewBox="0 0 32 32" width="66%" height="66%" aria-hidden="true">
        <path fill={c} d="M16 3c2 0 3.4 1.2 4.6 3.4 1 1.8 2.3 4.6 4 8.6 1.5 3.5 2.4 5.8 2.7 7 .5 2 .2 3.7-1 4.9a5 5 0 0 1-3.6 1.4c-1.5 0-3-.7-4.4-2-.4-.4-.8-.8-1.3-1.4-.5.6-.9 1-1.3 1.4-1.4 1.3-2.9 2-4.4 2a5 5 0 0 1-3.6-1.4c-1.2-1.2-1.5-2.9-1-4.9.3-1.2 1.2-3.5 2.7-7 1.7-4 3-6.8 4-8.6C12.6 4.2 14 3 16 3Zm0 2.6c-.8 0-1.5.7-2.3 2.2-.9 1.6-2.1 4.3-3.7 8.1-1.4 3.3-2.2 5.5-2.4 6.4-.3 1.1-.2 1.9.3 2.4.4.4 1 .6 1.7.6.8 0 1.7-.4 2.6-1.3.4-.3.7-.7 1.1-1.2-1.5-2-2.4-3.8-2.4-5.4 0-2 1.4-3.4 3.2-3.4s3.2 1.4 3.2 3.4c0 1.6-.9 3.4-2.4 5.4.4.5.7.9 1.1 1.2.9.9 1.8 1.3 2.6 1.3.7 0 1.3-.2 1.7-.6.5-.5.6-1.3.3-2.4-.2-.9-1-3.1-2.4-6.4-1.6-3.8-2.8-6.5-3.7-8.1C17.5 6.3 16.8 5.6 16 5.6Zm0 10.2c-.6 0-1 .4-1 1.1 0 .7.4 1.6 1 2.5.6-.9 1-1.8 1-2.5 0-.7-.4-1.1-1-1.1Z" />
      </svg>
    ),
  },
  booking: {
    bg: "#003580", fg: "#fff", letter: "B",
    mark: (c) => (
      <svg viewBox="0 0 32 32" width="60%" height="60%" aria-hidden="true">
        <path fill={c} d="M11 6h6.6c3.6 0 5.8 1.9 5.8 5 0 2-1 3.4-2.6 4.1 2.1.6 3.4 2.2 3.4 4.5 0 3.4-2.5 5.4-6.6 5.4H11V6Zm3.6 7.9h2.6c1.5 0 2.4-.8 2.4-2.1 0-1.3-.9-2-2.5-2h-2.5v4.1Zm0 7.7h2.9c1.7 0 2.7-.8 2.7-2.3 0-1.4-1-2.2-2.8-2.2h-2.8v4.5Z" />
      </svg>
    ),
  },
  vrbo: {
    bg: "#1668e3", fg: "#fff", letter: "V",
    mark: (c) => (
      <svg viewBox="0 0 32 32" width="60%" height="60%" aria-hidden="true">
        <path fill={c} d="M6 9h3.7l4.1 10.2L17.9 9h3.6L15.6 24h-3.2L6 9Zm14.4 8.6c0-3.6 2.6-6.2 6.1-6.2.4 0 .8 0 1.2.1v3.2a4 4 0 0 0-1-.1c-1.8 0-3 1.2-3 3.1V24h-3.3v-6.4Z" />
      </svg>
    ),
  },
  expedia: {
    bg: "#fbc02d", fg: "#191e3b", letter: "E",
    mark: (c) => (
      <svg viewBox="0 0 32 32" width="66%" height="66%" aria-hidden="true">
        <path fill={c} d="M16 4a12 12 0 1 0 0 24 12 12 0 0 0 0-24Zm0 2.4c1.6 0 3 .5 4.3 1.3L8.7 19.3A7.6 7.6 0 0 1 16 6.4Zm0 15.2c-1.6 0-3-.5-4.3-1.3l11.6-11.6A7.6 7.6 0 0 1 16 21.6Z" />
      </svg>
    ),
  },
  tripadvisor: {
    bg: "#00aa6c", fg: "#fff", letter: "T",
    mark: (c) => (
      <svg viewBox="0 0 32 32" width="72%" height="72%" aria-hidden="true">
        <path fill={c} d="M16 10c-2.7 0-5.2.6-7.2 1.6L6 9v4.3A6 6 0 0 0 10.4 23a6 6 0 0 0 4-1.5l1.6 1.7 1.6-1.7a6 6 0 0 0 4 1.5A6 6 0 0 0 26 13.3V9l-2.8 2.6C21.2 10.6 18.7 10 16 10Zm-5.6 10.4a3.4 3.4 0 1 1 0-6.8 3.4 3.4 0 0 1 0 6.8Zm11.2 0a3.4 3.4 0 1 1 0-6.8 3.4 3.4 0 0 1 0 6.8Zm-11.2-5a1.6 1.6 0 1 0 0 3.2 1.6 1.6 0 0 0 0-3.2Zm11.2 0a1.6 1.6 0 1 0 0 3.2 1.6 1.6 0 0 0 0-3.2Z" />
      </svg>
    ),
  },
  google: {
    bg: "#ffffff", fg: "#4285f4", letter: "G",
    mark: () => (
      <svg viewBox="0 0 48 48" width="70%" height="70%" aria-hidden="true">
        <path fill="#4285f4" d="M45 24c0-1.6-.1-3.1-.4-4.6H24v9h11.8c-.5 2.7-2 5-4.4 6.6v5.5h7.1C42.7 36.8 45 30.9 45 24Z" />
        <path fill="#34a853" d="M24 46c5.9 0 10.9-2 14.5-5.3l-7.1-5.5c-2 1.3-4.5 2.1-7.4 2.1-5.7 0-10.5-3.8-12.2-9H4.5v5.7A22 22 0 0 0 24 46Z" />
        <path fill="#fbbc05" d="M11.8 28.3a13.2 13.2 0 0 1 0-8.6v-5.7H4.5a22 22 0 0 0 0 20l7.3-5.7Z" />
        <path fill="#ea4335" d="M24 10.8c3.2 0 6.1 1.1 8.4 3.3l6.3-6.3A22 22 0 0 0 4.5 14l7.3 5.7c1.7-5.2 6.5-9 12.2-9Z" />
      </svg>
    ),
  },
  agoda: {
    bg: "#ff6f00", fg: "#fff", letter: "A",
    mark: (c) => (
      <svg viewBox="0 0 32 32" width="66%" height="66%" aria-hidden="true">
        <path fill={c} d="M16 5a11 11 0 0 0 0 22c2.7 0 5.1-1 7-2.6l-2-2.3A7.6 7.6 0 1 1 23.6 16H18v3.2h9V16A11 11 0 0 0 16 5Z" />
      </svg>
    ),
  },
  hostelworld: {
    bg: "#f36f21", fg: "#fff", letter: "H",
    mark: (c) => (
      <svg viewBox="0 0 32 32" width="60%" height="60%" aria-hidden="true">
        <path fill={c} d="M8 6h3.4v7.4h9.2V6H24v20h-3.4v-9.2h-9.2V26H8V6Z" />
      </svg>
    ),
  },
  other: { bg: "#8a8f9c", fg: "#fff", letter: "•" },
};

export default function PlatformIcon({ platform, size = 18 }: { platform: string; size?: number }) {
  const b = BRANDS[platform] ?? BRANDS.other;
  return (
    <span
      className="platicon"
      title={platform}
      style={{
        width: size, height: size, background: b.bg, color: b.fg,
        border: platform === "google" ? "1px solid #e3e5ec" : "none",
        fontSize: Math.round(size * 0.6),
      }}
    >
      {b.mark ? b.mark(b.fg) : b.letter}
    </span>
  );
}
