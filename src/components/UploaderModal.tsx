import { useEffect, useState } from "react";
import Uploader from "./Uploader";

interface CurrentGallery {
  id: number;
  name: string;
}

/**
 * Read the current gallery context (if any) from a window-global that the
 * Astro layout writes during SSR. The variable is set BEFORE React hydrates,
 * so it's available on first render.
 */
function readCurrentGallery(): CurrentGallery | null {
  if (typeof window === "undefined") return null;
  const g = (window as unknown as { __currentGallery?: CurrentGallery })
    .__currentGallery;
  return g ?? null;
}

export default function UploaderModal() {
  const [open, setOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const currentGallery = readCurrentGallery();

  // Open via custom event from the header button
  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener("uploader:open", onOpen);
    return () => window.removeEventListener("uploader:open", onOpen);
  }, []);

  // Auto-open when the user drags a file anywhere on the page
  useEffect(() => {
    let dragDepth = 0;
    const onDragEnter = (e: DragEvent) => {
      // Only react to file drags, not text drags
      if (!e.dataTransfer?.types?.includes("Files")) return;
      dragDepth++;
      setDragging(true);
      setOpen(true);
    };
    const onDragLeave = () => {
      dragDepth--;
      if (dragDepth <= 0) {
        dragDepth = 0;
        setDragging(false);
      }
    };
    const onDrop = () => {
      dragDepth = 0;
      setDragging(false);
    };
    const onDragOver = (e: DragEvent) => {
      // Prevent the browser from opening the file in a new tab if the user
      // drops outside the dropzone.
      if (e.dataTransfer?.types?.includes("Files")) {
        e.preventDefault();
      }
    };
    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("drop", onDrop);
    window.addEventListener("dragover", onDragOver);
    return () => {
      window.removeEventListener("dragenter", onDragEnter);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("drop", onDrop);
      window.removeEventListener("dragover", onDragOver);
    };
  }, []);

  // Esc closes (but not while dragging — that'd be weird)
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !dragging) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, dragging]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-40 flex items-start justify-center bg-black/70 p-4 pt-16 sm:pt-24"
      onClick={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}
    >
      <div
        className="w-full max-w-2xl overflow-hidden rounded-lg border border-neutral-800 bg-neutral-950 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-400">
            Subir fotos
          </h2>
          <button
            onClick={() => setOpen(false)}
            className="rounded-md px-2 py-1 text-sm text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>
        <div className="p-4">
          <Uploader
            defaultGalleryId={currentGallery?.id}
            defaultGalleryName={currentGallery?.name}
          />
        </div>
      </div>
    </div>
  );
}
