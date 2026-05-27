/**
 * Selection state machine for the photo grid.
 *
 * Supports:
 *   - shift+click  → range from last anchor to clicked index
 *   - ⌘/ctrl+click → toggle individual without entering "select mode"
 *   - plain click in select mode → toggle
 *   - plain click outside select mode → bubble up via `onOpen` (lightbox)
 *   - touch long-press (450ms) → enter forced select mode + select that one
 *   - ⌘A → select all
 *   - Esc → clear (only when lightbox is closed; caller passes `isLightboxOpen`)
 *
 * "Select mode" is true whenever there's at least one selection OR the user
 * explicitly entered it (via long-press or the "Seleccionar" button). It
 * suppresses opening the lightbox and surfaces the bulk action bar.
 */
import { useCallback, useEffect, useRef, useState } from "react";

interface HasId {
  id: number;
}

interface Args<T extends HasId> {
  items: T[];
  isLightboxOpen: boolean;
  /** Called when a plain click (no selection mode, no modifiers) happens. */
  onOpen: (idx: number) => void;
}

export interface GridSelection {
  selected: Set<number>;
  selectMode: boolean;
  clear: () => void;
  selectAll: () => void;
  enterSelectMode: () => void;
  /** Click handler for a thumbnail at `idx`. */
  onItemClick: (idx: number, e: React.MouseEvent) => void;
  /** Pointer-down for long-press detection on touch. */
  onItemPointerDown: (idx: number, e: React.PointerEvent) => void;
  /** Cancel the long-press timer on pointer up / leave. */
  cancelLongPress: () => void;
}

export function useGridSelection<T extends HasId>({
  items,
  isLightboxOpen,
  onOpen,
}: Args<T>): GridSelection {
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [forcedSelectMode, setForcedSelectMode] = useState(false);
  const anchorIndexRef = useRef<number | null>(null);
  const longPressTimer = useRef<number | null>(null);
  const selectMode = forcedSelectMode || selected.size > 0;

  const clear = useCallback(() => {
    setSelected(new Set());
    setForcedSelectMode(false);
    anchorIndexRef.current = null;
  }, []);

  const selectAll = useCallback(() => {
    setSelected(new Set(items.map((p) => p.id)));
  }, [items]);

  const enterSelectMode = useCallback(() => setForcedSelectMode(true), []);

  const toggle = useCallback((id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const onItemClick = useCallback(
    (idx: number, e: React.MouseEvent) => {
      const item = items[idx];
      if (!item) return;
      if (e.shiftKey) {
        window.getSelection?.()?.removeAllRanges();
        const anchor = anchorIndexRef.current ?? idx;
        const a = Math.min(anchor, idx);
        const b = Math.max(anchor, idx);
        setSelected((prev) => {
          const next = new Set(prev);
          for (let i = a; i <= b; i++) next.add(items[i].id);
          return next;
        });
        anchorIndexRef.current = idx;
        return;
      }
      if (e.metaKey || e.ctrlKey) {
        toggle(item.id);
        anchorIndexRef.current = idx;
        return;
      }
      if (selectMode) {
        toggle(item.id);
        anchorIndexRef.current = idx;
        return;
      }
      anchorIndexRef.current = idx;
      onOpen(idx);
    },
    [items, selectMode, toggle, onOpen],
  );

  const onItemPointerDown = useCallback(
    (idx: number, e: React.PointerEvent) => {
      if (e.pointerType !== "touch") return;
      if (selectMode) return;
      longPressTimer.current = window.setTimeout(() => {
        const item = items[idx];
        if (!item) return;
        setForcedSelectMode(true);
        setSelected(new Set([item.id]));
        anchorIndexRef.current = idx;
        if ("vibrate" in navigator) navigator.vibrate?.(20);
      }, 450);
    },
    [items, selectMode],
  );

  const cancelLongPress = useCallback(() => {
    if (longPressTimer.current != null) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  // Esc to clear · ⌘A to select all (only when lightbox is closed)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isLightboxOpen) return;
      if (e.key === "Escape" && selected.size > 0) {
        e.preventDefault();
        clear();
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "a") {
        e.preventDefault();
        selectAll();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isLightboxOpen, selected.size, clear, selectAll]);

  return {
    selected,
    selectMode,
    clear,
    selectAll,
    enterSelectMode,
    onItemClick,
    onItemPointerDown,
    cancelLongPress,
  };
}
