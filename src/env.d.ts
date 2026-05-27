/// <reference path="../.astro/types.d.ts" />

declare namespace App {
  interface Locals {
    user: { authenticated: true } | null;
  }
}

interface ImportMetaEnv {
  readonly APP_PASSWORD: string;
  readonly SESSION_SECRET: string;
  readonly TARGET_SIZE_MB?: string;
  readonly MAX_DIMENSION?: string;
  readonly DATA_DIR?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
