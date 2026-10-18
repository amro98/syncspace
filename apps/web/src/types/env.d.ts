interface ImportMetaEnv {
  /** Base URL of the SyncSpace API (REST + Socket.IO). Validated in src/lib/env.ts. */
  readonly VITE_API_BASE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
