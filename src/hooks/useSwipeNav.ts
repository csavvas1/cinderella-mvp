import { useRef } from "react";

// Horizontal swipe navigation between the tabs of the CURRENT side.
// Right-swipe advances to the next tab in the list; left-swipe goes back to the
// previous one. Never crosses the customer/agent boundary (the caller passes
// only the current side's tab order). Vertical drags are ignored so it doesn't
// fight scrolling or pull-to-refresh.
export function useSwipeNav(
  tabs: string[],
  currentPath: string,
  go: (to: string, dir: "next" | "prev") => void,
) {
  const startX = useRef<number | null>(null);
  const startY = useRef(0);
  const decided = useRef<"h" | "v" | null>(null);

  function onTouchStart(e: React.TouchEvent) {
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
    decided.current = null;
  }

  function onTouchMove(e: React.TouchEvent) {
    if (startX.current == null) return;
    if (decided.current == null) {
      const dx = Math.abs(e.touches[0].clientX - startX.current);
      const dy = Math.abs(e.touches[0].clientY - startY.current);
      if (dx < 8 && dy < 8) return;              // too small to judge yet
      decided.current = dx > dy ? "h" : "v";     // lock the axis on first real move
    }
  }

  function onTouchEnd(e: React.TouchEvent) {
    if (startX.current == null || decided.current !== "h") { startX.current = null; return; }
    const dx = e.changedTouches[0].clientX - startX.current;
    startX.current = null;
    if (Math.abs(dx) < 55) return;               // too short to count as a swipe
    const idx = tabs.indexOf(currentPath);
    if (idx === -1) return;
    if (dx > 0) {
      // swipe RIGHT -> advance to the next tab (Book -> Calendar -> ...)
      if (idx < tabs.length - 1) go(tabs[idx + 1], "next");
    } else {
      // swipe LEFT -> go back to the previous tab
      if (idx > 0) go(tabs[idx - 1], "prev");
    }
  }

  return { onTouchStart, onTouchMove, onTouchEnd };
}
