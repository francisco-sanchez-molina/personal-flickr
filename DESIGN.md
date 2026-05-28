# Design system

Notes for keeping the UI consistent without a formal Storybook. Edits
here should match what's in `src/styles/modules/tokens.css` and
`src/components/ui/`.

---

## Tokens

All theming values live as CSS custom properties in
`src/styles/modules/tokens.css`. They're remapped to Tailwind utilities
via the `@theme inline` block in `src/styles/global.css`, so you can
use either style at a call site:

```html
<div class="bg-bg-2 text-ink-3">…</div>      <!-- Tailwind -->
<div style="background: var(--bg-2);">…</div>  <!-- raw vars -->
```

The mood / theme / density attributes on `<html>` override the raw vars
at runtime (see `useThemePreferences` in `src/lib/theme.ts`).

### Colors

| Token | Tailwind | Purpose |
|---|---|---|
| `--bg`, `--bg-2`, `--bg-3` | `bg-bg`, `bg-bg-2`, `bg-bg-3` | Backgrounds, darkest → lighter |
| `--surface` | `bg-surface` | Card / dialog body |
| `--ink`, `--ink-2`, `--ink-3`, `--ink-4` | `text-ink`, `text-ink-2/3/4` | Text, darkest → lightest |
| `--accent`, `--accent-2`, `--accent-ink` | `bg-accent`, `text-accent`, `text-accent-ink` | Brand accent (mood-dependent) |
| `--line`, `--line-2` | `border-line`, `border-line-2` | Hairline borders |
| `--warn`, `--danger` | `text-warn`, `text-danger` | Feedback colors |

### Fonts

| Token | Tailwind | Use |
|---|---|---|
| `--f-display` (Instrument Serif) | `font-display` | H1/H2 editorial headlines, hero titles |
| `--f-ui` (Geist) | `font-ui` | Default body, buttons, labels |
| `--f-mono` (Geist Mono) | `font-mono` | EXIF, timestamps, debug, eyebrows |

### Radii

| Token | Tailwind | Pixel |
|---|---|---|
| `--radius-xs` | `rounded-xs` | 6 |
| `--radius-sm` | `rounded-sm` | 10 |
| `--radius-md` | `rounded-md` | 14 |

### Easing

| Token | Tailwind |
|---|---|
| `--ease` | `ease-smooth` |

---

## Primitives (`src/components/ui/`)

Type-safe React wrappers over the CSS class system. Use these from new
code instead of hand-writing `className="btn primary sm"`.

### `<Button>`

```tsx
<Button>Default</Button>
<Button variant="primary">Save</Button>
<Button variant="ghost" size="sm">Cancel</Button>
<Button variant="danger">Delete</Button>
<Button loading>Saving…</Button>
<Button href="/login">Sign in</Button>  {/* renders <a> */}
```

Props: `variant` (default / primary / ghost / danger), `size` (default /
sm), `loading`, `href` (auto-renders `<a>`), `className` (appended).
Forward ref, accepts all native button/anchor props.

### `<IconButton>`

```tsx
<IconButton aria-label="Cerrar" onClick={onClose}>
  <Icons.Close size={15} />
</IconButton>
```

`aria-label` is required by the type — these buttons render only an
icon, so screen readers need the label.

### `<TextField>`

```tsx
<TextField placeholder="Buscar…" value={q} onChange={…} />
<TextField leading={<Icons.Search size={16} />} placeholder="Buscar fotos…" />
<TextField density="compact" placeholder="Renombrar" />
```

Wraps the `.search` styled container + `<input>`. Props: `leading`,
`trailing`, `density` ("default" / "compact"), `containerClassName`.
All native input props pass through.

> ⚠️ Note: the prop is `density`, not `size` — `<input size>` is a real
> native attribute (visible width in chars) we don't want to clobber.

### `<Spinner>`

```tsx
<Spinner />              {/* 14px, inherits color */}
<Spinner size={20} />
```

Small inline loading indicator. Respects `prefers-reduced-motion`.

### `<ActionMenu>`

```tsx
<ActionMenu
  items={[
    { label: "Renombrar", icon: <Icons.Sliders size={13} />, onSelect: rename },
    { label: "Borrar", icon: <Icons.Trash size={13} />, danger: true, onSelect: del },
  ]}
  title="Acciones"
/>
```

The standard "···" overflow popover. Auto-closes on item select before
firing the handler (so a Dialog opened by the item doesn't compete with
the popover animation). Pass `trigger` to override the default
`IconButton` + `Icons.More`.

### Higher-level primitives

These are domain-flavored but generic enough to live in `ui/`:

- **`<Dialog>` family** — Radix-based modal. `<DialogContent size="sm|md|lg">`, `<DialogHeader>`, `<DialogTitle>`, `<DialogDescription>`, `<DialogBody>`, `<DialogFooter>`, `<DialogClose>`.
- **`<Sheet>` family** — side-anchored drawer, same Radix base. Used by the mobile menu.
- **`<Popover>` family** — anchored Radix popover. Used by `<ActionMenu>` and direct callers.
- **`<EmptyState>`** — `<div class="empty">` for empty lists. `.tsx` and `.astro` versions.
- **`<ErrorText>`** — null when `message` is empty; standard mono-danger style otherwise.
- **`<SectionHead>`** — eyebrow + h2 + actions slot. `.tsx` and `.astro` versions.
- **`<ConfirmDialog>` + `useConfirm()`** — async confirm replacement for native `confirm()`. Mount `<ConfirmHost>` once near the root (already done in `Base.astro`).

---

## Conventions

**Prefer the primitives over raw classes.** New code should use
`<Button>` instead of `<button className="btn primary">`. Existing
call-sites keep working — the CSS classes are still defined — and get
migrated when touched.

**Composition order in component imports**: `ui/` primitives go right
after the local `Icons` import and before any domain-specific imports.
Alphabetical within each group.

**Class composition** uses `cn()` from `~/lib/cn` (re-export of clsx):

```tsx
className={cn("base", isActive && "active", custom && "extra")}
```

Avoid template-string concatenation; the `cn()` form is shorter and
handles `false` / `undefined` cleanly.

**Don't add new CSS classes for one-off styling.** If you find yourself
declaring `.my-component { … }` for something used in a single file,
inline Tailwind utilities instead. Reserve CSS modules for shared
patterns (`.btn`, `.tile`, `.search`).

---

## Spacing & layout

We use Tailwind's default spacing scale (`gap-2`, `mt-3`, `px-4`, etc.)
plus the editorial `--grid-gap` for masonry / gallery grids.

No formal type scale yet — fonts are sized inline via Tailwind
arbitrary values (`text-[13px]`, `text-[11.5px]`) at usage sites. If
the same size appears 3+ times across files, that's a sign it should
become a tokenized utility.

---

## Migrating an existing call-site

Before:

```tsx
<button
  className="btn ghost sm border-dashed border-line-2"
  onClick={() => setEditing(true)}
  type="button"
>
  <Icons.Plus size={13} /> Nueva galería
</button>
```

After:

```tsx
<Button
  variant="ghost"
  size="sm"
  className="border-dashed border-line-2"
  onClick={() => setEditing(true)}
>
  <Icons.Plus size={13} /> Nueva galería
</Button>
```

Same DOM output (the React component renders `<button class="btn ghost
sm border-dashed border-line-2">`), but the call site declares intent
through props instead of a string the type-checker can't read.
