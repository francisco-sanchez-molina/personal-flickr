/// <reference path="../.astro/types.d.ts" />

declare namespace App {
  interface Locals {
    /** The logged-in user, or null when not authenticated. */
    user: { username: string } | null;
  }
}

interface ImportMetaEnv {
  /** Username required at login. Defaults to "admin" if unset. */
  readonly APP_USERNAME?: string;
  readonly APP_PASSWORD: string;
  readonly SESSION_SECRET: string;
  readonly TARGET_SIZE_MB?: string;
  readonly MAX_DIMENSION?: string;
  readonly DATA_DIR?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
