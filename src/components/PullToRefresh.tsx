import { useRef, useState, type ReactNode } from "react";

// Instagram-style pull-to-refresh. Wraps the scrolling content. When the user
// drags DOWN while the scroll area is already at the very top, we pull the
// content down (direct DOM transform, 1:1 with the thumb — no per-frame React
// state, so no lag) and reveal a spinner. Releasing past the threshold fires
// onRefresh; otherwise the content springs back.
const THRESHOLD = 70;     // px pull needed to trigger a refresh
const MAX_PULL = 120;     // clamp so it can't be dragged the whole screen down

export default function PullToRefresh({
  onRefresh,
  scrollRef,
  children,
}: {
  onRefresh: () => Promise<void>;
  // the scroll container we watch (must be at scrollTop 0 for a pull to start)
  scrollRef: React.RefObject<HTMLElement | null>;
  children: ReactNode;
}) {
  const contentRef = useRef<HTMLDivElement | null>(null);
  const startY = useRef<number | null>(null);
  const startX = useRef(0);
  const axis = useRef<"h" | "v" | null>(null); // locked on first real move
  const pulling = useRef(false);
  const pullDist = useRef(0);
  const [spin, setSpin] = useState(false);        // refresh in flight (spinner active)
  const [indicator, setIndicator] = useState(0);  // 0..1 how close to threshold (for the arrow)

  function setTransform(y: number, animate: boolean) {
    const el = contentRef.current;
    if (!el) return;
    el.style.transition = animate ? "transform .28s cubic-bezier(.32,.72,.35,1)" : "none";
    el.style.transform = y > 0 ? `translateY(${y}px)` : "";
  }

  function onStart(e: React.TouchEvent) {
    if (spin) return;
    // only arm a pull if we're scrolled to the very top
    const atTop = (scrollRef.current?.scrollTop ?? 0) <= 0;
    if (!atTop) { startY.current = null; return; }
    startY.current = e.touches[0].clientY;
    startX.current = e.touches[0].clientX;
    axis.current = null;
    pulling.current = false;
    pullDist.current = 0;
  }

  function onMove(e: React.TouchEvent) {
    if (startY.current == null || spin) return;
    const dy = e.touches[0].clientY - startY.current;
    const dx = e.touches[0].clientX - startX.current;
    // Lock the gesture axis on the first clear movement. A pull only happens on a
    // clearly VERTICAL drag; a horizontal drag is a page swipe (SwipePager owns
    // it) and must never also trigger a reload — one gesture, one action, like
    // Instagram.
    if (axis.current == null) {
      const ax = Math.abs(dx), ay = Math.abs(dy);
      if (ax < 10 && ay < 10) return;
      axis.current = ay > ax * 1.5 ? "v" : "h";
    }
    if (axis.current !== "v") return; // horizontal gesture -> leave it to the pager
    if (dy <= 0) {
      // dragging up — not a pull; release any partial pull
      if (pulling.current) { pulling.current = false; setTransform(0, true); setIndicator(0); }
      return;
    }
    // still at top? if the user scrolled, abort the pull
    if ((scrollRef.current?.scrollTop ?? 0) > 0) return;
    pulling.current = true;
    // rubber-band: resistance grows as you pull further
    const damped = Math.min(MAX_PULL, dy * 0.5);
    pullDist.current = damped;
    setTransform(damped, false);
    setIndicator(Math.min(1, damped / THRESHOLD));
    if (e.cancelable) e.preventDefault(); // block native pull-to-refresh / bounce
  }

  async function onEnd() {
    if (startY.current == null) return;
    startY.current = null;
    if (!pulling.current) return;
    pulling.current = false;
    if (pullDist.current >= THRESHOLD * 0.5) {
      // trigger: hold the content at the spinner rest position, run the refresh,
      // then spring back.
      setSpin(true);
      setTransform(52, true);
      try { await onRefresh(); } finally {
        setSpin(false);
        setIndicator(0);
        setTransform(0, true);
      }
    } else {
      setTransform(0, true);
      setIndicator(0);
    }
  }

  return (
    <div className="ptr">
      <div className={"ptr__spinner" + (spin ? " ptr__spinner--active" : "")}
        style={{ opacity: spin ? 1 : indicator }}>
        <span className={"ptr__ring" + (spin ? " ptr__ring--spin" : "")}
          style={{ transform: `rotate(${indicator * 270}deg)` }} />
      </div>
      <div ref={contentRef} className="ptr__content"
        onTouchStart={onStart} onTouchMove={onMove} onTouchEnd={onEnd} onTouchCancel={onEnd}>
        {children}
      </div>
    </div>
  );
}
