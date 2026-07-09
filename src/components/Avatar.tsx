// Renders an uploaded photo when present, else a gradient initial. No emojis.
// `emoji` is accepted for backward-compat with existing call sites but ignored.
export default function Avatar({
  photoUrl,
  emoji: _emoji,
  name,
  className = "avatar lg",
  grayscale = false,
}: {
  photoUrl?: string;
  emoji?: string;
  name?: string;
  className?: string;
  grayscale?: boolean;
}) {
  if (photoUrl) {
    return (
      <span className={className} style={{ padding: 0, overflow: "hidden", filter: grayscale ? "grayscale(1)" : undefined }}>
        <img src={photoUrl} alt={name || "profile"} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      </span>
    );
  }
  const initial = (name || "?").trim().charAt(0).toUpperCase();
  return (
    <span className={className} style={{ background: "linear-gradient(135deg, var(--indigo), #8b5cf6)", color: "#fff", fontWeight: 900 }}>
      {initial}
    </span>
  );
}
