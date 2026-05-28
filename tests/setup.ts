/**
 * Global setup — runs before any test file is loaded. Provides the
 * env vars `src/lib/config.ts` validates at import time so we can
 * import the rest of `~/lib/*` cleanly in tests.
 *
 * Anything that points at the filesystem uses an isolated `DATA_DIR`
 * under `node_modules/.tmp` so concurrent test runs don't fight over
 * `data/.session-secret` or similar.
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "personal-flickr-tests-"));

process.env.APP_USERNAME ??= "test-user";
process.env.APP_PASSWORD ??= "test-pass-do-not-use-in-prod";
process.env.SESSION_SECRET ??= "test-session-secret-with-enough-bytes";
process.env.DATA_DIR ??= tmpDir;
process.env.NODE_ENV ??= "test";
