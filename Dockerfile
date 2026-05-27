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
#  - libimage-exiftool-perl: extract embedded JPEG previews from RAW (CR2/CR3/NEF/...)
#  - tini: PID 1 + signal forwarding
#  - dumb-init alternative; tini is in main repos
RUN apt-get update && apt-get install -y --no-install-recommends \
      libimage-exiftool-perl \
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

# Persistent volume mount point
VOLUME ["/data"]

# Default user is `node` (uid 1000)
RUN mkdir -p /data && chown -R node:node /data /app
USER node

EXPOSE 4321

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/login').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "./dist/server/entry.mjs"]
