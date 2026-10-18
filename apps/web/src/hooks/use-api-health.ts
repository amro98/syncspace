import { healthResponseSchema } from '@syncspace/shared'
import { useQuery } from '@tanstack/react-query'

import { apiClient } from '@/lib/api-client'
import { queryKeys } from '@/lib/query-keys'

const HEALTH_POLL_INTERVAL_MS = 30_000

/** Polls the API liveness endpoint through the central API client. */
export function useApiHealth() {
  return useQuery({
    queryKey: queryKeys.health(),
    queryFn: ({ signal }) => apiClient.get('/health', { schema: healthResponseSchema, signal }),
    refetchInterval: HEALTH_POLL_INTERVAL_MS,
    staleTime: HEALTH_POLL_INTERVAL_MS,
    retry: false,
  })
}
