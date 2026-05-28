import { useCallback, useState } from "react";
import { cn } from "~/lib/cn";
import { Icons } from "../icons";

interface GallerySummary {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  photo_count: number;
  cover_name: string | null;
  cover_developed_at: number | null;
}

function coverUrl(coverName: string, developedAt: number | null): string {
  const v = developedAt ?? 0;
  return `/files/photo/${encodeURIComponent(coverName)}?v=${v}`;
}

function thumbStripUrl(name: string, developedAt: number | null): string {
  const v = developedAt ?? 0;
  return `/files/thumb/${encodeURIComponent(name)}?v=${v}`;
}

export default function GalleriesGrid({
  initial,
  orphanCount = 0,
  featured = true,
}: {
  initial: GallerySummary[];
  orphanCount?: number;
  /** When true, the first gallery is rendered as a 2×2 'big' featured card. */
  featured?: boolean;
}) {
  const [galleries, setGalleries] = useState<GallerySummary[]>(initial);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const create = useCallback(async () => {
    const name = newName.trim();
    if (!name) return;
    setError(null);
    try {
      const res = await fetch("/api/galleries", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.detail ?? body.error ?? "error");
      setGalleries((g) => [
        {
          ...body.gallery,
          photo_count: 0,
          cover_name: null,
          cover_developed_at: null,
        },
        ...g,
      ]);
      setNewName("");
      setCreating(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [newName]);

  return (
    <section>
      <div className="section-head">
        <div>
          <div className="h-eyebrow mb-2">Colecciones temáticas</div>
          <h2>Galerías</h2>
        </div>
        <div className="row">
          <span className="count-chip">
            {galleries.length} galerías · {orphanCount} sin clasificar
          </span>
          {!creating ? (
            <button className="btn primary sm" onClick={() => setCreating(true)}>
              <Icons.Plus size={13} /> Nueva galería
            </button>
          ) : (
            <form
              className="flex gap-1.5"
              onSubmit={(e) => {
                e.preventDefault();
                create();
              }}
            >
              <div className="search min-w-[180px] px-2.5 py-1.5">
                <input
                  autoFocus
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Nombre"
                  maxLength={80}
                  className="text-xs"
                />
              </div>
              <button type="submit" className="btn primary sm">
                Crear
              </button>
              <button
                type="button"
                className="btn ghost sm"
                onClick={() => {
                  setCreating(false);
                  setNewName("");
                  setError(null);
                }}
              >
                ✕
              </button>
            </form>
          )}
        </div>
      </div>

      {error && (
        <p className="m-0 mb-3 font-mono text-[12.5px] text-danger">{error}</p>
      )}

      {galleries.length === 0 && orphanCount === 0 ? (
        <div className="empty">
          <div className="big serif">Aún no hay galerías.</div>
          <div>Crea una para empezar a organizar.</div>
        </div>
      ) : (
        <div className="gallery-grid">
          {orphanCount > 0 && (
            <a href="/?view=orphans" className="gcard orphans" aria-label="Fotos sin galería">
              <div className="gcard-cover">
                <div className="gcard-empty">?</div>
              </div>
              <div className="gcard-meta">
                <div>
                  <h3>Sin galería</h3>
                  <div className="mt-1 text-xs text-ink-3">fotos sueltas</div>
                </div>
                <div className="mono">
                  {String(orphanCount).padStart(3, "0")}
                </div>
              </div>
            </a>
          )}
          {galleries.map((g, i) => (
            <a
              key={g.id}
              href={`/g/${g.slug}`}
              className={cn("gcard", featured && i === 0 && g.cover_name && "big")}
              aria-label={g.name}
            >
              <div className="gcard-cover">
                {g.cover_name ? (
                  <img
                    src={coverUrl(g.cover_name, g.cover_developed_at)}
                    alt={g.name}
                    loading="lazy"
                  />
                ) : (
                  <div className="gcard-empty">◌</div>
                )}
                {g.cover_name && (
                  <div className="badge">{g.photo_count} fotos</div>
                )}
                {g.cover_name && (
                  <div className="gcard-strip" aria-hidden="true">
                    {[...Array(4)].map((_, k) => (
                      <div key={k}>
                        <img
                          src={thumbStripUrl(g.cover_name!, g.cover_developed_at)}
                          alt=""
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="gcard-meta">
                <div>
                  <h3>{g.name}</h3>
                  {g.description && (
                    <div className="mt-1 overflow-hidden text-xs text-ink-3 text-ellipsis whitespace-nowrap">
                      {g.description}
                    </div>
                  )}
                </div>
                <div className="mono">
                  {String(g.photo_count).padStart(3, "0")}
                </div>
              </div>
            </a>
          ))}
        </div>
      )}
    </section>
  );
}
