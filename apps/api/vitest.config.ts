import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Starts an embedded PostgreSQL (PGlite) with the real migrations applied, or uses
    // TEST_DATABASE_URL when set. See src/test/global-setup.ts.
    globalSetup: ['./src/test/global-setup.ts'],
    setupFiles: ['./src/test/setup.ts'],
    // One shared database: run files sequentially so tests never contend for it.
    fileParallelism: false,
    testTimeout: 15_000,
    hookTimeout: 60_000,
    env: {
      NODE_ENV: 'test',
      // Keep tests hermetic regardless of the developer's shell environment;
      // src/test/setup.ts points DATABASE_URL at the test database.
      DATABASE_URL: '',
      JWT_SECRET: '',
      GOOGLE_CLIENT_ID: '',
      GOOGLE_CLIENT_SECRET: '',
      GITHUB_CLIENT_ID: '',
      GITHUB_CLIENT_SECRET: '',
      SMTP_HOST: '',
    },
  },
})
