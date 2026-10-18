/**
 * Backend entry point for authorization.
 *
 * - Policy: the pure rule functions live in @syncspace/shared (so the web
 *   client renders the same affordances) and are re-exported here. The API is
 *   the authority; client-side checks are UX only.
 * - Context: `context.ts` maps Prisma rows to the policy's normalised inputs.
 * - Enforcement: `enforce.ts` turns a decision into a 404/403 AppError.
 *
 * Route handlers never inspect roles directly — they call these functions.
 * Rules are documented in docs/PERMISSIONS.md.
 */
export {
  canAccessChannel,
  canAccessConversation,
  canAddChannelMember,
  canAddConversationParticipant,
  canChangeMemberRole,
  canCreateBoard,
  canCreateChannel,
  canCreateTask,
  canDeleteBoard,
  canDeleteMessage,
  canDeleteTask,
  canDeleteWorkspace,
  canEditMessage,
  canEditTask,
  canGrantRole,
  canInviteMember,
  canJoinChannel,
  canLeaveConversation,
  canLeaveWorkspace,
  canManageBoard,
  canManageChannel,
  canManageLabels,
  canManageMembers,
  canManageWorkspace,
  canModerateMessage,
  canPostInChannel,
  canPostInConversation,
  canPostMessage,
  canReactToMessage,
  canRemoveChannelMember,
  canRemoveMember,
  canRenameConversation,
  canReplyToMessage,
  canRevokeInvite,
  canStartConversation,
  canTransferOwnership,
  canViewBoard,
  canViewDestination,
  canViewWorkspace,
  evaluateInviteAcceptance,
  hasRoleAtLeast,
  isWorkspaceAdmin,
  isWorkspaceMember,
  isWorkspaceOwner,
} from '@syncspace/shared'
export type {
  BoardContext,
  ChannelContext,
  ConversationContext,
  MessageContext,
  TaskContext,
  WorkspaceActor,
} from '@syncspace/shared'

export * from './context'
export * from './enforce'
