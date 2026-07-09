import { APP_NAME } from "../data/brand";

// Neutral brand mark — a rounded "shine" diamond, no copyrighted imagery.
// `size` controls the glyph; `wordmark` toggles the name beside it.
export function LogoMark({ size = 24, agent = false }: { size?: number; agent?: boolean }) {
  const a = agent ? "var(--agent)" : "var(--indigo)";
  const b = agent ? "#38bdf8" : "#8b5cf6";
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <defs>
        <linearGradient id="lg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={a} />
          <stop offset="1" stopColor={b} />
        </linearGradient>
      </defs>
      <rect x="3" y="3" width="26" height="26" rx="9" fill="url(#lg)" />
      {/* four-point shine */}
      <path
        d="M16 8 C16.8 12.4 19.6 15.2 24 16 C19.6 16.8 16.8 19.6 16 24 C15.2 19.6 12.4 16.8 8 16 C12.4 15.2 15.2 12.4 16 8 Z"
        fill="#fff"
      />
    </svg>
  );
}

export function Logo({ size = 24, agent = false }: { size?: number; agent?: boolean }) {
  return (
    <span className={"brand" + (agent ? " brand--agent" : "")}>
      <LogoMark size={size} agent={agent} />
      {APP_NAME}
    </span>
  );
}
