import { useCallback, useState } from "react";

interface GallerySummary {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  photo_count: number;
  cover_name: string | null;
  cover_developed_at: number | null;
}

function thumbUrl(coverName: string, developedAt: number | null): string {
  const v = developedAt ?? 0;
  return `/files/thumb/${encodeURIComponent(coverName)}?v=${v}`;
}

export default function GalleriesGrid({
  initial,
}: {
  initial: GallerySummary[];
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
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-medium uppercase tracking-wider text-neutral-400">
          Galerías <span className="ml-1 text-neutral-600">({galleries.length})</span>
        </h2>
        {!creating ? (
          <button
            onClick={() => setCreating(true)}
            className="rounded-md bg-pink-500 px-3 py-1 text-sm font-medium text-white hover:bg-pink-600"
          >
            + Nueva
          </button>
        ) : (
          <form
            className="flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              create();
            }}
          >
            <input
              autoFocus
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Nombre de la galería"
              className="rounded-md border border-neutral-800 bg-neutral-900 px-2 py-1 text-sm outline-none focus:border-pink-500"
              maxLength={80}
            />
            <button
              type="submit"
              className="rounded-md bg-pink-500 px-3 py-1 text-sm font-medium text-white hover:bg-pink-600"
            >
              Crear
            </button>
            <button
              type="button"
              onClick={() => {
                setCreating(false);
                setNewName("");
                setError(null);
              }}
              className="rounded-md border border-neutral-800 px-2 py-1 text-sm text-neutral-400 hover:bg-neutral-800"
            >
              ✕
            </button>
          </form>
        )}
      </div>

      {error && (
        <p className="mb-3 rounded-md border border-red-700/40 bg-red-500/10 p-2 text-sm text-red-300">
          {error}
        </p>
      )}

      {galleries.length === 0 ? (
        <p className="py-12 text-center text-sm text-neutral-500">
          Aún no hay galerías. Crea una para empezar a organizar.
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {galleries.map((g) => (
            <li
              key={g.id}
              className="group overflow-hidden rounded-lg border border-neutral-800 bg-neutral-900/40 transition hover:border-neutral-700"
            >
              <a href={`/g/${g.slug}`} className="block">
                <div className="aspect-square overflow-hidden bg-neutral-900">
                  {g.cover_name ? (
                    <img
                      src={thumbUrl(g.cover_name, g.cover_developed_at)}
                      alt={g.name}
                      loading="lazy"
                      className="h-full w-full object-cover transition group-hover:scale-105"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-3xl text-neutral-700">
                      ◌
                    </div>
                  )}
                </div>
                <div className="p-2">
                  <div className="truncate text-sm font-medium">{g.name}</div>
                  <div className="text-xs text-neutral-400">
                    {g.photo_count} {g.photo_count === 1 ? "foto" : "fotos"}
                  </div>
                </div>
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
