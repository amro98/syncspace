import { generatePath } from 'react-router'

/**
 * Route patterns (used by the router) and typed path builders (used for links
 * and navigation). Never hand-write app URLs elsewhere.
 */
export const routePatterns = {
  login: '/login',
  register: '/register',
  forgotPassword: '/forgot-password',
  resetPassword: '/reset-password',
  socialConfirm: '/auth/social/confirm',
  socialLink: '/auth/social/link',
  invite: '/invite/:token',
  app: '/app',
  onboarding: '/app/onboarding',
  workspace: '/app/workspaces/:workspaceId',
  overview: '/app/workspaces/:workspaceId/overview',
  channel: '/app/workspaces/:workspaceId/channel/:channelId',
  dm: '/app/workspaces/:workspaceId/dm/:conversationId',
  tasks: '/app/workspaces/:workspaceId/tasks',
  settings: '/app/workspaces/:workspaceId/settings',
} as const

/** Appends `?redirect=` (and other params) only when present. */
function withQuery(path: string, params: Record<string, string | undefined>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value)
  }
  const query = search.toString()
  return query ? `${path}?${query}` : path
}

export const paths = {
  login: (options: { redirect?: string; error?: string } = {}) =>
    withQuery(routePatterns.login, options),
  register: (options: { redirect?: string; email?: string } = {}) =>
    withQuery(routePatterns.register, options),
  forgotPassword: (options: { email?: string } = {}) =>
    withQuery(routePatterns.forgotPassword, options),
  invite: (token: string) => generatePath(routePatterns.invite, { token }),
  app: () => routePatterns.app,
  onboarding: (options: { step?: 'create' } = {}) => withQuery(routePatterns.onboarding, options),
  workspace: (workspaceId: string) => generatePath(routePatterns.workspace, { workspaceId }),
  overview: (workspaceId: string) => generatePath(routePatterns.overview, { workspaceId }),
  channel: (workspaceId: string, channelId: string) =>
    generatePath(routePatterns.channel, { workspaceId, channelId }),
  dm: (workspaceId: string, conversationId: string) =>
    generatePath(routePatterns.dm, { workspaceId, conversationId }),
  tasks: (workspaceId: string) => generatePath(routePatterns.tasks, { workspaceId }),
  settings: (workspaceId: string) => generatePath(routePatterns.settings, { workspaceId }),
} as const
