# SyncSpace — Authorization Rules

The single reference for who may do what. The rules are implemented once, as pure functions in
[`packages/shared/src/permissions/`](../packages/shared/src/permissions/), and enforced by the API
through [`apps/api/src/lib/permissions/`](../apps/api/src/lib/permissions/). The web client calls the
same functions to decide which controls to show. **If this document and the code disagree, it is
a bug — fix both in the same change.**

## Principles

1. **Workspace membership first.** Every workspace resource requires membership of the workspace
   that owns it. A non-member gets nothing — not even a 403 (see rule 5).
2. **Strict role hierarchy.** `OWNER > ADMIN > MEMBER`. A higher role can do everything a lower
   role can, except where a rule is about _authorship_ or _participation_ (below).
3. **Authorship ≠ administration.** Editing a message is the author's right alone. Admin power is
   _moderation_ (deleting), never impersonation (editing).
4. **Participation ≠ administration.** Direct and group conversations are private to their
   participants. Admins have no implicit access to them.
5. **Hide, then forbid.** If the actor may not _see_ a resource, the API answers **404** as if it
   did not exist (`ensureVisible`). If they can see it but may not perform the action, **403**
   (`authorize`).
6. **No ad-hoc checks.** Routes and services never compare roles directly; they call a `can*`
   function with a normalised context (`WorkspaceActor`, `ChannelContext`, …).
