import { useRef } from "react";

// Drag-down-to-dismiss for a bottom-sheet modal. Attach the returned handlers +
// ref to the `.modal` element: dragging down translates the sheet 1:1 with the
// thumb and, past the threshold, calls onClose; a short drag springs back.
//
// The drag only arms when the sheet is scrolled to its top, so it never fights
// the modal's own inner scroll.
export function useSwipeDownClose(onClose: () => void, threshold = 90) {
  const ref = useRef<HTMLDivElement | null>(null);
  const startY = useRef<number | null>(null);
  const startX = useRef(0);
  const axis = useRef<"h" | "v" | null>(null);
  const dy = useRef(0);

  function set(y: number, animate: boolean) {
    const el = ref.current;
    if (!el) return;
    el.style.transition = animate ? "transform .22s cubic-bezier(.32,.72,.35,1)" : "none";
    el.style.transform = y > 0 ? `translateY(${y}px)` : "";
  }

  function onTouchStart(e: React.TouchEvent) {
    // only arm from the top of the sheet's own scroll
    if ((ref.current?.scrollTop ?? 0) > 0) { startY.current = null; return; }
    startY.current = e.touches[0].clientY;
    startX.current = e.touches[0].clientX;
    axis.current = null;
    dy.current = 0;
  }

  function onTouchMove(e: React.TouchEvent) {
    if (startY.current == null) return;
    const y = e.touches[0].clientY - startY.current;
    const x = e.touches[0].clientX - startX.current;
    if (axis.current == null) {
      const ax = Math.abs(x), ay = Math.abs(y);
      if (ax < 10 && ay < 10) return;
      axis.current = ay > ax * 1.5 ? "v" : "h";
    }
    if (axis.current !== "v") return;
    if (y <= 0) { dy.current = 0; set(0, false); return; } // only downward
    // if the sheet has scrolled, abort (let it scroll)
    if ((ref.current?.scrollTop ?? 0) > 0) return;
    dy.current = y;
    set(y, false);
    if (e.cancelable) e.preventDefault();
  }

  function onTouchEnd() {
    if (startY.current == null) return;
    startY.current = null;
    if (dy.current >= threshold) {
      set(window.innerHeight, true); // slide out
      setTimeout(onClose, 180);
    } else {
      set(0, true); // spring back
    }
  }

  return { ref, onTouchStart, onTouchMove, onTouchEnd };
}
