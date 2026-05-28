/**
 * The single `Database` instance for the app.
 *
 * Importing this module:
 *   - Ensures the data sub-directories exist (photos / thumbs / bases / tmp).
 *   - Opens (or creates) the SQLite file.
 *   - Sets the pragmas that need to live with each connection: WAL for
 *     concurrent readers + FK enforcement.
 *
 * Schema bootstrap and per-entity migrations live in `./schema.ts`, which
 * imports `db` from here. Entity modules (photo, gallery, tag, …) also
 * import from here for their prepared statements.
 */
import fs from "node:fs";
import Database from "better-sqlite3";
import { paths } from "../config";

fs.mkdirSync(paths.photosDir, { recursive: true });
fs.mkdirSync(paths.thumbsDir, { recursive: true });
fs.mkdirSync(paths.basesDir, { recursive: true });
fs.mkdirSync(paths.tmpDir, { recursive: true });

export const db = new Database(paths.dbFile);
db.pragma("journal_mode = WAL");
// SQLite enforces foreign keys per-connection; opt in once at startup so
// our ON DELETE CASCADE / SET NULL constraints actually do their job.
db.pragma("foreign_keys = ON");
