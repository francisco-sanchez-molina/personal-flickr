import { useCallback, useRef, useState } from "react";
import { Icons } from "./icons";

interface UploadedPhoto {
  id: number;
  name: string;
  width: number;
  height: number;
  size_bytes: number;
}

interface QueueItem {
  id: string;
  file: File;
  status:
    | "pending"
    | "checking"
    | "conflict"
    | "uploading"
    | "done"
    | "error";
  finalName?: string;
  suggested?: string | null;
  progress?: number;
  error?: string;
}

function fmtSize(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}
function uid() {
  return Math.random().toString(36).slice(2);
}

interface UploaderProps {
  defaultGalleryId?: number;
  defaultGalleryName?: string;
}

export default function Uploader({
  defaultGalleryId,
  defaultGalleryName,
}: UploaderProps = {}) {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const update = useCallback((id: string, patch: Partial<QueueItem>) => {
    setQueue((q) => q.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }, []);

  const doUpload = useCallback(
    async (
      item: QueueItem,
      decision: "create" | "replace" | "rename",
      finalName?: string,
    ) => {
      update(item.id, { status: "uploading", progress: 0 });
      const fd = new FormData();
      fd.append("file", item.file);
      fd.append("decision", decision);
      if (finalName) fd.append("finalName", finalName);

      try {
        const res = await new Promise<{
          ok: boolean;
          status: number;
          body: { error?: string; detail?: string; finalName?: string; suggested?: string; photo?: UploadedPhoto };
        }>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open("POST", "/api/upload");
          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
              update(item.id, { progress: e.loaded / e.total });
            }
          };
          xhr.onerror = () => reject(new Error("network"));
          xhr.onload = () => {
            try {
              const body = JSON.parse(xhr.responseText);
              resolve({ ok: xhr.status < 400, status: xhr.status, body });
            } catch {
              resolve({
                ok: false,
                status: xhr.status,
                body: { error: "bad response" },
              });
            }
          };
          xhr.send(fd);
        });

        if (res.ok && res.body.photo) {
          update(item.id, { status: "done", progress: 1 });
          const photo = res.body.photo;
          if (defaultGalleryId != null) {
            try {
              await fetch(`/api/galleries/${defaultGalleryId}/photos`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ photo_ids: [photo.id] }),
              });
            } catch {
              /* best-effort */
            }
          }
          window.dispatchEvent(
            new CustomEvent("photo:added", {
              detail: { photo, galleryId: defaultGalleryId ?? null },
            }),
          );
        } else if (res.status === 409 && res.body?.error === "name_conflict") {
          update(item.id, {
            status: "conflict",
            finalName: res.body.finalName,
            suggested: res.body.suggested,
          });
        } else {
          update(item.id, {
            status: "error",
            error: res.body?.detail ?? res.body?.error ?? "error",
          });
        }
      } catch (e: unknown) {
        update(item.id, {
          status: "error",
          error: e instanceof Error ? e.message : String(e),
        });
      }
    },
    [update, defaultGalleryId],
  );

  const enqueue = useCallback(
    async (files: File[]) => {
      const items: QueueItem[] = files.map((f) => ({
        id: uid(),
        file: f,
        status: "checking",
      }));
      setQueue((q) => [...items, ...q]);

      for (const item of items) {
        try {
          const res = await fetch("/api/check-name", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ filename: item.file.name }),
          });
          const body = await res.json();
          if (body.exists) {
            update(item.id, {
              status: "conflict",
              finalName: body.finalName,
              suggested: body.suggested,
            });
          } else {
            update(item.id, { status: "pending", finalName: body.finalName });
            doUpload({ ...item, finalName: body.finalName }, "create");
          }
        } catch (e: unknown) {
          update(item.id, {
            status: "error",
            error: e instanceof Error ? e.message : String(e),
          });
        }
      }
    },
    [doUpload, update],
  );

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fs = Array.from(e.target.files ?? []);
    if (fs.length) enqueue(fs);
    if (inputRef.current) inputRef.current.value = "";
  };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const fs = Array.from(e.dataTransfer.files ?? []);
    if (fs.length) enqueue(fs);
  };
  const dismiss = (id: string) =>
    setQueue((q) => q.filter((it) => it.id !== id));

  return (
    <div style={{ display: "grid", gap: 14 }}>
      {defaultGalleryId != null && defaultGalleryName && (
        <div
          style={{
            padding: "10px 14px",
            border: "1px solid color-mix(in srgb, var(--accent) 30%, var(--line))",
            background: "color-mix(in srgb, var(--accent) 6%, transparent)",
            borderRadius: 10,
            fontSize: 13,
            color: "var(--ink)",
          }}
        >
          <span style={{ color: "var(--accent)", marginRight: 6 }}>→</span>
          Las fotos se añadirán a{" "}
          <strong style={{ fontWeight: 600 }}>{defaultGalleryName}</strong>
        </div>
      )}

      <div
        className={`dropzone ${dragOver ? "over" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
      >
        <div className="icon">
          <Icons.Upload size={22} />
        </div>
        <div className="big serif">Arrastra fotos aquí</div>
        <div className="sub">
          o haz click para seleccionar · JPEG / PNG / HEIC / CR2 / CR3 / RAF / ARW
        </div>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="image/*,.cr2,.CR2,.cr3,.CR3,.nef,.NEF,.arw,.ARW,.dng,.DNG,.raf,.RAF,.orf,.ORF,.rw2,.RW2"
          style={{ display: "none" }}
          onChange={onPick}
        />
      </div>

      {queue.length > 0 && (
        <div className="up-list">
          {queue.map((it) => (
            <QueueRow
              key={it.id}
              item={it}
              onReplace={() => doUpload(it, "replace", it.finalName)}
              onRename={() => doUpload(it, "rename", it.suggested ?? undefined)}
              onDismiss={() => dismiss(it.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function QueueRow({
  item,
  onReplace,
  onRename,
  onDismiss,
}: {
  item: QueueItem;
  onReplace: () => void;
  onRename: () => void;
  onDismiss: () => void;
}) {
  const status = item.status;
  const pct = Math.round((item.progress ?? 0) * 100);
  return (
    <div className="up-row">
      <div className="up-thumb">
        <Icons.Photos size={20} />
      </div>
      <div className="up-info">
        <div className="name">{item.file.name}</div>
        <div className="sub">
          {fmtSize(item.file.size)} ·{" "}
          {status === "checking" && "comprobando…"}
          {status === "pending" && "en cola"}
          {status === "uploading" && `subiendo ${pct}%`}
          {status === "conflict" && (
            <>
              ya existe{" "}
              <code
                style={{
                  background: "var(--bg-3)",
                  padding: "1px 5px",
                  borderRadius: 4,
                }}
              >
                {item.finalName}
              </code>
            </>
          )}
          {status === "done" && "listo"}
          {status === "error" && `error: ${item.error}`}
        </div>
        {(status === "uploading" || status === "checking") && (
          <div className="progress">
            <span style={{ width: `${Math.max(5, pct)}%` }} />
          </div>
        )}
        {status === "conflict" && (
          <div className="up-conflict">
            <button className="btn sm" onClick={onReplace}>
              Reemplazar
            </button>
            <button className="btn sm primary" onClick={onRename}>
              Renombrar → {item.suggested}
            </button>
            <button className="btn sm ghost" onClick={onDismiss}>
              Cancelar
            </button>
          </div>
        )}
      </div>
      <div className={`up-status ${status === "done" ? "done" : status === "error" ? "err" : ""}`}>
        {status === "done" ? (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <Icons.Check size={14} /> OK
          </span>
        ) : status === "error" ? (
          "ERR"
        ) : status === "uploading" ? (
          `${pct}%`
        ) : status === "conflict" ? (
          "!"
        ) : (
          "…"
        )}
        {(status === "done" || status === "error") && (
          <button
            className="iconbtn"
            onClick={onDismiss}
            style={{
              width: 24,
              height: 24,
              marginLeft: 8,
              display: "inline-grid",
              verticalAlign: "middle",
            }}
            aria-label="Descartar"
          >
            <Icons.Close size={12} />
          </button>
        )}
      </div>
    </div>
  );
}
