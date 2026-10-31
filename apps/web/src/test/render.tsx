import type {
  AuthUser,
  ErrorCode,
  WorkspaceDetail,
  WorkspaceRole,
  WorkspaceSummary,
} from '@syncspace/shared'
import { render } from '@testing-library/react'
import { createMemoryRouter } from 'react-router'
import { vi } from 'vitest'

import { App } from '@/app/App'
import { routes } from '@/app/router/routes'
import { createQueryClient } from '@/lib/query-client'

/**
 * Renders the real route tree and providers at `path` with an isolated query
 * cache (the app's own QueryClient configuration, without retries).
 */
export function renderRoute(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  const queryClient = createQueryClient()
  queryClient.setDefaultOptions({
    queries: { retry: false, gcTime: Infinity },
    mutations: { retry: false },
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

// ---------------------------------------------------------------------------
// API router mock: `'METHOD /path': reply | (request) => reply`
// ---------------------------------------------------------------------------

export interface MockReply {
  status?: number
  body?: unknown
}

export interface MockRequest {
  body: unknown
  url: URL
}

export type MockRoutes = Record<string, MockReply | ((request: MockRequest) => MockReply)>

export interface ApiCall {
  method: string
  path: string
  body: unknown
}

export function apiError(code: ErrorCode, status: number, message = 'Request failed'): MockReply {
  return { status, body: { error: { code, message } } }
}

export function mockApi(routes: MockRoutes) {
  const calls: ApiCall[] = []
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input))
    const method = init?.method ?? 'GET'
    const body: unknown = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined
    calls.push({ method, path: url.pathname, body })

    const route = routes[`${method} ${url.pathname}`]
    if (!route) {
      return Promise.resolve(
        jsonResponse(
          { error: { code: 'NOT_FOUND', message: `No mock for ${method} ${url.pathname}` } },
          { status: 404 },
        ),
      )
    }
    const reply = typeof route === 'function' ? route({ body, url }) : route
    if (reply.status === 204) return Promise.resolve(new Response(null, { status: 204 }))
    return Promise.resolve(jsonResponse(reply.body ?? {}, { status: reply.status ?? 200 }))
  })
  vi.stubGlobal('fetch', fetchMock)
  return { calls, fetchMock }
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

export const ids = {
  user: '01920000-7c00-7000-8000-000000000001',
  otherUser: '01920000-7c00-7000-8000-000000000002',
  workspace: '01920000-7c00-7000-8000-0000000000a1',
  otherWorkspace: '01920000-7c00-7000-8000-0000000000a2',
}

export function authUser(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    id: ids.user,
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    avatarUrl: null,
    hasPassword: true,
    providers: [],
    ...overrides,
  }
}

export function workspaceSummary(overrides: Partial<WorkspaceSummary> = {}): WorkspaceSummary {
  return {
    id: ids.workspace,
    name: 'Acme Inc.',
    slug: 'acme',
    role: 'OWNER',
    memberCount: 3,
    ...overrides,
  }
}

export function workspaceDetail(
  overrides: Partial<Omit<WorkspaceDetail, 'membership'>> & { role?: WorkspaceRole } = {},
): WorkspaceDetail {
  const { role = 'OWNER', ...rest } = overrides
  return {
    id: ids.workspace,
    name: 'Acme Inc.',
    slug: 'acme',
    ownerId: ids.user,
    createdAt: '2026-01-01T00:00:00.000Z',
    memberCount: 3,
    membership: { role, joinedAt: '2026-01-01T00:00:00.000Z' },
    ...rest,
  }
}

/** Routes for a signed-in user who belongs to `workspaces`. */
export function signedInRoutes(
  options: { user?: AuthUser; workspaces?: WorkspaceDetail[] } = {},
): MockRoutes {
  const user = options.user ?? authUser()
  const workspaces = options.workspaces ?? [workspaceDetail()]
  const routes: MockRoutes = {
    'GET /auth/me': { body: { user } },
    'GET /auth/providers': { body: { providers: ['GOOGLE', 'GITHUB'] } },
    'GET /workspaces': {
      body: {
        items: workspaces.map((workspace) => ({
          id: workspace.id,
          name: workspace.name,
          slug: workspace.slug,
          role: workspace.membership.role,
          memberCount: workspace.memberCount,
        })),
        nextCursor: null,
      },
    },
    'POST /auth/logout': { status: 204 },
  }
  for (const workspace of workspaces)
    routes[`GET /workspaces/${workspace.id}`] = { body: workspace }
  return routes
}

export const signedOutRoutes: MockRoutes = {
  'GET /auth/me': apiError('UNAUTHENTICATED', 401, 'Authentication required'),
  'GET /auth/providers': { body: { providers: ['GOOGLE', 'GITHUB'] } },
}
