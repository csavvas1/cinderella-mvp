import { useEffect, useRef, type ReactNode } from "react";

// Instagram-style horizontal pager. Renders the previous / current / next tab
// side by side in a track and lets the user drag the track WITH their thumb in
// real time (direct DOM transform — no per-frame React state, so it tracks 1:1
// with no lag). On release it snaps to whichever page is more than ~1/3 dragged
// and reports the new index; a short drag springs back to the current page.
//
// Direction (matches Instagram): drag LEFT -> advance to the next tab; drag
// RIGHT -> go back to the previous tab.
//
// Vertical drags are ignored (axis is locked on first move) so this never fights
// the vertical scroll or pull-to-refresh.
export default function SwipePager({
  index,
  count,
  onIndexChange,
  renderPage,
}: {
  index: number;                              // current page index within the side
  count: number;                             // number of tabs on this side
  onIndexChange: (next: number) => void;      // fired once a swipe commits
  renderPage: (i: number) => ReactNode;       // render the page at tab index i
}) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const startX = useRef<number | null>(null);
  const startY = useRef(0);
  const axis = useRef<"h" | "v" | null>(null);
  const width = useRef(0);
  const dragging = useRef(false);

  // Base transform positions the track so the CURRENT page fills the viewport.
  // The track holds [prev?, current, next?]; we always render current, plus any
  // existing neighbours, and offset by how many slots precede the current one.
  const hasPrev = index > 0;
  const hasNext = index < count - 1;
  const slotOfCurrent = hasPrev ? 1 : 0; // current is 2nd slot when a prev exists

  function baseX() { return -slotOfCurrent * width.current; }

  // keep the track parked on the current page whenever index changes / on mount
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    width.current = viewportRef.current?.clientWidth ?? window.innerWidth;
    el.style.transition = "none";
    el.style.transform = `translateX(${baseX()}px)`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, count]);

  function onStart(e: React.TouchEvent) {
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
    axis.current = null;
    dragging.current = false;
    width.current = viewportRef.current?.clientWidth ?? window.innerWidth;
  }

  function onMove(e: React.TouchEvent) {
    if (startX.current == null) return;
    const dx = e.touches[0].clientX - startX.current;
    const dy = e.touches[0].clientY - startY.current;
    if (axis.current == null) {
      if (Math.abs(dx) < 5 && Math.abs(dy) < 5) return; // decide sooner (was 8)
      // Bias slightly toward horizontal so near-diagonal flicks still register
      // as swipes (fewer "failed" swipes) without hijacking clear vertical scroll.
      axis.current = Math.abs(dx) > Math.abs(dy) * 0.8 ? "h" : "v";
      if (axis.current === "h") dragging.current = true;
    }
    if (axis.current !== "h") return;
    // Hard-lock the edges: on the last (right-most) page a further left-drag has
    // no next page, and on the first (left-most) page a right-drag has no prev —
    // in both cases pin the track so it doesn't rubber-band into empty space.
    let eff = dx;
    if (dx > 0 && !hasPrev) eff = 0;   // left-most: block right-drag (back)
    if (dx < 0 && !hasNext) eff = 0;   // right-most: block left-drag (forward)
    const el = trackRef.current;
    if (el) {
      el.style.transition = "none";
      el.style.transform = `translateX(${baseX() + eff}px)`;
    }
    if (e.cancelable) e.preventDefault(); // we own this horizontal gesture
  }

  function settle(toSlot: number, commitIndex: number | null) {
    const el = trackRef.current;
    if (!el) return;
    el.style.transition = "transform .3s cubic-bezier(.22,.61,.36,1)";
    el.style.transform = `translateX(${-toSlot * width.current}px)`;
    if (commitIndex != null) {
      const done = () => { el.removeEventListener("transitionend", done); onIndexChange(commitIndex); };
      el.addEventListener("transitionend", done);
    }
  }

  function onEnd(e: React.TouchEvent) {
    if (startX.current == null || axis.current !== "h") { startX.current = null; return; }
    const dx = e.changedTouches[0].clientX - startX.current;
    startX.current = null;
    dragging.current = false;
    const threshold = width.current * 0.2; // easier to commit a swipe (was 0.3)
    if (dx <= -threshold && hasNext) {
      // dragged LEFT far enough -> next page (slide track further left)
      settle(slotOfCurrent + 1, index + 1);
    } else if (dx >= threshold && hasPrev) {
      // dragged RIGHT far enough -> previous page
      settle(slotOfCurrent - 1, index - 1);
    } else {
      // snap back to current
      settle(slotOfCurrent, null);
    }
  }

  // slots to render, in visual order, with their tab index
  const slots: number[] = [];
  if (hasPrev) slots.push(index - 1);
  slots.push(index);
  if (hasNext) slots.push(index + 1);

  return (
    <div className="swipe" ref={viewportRef}
      onTouchStart={onStart} onTouchMove={onMove} onTouchEnd={onEnd} onTouchCancel={onEnd}>
      <div className="swipe__track" ref={trackRef}>
        {slots.map((i) => (
          <div className="swipe__page" key={i}>{renderPage(i)}</div>
        ))}
      </div>
    </div>
  );
}
