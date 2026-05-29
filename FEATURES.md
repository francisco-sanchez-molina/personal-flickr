# Personal Flickr — Catálogo de características

Galería de fotos y vídeo **monousuario**, autoalojada. Astro 5 SSR + React 19
islands + SQLite (better-sqlite3) + sharp/ffmpeg, desplegada en Docker/Coolify.

Este fichero es el inventario vivo de **qué hace el producto** (no cómo está
construido — para eso, `ARCHITECTURE.md`). Cada característica tiene un ID
estable `PF-NNN` para poder referenciarla en commits, issues y código.

**Leyenda de estado:** ✅ Hecho · 🟡 Parcial · 🔭 Backlog (ver final)

---

## 1. Acceso y seguridad

| ID | Característica | Estado | Notas |
|----|---------------|--------|-------|
| PF-001 | Login usuario + contraseña | ✅ | `APP_USERNAME` + `APP_PASSWORD` por env. Comparación timing-safe (HMAC). |
| PF-002 | Sesión por cookie firmada | ✅ | HMAC-SHA256, HttpOnly + SameSite=Lax + Secure en prod, caduca a 30 días. |
| PF-003 | `SESSION_SECRET` autopersistente | ✅ | Se genera y guarda en `$DATA_DIR/.session-secret` (0600) si no se define. |
| PF-004 | Rate-limit de login | ✅ | Token bucket, 5 intentos/min/IP. IP vía `x-forwarded-for` / `cf-connecting-ip`. |
| PF-005 | Middleware de auth global | ✅ | Todo protegido salvo `/login`, `/api/auth/login` y rutas públicas de compartir. |
| PF-006 | Logout | ✅ | Borra la cookie de sesión. |

## 2. Subida e ingesta

| ID | Característica | Estado | Notas |
|----|---------------|--------|-------|
| PF-010 | Subida drag & drop | ✅ | Cola con progreso por archivo, reintentos con backoff (3×), stats agregadas. |
| PF-011 | Soltar carpetas | ✅ | Recorre subdirectorios (US-06). |
| PF-012 | Detección de colisión por nombre | ✅ | Reemplazar / Renombrar (sugiere `foo-2.jpg`) / Cancelar. |
| PF-013 | Deduplicación por contenido (SHA-256) | ✅ | Hash del binario; ofrece "Subir igualmente" ante duplicado exacto (US-03). |
| PF-014 | Backfill de hash perezoso | ✅ | Fotos antiguas calculan su hash al abrirlas por primera vez. |
| PF-015 | Soporte RAW | ✅ | CR2/CR3/NEF/ARW/DNG/RAF/ORF/RW2. macOS→`sips`, Linux→`exiftool` (JPEG embebido). |
| PF-016 | Soporte HEIC/HEIF | ✅ | Vía libheif1 + sharp (US-04). |
| PF-017 | Asignación automática a galería | ✅ | Subir desde `/g/{slug}` asigna a esa galería directamente. |

## 3. Procesado de imagen (revelado)

| ID | Característica | Estado | Notas |
|----|---------------|--------|-------|
| PF-020 | Panel de revelado con sliders | ✅ | Brillo, contraste, saturación, hue, rotación. |
| PF-021 | Preview en vivo (CSS filters) | ✅ | El save reaplica el mismo pipeline en sharp para que coincida. |
| PF-022 | Re-revelado no-destructivo | ✅ | Se preserva el JPEG base; reabrir Revelar no degrada calidad. |
| PF-023 | Presets de revelado | ✅ | Recetas predefinidas mapeadas a los parámetros persistidos. |
| PF-024 | Rotación rápida (90° L/R) | ✅ | Botones en el lightbox; recodifica el base. |
| PF-025 | Histograma | ✅ | Cálculo client-side en el panel de info. |
| PF-026 | Calidez (sepia) | ✅ | Knob CSS `sepia()` ↔ sharp `.recomb()` con la matriz idéntica; preview fiel al guardado. |

## 4. Vídeo

| ID | Característica | Estado | Notas |
|----|---------------|--------|-------|
| PF-030 | Ingesta de vídeo | ✅ | MP4/MOV/M4V/WebM/MKV. |
| PF-031 | Transcodificación a 720p H.264/AAC | ✅ | CRF 23, `+faststart`. "HD más ligero que WhatsApp". Requiere ffmpeg. |
| PF-032 | Procesado en segundo plano | ✅ | Cola en proceso; estado `processing`/`ready`/`failed` con recuperación al arrancar. |
| PF-033 | Reproducción con seek (range requests) | ✅ | El endpoint de ficheros sirve `206 Partial Content`. |
| PF-034 | Póster de vídeo | ✅ | Thumbnail WebP extraído del primer frame. |

## 5. Organización: galerías

