import { useEffect, useState } from "react";
import Uploader from "./Uploader";
import { Icons } from "./icons";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/Dialog";

interface CurrentGallery {
  id: number;
  name: string;
}

function readCurrentGallery(): CurrentGallery | null {
  if (typeof window === "undefined") return null;
  const g = (window as unknown as { __currentGallery?: CurrentGallery })
    .__currentGallery;
  return g ?? null;
}

/**
 * Global upload modal. Mounted once by Base.astro. Opens via:
 *   - window dispatching `uploader:open` (the topbar button)
 *   - the user dragging a file anywhere onto the page
 */
export default function UploaderModal() {
  const [open, setOpen] = useState(false);
  const currentGallery = readCurrentGallery();

  // Open on custom event
  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener("uploader:open", onOpen);
    return () => window.removeEventListener("uploader:open", onOpen);
  }, []);

  // Open on file drag anywhere on the page
  useEffect(() => {
    let depth = 0;
    const onDragEnter = (e: DragEvent) => {
      if (!e.dataTransfer?.types?.includes("Files")) return;
      depth++;
      setOpen(true);
    };
    const onDragLeave = () => {
      depth--;
      if (depth <= 0) depth = 0;
    };
    const onDrop = () => {
      depth = 0;
    };
    const onDragOver = (e: DragEvent) => {
      // Prevent the browser from opening dropped files in a new tab if the
      // user misses the dropzone.
      if (e.dataTransfer?.types?.includes("Files")) e.preventDefault();
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

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Subir fotos</DialogTitle>
          <DialogClose asChild>
            <button className="iconbtn" aria-label="Cerrar">
              <Icons.Close size={15} />
            </button>
          </DialogClose>
        </DialogHeader>
        <DialogDescription>
          Sube fotos al servidor — JPEG, PNG, HEIC y RAW de cámara
        </DialogDescription>
        <div className="dialog-body">
          <Uploader
            defaultGalleryId={currentGallery?.id}
            defaultGalleryName={currentGallery?.name}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
