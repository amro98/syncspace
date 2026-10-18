import { z } from 'zod'

const envSchema = z.object({
  VITE_API_BASE_URL: z
    .url()
    .default('http://localhost:4000')
    .transform((url) => url.replace(/\/+$/, '')),
})

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim()

/** Validated client configuration. Nothing else reads `import.meta.env` directly. */
export const env = envSchema.parse({
  // An empty value in .env means "use the default".
  VITE_API_BASE_URL: apiBaseUrl === '' ? undefined : apiBaseUrl,
})