7. **Defence in depth.** The database independently enforces tenancy, membership and ownership
   invariants ([`DATA_MODEL.md`](DATA_MODEL.md#invariants)), so a missed application check cannot
   corrupt data across workspaces.

## Roles

| Capability                                          | OWNER | ADMIN | MEMBER | Function                                 |
| --------------------------------------------------- | :---: | :---: | :----: | ---------------------------------------- |
| View the workspace and public content               |  ✅   |  ✅   |   ✅   | `canViewWorkspace`                       |
| Edit workspace settings (name, slug)                |  ✅   |   —   |   —    | `canManageWorkspace`                     |
| Delete the workspace                                |  ✅   |   —   |   —    | `canDeleteWorkspace`                     |
| Transfer ownership to another member                |  ✅   |   —   |   —    | `canTransferOwnership`                   |
| Open member management                              |  ✅   |  ✅   |   —    | `canManageMembers`                       |
| Invite as MEMBER / revoke MEMBER invites            |  ✅   |  ✅   |   —    | `canInviteMember`, `canRevokeInvite`     |
| Invite as ADMIN / revoke ADMIN invites              |  ✅   |   —   |   —    | `canInviteMember`, `canRevokeInvite`     |
| Change a member's role (ADMIN ↔ MEMBER)             |  ✅   |   —   |   —    | `canChangeMemberRole`                    |
| Remove an ADMIN                                     |  ✅   |   —   |   —    | `canRemoveMember`                        |
| Remove a MEMBER                                     |  ✅   |  ✅   |   —    | `canRemoveMember`                        |
| Leave the workspace                                 |  —¹   |  ✅   |   ✅   | `canLeaveWorkspace`                      |
| Create channels (public or private)                 |  ✅   |  ✅   |   ✅   | `canCreateChannel`                       |
| Manage any channel (rename, type, archive, delete)  |  ✅   |  ✅   |   —    | `canManageChannel`                       |
| Read private channels without being a member        |  ✅   |  ✅   |   —    | `canAccessChannel`                       |
| Delete other people's channel messages (moderation) |  ✅   |  ✅   |   —    | `canDeleteMessage`, `canModerateMessage` |
| Create boards                                       |  ✅   |  ✅   |   ✅   | `canCreateBoard`                         |
| Manage any board and its columns                    |  ✅   |  ✅   |  own²  | `canManageBoard`                         |
| Delete boards permanently                           |  ✅   |  ✅   |   —    | `canDeleteBoard`                         |
| Create and edit tasks (move, assign, label, …)      |  ✅   |  ✅   |   ✅   | `canCreateTask`, `canEditTask`           |
| Delete any task                                     |  ✅   |  ✅   |  own²  | `canDeleteTask`                          |
| Manage workspace labels                             |  ✅   |  ✅   |   —    | `canManageLabels`                        |

¹ The OWNER must transfer ownership (or delete the workspace) first.
² Boards/tasks the member created.

### OWNER

- Exactly one per workspace, always (enforced by the database, see `DATA_MODEL.md`).
- Full control, including everything ADMIN can do.
- Only role that manages **admins**: grants/revokes ADMIN, removes admins, invites admins.
- Cannot be removed, demoted, or leave. Ownership changes only through **transfer**: the new owner
  must already be a member; the previous owner becomes ADMIN.
- Nobody can be _granted_ OWNER via invite or role change (`canGrantRole(…, 'OWNER')` is always false).

### ADMIN

- Manages channels (including private ones), boards, tasks and labels.
- Manages **members** where allowed: invites and removes `MEMBER`s, revokes MEMBER invites.
- Cannot touch the OWNER, cannot create/remove/demote other ADMINs, cannot change roles.
- Cannot edit workspace settings or delete the workspace.

### MEMBER

- Normal collaboration: read/post in public channels, create channels, start conversations,
  create and edit tasks, create boards.
- Manages boards and deletes tasks **they created**.
- No administration of the workspace, its members, or other people's content.

## Channels

| Action                                   | PUBLIC channel                              | PRIVATE channel                                     |
| ---------------------------------------- | ------------------------------------------- | --------------------------------------------------- |
| Read (`canAccessChannel`)                | every workspace member                      | channel members **+ OWNER/ADMIN** (oversight)       |
| Post, react, reply (`canPostInChannel`)  | every workspace member                      | channel members only (oversight is read + moderate) |
| Self-join (`canJoinChannel`)             | any member not already in it                | never — must be added                               |
| Add people (`canAddChannelMember`)       | n/a (open to all members)                   | existing channel members and OWNER/ADMIN            |
| Remove people (`canRemoveChannelMember`) | yourself (leave); OWNER/ADMIN remove anyone | same                                                |
| Manage (`canManageChannel`)              | OWNER/ADMIN                                 | OWNER/ADMIN                                         |

- `ChannelMember` rows are **required for private channels only**; public access derives from
  workspace membership.
- **Archived** channels remain readable but are read-only: no posting, reacting, replying, editing
  or adding members. Admins can still manage (e.g. unarchive) and moderate them.

## Direct and group conversations

| Action                                 | Who                                                              | Function                                                                         |
| -------------------------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Start a DIRECT or GROUP conversation   | any workspace member                                             | `canStartConversation`                                                           |
| Read and post                          | participants only — **no admin override**                        | `canAccessConversation`, `canPostInConversation`                                 |
| Add participants, rename, leave        | participants of a **GROUP**                                      | `canAddConversationParticipant`, `canRenameConversation`, `canLeaveConversation` |
| Add/rename/leave a DIRECT conversation | nobody — a DM is fixed to its pair (hide it client-side instead) | —                                                                                |

Participants must be members of the conversation's workspace (database-enforced); leaving the
workspace removes them from its conversations automatically.

## Messages

| Action              | Rule                                                                            | Function             |
| ------------------- | ------------------------------------------------------------------------------- | -------------------- |
| Edit                | **Author only**, message not deleted, author can still post in the destination  | `canEditMessage`     |
| Delete (own)        | Author, message not deleted, author can still post in the destination           | `canDeleteMessage`   |
| Delete (moderation) | OWNER/ADMIN, **channel messages only** (incl. private and archived channels)    | `canModerateMessage` |
| React               | Can post in the destination, message not deleted                                | `canReactToMessage`  |
| Reply in thread     | Can post in the destination, message not deleted, message is not itself a reply | `canReplyToMessage`  |
| View                | Can access the destination                                                      | `canViewDestination` |

- Deletion is **soft** (`deletedAt`); the service redacts `content`. Replies and reactions keep their anchor.
- No one — including the OWNER — can edit someone else's message.
- No one can moderate DMs or group conversations.

## Boards and tasks

- Boards are visible to every workspace member (no private boards in the MVP).
- **Archived boards are read-only**: no task creation or editing; only managers can unarchive.
- Task editing is collaborative: any member can edit any task on an active board, including moving,
  assigning (only to workspace members — database-enforced) and applying labels (only labels of the
  same workspace — database-enforced).
- Permanent deletion is restricted (boards: OWNER/ADMIN; tasks: creator on an active board, or
  OWNER/ADMIN). Prefer archiving.

## Invitations

- Who may invite / revoke: anyone who may **grant the invite's role** (`canGrantRole`):
  OWNER → ADMIN or MEMBER; ADMIN → MEMBER; never OWNER.
- Accepting (`evaluateInviteAcceptance`): the invite must be pending (not accepted, not revoked,
  not expired) and addressed to the signed-in user's own email. A leaked link cannot be redeemed by
  a different account.
- Tokens are random, sent only to the invitee, and stored as **SHA-256 hashes**.
- One pending invite per (workspace, email); re-inviting refreshes the pending invite.

## Notifications

- A notification is visible to its recipient only. This is a query-scoping rule rather than a
  policy function: every notification query filters on `userId = <signed-in user>`. No role grants
  access to someone else's notifications.

## Realtime rooms

Joining a room grants read access to everything broadcast into it, so room joins use the **same**
rules: `workspace:<id>` requires `canViewWorkspace`; `channel:<id>` requires `canAccessChannel`;
`conversation:<id>` requires `canAccessConversation`. Workspace and channel joins are enforced by
`membershipRoomAccess`; conversation joins arrive with the messaging phase.

## Using the policy

```ts
import {
  authorize,
  canManageChannel,
  canAccessChannel,
  ensureVisible,
  toActor,
  toChannelContext,
} from '@/lib/permissions'

const membership = await findMembership(channel.workspaceId, userId) // WorkspaceMember | null
const actor = toActor(userId, membership)
const context = toChannelContext(channel, await isChannelMember(channel.id, userId))

ensureVisible(canAccessChannel(actor, context)) // 404 when the actor cannot see it
authorize(canManageChannel(actor, context)) // 403 when they see it but cannot act
```

Contexts are always built for the **resource's** workspace, from the actor's point of view.
