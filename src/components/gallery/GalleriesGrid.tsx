import { useState } from "react";
import { cn } from "~/lib/cn";
import EmptyState from "../ui/EmptyState";
import NewGalleryForm from "./NewGalleryForm";

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

  return (
    <section>
      <div className="section-head">
        <div>
          <div className="h-eyebrow mb-2">Colecciones temáticas</div>
          <h2>Galerías</h2>
        </div>
        <div className="row min-w-[260px] items-center gap-2">
          <span className="count-chip">
            {galleries.length} galerías · {orphanCount} sin clasificar
          </span>
          <NewGalleryForm
            onCreated={(g) =>
              setGalleries((arr) => [
                {
                  ...g,
                  photo_count: 0,
                  cover_name: null,
                  cover_developed_at: null,
                },
                ...arr,
              ])
            }
          />
        </div>
      </div>

      {galleries.length === 0 && orphanCount === 0 ? (
        <EmptyState
          title="Aún no hay galerías."
          sub="Crea una para empezar a organizar."
        />
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
