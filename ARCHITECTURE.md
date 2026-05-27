# Architecture

Personal Flickr is a single-user photo gallery built on **Astro 5** (SSR
mode) with **React 19 islands** for interactive surfaces. SQLite is the only
datastore; original files live on disk under `$DATA_DIR`. The whole thing
deploys as one Node container.

This document is the map. For setup, deployment and feature overview, see
`README.md`.

---

## High-level data flow

```
Browser ──► Astro page (SSR)
              │
              ├─ runs server query (better-sqlite3)
              │     ↓
              ├─ renders HTML + hydrates React islands
              │     ↓
              ▼
            Browser
              │
              ├─ React island fetches /api/* on user actions
              │     ↓
              ▼
            Astro API route
              │
              ├─ parseJson(request, ZodSchema) — 400 on bad input
              ├─ DB mutation via prepared statement
              ├─ disk mutation (sharp / fs) if needed
              ▼
            Response.json(...)
```

Astro renders the initial HTML so first paint is real content (good for
keyboard-first navigation and zero-JS fallbacks where they exist). React
takes over for: the photo grid + lightbox, the develop panel, the upload
flow, the mobile sheet, popovers, and the gallery picker. **No client-side
router** — links are real `<a href>`s that hit Astro.

---

## Directory layout

```
src/
├── components/                React islands. Subdirs are domain-grouped.
│   ├── icons.tsx              SVG icon set shared by everything.
│   ├── ui/                    Headless primitives (Radix-based).
│   │   ├── Dialog.tsx
│   │   ├── Popover.tsx
│   │   └── Sheet.tsx
│   ├── nav/                   Top-level chrome.
│   │   ├── Rail.tsx           Desktop left rail.
│   │   ├── Topbar.tsx         Search + uploader + breadcrumb.
│   │   └── MobileMenu.tsx     ≤720px drawer (built on Sheet).
│   ├── gallery/               Photo collection views.
│   │   ├── Gallery.tsx        Orchestrator: state + selection + bulk + lightbox.
│   │   ├── PhotoGrid.tsx      Masonry render (pure presentation).
│   │   ├── GalleriesGrid.tsx  Galleries index grid (home + /?view=galleries).
│   │   ├── GalleryHeader.tsx  Hero-bar buttons (rename, delete).
│   │   └── hooks/
│   │       └── useGridSelection.ts  shift/⌘-click, long-press, ⌘A/Esc.
│   ├── lightbox/              Photo viewer.
│   │   ├── Lightbox.tsx       Zoom + swipe + fullscreen + develop host.
│   │   ├── LightboxInfo.tsx   EXIF + tags side panel.
│   │   ├── Histogram.tsx      Client-side canvas histogram.
│   │   ├── DevelopPanel.tsx   Non-destructive develop (sliders + presets).
│   │   ├── GalleryPicker.tsx  Popover to add the active photo to galleries.
│   │   └── hooks/
│   │       ├── useFullscreen.ts        Fullscreen API + state.
│   │       ├── usePreloadNeighbors.ts  Warm cache for ±1/±2 photos.
│   │       └── useSwipeNav.ts          Carousel-style gesture.
│   ├── upload/
│   │   ├── Uploader.tsx       Dropzone + per-file progress.
│   │   └── UploaderModal.tsx  Wraps Uploader in a Dialog; listens for "uploader:open".
│   └── bulk/
│       └── BulkActionBar.tsx  Floating bar shown when selection > 0.
│
├── layouts/
│   └── Base.astro             Body shell: <head>, fonts, Rail, Topbar, UploaderModal.
│
├── pages/
│   ├── index.astro            Home / galleries / photos / favorites / tags / orphans / search.
│   ├── login.astro            Password gate.
│   ├── g/[slug].astro         Gallery detail page (hero + photos).
│   ├── files/                 Static-served photo / thumb / base.
│   └── api/                   JSON endpoints. See "API contract" below.
│
├── lib/                       Pure logic, no React.
│   ├── auth.ts                Cookie issue / verify (HMAC).
│   ├── cn.ts                  Re-export of clsx as `cn`.
│   ├── config.ts              Env reading; DATA_DIR / APP_PASSWORD / NODE_ENV.
│   ├── db.ts                  better-sqlite3, schema, prepared statements, types.
│   ├── exif.ts                exifr-based EXIF extraction.
│   ├── photo.ts               URL builders + display formatters over Photo.
│   ├── processor.ts           sharp + sips/exiftool: RAW + develop + thumbs.
│   ├── storage.ts             Filesystem paths + slug helpers.
│   └── validation.ts          Zod schemas + parseJson() helper.
│
├── middleware.ts              Auth gate for everything except /login and /api/auth/login.
│
└── styles/
    ├── global.css             Just @imports modules in cascade order.
    └── modules/               17 single-concept files (tokens, base, rail, topbar, …).
```

---

## Design tokens & theming

`styles/modules/tokens.css` is the single source of truth for color and
typography variables. Three orthogonal axes:

- **Mood** — `data-mood="estudio" | "darkroom" | "salon"` on `<html>`.
  Shifts the accent palette.
- **Theme** — `data-theme="dark" | "light"`. Inverts surfaces.
- **Density** — `data-density="regular" | "compact"`. Affects paddings only.

These attributes are read in `Base.astro` from `localStorage` **before**
React boots (an inline `<script>`), so there's no flash. The `Rail` and
`MobileMenu` islands sync their UI state in a `useEffect`, then write back
to both the DOM attribute and `localStorage` when the user changes them.

