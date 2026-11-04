import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query'

import { ApiError } from '@/lib/api-client'
import { queryKeys } from '@/lib/query-keys'
import { useUiStore } from '@/stores/ui-store'

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
    if (!(error instanceof ApiError) || error.code !== 'UNAUTHENTICATED') return
    const sessionKey = queryKeys.auth.session()
    if (queryClient.getQueryData(sessionKey)) {
      // A signed-in session just ended: drop everything cached for it (nothing
      // of the previous session may render again) and explain why on /login.
      const sessionHash = JSON.stringify(sessionKey)
      queryClient.removeQueries({ predicate: (query) => query.queryHash !== sessionHash })
      useUiStore.getState().setSessionExpired(true)
    }
    // Idempotent: further 401s while redirecting change nothing (no loops).
    queryClient.setQueryData(sessionKey, null)
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
