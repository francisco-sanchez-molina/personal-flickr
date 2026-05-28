import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icons } from "../icons";
import ErrorText from "../ui/ErrorText";

interface UploadedPhoto {
  id: number;
  name: string;
  width: number;
  height: number;
  size_bytes: number;
}

type QueueStatus =
  | "checking"
  | "pending"
  | "uploading"
  | "retrying"
  | "conflict"
  | "duplicate"
  | "done"
  | "error";

interface QueueItem {
  id: string;
  file: File;
  status: QueueStatus;
  finalName?: string;
  suggested?: string | null;
  /** Existing-photo filename returned by the server when we hit a hash match. */
  duplicateOf?: string;
  /** 0–1, bytes uploaded over total bytes (for this item). */
  progress?: number;
  /** Bytes already accepted by the server during the active upload. */
  uploadedBytes?: number;
  /** How many times this item has been retried (max 3). */
  retries?: number;
  /** Seconds until the next retry fires. Decrements as the timer runs. */
  retryIn?: number;
  error?: string;
}

const MAX_RETRIES = 3;
/** Backoff window in ms for retry N (0-indexed). 1s, 2s, 4s. */
const RETRY_DELAYS_MS = [1_000, 2_000, 4_000];

// ──────────────── formatting helpers ────────────────

