/**
 * Tracks whether `ref` is the current fullscreen element and exposes a toggle
 * that drives the Fullscreen API.  Safe in non-supporting browsers (the
 * promise rejection is swallowed).
 */
import { useCallback, useEffect, useState, type RefObject } from "react";

export function useFullscreen<T extends HTMLElement>(
  ref: RefObject<T | null>,
): { isFullscreen: boolean; toggle: () => void } {
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const onChange = () => {
      setIsFullscreen(document.fullscreenElement === ref.current);
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, [ref]);

  const toggle = useCallback(() => {
    if (document.fullscreenElement) {
      void document.exitFullscreen?.();
    } else {
      void ref.current?.requestFullscreen?.().catch(() => {});
    }
  }, [ref]);

  return { isFullscreen, toggle };
}
