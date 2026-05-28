/**
 * Carousel-style horizontal swipe navigation for the lightbox.
 *
 * Semantics:
 *   - Only activates at scale=1 (when isZoomed is false). Pinch-zoomed content
 *     gets pan, not swipe.
 *   - First ~8px establishes axis ("x" for swipe, "y" for vertical scroll —
 *     left alone). After that, x-axis drags translate the stage.
 *   - On release, a commit threshold (60px distance OR 0.6 px/ms velocity)
 *     triggers commitSwipe(direction) which animates the current photo off
 *     screen, then snaps translateX back to 0 with no animation while
 *     swapping the active index. That last beat — "no-animation reset" — is
 *     what makes it look like a real carousel rather than a slide that
 *     rubber-bands and jumps.
 */
import { useRef, useState } from "react";

/**
 * Read the user's reduced-motion preference once at call time. We don't
 * subscribe to the media query — swipe is a transient gesture and reading
 * it per-commit is enough; this avoids stateful plumbing for a 1-bit value.
 */
function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

interface Args {
  /** True when the photo is zoomed in (>1×). Swipe is disabled then. */
  isZoomed: boolean;
  /** Total photo count — needed for wrap-around. */
  count: number;
  /** Current photo index. */
  index: number;
  /** Called with the new index after a committed swipe. */
  onIndex: (next: number) => void;
}

export interface SwipeNav {
  /** Current horizontal translation in px (-Inf, +Inf). */
  dragX: number;
  /** True while the user is actively dragging. */
  dragging: boolean;
  /**
   * True for the one-frame window after we commit a swipe, while we reset
   * translateX to 0 with no transition. Consumers should disable their CSS
   * transition while this is true.
   */
  transitioning: boolean;
  onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
  onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => void;
  onPointerEnd: (e: React.PointerEvent<HTMLDivElement>) => void;
}

export function useSwipeNav({ isZoomed, count, index, onIndex }: Args): SwipeNav {
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const startRef = useRef({ x: 0, y: 0, t: 0 });
  const axisRef = useRef<"none" | "x" | "y">("none");
  const activePointers = useRef(new Set<number>());

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    activePointers.current.add(e.pointerId);
    if (isZoomed) return;
    if (activePointers.current.size > 1) {
      setDragging(false);
      setDragX(0);
      return;
    }
    if (e.button !== 0 && e.pointerType === "mouse") return;
    setDragging(true);
    startRef.current = { x: e.clientX, y: e.clientY, t: Date.now() };
    axisRef.current = "none";
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging || isZoomed || activePointers.current.size > 1) return;
    const dx = e.clientX - startRef.current.x;
    const dy = e.clientY - startRef.current.y;
    if (axisRef.current === "none") {
      if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
        axisRef.current = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
      }
    }
    if (axisRef.current === "x") {
      const abs = Math.abs(dx);
      // Rubber-band past 200px so finger never feels like it teleports.
      const eased = abs > 200 ? 200 + (abs - 200) * 0.4 : abs;
      setDragX(Math.sign(dx) * eased);
    }
  };

  const commitSwipe = (direction: 1 | -1) => {
    // For users who prefer reduced motion, skip the slide-off animation
    // and just jump to the next photo. The carousel feel is sacrificed
    // for accessibility — what matters is that nav still works.
    if (prefersReducedMotion()) {
      setDragX(0);
      if (direction < 0) {
        onIndex((index + 1) % count);
      } else {
        onIndex((index - 1 + count) % count);
      }
      return;
    }
    const width = window.innerWidth;
    setDragX(direction * width);
    window.setTimeout(() => {
      setTransitioning(true);
      setDragX(0);
      if (direction < 0) {
        onIndex((index + 1) % count);
      } else {
        onIndex((index - 1 + count) % count);
      }
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setTransitioning(false));
      });
    }, 220);
  };

  const onPointerEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    activePointers.current.delete(e.pointerId);
    if (!dragging) return;
    setDragging(false);
    const dx = e.clientX - startRef.current.x;
    const dt = Math.max(1, Date.now() - startRef.current.t);
    const vx = dx / dt;
    const commit =
      !isZoomed &&
      axisRef.current === "x" &&
      (Math.abs(dx) > 60 || Math.abs(vx) > 0.6);
    if (commit) {
      commitSwipe(dx < 0 ? -1 : 1);
    } else {
      setDragX(0);
    }
  };

  return { dragX, dragging, transitioning, onPointerDown, onPointerMove, onPointerEnd };
}