function fmtSize(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

function fmtDuration(secs: number): string {
  if (!Number.isFinite(secs) || secs <= 0) return "—";
  if (secs < 60) return `${Math.ceil(secs)} s`;
  const m = Math.floor(secs / 60);
  const s = Math.ceil(secs - m * 60);
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}

function uid(): string {
  return Math.random().toString(36).slice(2);
}

// ──────────────── folder drop (US-06) ────────────────

/**
 * Web standard for "drop a folder": each DataTransferItem can be inspected
 * via `webkitGetAsEntry()` which returns a `FileSystemEntry` we walk
 * recursively. Despite the prefix it's supported by every modern browser.
 *
 * We collect ALL files under the dropped tree and let the caller filter
 * by mime — easier than trying to predict acceptable extensions here.
 */
async function filesFromDataTransfer(dt: DataTransfer): Promise<File[]> {
  // If the browser didn't expose `items` with entries (e.g. drag from a
  // weird source), fall back to plain `dt.files`. Folders won't expand
  // in that case, but at least file drops still work.
  if (!dt.items || dt.items.length === 0) return Array.from(dt.files);
  const entries: FileSystemEntry[] = [];
  for (const item of Array.from(dt.items)) {
    const entry =
      typeof item.webkitGetAsEntry === "function"
        ? item.webkitGetAsEntry()
        : null;
    if (entry) entries.push(entry);
  }
  if (entries.length === 0) return Array.from(dt.files);

  const out: File[] = [];
  const walk = async (entry: FileSystemEntry): Promise<void> => {
    if (entry.isFile) {
      const file = await new Promise<File | null>((resolve) =>
        (entry as FileSystemFileEntry).file(
          (f) => resolve(f),
          () => resolve(null),
        ),
      );
      if (file) out.push(file);
      return;
    }
    if (entry.isDirectory) {
      const reader = (entry as FileSystemDirectoryEntry).createReader();
      // readEntries() returns batches; keep calling until empty.
      while (true) {
        const batch = await new Promise<FileSystemEntry[]>((resolve) =>
          reader.readEntries(
            (es) => resolve(es),
            () => resolve([]),
          ),
        );
        if (batch.length === 0) break;
        for (const child of batch) await walk(child);
      }
    }
  };
  await Promise.all(entries.map(walk));
  return out;
}

// ──────────────── component ────────────────

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
  const [globalError, setGlobalError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // When the first byte starts moving, snapshot the timestamp + the total
  // bytes-to-upload. The aggregate ETA derives from this rolling sample —
  // less accurate than a sliding window but stable enough for the UI.
  const sessionStartRef = useRef<{ ts: number; totalBytes: number } | null>(null);

  const update = useCallback((id: string, patch: Partial<QueueItem>) => {
    setQueue((q) => q.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }, []);

  // ──────────────── upload (with retry) ────────────────

  /**
   * One upload attempt. On network failure or 5xx, schedules a retry up to
   * MAX_RETRIES times with exponential backoff. 4xx responses are terminal
   * (the server won't change its mind about a malformed request).
   */
  const doUpload = useCallback(
    async (
      item: QueueItem,
      decision: "create" | "replace" | "rename",
      finalName?: string,
      opts: { acknowledgeDuplicate?: boolean; retry?: number } = {},
    ): Promise<void> => {
      const attempt = opts.retry ?? 0;
      update(item.id, {
        status: "uploading",
        progress: 0,
        uploadedBytes: 0,
        retries: attempt,
        retryIn: undefined,
        error: undefined,
      });

      const fd = new FormData();
      fd.append("file", item.file);
      fd.append("decision", decision);
      if (finalName) fd.append("finalName", finalName);
      if (opts.acknowledgeDuplicate) fd.append("acknowledgeDuplicate", "true");

      try {
        const res = await new Promise<{
          ok: boolean;
          status: number;
          body: {
            error?: string;
            detail?: string;
            finalName?: string;
            suggested?: string;
            duplicateOf?: string;
            photo?: UploadedPhoto;
          };
        }>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open("POST", "/api/upload");
          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
              update(item.id, {
                progress: e.loaded / e.total,
                uploadedBytes: e.loaded,
              });
            }
          };
          xhr.onerror = () => reject(new Error("network"));
          xhr.ontimeout = () => reject(new Error("timeout"));
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
          update(item.id, {
            status: "done",
            progress: 1,
            uploadedBytes: item.file.size,
          });
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
          return;
        }

        if (res.status === 409 && res.body?.error === "name_conflict") {
          update(item.id, {
            status: "conflict",
            finalName: res.body.finalName,
            suggested: res.body.suggested,
          });
          return;
        }

        if (res.status === 409 && res.body?.error === "duplicate_content") {
          update(item.id, {
            status: "duplicate",
            duplicateOf: res.body.duplicateOf,
          });
          return;
        }

        // Retry on 5xx — likely transient server problem (overload,
        // ffmpeg lock, etc). 4xx is terminal: the request itself is bad.
        if (res.status >= 500 && attempt < MAX_RETRIES) {
          scheduleRetry(item, decision, finalName, attempt, opts);
          return;
        }

        update(item.id, {
          status: "error",
          error: res.body?.detail ?? res.body?.error ?? "error",
        });
      } catch (e: unknown) {
        // Network blip / timeout / aborted — retriable.
        if (attempt < MAX_RETRIES) {
          scheduleRetry(item, decision, finalName, attempt, opts);
          return;
        }
        update(item.id, {
          status: "error",
          error: e instanceof Error ? e.message : String(e),
        });
      }
    },
    [update, defaultGalleryId],
  );

  /**
   * Set status to `retrying` with a countdown so the user sees something
   * is happening. The countdown decrements every second and triggers the
   * next attempt when it hits zero — keeps the UX honest about the wait.
   */
  const scheduleRetry = useCallback(
    (
      item: QueueItem,
      decision: "create" | "replace" | "rename",
      finalName: string | undefined,
      lastAttempt: number,
      opts: { acknowledgeDuplicate?: boolean } = {},
    ) => {
      const delay = RETRY_DELAYS_MS[lastAttempt] ?? 4_000;
      const next = lastAttempt + 1;
      const startedAt = Date.now();
      update(item.id, {
        status: "retrying",
        retries: next,
        retryIn: Math.ceil(delay / 1000),
      });
      const tick = window.setInterval(() => {
        const remaining = delay - (Date.now() - startedAt);
        if (remaining <= 0) {
          window.clearInterval(tick);
          doUpload(item, decision, finalName, { ...opts, retry: next });
          return;
        }
        update(item.id, { retryIn: Math.ceil(remaining / 1000) });
      }, 1_000);
    },
    [update, doUpload],
  );

  // ──────────────── enqueue & user actions ────────────────

  const enqueue = useCallback(
    async (files: File[]) => {
      setGlobalError(null);
      if (files.length === 0) return;
      // Start (or restart) the session timer the moment we accept files —
      // gives us a stable reference for ETA.
      sessionStartRef.current = {
        ts: Date.now(),
        totalBytes: files.reduce((s, f) => s + f.size, 0),
      };

      const items: QueueItem[] = files.map((f) => ({
        id: uid(),
        file: f,
        status: "checking",
        progress: 0,
        uploadedBytes: 0,
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

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    try {
      const fs = await filesFromDataTransfer(e.dataTransfer);
      // Filter out anything the input wouldn't accept on its own — keeps
      // a "drop a Downloads/ folder full of mixed files" from spamming
      // the queue with random PDFs.
      const valid = fs.filter((f) => isAcceptableFile(f));
      if (valid.length === 0) {
        setGlobalError("No se encontraron fotos o vídeos en lo que has soltado.");
        return;
      }
      enqueue(valid);
    } catch (err) {
      setGlobalError(err instanceof Error ? err.message : String(err));
    }
  };

  const dismiss = (id: string) =>
    setQueue((q) => q.filter((it) => it.id !== id));

  const clearDone = () =>
    setQueue((q) => q.filter((it) => it.status !== "done"));

  // ──────────────── aggregate stats (US-01) ────────────────

  const stats = useMemo(() => {
    const total = queue.length;
    const done = queue.filter((q) => q.status === "done").length;
    const failed = queue.filter((q) => q.status === "error").length;
    const inFlight = queue.filter(
      (q) =>
        q.status === "uploading" ||
        q.status === "pending" ||
        q.status === "retrying" ||
        q.status === "checking",
    ).length;

    const totalBytes = queue.reduce((s, q) => s + q.file.size, 0);
    const uploadedBytes = queue.reduce((s, q) => {
      if (q.status === "done") return s + q.file.size;
      if (q.uploadedBytes != null) return s + q.uploadedBytes;
      return s;
    }, 0);

    let etaSecs: number | null = null;
    if (
      sessionStartRef.current &&
      inFlight > 0 &&
      uploadedBytes > 0 &&
      uploadedBytes < totalBytes
    ) {
      const elapsed = (Date.now() - sessionStartRef.current.ts) / 1000;
      if (elapsed > 0.5) {
        const rate = uploadedBytes / elapsed; // bytes / sec
        if (rate > 0) {
          etaSecs = (totalBytes - uploadedBytes) / rate;
        }
      }
    }

    return { total, done, failed, inFlight, totalBytes, uploadedBytes, etaSecs };
  }, [queue]);

  const showStats =
    queue.length > 0 && (stats.inFlight > 0 || stats.done > 0 || stats.failed > 0);

  // Force a re-render every second while uploads are in flight so the ETA
  // counter ticks. cheaper than a per-item interval; bails out when idle.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (stats.inFlight === 0) return;
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [stats.inFlight]);

  return (
    <div className="grid gap-3.5">
      {defaultGalleryId != null && defaultGalleryName && (
        <div
          className="rounded-[10px] px-3.5 py-2.5 text-[13px] text-ink"
          style={{
            border: "1px solid color-mix(in srgb, var(--accent) 30%, var(--line))",
            background: "color-mix(in srgb, var(--accent) 6%, transparent)",
          }}
        >
          <span className="mr-1.5 text-accent">→</span>
          Las fotos se añadirán a{" "}
          <strong className="font-semibold">{defaultGalleryName}</strong>
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
        <div className="big serif">Arrastra fotos, vídeos o una carpeta</div>
        <div className="sub">
          o haz click para seleccionar · JPEG / PNG / HEIC / RAW · MP4 / MOV
        </div>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="image/*,video/*,.heic,.HEIC,.heif,.HEIF,.cr2,.CR2,.cr3,.CR3,.nef,.NEF,.arw,.ARW,.dng,.DNG,.raf,.RAF,.orf,.ORF,.rw2,.RW2,.mp4,.MP4,.mov,.MOV,.m4v,.M4V,.webm,.WEBM,.mkv,.MKV"
          className="hidden"
          onChange={onPick}
        />
      </div>

      <ErrorText message={globalError} />

      {showStats && <AggregateBar stats={stats} onClearDone={clearDone} />}

      {queue.length > 0 && (
        <div className="up-list">
          {queue.map((it) => (
            <QueueRow
              key={it.id}
              item={it}
              onReplace={() => doUpload(it, "replace", it.finalName)}
              onRename={() => doUpload(it, "rename", it.suggested ?? undefined)}
              onForceDuplicate={() =>
                doUpload(it, "create", it.finalName, {
                  acknowledgeDuplicate: true,
                })
              }
              onDismiss={() => dismiss(it.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ──────────────── aggregate progress bar ────────────────

function AggregateBar({
  stats,
  onClearDone,
}: {
  stats: {
    total: number;
    done: number;
    failed: number;
    inFlight: number;
    totalBytes: number;
    uploadedBytes: number;
    etaSecs: number | null;
  };
  onClearDone: () => void;
}) {
  const pct =
    stats.totalBytes > 0
      ? Math.round((stats.uploadedBytes / stats.totalBytes) * 100)
      : 0;
  const isComplete = stats.inFlight === 0 && stats.done > 0;
  return (
    <div className="rounded-[10px] border border-line bg-bg-2 px-3.5 py-3">
      <div className="flex items-center justify-between gap-3 text-[12.5px] text-ink-2">
        <div className="font-mono tracking-[.02em]">
          <strong className="font-ui text-[13px] text-ink">
            {stats.done}/{stats.total}
          </strong>{" "}
          <span className="text-ink-3">
            · {fmtSize(stats.uploadedBytes)} / {fmtSize(stats.totalBytes)}
          </span>
          {stats.failed > 0 && (
            <span className="ml-2 text-danger">· {stats.failed} con error</span>
          )}
        </div>
        <div className="font-mono text-[11.5px] tracking-[.04em] text-ink-3">
          {stats.inFlight > 0 && stats.etaSecs != null ? (
            <>queda {fmtDuration(stats.etaSecs)}</>
          ) : isComplete ? (
            <button
              className="btn ghost sm"
              onClick={onClearDone}
              type="button"
            >
              Limpiar terminadas
            </button>
          ) : (
            <>·</>
          )}
        </div>
      </div>
      <div className="progress mt-2">
        <span style={{ width: `${Math.max(2, pct)}%` }} />
      </div>
    </div>
  );
}

// ──────────────── per-item row ────────────────

function QueueRow({
  item,
  onReplace,
  onRename,
  onForceDuplicate,
  onDismiss,
}: {
  item: QueueItem;
  onReplace: () => void;
  onRename: () => void;
  onForceDuplicate: () => void;
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
          {status === "retrying" && (
            <>
              reintentando ({item.retries}/{MAX_RETRIES}) en {item.retryIn ?? 0}s
            </>
          )}
          {status === "conflict" && (
            <>
              ya existe{" "}
              <code className="rounded bg-bg-3 px-1.5 py-px">
                {item.finalName}
              </code>
            </>
          )}
          {status === "duplicate" && (
            <>
              foto idéntica a{" "}
              <code className="rounded bg-bg-3 px-1.5 py-px">
                {item.duplicateOf}
              </code>
            </>
          )}
          {status === "done" && "listo"}
          {status === "error" && `error: ${item.error}`}
        </div>
        {(status === "uploading" || status === "checking" || status === "retrying") && (
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
        {status === "duplicate" && (
          <div className="up-conflict">
            <button className="btn sm primary" onClick={onForceDuplicate}>
              Subir igualmente
            </button>
            <button className="btn sm ghost" onClick={onDismiss}>
              Cancelar
            </button>
          </div>
        )}
      </div>
      <div
        className={`up-status ${status === "done" ? "done" : status === "error" ? "err" : ""}`}
      >
        {status === "done" ? (
          <span className="inline-flex items-center gap-1.5">
            <Icons.Check size={14} /> OK
          </span>
        ) : status === "error" ? (
          "ERR"
        ) : status === "uploading" ? (
          `${pct}%`
        ) : status === "retrying" ? (
          `↻ ${item.retryIn ?? 0}s`
        ) : status === "conflict" || status === "duplicate" ? (
          "!"
        ) : (
          "…"
        )}
        {(status === "done" || status === "error") && (
          <button
            className="iconbtn ml-2 inline-grid h-6 w-6 align-middle"
            onClick={onDismiss}
            aria-label="Descartar"
          >
            <Icons.Close size={12} />
          </button>
        )}
      </div>
    </div>
  );
}

// ──────────────── helpers ────────────────

/**
 * Accept anything that looks like an image or video by MIME OR by extension.
 * MIME alone misses HEIC sometimes (browsers don't always set it). Extension
 * alone misses HEICs the OS happens to type as image/heic.
 */
function isAcceptableFile(f: File): boolean {
  if (f.type && (f.type.startsWith("image/") || f.type.startsWith("video/"))) {
    return true;
  }
  const ext = f.name.toLowerCase().match(/\.[a-z0-9]+$/)?.[0] ?? "";
  const RAW_EXTS = [".cr2", ".cr3", ".nef", ".arw", ".dng", ".raf", ".orf", ".rw2"];
  const HEIC_EXTS = [".heic", ".heif"];
  const VIDEO_EXTS = [".mp4", ".mov", ".m4v", ".webm", ".mkv"];
  return [...RAW_EXTS, ...HEIC_EXTS, ...VIDEO_EXTS].includes(ext);
}
