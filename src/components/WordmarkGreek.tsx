// "Σιντερέλλα" wordmark — rendered as live text in Vollkorn 900, a sturdy,
// warm bold serif with full Greek support. `height` maps to an approximate cap
// height so existing call sites keep working.
export default function WordmarkGreek({ height = 84, color = "#ffffff" }: { height?: number; color?: string }) {
  return (
    <span
      role="img"
      aria-label="Σιντερέλλα"
      style={{
        fontFamily: "var(--font-wordmark)",
        fontSize: Math.round(height * 0.68),
        lineHeight: 1,
        color,
        letterSpacing: "0.005em",
        fontWeight: 900,
        whiteSpace: "nowrap",
        display: "inline-block",
      }}
    >
      Σιντερέλλα
    </span>
  );
}
