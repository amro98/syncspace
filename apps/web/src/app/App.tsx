import type { QueryClient } from '@tanstack/react-query'
import { type createBrowserRouter, RouterProvider } from 'react-router'

import { Toaster } from '@/components/shared/Toaster'

import { AppProviders } from './providers/AppProviders'

export type AppRouter = ReturnType<typeof createBrowserRouter>

interface AppProps {
  router: AppRouter
  queryClient: QueryClient
}

export function App({ router, queryClient }: AppProps) {
  return (
    <AppProviders queryClient={queryClient}>
      <RouterProvider router={router} />
      <Toaster />
    </AppProviders>
  )
}
