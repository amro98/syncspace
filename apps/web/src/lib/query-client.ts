import { QueryClient } from '@tanstack/react-query'

import { ApiError } from '@/lib/api-client'

declare module '@tanstack/react-query' {
  interface Register {
    // Every queryFn/mutationFn goes through apiClient, which only throws ApiError.
    defaultError: ApiError
  }
}

function shouldRetry(failureCount: number, error: unknown): boolean {
  // Client errors (4xx) are deterministic; retrying cannot fix them.
  if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false
  return failureCount < 2
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Realtime events keep active data fresh, so avoid refetch storms.
        staleTime: 30_000,
        retry: shouldRetry,
      },
      mutations: {
        retry: false,
      },
    },
  })
}
