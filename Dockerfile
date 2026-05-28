# syntax=docker/dockerfile:1.6

# ============================================================
#  Builder
# ============================================================
FROM node:22-bookworm-slim AS builder
WORKDIR /app

# Build tools (needed if a prebuilt binary is unavailable for the target arch)
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 make g++ ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# pnpm via corepack
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

# Install deps (lockfile-driven). All deps + devDeps for the build step.
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Build
COPY . .
RUN pnpm build

# Strip devDeps from node_modules so the runtime image is smaller
RUN pnpm prune --prod

# ============================================================
#  Runtime
# ============================================================
FROM node:22-bookworm-slim AS runtime
WORKDIR /app

# Runtime tools:
#  - libimage-exiftool-perl : extract embedded JPEG previews from RAW
#  - ffmpeg                 : transcode uploaded videos to 720p H.264/AAC MP4
#  - libheif1               : HEIC/HEIF decode support for sharp/libvips (iPhone)
#  - gosu                   : drop privileges in the entrypoint
#  - tini                   : PID 1 + signal forwarding
RUN apt-get update && apt-get install -y --no-install-recommends \
      libimage-exiftool-perl \
      ffmpeg \
      libheif1 \
      gosu \
      tini \
      ca-certificates \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=4321 \
    DATA_DIR=/data

# Copy compiled server + production deps only
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

# Entrypoint: chowns /data as root, then drops to `node` via gosu
COPY --chmod=755 docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

# Persistent volume mount point
VOLUME ["/data"]

# /app stays owned by node so the app can read its own files. /data is
# fixed at runtime by the entrypoint (the volume mount overlays whatever
# we set at build time, so an early chown wouldn't survive).
RUN chown -R node:node /app && mkdir -p /data

# NOTE: we deliberately do NOT `USER node` here — the entrypoint starts
# as root to chown /data and then exec's gosu to drop privileges.

EXPOSE 4321

# Coolify uses this. Reads PORT from env so it works whether Coolify sets
# PORT=3000 (its default for apps) or we keep the 4321 from the ENV above.
HEALTHCHECK --interval=30s --timeout=3s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/login').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "./dist/server/entry.mjs"]
