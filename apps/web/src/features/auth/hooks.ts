import type { AuthUser } from '@syncspace/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'

import { queryKeys } from '@/lib/query-keys'

import { fetchAuthProviders, fetchSession, logout } from './api'

/** Server auth state lives only in TanStack Query (never in Zustand). */
export function useSession() {
  return useQuery({
    queryKey: queryKeys.auth.session(),
    queryFn: ({ signal }) => fetchSession(signal),
    staleTime: 5 * 60_000,
  })
}

export function useAuthProviders() {
  return useQuery({
    queryKey: queryKeys.auth.providers(),
    queryFn: fetchAuthProviders,
    staleTime: Infinity,
  })
}

/**
 * Switches the client to a different identity (sign in, sign up, social
 * confirm, sign out). The whole cache is dropped first so nothing cached for
 * the previous user can ever render for the next one.
 */
export function useReplaceSession() {
  const queryClient = useQueryClient()
  return useCallback(
    (user: AuthUser | null) => {
      const sessionHash = JSON.stringify(queryKeys.auth.session())
      // Keep the session query itself (mounted guards observe it); drop everything else.
      void queryClient.cancelQueries()
      queryClient.removeQueries({ predicate: (query) => query.queryHash !== sessionHash })
      queryClient.getMutationCache().clear()
      queryClient.setQueryData(queryKeys.auth.session(), user)
    },
    [queryClient],
  )
}

export function useLogout() {
  const replaceSession = useReplaceSession()
  return useMutation({
    mutationFn: logout,
    onSettled: () => {
      // Signed out locally even if the request failed (e.g. offline): the cookie
      // is httpOnly, but the server rejects it on the next request anyway.
      // Loaded lazily: the realtime client lives in the signed-in chunk.
      void import('@/lib/socket').then(({ disconnectSocket }) => {
        disconnectSocket()
      })
      replaceSession(null)
    },
  })
}
