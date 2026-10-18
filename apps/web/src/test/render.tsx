import { QueryClient } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import { createMemoryRouter } from 'react-router'
import { vi } from 'vitest'

import { App } from '@/app/App'
import { routes } from '@/app/router/routes'

/** Renders the real route tree and providers at `path` with an isolated query cache. */
export function renderRoute(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  })
  const result = render(<App router={router} queryClient={queryClient} />)
  return { ...result, router, queryClient }
}

export function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers)
  headers.set('Content-Type', 'application/json')
  return new Response(JSON.stringify(body), { status: 200, ...init, headers })
}

/** Stubs global fetch; returns the mock for assertions. */
export function mockFetch(implementation: (input: RequestInfo | URL) => Promise<Response>) {
  const fetchMock = vi.fn(implementation)
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}
