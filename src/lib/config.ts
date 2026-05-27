import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import "dotenv/config";

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

const dataDir = path.resolve(process.env.DATA_DIR ?? "./data");

/**
 * Resolve the session secret in priority order:
 *   1. SESSION_SECRET env var (lets you control rotation explicitly)
 *   2. $DATA_DIR/.session-secret if present (survives restarts)
 *   3. Generate 32 random bytes, persist to $DATA_DIR/.session-secret (mode 0600)
 *
 * Persisting in the data volume means redeploys keep your existing sessions
 * alive. Deleting the file (or setting a different env var) rotates it.
 */
function loadOrCreateSessionSecret(): string {
  const fromEnv = process.env.SESSION_SECRET;
  if (fromEnv && fromEnv.length >= 16) return fromEnv;

  const secretFile = path.join(dataDir, ".session-secret");
  try {
    const existing = fs.readFileSync(secretFile, "utf8").trim();
    if (existing.length >= 16) return existing;
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }

  const generated = crypto.randomBytes(32).toString("hex");
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(secretFile, generated, { mode: 0o600 });
  // eslint-disable-next-line no-console
  console.log(
    `[config] generated new SESSION_SECRET → ${secretFile} (mode 0600)`,
  );
  return generated;
}

export const config = {
  password: required("APP_PASSWORD"),
  sessionSecret: loadOrCreateSessionSecret(),
  targetSizeMB: Number(process.env.TARGET_SIZE_MB ?? "2"),
  maxDimension: Number(process.env.MAX_DIMENSION ?? "2560"),
  dataDir,
};

export const paths = {
  photosDir: path.join(config.dataDir, "photos"),
  thumbsDir: path.join(config.dataDir, "thumbs"),
  basesDir: path.join(config.dataDir, "bases"),
  tmpDir: path.join(config.dataDir, "tmp"),
  dbFile: path.join(config.dataDir, "db.sqlite"),
};
