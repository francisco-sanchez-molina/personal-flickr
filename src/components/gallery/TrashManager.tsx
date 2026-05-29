/**
 * Trash view (PF-214). Lists soft-deleted photos with restore + permanent-
 * delete per row, plus an "empty trash" action. Photos here are hidden from
 * every browsing surface but their files/memberships/shares survive until
 * purged, so restore is lossless.
 */
import { useState } from "react";
import { thumbUrl } from "~/lib/photo";
import { Icons } from "../icons";
import Button from "../ui/Button";
import { useConfirm } from "../ui/ConfirmDialog";
import EmptyState from "../ui/EmptyState";
import ErrorText from "../ui/ErrorText";
import IconButton from "../ui/IconButton";

export interface TrashRow {
  id: number;
  name: string;
  kind: "photo" | "video";
  developed_at: number;
  deleted_at: number | null;
}

function relativeFromNow(ms: number): string {
  const diff = Date.now() - ms;
  if (diff < 3_600_000) return `hace ${Math.max(1, Math.floor(diff / 60_000))} min`;
  if (diff < 86_400_000) return `hace ${Math.floor(diff / 3_600_000)} h`;
  const days = Math.floor(diff / 86_400_000);
  if (days < 30) return `hace ${days} d`;
  return `hace ${Math.floor(days / 30)} mes(es)`;
}

export default function TrashManager({ initial }: { initial: TrashRow[] }) {
  const [rows, setRows] = useState<TrashRow[]>(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const confirm = useConfirm();

  const restore = async (row: TrashRow) => {
    setError(null);
    try {
      const res = await fetch(`/api/photos/${row.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "restore" }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "error");
      setRows((arr) => arr.filter((r) => r.id !== row.id));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const purge = async (row: TrashRow) => {
    const ok = await confirm({
      title: `¿Borrar "${row.name}" para siempre?`,
      description: "Se elimina el archivo del disco. Esto no se puede deshacer.",
      confirmLabel: "Borrar definitivamente",
      destructive: true,
    });
    if (!ok) return;
    setError(null);
    try {
      const res = await fetch(`/api/photos/${row.id}?purge=1`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "error");
      setRows((arr) => arr.filter((r) => r.id !== row.id));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const emptyTrash = async () => {
    const ok = await confirm({
      title: `¿Vaciar la papelera (${rows.length})?`,
      description:
        "Se borran del disco todas las fotos de la papelera. Esto no se puede deshacer.",
      confirmLabel: "Vaciar papelera",
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/trash", { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "error");
      setRows([]);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (rows.length === 0) {
    return (
      <EmptyState
        title="La papelera está vacía."
        sub="Las fotos que envíes a la papelera aparecerán aquí y podrás restaurarlas."
      />
    );
  }

  return (
    <>
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="font-mono text-[11px] tracking-[.04em] text-ink-3 uppercase">
          {rows.length} en la papelera
        </span>
        <Button variant="danger" size="sm" onClick={emptyTrash} loading={busy}>
          <Icons.Trash size={13} /> Vaciar papelera
        </Button>
      </div>

      <div className="grid gap-2">
        {rows.map((row) => (
          <div
            key={row.id}
            className="flex items-center gap-3 rounded-md border border-line bg-bg-2 px-3 py-2.5"
          >
            <div className="h-14 w-14 shrink-0 overflow-hidden rounded border border-line bg-bg-3 opacity-70">
              <img
                src={thumbUrl({ name: row.name, developed_at: row.developed_at })}
                alt=""
                className="h-full w-full object-cover"
                loading="lazy"
              />
            </div>
            <div className="min-w-0 flex-1">
              <div className="serif overflow-hidden text-[15px] text-ellipsis whitespace-nowrap text-ink">
                {row.name}
                {row.kind === "video" && (
                  <span className="ml-2 align-middle font-mono text-[10px] tracking-[.08em] text-ink-3 uppercase">
                    vídeo
                  </span>
                )}
              </div>
              {row.deleted_at != null && (
                <div className="mt-0.5 font-mono text-[10.5px] tracking-[.04em] text-ink-3">
                  borrada {relativeFromNow(row.deleted_at)}
                </div>
              )}
            </div>
            <Button size="sm" onClick={() => restore(row)}>
              <Icons.Reset size={13} /> Restaurar
            </Button>
            <IconButton
              onClick={() => purge(row)}
              aria-label="Borrar definitivamente"
              title="Borrar definitivamente"
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
