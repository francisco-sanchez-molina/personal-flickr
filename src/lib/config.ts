import path from "node:path";
import "dotenv/config";

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

export const config = {
  password: required("APP_PASSWORD"),
  sessionSecret: required("SESSION_SECRET"),
  targetSizeMB: Number(process.env.TARGET_SIZE_MB ?? "2"),
  maxDimension: Number(process.env.MAX_DIMENSION ?? "2560"),
  dataDir: path.resolve(process.env.DATA_DIR ?? "./data"),
};

export const paths = {
  photosDir: path.join(config.dataDir, "photos"),
  thumbsDir: path.join(config.dataDir, "thumbs"),
  basesDir: path.join(config.dataDir, "bases"),
  tmpDir: path.join(config.dataDir, "tmp"),
  dbFile: path.join(config.dataDir, "db.sqlite"),
};