| ID | Característica | Estado | Notas |
|----|---------------|--------|-------|
| PF-040 | Galerías (colecciones N:M) | ✅ | Una foto puede estar en varias galerías. |
| PF-041 | CRUD de galería | ✅ | Crear, renombrar (regenera slug), borrar. |
| PF-042 | Portada manual | ✅ | Pin de una foto como portada; fallback a la más reciente (US-08). |
| PF-043 | Sub-galerías (1 nivel) | ✅ | Reparentar bajo otra top-level (US-11). |
| PF-044 | Huérfanas (sin galería) | ✅ | Vista dedicada + contador en la grid. |
| PF-045 | Quitar de galería en lote | ✅ | Desde la barra de selección. |
| PF-046 | Papelera / soft-delete | ✅ | Borrar oculta (no destruye); `?view=trash` restaura, purga o vacía. Ficheros + membresías + shares se conservan hasta el purge. |

## 6. Organización: etiquetas

| ID | Característica | Estado | Notas |
|----|---------------|--------|-------|
| PF-050 | Etiquetas N:M | ✅ | Case-insensitive, autoprune cuando quedan vacías. |
| PF-051 | Editor de etiquetas en lightbox | ✅ | Añadir/quitar desde el panel de info. |
| PF-052 | Vista índice de etiquetas | ✅ | Listado con recuento + filtro por etiqueta. |
| PF-053 | Renombrar / fusionar etiquetas | ✅ | Merge transfiere membresías y borra la fuente (US-10). |

## 7. Smart albums (filtros guardados)

| ID | Característica | Estado | Notas |
|----|---------------|--------|-------|
| PF-060 | Smart albums | ✅ | Filtro guardado que se recalcula en cada visita (US-09). |
| PF-061 | Dimensiones de filtro | ✅ | Cámara, objetivo, tipo, favorita, sin galería, rango ISO, rango ƒ, rango fechas. |
| PF-062 | CRUD de smart album | ✅ | Builder con vista previa de resultados. |

## 8. Favoritos, búsqueda y descubrimiento

| ID | Característica | Estado | Notas |
|----|---------------|--------|-------|
| PF-070 | Marcar favorita | ✅ | Estrella en lightbox + overlay en thumbnail. |
| PF-071 | Vista de favoritas | ✅ | Pestaña dedicada. |
| PF-072 | Favorito en lote | ✅ | Toggle masivo desde la barra de selección. |
| PF-073 | Búsqueda global | ✅ | `?q=` sobre fotos y galerías (nombre, cámara, etiqueta…). Atajo ⌘K. |
| PF-074 | Home / Inicio | ✅ | Hero destacado + galerías + subidas recientes. |
| PF-075 | Vista de mapa | ✅ | `?view=map`: fotos geolocalizadas sobre OSM (Leaflet), markers con thumbnail. |

## 9. Visor (lightbox)

| ID | Característica | Estado | Notas |
|----|---------------|--------|-------|
| PF-080 | Lightbox a pantalla completa | ✅ | Pinch-zoom, doble-tap, pan. |
| PF-081 | Navegación swipe entre fotos | ✅ | Carrusel con commit + slide. |
| PF-082 | Precarga de vecinas | ✅ | Prev/next se cargan por adelantado. |
| PF-083 | Atajos de teclado | ✅ | ←/→ navegar, Esc cerrar, F favorita, I info. |
| PF-084 | Pantalla completa nativa | ✅ | Fullscreen API. |
| PF-085 | Panel de info / EXIF | ✅ | Cámara, objetivo, ISO, ƒ, obturación, focal, fecha, GPS, dimensiones, peso. |
| PF-086 | Aspect-ratio correcto en verticales | ✅ | Sin recorte ni deformación. |
| PF-087 | Descarga del original | ✅ | Botón con `<a download>`. |
| PF-088 | Menú "···" + bottom-sheet en móvil | ✅ | Acciones desbordadas y panel de info como hoja inferior. |

## 10. Metadatos (EXIF)

| ID | Característica | Estado | Notas |
|----|---------------|--------|-------|
| PF-090 | Extracción de EXIF en subida | ✅ | Vía exifr: cámara, objetivo, ƒ, obturación, ISO, focal, fecha, GPS. |
| PF-091 | Backfill de EXIF | ✅ | Endpoint para fotos previas a esta feature. |

## 11. Compartir (enlaces públicos)

| ID | Característica | Estado | Notas |
|----|---------------|--------|-------|
| PF-100 | Enlace público por foto | ✅ | Token de 22 chars; ve la foto sin login. |
| PF-101 | Revocar enlace | ✅ | Borrar el token corta el acceso en todas partes al instante. |
| PF-102 | Página pública de visualización | ✅ | `/s/:token`, con caption de EXIF, `noindex`, 404 si revocado. |
| PF-103 | Contador de vistas | ✅ | 1 page-view = 1 vista (no cuenta range requests de vídeo). |
| PF-104 | Listado global de compartidas | ✅ | Vista `?view=shares`: thumbnail, URL, creado, última vista, vistas, copiar/revocar. |
| PF-105 | Varios enlaces por foto | ✅ | Cada uno con su contador independiente. |
| PF-106 | Enlace público por galería | ✅ | Token → `/sg/:token`; sirve sólo fotos miembro vivas. Mismo contador + revocado. |
| PF-107 | Listado unificado foto + galería | ✅ | `?view=shares` lista ambos tipos con su icono y contador. |

