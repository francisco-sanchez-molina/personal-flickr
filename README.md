# Personal Flickr

> Galería personal de fotos, con login único, ingesta de RAW de cámara, recompresión a ~2 MB, panel de revelado en vivo, lightbox con pinch-zoom y swipe, y deploy a Coolify en un Dockerfile.

[![Stack: Astro 5](https://img.shields.io/badge/Astro-5-FF5D01?logo=astro&logoColor=white)](https://astro.build)
[![React 19](https://img.shields.io/badge/React-19-149eca?logo=react&logoColor=white)](https://react.dev)
[![Tailwind v4](https://img.shields.io/badge/Tailwind-v4-38bdf8?logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

**Qué es**: un proyecto personal para tener tus propias fotos accesibles desde el móvil sin pagar Flickr/Google Photos. Login con una contraseña, drag&drop, una galería bonita, y la posibilidad de revelar un RAW sin abrir Lightroom.

**Qué no es**: una alternativa multi-usuario a Flickr. No hay roles, ni compartir links públicos, ni álbumes. Si necesitas eso, mira [Immich](https://immich.app/), [PhotoStructure](https://photostructure.com/) o [PhotoPrism](https://www.photoprism.app/).

---

## Features

> Inventario completo y trazable (con backlog priorizado) en **[`FEATURES.md`](./FEATURES.md)**. Lo de abajo son los titulares.

- 🔐 **Login usuario + contraseña** (env vars) + cookie firmada HMAC + rate-limit 5 intentos/min/IP
- 📤 **Upload drag&drop** con detección de colisión por nombre (Reemplazar / Renombrar / Cancelar)
- 📸 **Soporta RAW** de cámara: CR2, CR3, NEF, ARW, DNG, RAF, ORF, RW2
  - macOS: usa `sips` built-in
  - Linux/Docker: usa `exiftool` para extraer el JPEG embebido (~200 ms por foto)
- 🎬 **Vídeo** (MP4 / MOV / M4V / WebM / MKV) con transcodificación automática a **720p H.264 / AAC** (CRF 23, `+faststart`). Pensado para "HD pero más pequeño que WhatsApp": un clip 1080p del móvil se queda en ~1.5-2.5 Mbps. Requiere `ffmpeg` en PATH (incluido en el Dockerfile).
- 🎚 **Panel de revelado** con sliders (brillo, contraste, saturación, hue, rotar) — preview en vivo con CSS filters, save aplica el mismo pipeline en `sharp`
- 🔄 **Re-revelado no-destructivo**: el JPEG embebido se preserva como "base"; puedes volver a abrir Revelar sin perder calidad
- 🖼 **Lightbox** con pinch-zoom, swipe entre fotos, doble-tap, navegación con teclado
- 🔗 **Enlaces públicos por foto** (sin login), revocables y con contador de vistas
- 🗂 **Galerías, sub-galerías, etiquetas y smart albums** + búsqueda global y favoritas
- 🌐 **Cloudflare Tunnel embebido** (`pnpm share`) para exponerlo sin abrir puertos ni tocar firewall
- 🐳 **Dockerfile multi-stage** listo para Coolify / cualquier orquestador, con volumen `/data` para persistencia

## Stack

## Stack

- **Astro 5** (SSR Node, standalone) + **React** islands + **Tailwind v4**
- **better-sqlite3** para metadata (un archivo `data/db.sqlite`)
- **sharp** (mozjpeg) para resize/recompresión y aplicación de revelado
- **react-zoom-pan-pinch** para el lightbox
- **Extracción de RAW**:
  - macOS: `sips` (built-in)
  - Linux: `exiftool` (`-PreviewImage` / `-JpgFromRaw` para CR3)
- Auth: contraseña única en env var + cookie firmada HMAC + SameSite=Lax + Secure (en prod) para CSRF

## Requisitos

- Node 22+
- `pnpm` (o npm)
- macOS o Linux con `exiftool` instalado (auto-instalado en el Dockerfile)
- `ffmpeg` + `ffprobe` en PATH si quieres subir vídeos (`brew install ffmpeg` en macOS, auto-instalado en el Dockerfile)

## Setup local

```bash
pnpm install
cp .env.example .env
# Edita .env:
#   APP_PASSWORD=loquequieras
#   SESSION_SECRET=$(openssl rand -hex 32)
```

## Desarrollo

```bash
pnpm dev
# http://localhost:4321
```

## Producción (local)

```bash
pnpm build
pnpm start
# http://localhost:4321
```

Las fotos viven en `./data/photos/`, los thumbnails en `./data/thumbs/`, las bases para re-revelado (solo RAW) en `./data/bases/`, y la metadata en `./data/db.sqlite`. Hacer backup = copiar `./data/`.

## Revelado no-destructivo

Para fotos subidas como RAW (CR2/CR3/NEF/ARW/DNG/RAF/ORF/RW2), se preserva el JPEG embebido extraído por la cámara como **base** (`data/bases/{name}.jpg`). Eso permite re-revelar las veces que quieras sin perder calidad:

1. Abre la foto en el lightbox → botón **Revelar**
2. Ajusta los sliders (Brillo / Contraste / Saturación / Hue / Rotar)
3. El preview se actualiza en vivo usando `filter: brightness() contrast() saturate() hue-rotate()` (CSS)
4. **Guardar** → el server aplica los mismos ajustes con `sharp` sobre la base → reemplaza el JPEG visible
5. Los parámetros quedan en DB (`develop_params` JSON), así que al re-abrir Revelar los sliders arrancan donde los dejaste

Para JPEGs y PNGs subidos tal cual, no hay base preservada (sería duplicar el archivo). Si subes una foto y quieres re-revelarla, súbela en RAW.

## Acceso remoto con Cloudflare Tunnel (incluido)

El proyecto **trae cloudflared embebido** vía el paquete npm `cloudflared`. No necesitas `brew install` ni instalar nada por tu cuenta — la primera vez que arranques el túnel se descarga el binario en `node_modules/`.

**Un único comando para todo** (dev server + túnel):

```bash
pnpm share
# imprime: ✅ URL pública: https://<random-words>.trycloudflare.com
```

Variantes:

```bash
pnpm tunnel        # solo el túnel (apunta a localhost:4321 ya arrancado en otro sitio)
pnpm share         # dev + túnel
pnpm share:prod    # build/start + túnel
```

### ¿Y un dominio fijo (no la URL random)?

`*.trycloudflare.com` cambia cada vez. Si quieres `fotos.tudominio.com` estable:

```bash
node_modules/.bin/cloudflared tunnel login
node_modules/.bin/cloudflared tunnel create personal-flickr
node_modules/.bin/cloudflared tunnel route dns personal-flickr fotos.tudominio.com
node_modules/.bin/cloudflared tunnel run personal-flickr
```

## Deploy a Coolify

El repo incluye un **`Dockerfile` multi-stage** (~750 MB) con:
- Base `node:22-bookworm-slim`
- `libimage-exiftool-perl` para procesar RAW
- `tini` como PID 1 para signals limpios
- Usuario `node` (uid 1000)
- Healthcheck en `/login`
- Volumen `/data` para persistencia

### Pasos

1. **Subir el repo a Git** (GitHub / GitLab / Forgejo, lo que use tu Coolify).

2. **Coolify → New Resource → Public/Private Git Repository**.
   - Repository: el tuyo
   - Branch: `main`
   - **Build Pack: `Dockerfile`** (Coolify lo autodetecta)
   - Port: `4321`

3. **Environment Variables** (en la pestaña Environment):
   ```
   APP_PASSWORD=loquequieras
   NODE_ENV=production
   ```
   `SESSION_SECRET` se autogenera y se persiste en `/data/.session-secret`
   en el primer arranque. Solo defínelo manualmente si quieres rotación explícita.

   Variables opcionales con defaults:
   ```
   TARGET_SIZE_MB=2
   MAX_DIMENSION=2560
   VIDEO_MAX_DIM=1280          # lado más largo del vídeo transcodificado (720p)
   VIDEO_CRF=23                # 18 = mejor calidad / 28 = más compresión
   VIDEO_AUDIO_KBPS=128
   DATA_DIR=/data
   ```
   ⚠️ **NO marques `Build Variable`** en estas — son runtime only.

4. **Storage → Add Volume**:
   - Name: `personal-flickr-data`
   - Mount Path: `/data`
   - Source Path: (déjalo vacío para que Coolify lo gestione, o pon una ruta del host)

   Esto es lo que sobrevive a redeploys: las fotos, thumbnails, bases para re-revelado, y la DB.

5. **Domains**:
   - Pon el dominio público que quieras servir (`fotos.devialab.com` o el que sea).
   - Coolify se encarga del SSL automáticamente (Let's Encrypt).

6. **Deploy** → el primer build tarda 2-4 min (pnpm install + build + apt install de exiftool).

### Verificación post-deploy

```bash
# Sanity check
curl -I https://fotos.tudominio.com/login   # → 200

# Login
curl -c /tmp/c.txt -X POST https://fotos.tudominio.com/api/auth/login -d "password=loquequieras" -L

# Subir una foto
curl -b /tmp/c.txt -X POST https://fotos.tudominio.com/api/upload \
  -F "file=@foto.cr2" -F "decision=create"
```

### Test local del Dockerfile (antes de subir)

```bash
pnpm docker:build    # construye personal-flickr:local
pnpm docker:run      # arranca con bind mount ./data y .env del repo
# → http://localhost:4321
```

### Backup en Coolify

El volumen `/data` contiene **todo** lo importante:

```bash
# Dump tarball desde Coolify host (o desde el container)
docker exec <container> tar czf - /data > backup-$(date +%F).tgz

# Restaurar
docker cp backup.tgz <container>:/tmp/
docker exec <container> tar xzf /tmp/backup.tgz -C /
```

## Variables de entorno

| Var              | Default    | Descripción                                                |
| ---------------- | ---------- | ---------------------------------------------------------- |
| `APP_USERNAME`   | `admin`    | Usuario requerido en el login                              |
| `APP_PASSWORD`   | _required_ | Contraseña para entrar                                     |
| `SESSION_SECRET` | _auto_     | HMAC de la cookie. Si vacío, se genera + persiste en `$DATA_DIR/.session-secret` |
| `TARGET_SIZE_MB` | `2`        | Tamaño objetivo del JPEG procesado                         |
| `MAX_DIMENSION`  | `2560`     | Lado más largo tras resize                                 |
| `VIDEO_MAX_DIM`  | `1280`     | Lado más largo del vídeo transcodificado (1280 ≈ 720p)     |
| `VIDEO_CRF`      | `23`       | Calidad H.264 (libx264). Menos = mejor calidad / más peso  |
| `VIDEO_AUDIO_KBPS` | `128`    | Bitrate del audio AAC                                      |
| `VIDEO_CONCURRENCY` | `1`     | Cuántos ffmpeg simultáneos en la cola de transcode         |
| `DATA_DIR`       | `./data`   | Dónde se guarda todo (en Docker se setea a `/data`)        |
| `HOST`           | `0.0.0.0`  | Bind host (Astro Node adapter)                             |
| `PORT`           | `4321`     | Puerto (Astro Node adapter)                                |
| `COOKIE_SECURE`  | `auto`     | `true`/`false`. Auto = Secure si `NODE_ENV=production`     |
| `NODE_ENV`       | _unset_    | Si `production`, activa el flag Secure en la cookie        |

## Cómo funciona el control de colisiones

1. Antes de subir, el cliente llama a `POST /api/check-name` con el nombre del fichero.
2. El servidor sanitiza el stem (slug-friendly) y comprueba si ya existe ese `nombre.jpg`.
3. Si **no** existe → upload directo.
4. Si **sí** existe → diálogo en el cliente:
   - **Reemplazar**: sobrescribe la foto manteniendo el mismo nombre.
   - **Renombrar**: server sugiere `nombre-2.jpg` (incrementa hasta encontrar libre).
   - **Cancelar**: se descarta de la cola.
5. `POST /api/upload` re-valida la colisión en el servidor antes de escribir.

## Pipeline de procesado

### Vídeo

El upload responde rápido (~500 ms) y el transcode pesado corre en segundo plano:

```
upload tmp/  →  ffprobe (width, height, duration, rotation)
              → ffmpeg -ss 1 -frames:v 1 (poster) → sharp 480 webp
              → INSERT photo (processing_status='processing', size_bytes=0)
              → respond 200 OK con la fila
              ▼  background queue (concurrencia 1 por defecto)
              → ffmpeg -vf scale=W:H -c:v libx264 -crf 23 -preset medium
                       -pix_fmt yuv420p -c:a aac -b:a 128k -movflags +faststart
              → data/photos/{name}.mp4
              → UPDATE photo (status='ready', size_bytes=..., developed_at=now)
```

Mientras `processing_status='processing'` la UI muestra spinner + "Procesando vídeo…" sobre el poster, y el lightbox no monta el `<video>` (el archivo aún no existe en disco). El cliente hace polling de `/api/photos/{id}` cada 2.5 s hasta que la fila transiciona a `ready` o `failed`. Si el server se reinicia con jobs en vuelo, las filas huérfanas se marcan `failed` al arrancar (la cola es in-process, no persistente).

Concurrencia configurable con `VIDEO_CONCURRENCY` (default 1 — para personal use está bien, sube a 2-3 si tu host tiene cores y subes muchos clips a la vez).

Métricas típicas con los defaults (720p / CRF 23):
- vídeo 1080p del iPhone (~17 Mbps) → 720p ~1.5-2.5 Mbps → **~10-15× más pequeño**
- comparado con WhatsApp (~480p / 700 kbps): más resolución, más bitrate, **visiblemente mejor**

Las galerías, favoritos, tags y lightbox tratan vídeo y foto igual (mismo schema `photos` con columna `kind`). El lightbox conmuta al `<video>` nativo con controles cuando el item es vídeo (sin zoom ni Revelar).

### Foto

```
upload tmp/  →  ¿es RAW?
                  ├── sí: macOS  → sips → jpeg buffer (base)
                  │       Linux  → exiftool -b -PreviewImage → jpeg buffer (base)
                  └── no:        → input es ya jpeg/png/heic (base = input)

base buffer  →  sharp.rotate() (EXIF)
              → sharp.rotate(rotateParam)       ┐
              → sharp.linear(brightness, 0)     │   develop params
              → sharp.linear(contrast, offset)  │   (defecto identidad)
              → sharp.modulate({saturation,hue})┘
              → resize 2560 fit-inside
              → mozjpeg progressive, q iterando 85→60 hasta caber en TARGET_SIZE_MB
              → data/photos/{name}.jpg

base buffer  →  ...resize 480, webp q75
              → data/thumbs/{name}.webp

(solo si RAW)
base buffer  →  data/bases/{name}.jpg   (preserved as-is para re-revelado)
```

## Modelo de seguridad (sé honesto contigo mismo)

Esto es un servicio **single-user**, no Flickr para 1000 personas. Está pensado para que solo tú entres.

**Lo que protege:**
- Acceso casual desde fuera: necesitas la `APP_PASSWORD` para entrar
- Cookie firmada HMAC (no se puede falsificar sesión sin `SESSION_SECRET`)
- `HttpOnly` + `SameSite=Lax` + `Secure` (en prod) — CSRF cubierto: el navegador no manda la cookie en POSTs cross-origin
- Bot scrapers: `<meta name="robots" content="noindex">` en el layout base
- Comparación de password con `timingSafeEqual` (sin diferencias observables por tiempo)

**Lo que NO protege:**
- Brute-force online: no hay rate-limit en `/api/auth/login`. Usa una password larga (>16 caracteres aleatorios) y/o ponlo detrás de Cloudflare Access si lo expones públicamente
- Logs de Coolify/proxy: si imprimen request bodies, podrían registrar tu password en el POST de login. Revisa la config del proxy
- Path traversal en RAW: el procesado se hace sobre un archivo en `tmp/` con nombre randomizado por nosotros, así que filenames sospechosos no llegan a `exiftool` con el nombre original
- Múltiples usuarios concurrentes: SQLite con WAL aguanta varios reads en paralelo pero los writes serializan. Para 1 persona, sobra
- Filesystem fill: no hay quota — si subes 50 GB de RAW, los 50 GB ocupan disco

**Para producción seria** (si quisieras compartirlo con familia), añadirías al menos:
- Rate-limit en login (5 intentos / IP / minuto)
- Múltiples usuarios con roles
- Audit log
- Una capa de proxy con WAF (Cloudflare Access es prácticamente gratis y bloquea el 99% del ruido)

## Contribuir

Es un proyecto personal así que no esperes turnaround rápido, pero PRs / issues bienvenidos si encuentras un bug claro. Para features grandes, abre un issue primero.

## License

[MIT](LICENSE)
