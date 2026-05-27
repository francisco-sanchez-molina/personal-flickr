import { useCallback, useRef, useState } from "react";

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
  status: "pending" | "checking" | "conflict" | "uploading" | "done" | "error";
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

export default function Uploader() {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const update = useCallback((id: string, patch: Partial<QueueItem>) => {
    setQueue((q) => q.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }, []);

  const doUpload = useCallback(
    async (item: QueueItem, decision: "create" | "replace" | "rename", finalName?: string) => {
      update(item.id, { status: "uploading", progress: 0 });
      const fd = new FormData();
      fd.append("file", item.file);
      fd.append("decision", decision);
      if (finalName) fd.append("finalName", finalName);

      try {
        const res = await new Promise<{ ok: boolean; status: number; body: any }>(
          (resolve, reject) => {
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
                resolve({ ok: false, status: xhr.status, body: { error: "bad response" } });
              }
            };
            xhr.send(fd);
          },
        );

        if (res.ok) {
          update(item.id, { status: "done", progress: 1 });
          window.dispatchEvent(
            new CustomEvent<UploadedPhoto>("photo:added", { detail: res.body.photo }),
          );
        } else if (res.status === 409 && res.body?.error === "name_conflict") {
          update(item.id, {
            status: "conflict",
            finalName: res.body.finalName,
            suggested: res.body.suggested,
          });
        } else {
          update(item.id, { status: "error", error: res.body?.detail ?? res.body?.error ?? "error" });
        }
      } catch (e: any) {
        update(item.id, { status: "error", error: String(e?.message ?? e) });
      }
    },
    [update],
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
        } catch (e: any) {
          update(item.id, { status: "error", error: String(e?.message ?? e) });
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
    <section className="space-y-4">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={[
          "flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition",
          dragOver
            ? "border-pink-400 bg-pink-500/5"
            : "border-neutral-800 bg-neutral-900/40 hover:border-neutral-700 hover:bg-neutral-900/60",
        ].join(" ")}
      >
        <p className="text-lg font-medium">Arrastra fotos aquí</p>
        <p className="mt-1 text-sm text-neutral-400">
          o haz click para seleccionar · JPEG / PNG / HEIC / CR2 / CR3
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="image/*,.cr2,.CR2,.cr3,.CR3,.nef,.NEF,.arw,.ARW,.dng,.DNG,.raf,.RAF,.orf,.ORF,.rw2,.RW2"
          className="hidden"
          onChange={onPick}
        />
      </div>

      {queue.length > 0 && (
        <ul className="space-y-2">
          {queue.map((it) => (
            <QueueRow
              key={it.id}
              item={it}
              onReplace={() => doUpload(it, "replace", it.finalName)}
              onRename={() => doUpload(it, "rename", it.suggested ?? undefined)}
              onCancel={() => dismiss(it.id)}
              onDismiss={() => dismiss(it.id)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function QueueRow({
  item,
  onReplace,
  onRename,
  onCancel,
  onDismiss,
}: {
  item: QueueItem;
  onReplace: () => void;
  onRename: () => void;
  onCancel: () => void;
  onDismiss: () => void;
}) {
  return (
    <li className="rounded-lg border border-neutral-800 bg-neutral-900/40 px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{item.file.name}</div>
          <div className="text-xs text-neutral-400">
            {fmtSize(item.file.size)} · {statusLabel(item)}
          </div>
        </div>
        {item.status === "done" && (
          <button
            className="text-xs text-neutral-500 hover:text-neutral-200"
            onClick={onDismiss}
          >
            ✕
          </button>
        )}
        {item.status === "error" && (
          <button
            className="text-xs text-neutral-500 hover:text-neutral-200"
            onClick={onDismiss}
          >
            ✕
          </button>
        )}
      </div>

      {(item.status === "checking" ||
        item.status === "pending" ||
        item.status === "uploading") && (
        <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-neutral-800">
          <div
            className="h-full bg-pink-500 transition-all"
            style={{
              width: `${Math.max(5, Math.round((item.progress ?? 0) * 100))}%`,
              opacity: item.status === "uploading" ? 1 : 0.5,
            }}
          />
        </div>
      )}

      {item.status === "conflict" && (
        <div className="mt-3 rounded-md border border-amber-700/40 bg-amber-500/5 p-3">
          <p className="text-sm">
            Ya existe <code className="rounded bg-neutral-800 px-1">{item.finalName}</code>. ¿Qué hacemos?
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              onClick={onReplace}
              className="rounded-md bg-amber-500 px-3 py-1 text-sm font-medium text-neutral-950 hover:bg-amber-400"
            >
              Reemplazar
            </button>
            <button
              onClick={onRename}
              className="rounded-md bg-pink-500 px-3 py-1 text-sm font-medium text-white hover:bg-pink-600"
            >
              Renombrar → {item.suggested}
            </button>
            <button
              onClick={onCancel}
              className="rounded-md border border-neutral-700 px-3 py-1 text-sm text-neutral-300 hover:bg-neutral-800"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {item.status === "error" && (
        <p className="mt-2 text-sm text-red-400">Error: {item.error}</p>
      )}
    </li>
  );
}

function statusLabel(it: QueueItem): string {
  switch (it.status) {
    case "checking":
      return "comprobando nombre…";
    case "pending":
      return "en cola";
    case "uploading":
      return `subiendo ${Math.round((it.progress ?? 0) * 100)}%`;
    case "conflict":
      return "colisión de nombre";
    case "done":
      return "✓ subida";
    case "error":
      return "error";
  }
}
