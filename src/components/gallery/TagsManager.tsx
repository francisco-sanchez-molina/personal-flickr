/**
 * Tags index with per-chip rename / merge / delete actions.
 *
 * Each tag is a clickable chip (links to its photos as before), plus a
 * "···" button that opens a popover with the admin actions. Mutations
 * are optimistic when safe; we re-fetch the full list after a merge or
 * delete since they can affect multiple rows / counts.
 */
import { useState } from "react";
import { Icons } from "../icons";
import { useConfirm } from "../ui/ConfirmDialog";
import ErrorText from "../ui/ErrorText";
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "../ui/Popover";

interface Tag {
  id: number;
  name: string;
  photo_count: number;
}

export default function TagsManager({ initial }: { initial: Tag[] }) {
  const [tags, setTags] = useState<Tag[]>(initial);
  const [error, setError] = useState<string | null>(null);
  const confirm = useConfirm();

  // Refresh from the server — used after merge/delete since those can
  // affect rows beyond the one acted on (counts change, source tag gone).
  const refresh = async () => {
    try {
      const res = await fetch("/api/tags");
      const body = await res.json();
      if (res.ok) setTags(body.tags ?? []);
    } catch {
      /* keep current view */
    }
  };

  const rename = async (id: number, newName: string) => {
    setError(null);
    try {
      const res = await fetch(`/api/tags/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: newName }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.detail ?? body.error ?? "error");
      setTags((arr) =>
        arr.map((t) => (t.id === id ? { ...t, name: body.tag.name } : t)),
      );
      return true;
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    }
  };

  const merge = async (fromId: number, intoId: number) => {
    setError(null);
    try {
      const res = await fetch(`/api/tags/${fromId}/merge`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ intoId }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.detail ?? body.error ?? "error");
      await refresh();
      return true;
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    }
  };

  const remove = async (tag: Tag) => {
    const ok = await confirm({
      title: `¿Borrar la etiqueta "${tag.name}"?`,
      description: `Se desetiquetan ${tag.photo_count} foto${tag.photo_count === 1 ? "" : "s"}. Las fotos no se eliminan.`,
      confirmLabel: "Borrar",
      destructive: true,
    });
    if (!ok) return;
    setError(null);
    try {
      const res = await fetch(`/api/tags/${tag.id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail ?? body.error ?? "error");
      }
      await refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  if (tags.length === 0) return null;

  return (
    <>
      <div className="chips max-w-[900px] gap-1.5">
        {tags.map((t) => (
          <TagChip
            key={t.id}
            tag={t}
            otherTags={tags.filter((o) => o.id !== t.id)}
            onRename={(newName) => rename(t.id, newName)}
            onMerge={(intoId) => merge(t.id, intoId)}
            onDelete={() => remove(t)}
          />
        ))}
      </div>
      <ErrorText message={error} className="mt-3" />
    </>
  );
}

// ──────────────── per-tag chip with admin popover ────────────────

function TagChip({
  tag,
  otherTags,
  onRename,
  onMerge,
  onDelete,
}: {
  tag: Tag;
  otherTags: Tag[];
  onRename: (newName: string) => Promise<boolean>;
  onMerge: (intoId: number) => Promise<boolean>;
  onDelete: () => void;
}) {
  // The popover hosts three sub-modes: idle (action list), renaming
  // (inline input), merging (list of other tags). Keeping it all
  // inside one popover keeps the page tidy — no extra dialogs.
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"idle" | "rename" | "merge">("idle");
  const [draft, setDraft] = useState(tag.name);

  const close = () => {
    setOpen(false);
    setMode("idle");
    setDraft(tag.name);
  };

  return (
    <span className="inline-flex items-center gap-px">
      <a
        href={`/?view=tags&tag=${encodeURIComponent(tag.name)}`}
        className="chip"
      >
        {tag.name}{" "}
        <span className="ml-1 opacity-55">{tag.photo_count}</span>
      </a>
      <Popover open={open} onOpenChange={(o) => (o ? setOpen(true) : close())}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="iconbtn h-[26px] w-[22px]"
            aria-label={`Acciones para ${tag.name}`}
            title="Acciones"
          >
            <Icons.More size={13} />
          </button>
        </PopoverTrigger>
        <PopoverContent side="bottom" align="end" className="w-[260px]">
          <PopoverHeader>
            <PopoverTitle>{tag.name}</PopoverTitle>
          </PopoverHeader>

          {mode === "idle" && (
            <div className="grid gap-1 py-1">
              <button
                className="row-check cursor-pointer text-left"
                onClick={() => setMode("rename")}
              >
                <Icons.Sliders size={13} />
                <span className="flex-1">Renombrar</span>
              </button>
              <button
                className="row-check cursor-pointer text-left"
                onClick={() => setMode("merge")}
                disabled={otherTags.length === 0}
              >
                <Icons.Folder size={13} />
                <span className="flex-1">Fusionar con…</span>
              </button>
              <button
                className="row-check cursor-pointer text-left text-danger"
                onClick={() => {
                  close();
                  onDelete();
                }}
              >
                <Icons.Trash size={13} />
                <span className="flex-1">Borrar</span>
              </button>
            </div>
          )}

          {mode === "rename" && (
            <form
              className="grid gap-2"
              onSubmit={async (e) => {
                e.preventDefault();
                const next = draft.trim();
                if (!next || next === tag.name) {
                  close();
                  return;
                }
                const ok = await onRename(next);
                if (ok) close();
              }}
            >
              <div className="search px-2 py-1">
                <input
                  autoFocus
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  maxLength={40}
                  placeholder="Nuevo nombre"
                />
              </div>
              <div className="flex gap-1.5">
                <button type="submit" className="btn primary sm">
                  Guardar
                </button>
                <button
                  type="button"
                  className="btn ghost sm"
                  onClick={() => setMode("idle")}
                >
                  Atrás
                </button>
              </div>
            </form>
          )}

          {mode === "merge" && (
            <div className="grid gap-1.5">
              <p className="m-0 font-mono text-[11px] tracking-[.04em] text-ink-3">
                Mover {tag.photo_count} foto
                {tag.photo_count === 1 ? "" : "s"} a:
              </p>
              <div className="-mx-1 max-h-[200px] overflow-y-auto">
                {otherTags.map((o) => (
                  <button
                    key={o.id}
                    className="row-check cursor-pointer text-left"
                    onClick={async () => {
                      const ok = await onMerge(o.id);
                      if (ok) close();
                    }}
                  >
                    <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap">
                      {o.name}
                    </span>
                    <span className="opacity-55">{o.photo_count}</span>
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="btn ghost sm"
                onClick={() => setMode("idle")}
              >
                Atrás
              </button>
            </div>
          )}
        </PopoverContent>
      </Popover>
    </span>
  );
}
