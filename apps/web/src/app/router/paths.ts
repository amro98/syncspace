import { generatePath } from 'react-router'

/**
 * Route patterns (used by the router) and typed path builders (used for links
 * and navigation). Never hand-write app URLs elsewhere.
 */
export const routePatterns = {
  login: '/login',
  register: '/register',
  app: '/app',
  workspace: '/app/workspaces/:workspaceId',
  channel: '/app/workspaces/:workspaceId/channel/:channelId',
  tasks: '/app/workspaces/:workspaceId/tasks',
  settings: '/app/workspaces/:workspaceId/settings',
} as const

export const paths = {
  login: () => routePatterns.login,
  register: () => routePatterns.register,
  app: () => routePatterns.app,
  workspace: (workspaceId: string) => generatePath(routePatterns.workspace, { workspaceId }),
  channel: (workspaceId: string, channelId: string) =>
    generatePath(routePatterns.channel, { workspaceId, channelId }),
  tasks: (workspaceId: string) => generatePath(routePatterns.tasks, { workspaceId }),
  settings: (workspaceId: string) => generatePath(routePatterns.settings, { workspaceId }),
} as const
