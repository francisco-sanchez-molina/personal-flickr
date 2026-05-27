import { useEffect, useState } from "react";
import Uploader from "./Uploader";
import { Icons } from "./icons";

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

export default function UploaderModal() {
  const [open, setOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const currentGallery = readCurrentGallery();

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener("uploader:open", onOpen);
    return () => window.removeEventListener("uploader:open", onOpen);
  }, []);

  useEffect(() => {
    let depth = 0;
    const onDragEnter = (e: DragEvent) => {
      if (!e.dataTransfer?.types?.includes("Files")) return;
      depth++;
      setDragging(true);
      setOpen(true);
    };
    const onDragLeave = () => {
      depth--;
      if (depth <= 0) {
        depth = 0;
        setDragging(false);
      }
    };
    const onDrop = () => {
      depth = 0;
      setDragging(false);
    };
    const onDragOver = (e: DragEvent) => {
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
      className="modal"
      onClick={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}
    >
      <div className="modal-card">
        <div className="modal-head">
          <h2>Subir fotos</h2>
          <button
            className="iconbtn"
            onClick={() => setOpen(false)}
            aria-label="Cerrar"
          >
            <Icons.Close size={15} />
          </button>
        </div>
        <div className="modal-body">
          <Uploader
            defaultGalleryId={currentGallery?.id}
            defaultGalleryName={currentGallery?.name}
          />
        </div>
      </div>
    </div>
  );
}
