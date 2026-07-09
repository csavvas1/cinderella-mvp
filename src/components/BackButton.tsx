import { useNavigate } from "react-router-dom";

export default function BackButton({ to, label = "Back" }: { to?: string | number; label?: string }) {
  const nav = useNavigate();
  function go() {
    if (typeof to === "string") nav(to);
    else nav(-1);
  }
  return (
    <button className="backbtn" onClick={go}>
      <span className="backbtn__ic">
        <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
          <path d="M15 4 L7 12 L15 20" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <span>{label}</span>
    </button>
  );
}
