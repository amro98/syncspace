import { type QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

import { ThemeProvider } from './ThemeProvider'

interface AppProvidersProps {
  queryClient: QueryClient
  children: ReactNode
}

/**
 * Global providers. The QueryClient is injected (not a module singleton) so
 * tests get an isolated cache per render.
 */
export function AppProviders({ queryClient, children }: AppProvidersProps) {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>{children}</ThemeProvider>
    </QueryClientProvider>
  )
}
