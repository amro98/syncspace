/**
 * The signed-in area, loaded as one lazy chunk by routes.tsx (workspace UI,
 * onboarding and the realtime client stay out of the sign-in bundle).
 */
export { RequireAuth } from '@/features/auth/routes/RequireAuth'
export { AppIndexRedirect } from '@/features/workspaces/routes/AppIndexRedirect'
export { OnboardingPage } from '@/features/workspaces/routes/OnboardingPage'
export { WorkspaceHomePage } from '@/features/workspaces/routes/WorkspaceHomePage'
export { WorkspaceLayout } from '@/features/workspaces/routes/WorkspaceLayout'
export { WorkspaceSettingsPage } from '@/features/workspaces/routes/WorkspaceSettingsPage'
export { ChannelPage } from '@/features/chat/routes/ChannelPage'
export { ConversationPage } from '@/features/chat/routes/ConversationPage'
export { WorkspaceIndexRedirect } from '@/features/chat/routes/WorkspaceIndexRedirect'