## 12. Selección y acciones en lote

| ID | Característica | Estado | Notas |
|----|---------------|--------|-------|
| PF-110 | Selección múltiple | ✅ | Click, shift-click (rango), ⌘/Ctrl-click, long-press en móvil. |
| PF-111 | Atajos de selección | ✅ | ⌘A seleccionar todo, Esc limpiar. |
| PF-112 | Barra de acciones flotante | ✅ | Añadir a galería, favorito, quitar de galería, eliminar, cancelar. |

## 13. Navegación, UI y personalización

| ID | Característica | Estado | Notas |
|----|---------------|--------|-------|
| PF-120 | Rail lateral + Topbar | ✅ | Navegación principal + breadcrumb + búsqueda. |
| PF-121 | Menú móvil (drawer) | ✅ | Sheet lateral con navegación + ajustes. |
| PF-122 | Temas claro/oscuro | ✅ | Toggle persistente. |
| PF-123 | Moods visuales | ✅ | Paletas alternativas persistidas en localStorage. |
| PF-124 | Design system documentado | ✅ | Primitivos UI (Button, IconButton, TextField, Dialog…) en `DESIGN.md`. |
| PF-125 | Masonry virtualizada | ✅ | Filas justificadas con @tanstack/react-virtual (US-23). |
| PF-126 | Accesibilidad base | ✅ | Focus ring global, `aria-current`/`aria-pressed` en navegación y toggles. |

## 14. PWA / instalación

| ID | Característica | Estado | Notas |
|----|---------------|--------|-------|
| PF-130 | Manifest + iconos | ✅ | Instalable como app. |
| PF-131 | Service worker | ✅ | Registro para cumplir la heurística de instalabilidad. |
| PF-132 | Favicon SVG + Apple touch icon | ✅ | |

## 15. Operación e infraestructura

| ID | Característica | Estado | Notas |
|----|---------------|--------|-------|
| PF-140 | Docker multi-stage | ✅ | Listo para Coolify / cualquier orquestador. Volumen `/data`. |
| PF-141 | Entrypoint con drop de privilegios | ✅ | gosu root→node, arregla permisos de `/data`. |
| PF-142 | Cloudflare Tunnel embebido | ✅ | `pnpm share` expone sin abrir puertos. |
| PF-143 | Indicador de uso de disco | ✅ | Chip "X.X GB" en el rail, poll 60s, cacheado. |
| PF-144 | Migraciones idempotentes | ✅ | `addColumnIfMissing` — esquema evoluciona sin herramienta de migración. |
| PF-145 | Tests unitarios + integración | ✅ | 92 tests: lib puro + schemas Zod + capa DB completa (temp SQLite). Queda E2E de navegador. |

---

## 🔭 Backlog / candidatas (gorra de PO)

Priorizado por valor/esfuerzo.

> **Entregado desde la última revisión:** PF-200 (compartir galerías),
> PF-210 (vista de mapa), PF-214 (papelera), PF-221 → reinterpretado como
> PF-026 (knob Calidez real), y PF-145 (tests de la capa DB). Movidos a sus
> secciones de capacidad arriba.

### Alta — completan huecos obvios
- **PF-201 · Caducidad / contraseña en enlaces** — hoy un enlace vive hasta que
  se revoca. Opción de expiración por fecha o protección por PIN. Aplica ya a
  foto y galería.
- **PF-202 · Compartir en lote** — generar enlace desde la barra de selección,
  no sólo foto a foto.
- **PF-203 · Galerías en el menú "···" del lightbox móvil** — el GalleryPicker es
  un Popover y hoy no se abre desde el overflow en móvil (documentado como
  pendiente).

### Media — valor real, más trabajo
- **PF-211 · Ordenación / filtros en grid** — por fecha de captura, cámara, etc.,
  sin tener que crear un smart album.
- **PF-212 · Descarga en lote (zip)** — seleccionar y descargar varias.
- **PF-213 · Línea de tiempo** — agrupar por mes/año de captura.
- **PF-215 · Clustering de markers en el mapa** — PF-075 pinta markers sueltos;
  con muchas fotos geolocalizadas conviene agrupar (Leaflet.markercluster).
- **PF-216 · Vaciado automático de papelera** — `listTrashedBefore` ya existe;
  falta un cron/retención (p. ej. purgar lo que lleve >30 días en la papelera).

### Baja — nice-to-have
- **PF-220 · Multiusuario / roles** — explícitamente fuera de scope hoy
  (ver `ARCHITECTURE.md` "Things we don't do"), pero es la palanca de producto
  más grande si algún día cambia el público objetivo.
- **PF-222 · Slideshow / presentación** — auto-avance en el lightbox.
- **PF-223 · Álbumes compartidos colaborativos** — depende de multiusuario.

---

## 🚫 Fuera de alcance (decisiones de producto)

Documentado en detalle en `ARCHITECTURE.md` → *Things we explicitly don't do*.
Resumen: multiusuario, edición destructiva, sincronización entre dispositivos,
y reconocimiento facial / IA no están en el roadmap mientras el producto siga
siendo "mi galería privada, autoalojada".
