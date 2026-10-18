import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/server.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node20',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  // @syncspace/shared ships TypeScript source, so it is compiled into the
  // bundle. All other dependencies stay external and resolve from node_modules.
  noExternal: [/^@syncspace\//],
})
