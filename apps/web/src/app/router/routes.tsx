import { Navigate, type RouteObject } from 'react-router'

import { AppShell } from '@/app/layouts/AppShell'
import { AuthLayout } from '@/app/layouts/AuthLayout'

import { NotFoundPage } from './NotFoundPage'
import { paths, routePatterns } from './paths'
import { RouteErrorBoundary } from './RouteErrorBoundary'
import { RoutePlaceholder } from './RoutePlaceholder'

/**
 * Application route tree. Feature pages will replace the placeholders and be
 * code-split with the route `lazy` API. Auth guards are added in the auth phase
 * (as a layout route wrapping `/app`).
 */
export const routes: RouteObject[] = [
  {
    errorElement: <RouteErrorBoundary />,
    children: [
      { index: true, element: <Navigate to={paths.app()} replace /> },
      {
        element: <AuthLayout />,
        children: [
          { path: routePatterns.login, element: <RoutePlaceholder title="Sign in" /> },
          { path: routePatterns.register, element: <RoutePlaceholder title="Create account" /> },
        ],
      },
      {
        path: routePatterns.app,
        element: <AppShell />,
        children: [
          { index: true, element: <RoutePlaceholder title="Home" /> },
          { path: routePatterns.workspace, element: <RoutePlaceholder title="Workspace" /> },
          { path: routePatterns.channel, element: <RoutePlaceholder title="Channel" /> },
          { path: routePatterns.tasks, element: <RoutePlaceholder title="Tasks" /> },
          { path: routePatterns.settings, element: <RoutePlaceholder title="Settings" /> },
        ],
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]