Every component CSS file under `styles/modules/` references variables only
(`var(--bg-2)`, `var(--accent)`, `var(--f-display)`, …). To add a new
"mood", you only touch tokens.css.

---

## Component conventions

**One default export per file.** Named exports are reserved for related
sub-pieces (`DialogContent`, `DialogHeader`) or hooks.

**Subdir entry points.** `components/gallery/Gallery.tsx` is the public
shape; everything else under `gallery/` (PhotoGrid, hooks) is implementation
detail consumed by `Gallery.tsx`. Outside callers import the orchestrator,
never the internals.

**Class composition** goes through `cn()` from `~/lib/cn`:

```tsx
<div className={cn("tile", isSelected && "selected", dim && "dim")} />
```

…rather than template strings or `[…].filter(Boolean).join(" ")`.

**Primitives wrap Radix.** `ui/Dialog`, `ui/Popover`, `ui/Sheet` re-export
Radix parts under app-specific names and inject our CSS class hooks. New
overlays should compose these instead of dropping in raw Radix.

**Server-side fetch lives in the .astro page.** API routes are for client
mutations. Read-on-load data is queried directly via `galleryQueries` /
`photoQueries` from the page front-matter.

---

## State ownership

- `Gallery.tsx` owns `photos[]` and `active` (lightbox index). All mutating
  fetches funnel through it so the optimistic state can roll back.
- `useGridSelection` owns selection — it lives next to `Gallery` because no
  other consumer needs it.
- `Lightbox.tsx` owns its own local state: zoom scale, develop-panel
  open/closed, info-panel open/closed, fullscreen, the swipe gesture state
  (via `useSwipeNav`). It signals up via `onIndex`/`onClose`/`onDelete`/
  `onToggleFavorite`/`onDeveloped` callbacks.
- Cross-component coordination uses `window.dispatchEvent(new CustomEvent(...))`
  for two narrow cases:
  - `uploader:open` — Topbar tells UploaderModal to open.
  - `photo:added`, `photo:memberships-changed` — Uploader / picker tells
    every Gallery instance to add or drop the affected photo.

  These are intentional — they avoid lifting state to a global store for
  what are essentially one-shot signals between unrelated islands.

---

## API contract

All endpoints under `src/pages/api/`. Conventions:

- **JSON in / JSON out.** Request bodies parsed through Zod schemas in
  `lib/validation.ts` via `parseJson(request, Schema)`. On parse failure
  the helper returns a pre-baked 400 with `{ error, detail }`.
- **Path IDs are validated by `Number.isInteger`** at the top of the handler;
  the response is `{ error: "bad_id" }`.
- **404 on missing rows.** `Response.json({ error: "not_found" }, { status: 404 })`.
- **Mutations return the updated entity** so the client can drop its
  optimistic copy. E.g. `POST /api/photos/[id]/favorite` returns
  `{ ok: true, photo: <updated row> }`.

When adding an endpoint that takes a body, define its schema in
`lib/validation.ts` first, then `parseJson` it. That keeps validation rules
in one place and prevents per-endpoint ad-hoc clamping.

---

## Photo lifecycle

1. **Upload** — `POST /api/upload` (multipart). `processor.ts` extracts an
   EXIF preview for RAW files (via `sips` on macOS / `exiftool` elsewhere)
   and writes:
   - `photo/<name>.jpg` — current developed JPEG (served to the browser).
   - `thumb/<name>.jpg` — small thumb.
   - `base/<name>.jpg` — immutable base for non-destructive re-develop
     (only for RAW; JPEGs don't get one).
   - DB row in `photos` with EXIF columns + `developed_at = uploaded_at`.

2. **Develop** — `POST /api/photos/[id]/develop` rebuilds `photo/*` and
   `thumb/*` from the preserved `base/*` using `sharp`. Updates
   `develop_params` (JSON) + `developed_at`. URLs include
   `?v=<developed_at>` so browsers refetch.

3. **Delete** — `DELETE /api/photos/[id]` removes the row and the three
   files. `DELETE /api/galleries/[id]/photos/[id]` only removes the
   `photo_galleries` membership, never the file.

---

## Auth

Single shared password (`APP_PASSWORD` env). On login the server issues a
HMAC-signed cookie (`HttpOnly`, `SameSite=Lax`, `Secure` in prod). The
middleware (`src/middleware.ts`) verifies it on every request, redirecting
unauthenticated requests to `/login`. `SESSION_SECRET` is auto-generated and
persisted to `$DATA_DIR/.session-secret` (chmod 0600) on first boot —
nothing to configure.

CSRF protection relies on `SameSite=Lax` + HttpOnly cookies; Astro's
built-in origin check is disabled in `astro.config.mjs` because it doesn't
play nicely with reverse proxies like Coolify + Cloudflare Tunnel.

---

## Things we explicitly don't do

- **No Tailwind.** Removed in favor of CSS variables + small modular files.
  Adding it back means re-evaluating tokens.css.
- **No client-side router.** Astro pages are real navigations.
- **No global state library.** State is owned by the nearest meaningful
  component; cross-island coordination uses CustomEvents for the rare cases
  where prop-drilling isn't viable.
- **No HEIC support yet.** RAW (CR2 etc) works via system tools; HEIC would
  need `libheif` in the Docker image.
- **No multi-user.** Single password; no `users` table.
