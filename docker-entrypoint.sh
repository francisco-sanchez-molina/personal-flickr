#!/bin/sh
set -e

# Fix ownership of the persistent volume.
#
# Coolify (and many orchestrators) create the mount point as root:root.
# The app runs as the unprivileged `node` user (uid 1000) so it can't write
# unless we chown first. We skip the chown if /data is already owned by node
# to keep restarts fast on large libraries.

if [ -d /data ]; then
  current_uid="$(stat -c %u /data 2>/dev/null || echo unknown)"
  if [ "$current_uid" != "1000" ]; then
    echo "[entrypoint] /data owned by uid=$current_uid, chowning to node…"
    chown -R node:node /data || {
      echo "[entrypoint] WARNING: chown failed (rootless docker?); the app may not be able to write to /data"
    }
  fi
fi

# Drop privileges and hand off to tini for clean signal forwarding.
exec /usr/bin/tini -- gosu node "$@"
