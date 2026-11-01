import { Navigate, type RouteObject } from 'react-router'

import { AuthLayout } from '@/app/layouts/AuthLayout'
import { FullPageSpinner } from '@/components/shared/Spinner'
import { ForgotPasswordPage } from '@/features/auth/routes/ForgotPasswordPage'
import { GuestOnly } from '@/features/auth/routes/guards'
import { LoginPage } from '@/features/auth/routes/LoginPage'
import { RegisterPage } from '@/features/auth/routes/RegisterPage'
import { ResetPasswordPage } from '@/features/auth/routes/ResetPasswordPage'
import { SocialConfirmPage } from '@/features/auth/routes/SocialConfirmPage'
import { InvitePage } from '@/features/invites/InvitePage'

import { NotFoundPage } from './NotFoundPage'
import { paths, routePatterns } from './paths'
import { RouteErrorBoundary } from './RouteErrorBoundary'
import { RoutePlaceholder } from './RoutePlaceholder'

/**
 * Application route tree.
 *
 * - Guest-only: sign-in, sign-up, forgot password (signed-in users are sent on).
 * - Open: reset password, social confirmation, invitations (work either way).
 * - /app/*: requires a session; workspace routes additionally require membership.
 *
 * The workspace index opens its first channel; channels and DMs are addressed
 * by URL. The task board is a placeholder until its phase.
 *
 * The signed-in area (/app/*) is code-split: sign-in pages do not download the
 * workspace UI or the realtime client.
 */
export const routes: RouteObject[] = [
  {
    errorElement: <RouteErrorBoundary />,
    hydrateFallbackElement: <FullPageSpinner />,
    children: [
      { index: true, element: <Navigate to={paths.app()} replace /> },
      {
        element: <GuestOnly />,
        children: [
          {
            element: <AuthLayout />,
            children: [
              { path: routePatterns.login, element: <LoginPage /> },
              { path: routePatterns.register, element: <RegisterPage /> },
              { path: routePatterns.forgotPassword, element: <ForgotPasswordPage /> },
            ],
          },
        ],
      },
      {
        element: <AuthLayout />,
        children: [
          { path: routePatterns.resetPassword, element: <ResetPasswordPage /> },
          { path: routePatterns.socialConfirm, element: <SocialConfirmPage mode="signup" /> },
          { path: routePatterns.socialLink, element: <SocialConfirmPage mode="link" /> },
          { path: routePatterns.invite, element: <InvitePage /> },
        ],
      },
      {
        path: routePatterns.app,
        lazy: async () => ({ Component: (await import('./app-area')).RequireAuth }),
        children: [
          {
            index: true,
            lazy: async () => ({ Component: (await import('./app-area')).AppIndexRedirect }),
          },
          {
            path: routePatterns.onboarding,
            lazy: async () => ({ Component: (await import('./app-area')).OnboardingPage }),
          },
          {
            path: routePatterns.workspace,
            lazy: async () => ({ Component: (await import('./app-area')).WorkspaceLayout }),
            children: [
              {
                index: true,
                lazy: async () => ({
                  Component: (await import('./app-area')).WorkspaceIndexRedirect,
                }),
              },
              {
                path: routePatterns.overview,
                lazy: async () => ({ Component: (await import('./app-area')).WorkspaceHomePage }),
              },
              {
                path: routePatterns.channel,
                lazy: async () => ({ Component: (await import('./app-area')).ChannelPage }),
              },
              {
                path: routePatterns.dm,
                lazy: async () => ({ Component: (await import('./app-area')).ConversationPage }),
              },
              { path: routePatterns.tasks, element: <RoutePlaceholder title="Tasks" /> },
              {
                path: routePatterns.settings,
                lazy: async () => ({
                  Component: (await import('./app-area')).WorkspaceSettingsPage,
                }),
              },
            ],
          },
        ],
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]
