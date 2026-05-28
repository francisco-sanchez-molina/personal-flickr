/**
 * Cross-photo shares list (used by `/?view=shares`).
 *
 * Each row is one active share token: thumbnail of its photo + the
 * public URL, with the running view counter and copy/revoke actions.
 * Newest first.
 */
import { useState } from "react";
import { thumbUrl } from "~/lib/photo";
import { Icons } from "../icons";
import { useConfirm } from "../ui/ConfirmDialog";
import EmptyState from "../ui/EmptyState";
import ErrorText from "../ui/ErrorText";
import IconButton from "../ui/IconButton";

export interface ShareRow {
  token: string;
  photo_id: number;
  created_at: number;
  view_count: number;
  last_viewed_at: number | null;
  photo_name: string;
  photo_kind: "photo" | "video";
  photo_developed_at: number;
}

function shareUrlFor(token: string): string {
  if (typeof window === "undefined") return `/s/${token}`;
  return `${window.location.origin}/s/${token}`;
}

function fmtDate(ms: number): string {
  return new Date(ms).toLocaleString("es-ES", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function relativeFromNow(ms: number): string {
  const diff = Date.now() - ms;
  if (diff < 60_000) return "ahora";
  if (diff < 3_600_000) return `hace ${Math.floor(diff / 60_000)} min`;
  if (diff < 86_400_000) return `hace ${Math.floor(diff / 3_600_000)} h`;
  const days = Math.floor(diff / 86_400_000);
  if (days < 30) return `hace ${days} d`;
  const months = Math.floor(days / 30);
  if (months < 12) return `hace ${months} mes${months === 1 ? "" : "es"}`;
  return `hace ${Math.floor(days / 365)} año(s)`;
}

export default function SharesManager({ initial }: { initial: ShareRow[] }) {
  const [rows, setRows] = useState<ShareRow[]>(initial);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const confirm = useConfirm();

  const totalViews = rows.reduce((n, r) => n + r.view_count, 0);

  const copy = async (token: string) => {
    try {
      await copyToClipboard(shareUrlFor(token));
      setCopied(token);
      setTimeout(() => setCopied(null), 1800);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const revoke = async (row: ShareRow) => {
    const ok = await confirm({
      title: "¿Revocar este enlace?",
      description: `"${row.photo_name}" dejará de ser accesible sin login.`,
      confirmLabel: "Revocar",
      destructive: true,
    });
    if (!ok) return;
    setError(null);
    try {
      const res = await fetch(`/api/shares/${row.token}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail ?? body.error ?? "error");
      }
      setRows((arr) => arr.filter((s) => s.token !== row.token));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  if (rows.length === 0) {
    return (
      <EmptyState
        title="Aún no hay enlaces compartidos."
        sub='Abre una foto y pulsa "Compartir" para crear el primero.'
      />
    );
  }

  return (
    <>
      <div className="mb-3 font-mono text-[11px] tracking-[.04em] text-ink-3 uppercase">
        {rows.length} enlace{rows.length === 1 ? "" : "s"} · {totalViews} vista
        {totalViews === 1 ? "" : "s"} en total
      </div>

      <div className="grid gap-2">
        {rows.map((row) => (
          <div
            key={row.token}
            className="flex items-center gap-3 rounded-md border border-line bg-bg-2 px-3 py-2.5"
          >
            <a
              href={`/s/${row.token}`}
              target="_blank"
              rel="noopener noreferrer"
              className="block h-14 w-14 shrink-0 overflow-hidden rounded border border-line bg-bg-3"
              aria-label={`Abrir ${row.photo_name}`}
              title="Abrir vista pública"
            >
              <img
                src={thumbUrl({
                  name: row.photo_name,
                  developed_at: row.photo_developed_at,
                })}
                alt=""
                className="h-full w-full object-cover"
                loading="lazy"
              />
            </a>

            <div className="min-w-0 flex-1">
              <div className="serif overflow-hidden text-[15px] text-ellipsis whitespace-nowrap text-ink">
                {row.photo_name}
                {row.photo_kind === "video" && (
                  <span className="ml-2 align-middle font-mono text-[10px] tracking-[.08em] text-ink-3 uppercase">
                    vídeo
                  </span>
                )}
              </div>
              <div className="mt-0.5 overflow-hidden font-mono text-[11.5px] tracking-[.02em] text-ellipsis whitespace-nowrap text-ink-3">
                {shareUrlFor(row.token)}
              </div>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-[10.5px] tracking-[.04em] text-ink-3">
                <span>creado {relativeFromNow(row.created_at)}</span>
                <span>
                  <span className="text-ink-2">{row.view_count}</span>{" "}
                  vista{row.view_count === 1 ? "" : "s"}
                </span>
                {row.last_viewed_at != null && (
                  <span title={fmtDate(row.last_viewed_at)}>
                    última {relativeFromNow(row.last_viewed_at)}
                  </span>
                )}
              </div>
            </div>

            <IconButton
              onClick={() => copy(row.token)}
              aria-label="Copiar URL"
              title={copied === row.token ? "Copiado ✓" : "Copiar"}
            >
              {copied === row.token ? (
                <Icons.Check size={14} />
              ) : (
                <Icons.Copy size={14} />
              )}
            </IconButton>
            <IconButton
              onClick={() => revoke(row)}
              aria-label="Revocar enlace"
              title="Revocar"
            >
              <Icons.Trash size={14} />
            </IconButton>
          </div>
        ))}
      </div>

      <ErrorText message={error} className="mt-3" />
    </>
  );
}

async function copyToClipboard(text: string): Promise<void> {
  if (
    typeof navigator !== "undefined" &&
    navigator.clipboard?.writeText &&
    window.isSecureContext
  ) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.style.position = "fixed";
  ta.style.top = "-1000px";
  document.body.appendChild(ta);
  ta.select();
  try {
    // execCommand is deprecated but the only path that works on
    // non-secure origins (plain http LAN). See ShareDialog for the
    // matching note.
    document.execCommand("copy");
  } finally {
    document.body.removeChild(ta);
  }
}
