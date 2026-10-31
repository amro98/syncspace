import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query'

import { ApiError } from '@/lib/api-client'
import { queryKeys } from '@/lib/query-keys'

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
  /**
   * A 401 from any request means the session ended (expired, revoked by a
   * password reset, or signed out elsewhere). Marking the session as signed
   * out makes the route guard send the user to /login.
   */
  const onError = (error: unknown) => {
    if (error instanceof ApiError && error.code === 'UNAUTHENTICATED') {
      queryClient.setQueryData(queryKeys.auth.session(), null)
    }
  }

  const queryClient: QueryClient = new QueryClient({
    queryCache: new QueryCache({ onError }),
    mutationCache: new MutationCache({ onError }),
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
  return queryClient
}
