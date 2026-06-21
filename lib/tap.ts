/** Finger travel (px) past which a touch is a scroll/drag, not a tap. */
const TAP_SLOP = 10;

/**
 * Fire a handler on mouse click and on a deliberate touch tap. A touch that moves
 * more than TAP_SLOP between start and end is treated as a scroll and ignored, so
 * scrolling never accidentally selects/activates the element.
 *
 * The mutable `start` is created per call but a single touchstart→move→end gesture
 * runs against the same render's handlers (no re-render happens mid-gesture, since
 * only the final tap mutates React state), so a plain object is enough.
 */
export function tapProps(handler: () => void) {
  const start = { x: 0, y: 0, moved: false };
  return {
    onClick: handler, // mouse + keyboard-synthesized click
    onTouchStart: (e: React.TouchEvent) => {
      const t = e.touches[0];
      if (!t) return;
      start.x = t.clientX;
      start.y = t.clientY;
      start.moved = false;
    },
    onTouchMove: (e: React.TouchEvent) => {
      const t = e.touches[0];
      if (!t) return;
      if (Math.hypot(t.clientX - start.x, t.clientY - start.y) > TAP_SLOP) {
        start.moved = true;
      }
    },
    onTouchEnd: (e: React.TouchEvent) => {
      if (start.moved) return; // scrolled — let the browser do nothing, no select
      e.preventDefault(); // real tap: suppress the synthesized duplicate click
      handler();
    },
  };
}
