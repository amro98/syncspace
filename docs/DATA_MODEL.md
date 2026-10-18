# SyncSpace — Data Model

Source of truth: [`apps/api/prisma/schema.prisma`](../apps/api/prisma/schema.prisma) plus the
hand-written section at the end of each migration
([`20261018000000_init`](../apps/api/prisma/migrations/20261018000000_init/migration.sql),
[`20261018120000_read_state`](../apps/api/prisma/migrations/20261018120000_read_state/migration.sql)).
Authorization rules live in [`PERMISSIONS.md`](PERMISSIONS.md).

## Conventions

| Topic           | Decision                                                                                                                                                                                                                                                                                                                                               |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| IDs             | **UUIDv7** everywhere: `@default(uuid(7)) @db.Uuid`. 16-byte native `uuid`, globally unique, not guessable like serials, and time-ordered so B-tree inserts stay local and IDs sort by creation. One strategy for every table. The API validates IDs as UUIDs (`idSchema`), so a malformed ID is a 400, never a database cast error.                   |
| Naming          | PostgreSQL tables/columns are `snake_case` (`@@map`/`@map`); Prisma/TypeScript use `camelCase`.                                                                                                                                                                                                                                                        |
| Timestamps      | `timestamptz(3)`. `createdAt @default(now())` on every table; `updatedAt @updatedAt` on every mutable entity. Join rows use a semantic timestamp (`joinedAt`, `assignedAt`). Lifecycle markers are nullable timestamps (`archivedAt`, `deletedAt`, `completedAt`, `readAt`, `acceptedAt`, `revokedAt`) — a timestamp says _when_ as well as _whether_. |
| Tenancy         | Every workspace-owned row has `workspace_id`. Child rows reference their parent through **composite foreign keys** such as `(board_id, workspace_id) → boards(id, workspace_id)`, so a row can never point at another workspace's data.                                                                                                                |
| Enums           | PostgreSQL enums in Prisma; the same values are exported from `@syncspace/shared` (`WORKSPACE_ROLES`, …). A test fails if the two drift.                                                                                                                                                                                                               |
| Ephemeral state | Typing indicators and live presence are **never persisted** (Socket.IO/memory only). `users.last_seen_at` is a coarse "last active" timestamp, updated sparingly.                                                                                                                                                                                      |

## Entity overview

```
User ─┬─< WorkspaceMember >── Workspace (owner_id → User)
      │          │                │
      │          ├─< ChannelMember >── Channel ─< Message (channel)
      │          ├─< ConversationParticipant >── Conversation ─< Message (conversation)
      │          └─< TaskAssignee >── Task
      │
Workspace ─< WorkspaceInvite
Workspace ─< Board ─< BoardColumn ─< Task ─< TaskLabelAssignment >── TaskLabel >── Workspace
Message ─< Message (replies)   Message ─< MessageReaction   Message|Task ─< Attachment
User ─< Notification (recipient), Notification >── User (actor), Workspace
WorkspaceMember ─< ChannelReadState >── Channel        ConversationParticipant ── ConversationReadState (1:1)
```

## Models

| Model                     | Purpose                                         | Key fields / constraints                                                                                                                                                                                    |
| ------------------------- | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `User`                    | Identity, ready for auth                        | `email` unique + normalised (CHECK); `passwordHash` nullable (auth phase / OAuth); `lastSeenAt`                                                                                                             |
| `Workspace`               | Tenant                                          | `slug` unique, URL-safe (CHECK), stable — not regenerated on rename; `ownerId` → User (**Restrict**)                                                                                                        |
| `WorkspaceMember`         | Membership + role                               | unique `(workspaceId, userId)`; `role` OWNER/ADMIN/MEMBER; ≤1 OWNER per workspace (partial unique index)                                                                                                    |
| `WorkspaceInvite`         | Email invitation                                | `tokenHash` unique (SHA-256, raw token never stored); `role` ≠ OWNER (CHECK); one _pending_ invite per (workspace, email) (partial unique index); `acceptedAt` / `revokedAt` mutually exclusive (CHECK)     |
| `Channel`                 | Public/private channel                          | unique `(workspaceId, slug)`; `type` PUBLIC/PRIVATE; `archivedAt`                                                                                                                                           |
| `ChannelMember`           | Private-channel membership                      | PK `(channelId, userId)`; FK to the user's **workspace membership**                                                                                                                                         |
| `Conversation`            | DIRECT or GROUP DM                              | `directKey` (sorted pair) unique per workspace for DIRECT; CHECKs tie `directKey`/`name` to `type`                                                                                                          |
| `ConversationParticipant` | Who is in a conversation                        | PK `(conversationId, userId)`; FK to workspace membership                                                                                                                                                   |
| `Message`                 | Channel or conversation message, thread replies | destination XOR (CHECK); composite FKs keep destination in the same workspace; `parentMessageId` for threads; soft delete (`deletedAt`); `editedAt`                                                         |
| `MessageReaction`         | Emoji reactions                                 | PK `(messageId, userId, emoji)` — many emojis per user, each at most once                                                                                                                                   |
| `ChannelReadState`        | Read cursor per user per channel                | PK `(channelId, userId)`; composite FKs to the channel (same workspace) and to the user's workspace membership; `lastReadAt`; `lastReadMessageId` in the same channel (trigger), SET NULL on message delete |
| `ConversationReadState`   | Read cursor per participant per conversation    | PK `(conversationId, userId)`; FK to the **participant** row; `lastReadAt`; `lastReadMessageId` in the same conversation (trigger), SET NULL on message delete                                              |
| `Attachment`              | File metadata only                              | owner XOR message/task (CHECK); `size ≥ 0`; `url` + optional `storageKey`                                                                                                                                   |
| `Board`                   | Kanban board                                    | `archivedAt`                                                                                                                                                                                                |
| `BoardColumn`             | Ordered column                                  | `position` float (finite CHECK); unique `(id, boardId)` as FK target                                                                                                                                        |
| `Task`                    | Card                                            | composite FKs: board in same workspace, **column in same board**; `priority`; `position`; `dueDate`; `completedAt`; `archivedAt`                                                                            |
| `TaskAssignee`            | Task ↔ member                                   | PK `(taskId, userId)`; FK to workspace membership                                                                                                                                                           |
| `TaskLabel`               | Workspace label                                 | unique `(workspaceId, name)`; `color` `#RRGGBB` (CHECK)                                                                                                                                                     |
| `TaskLabelAssignment`     | Task ↔ label                                    | PK `(taskId, labelId)`; both FKs share `workspace_id` → same-workspace guaranteed                                                                                                                           |
| `Notification`            | Inbox item                                      | denormalised `title`/`body`; loose `(entityType, entityId)` pointer (both or neither, CHECK; no FK); `actorId`; `readAt`                                                                                    |

## Invariants

**DB** = enforced by PostgreSQL (cannot be bypassed by application bugs). **App** = enforced by the
service layer (documented contract for later phases).

| #   | Invariant                                                                                                                            | Enforced by                                                                                                                               |
| --- | ------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Workspace resources require workspace membership                                                                                     | App (policy `isWorkspaceMember`); DB for membership-scoped rows (#4)                                                                      |
| 2   | Private channel access requires a `ChannelMember` row (or OWNER/ADMIN oversight)                                                     | App (`canAccessChannel`)                                                                                                                  |
| 3   | Conversation access requires a `ConversationParticipant` row                                                                         | App (`canAccessConversation`)                                                                                                             |
| 4   | Channel members, conversation participants and task assignees are members of the same workspace; removing a member removes all three | **DB** — FK `(workspace_id, user_id) → workspace_members` with ON DELETE CASCADE                                                          |
| 5   | Every row's parent belongs to the same workspace (message → channel/conversation, task → board, label assignment → task + label, …)  | **DB** — composite FKs                                                                                                                    |
| 6   | A task's column belongs to the task's board                                                                                          | **DB** — FK `(column_id, board_id) → board_columns(id, board_id)`                                                                         |
| 7   | Labels on a task belong to the task's workspace                                                                                      | **DB** — both FKs of `task_label_assignments` share `workspace_id`                                                                        |
| 8   | A message belongs to exactly one destination (channel XOR conversation)                                                              | **DB** — `messages_destination_xor_check`                                                                                                 |
| 9   | Replies are one level deep and live in their parent's channel/conversation                                                           | **DB** — `messages_thread_parent` trigger; `messages_parent_not_self_check`                                                               |
| 10  | An attachment belongs to exactly one owner (message XOR task)                                                                        | **DB** — `attachments_owner_xor_check`                                                                                                    |
| 11  | Each workspace always has exactly one OWNER, and it is `workspaces.owner_id`                                                         | **DB** — partial unique index `workspace_members_single_owner_key` + deferred constraint triggers `*_owner_invariant` (checked at COMMIT) |
| 12  | The OWNER cannot be removed or demoted without an ownership transfer                                                                 | **DB** (#11) + App (`canRemoveMember`, `canChangeMemberRole`)                                                                             |
| 13  | A user who owns a workspace cannot be deleted                                                                                        | **DB** — `workspaces.owner_id` ON DELETE RESTRICT                                                                                         |
| 14  | At most one DIRECT conversation per user pair per workspace                                                                          | **DB** — unique `(workspace_id, direct_key)` + CHECK; App computes `directConversationKey`                                                |
| 15  | DIRECT conversations have exactly two participants (one for a self-DM) and are never renamed                                         | App                                                                                                                                       |
| 16  | OWNER is never granted by invitation; one pending invite per email                                                                   | **DB** — `workspace_invites_role_check`, `workspace_invites_pending_email_key`                                                            |
| 17  | Emails are stored trimmed and lower-cased                                                                                            | **DB** — CHECK; App normalises with `emailSchema`                                                                                         |
| 18  | Slugs are URL-safe                                                                                                                   | **DB** — CHECK; App generates with `slugify` and de-duplicates                                                                            |
| 19  | Ordering positions are finite numbers                                                                                                | **DB** — CHECK                                                                                                                            |
| 20  | `editedAt` is set only by author content edits; deleted messages have redacted content                                               | App                                                                                                                                       |
| 21  | Attachments are created in the same transaction as their message/task (upload to storage first)                                      | App (XOR makes orphans impossible)                                                                                                        |
| 22  | One read cursor per user per channel / conversation                                                                                  | **DB** — primary keys                                                                                                                     |
| 23  | A channel cursor belongs to a member of the channel's workspace; a conversation cursor belongs to a participant                      | **DB** — composite FKs (cascade on leave/removal)                                                                                         |
| 24  | A cursor's `lastReadMessageId` is a message in the same channel / conversation                                                       | **DB** — `channel_read_states_last_read_message` / `conversation_read_states_last_read_message` triggers                                  |
| 25  | "Mark as read" never moves a cursor backwards (an explicit "mark unread" may)                                                        | App                                                                                                                                       |

### Ownership changes (must be one transaction)

Creating a workspace: insert the workspace **and** its OWNER membership in the same transaction
(Prisma nested create does this). Transferring ownership:

1. demote the current OWNER membership to ADMIN,
2. promote the new owner's membership to OWNER,
3. set `workspaces.owner_id` to the new owner.

Step order matters because the single-OWNER index is checked immediately; the owner/`owner_id`
consistency is checked at COMMIT.

## Delete rules

Guiding rule: **deleting a workspace removes everything it owns; deleting a user never destroys
shared history.** Users are expected to be _anonymised_ (scrub name, email, avatar, password hash),
not hard-deleted, once they have authored content.

| Relation                                                                               | onDelete     | Why                                                                                                                                                                                             |
| -------------------------------------------------------------------------------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Everything → `Workspace`                                                               | **Cascade**  | Workspace deletion is an explicit, owner-only, total operation.                                                                                                                                 |
| `Workspace.owner` → User                                                               | **Restrict** | Ownership must be transferred (or the workspace deleted) first.                                                                                                                                 |
| `Message.author` → User                                                                | **Restrict** | Authored history is preserved; hard-deleting an author is blocked → anonymise instead.                                                                                                          |
| `createdBy` / `uploadedBy` / `actor` → User                                            | **SetNull**  | Attribution is informational; losing it must not block or destroy anything.                                                                                                                     |
| `WorkspaceMember.user`, reactions, participations, assignments, notifications → User   | **Cascade**  | Personal, user-scoped rows with no value without the user.                                                                                                                                      |
| Membership-scoped rows → `WorkspaceMember`                                             | **Cascade**  | Leaving/removal from a workspace revokes channel membership, DM participation and task assignments automatically.                                                                               |
| `Message`, `ChannelMember` → `Channel`; `Message`, participants → `Conversation`       | **Cascade**  | Hard-deleting a channel is rare (archive is the default); when done, its content goes with it.                                                                                                  |
| Replies → parent `Message`                                                             | **Cascade**  | Messages are soft-deleted; a hard delete only happens as part of a channel/workspace cascade.                                                                                                   |
| Reactions, attachments → `Message`; attachments, assignees, label assignments → `Task` | **Cascade**  | Dependent data.                                                                                                                                                                                 |
| `BoardColumn`, `Task` → `Board`                                                        | **Cascade**  | Deleting a board (OWNER/ADMIN only) removes its contents.                                                                                                                                       |
| `Task.column` → `BoardColumn`                                                          | **NoAction** | A column that still holds tasks cannot be deleted on its own (move or archive tasks first). NO ACTION is checked at the end of the statement, so deleting a whole board still cascades cleanly. |
| `TaskLabelAssignment` → `TaskLabel`                                                    | **Cascade**  | Deleting a label removes it from tasks.                                                                                                                                                         |
| `Notification.workspace`                                                               | **Cascade**  | Notifications about a deleted workspace are meaningless.                                                                                                                                        |
| Read states → `Channel`, `WorkspaceMember`, `ConversationParticipant`                  | **Cascade**  | Deleting the destination, leaving it, or being removed from the workspace drops the cursor. User deletion cascades through membership/participation.                                            |
| `lastReadMessage` → `Message`                                                          | **SetNull**  | Hard-deleting the referenced message keeps the cursor and its `lastReadAt` position; only the pointer is cleared. (Soft-deleted messages keep their row, so the pointer stays valid.)           |

## Indexes

Every index serves a known query; unique constraints double as indexes for their leading columns.

| Table                                                              | Index                                                                                                              | Serves                                                                                                           |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| `workspace_members`                                                | unique `(workspace_id, user_id)`; `(user_id)`                                                                      | members of a workspace; workspaces of a user                                                                     |
| `workspace_invites`                                                | partial unique `(workspace_id, email) WHERE pending`; `(workspace_id, created_at)`; `(email)`; unique `token_hash` | pending lookup; invite history; invites at sign-up; token redemption                                             |
| `channels`                                                         | unique `(workspace_id, slug)`                                                                                      | channel list + slug routing                                                                                      |
| `channel_members` / `conversation_participants` / `task_assignees` | `(workspace_id, user_id)`                                                                                          | "my private channels / DMs / tasks in workspace X"; membership cascade                                           |
| `conversations`                                                    | unique `(workspace_id, direct_key)`; `(workspace_id)`                                                              | DM find-or-create; conversation list                                                                             |
| `messages`                                                         | `(channel_id, created_at, id)`; `(conversation_id, created_at, id)`                                                | keyset-paginated timelines                                                                                       |
| `messages`                                                         | `(parent_message_id, created_at)`; `(author_id)`                                                                   | thread replies; per-author queries and the RESTRICT check on user deletion                                       |
| `message_reactions`                                                | PK `(message_id, user_id, emoji)`; `(user_id)`                                                                     | reactions per message; user cascade                                                                              |
| `channel_read_states`                                              | PK `(channel_id, user_id)`; `(workspace_id, user_id)`; `(last_read_message_id)`                                    | cursor lookup; a user's cursors in a workspace (sidebar badges) + membership cascade; SET NULL on message delete |
| `conversation_read_states`                                         | PK `(conversation_id, user_id)` (also serves the participant FK); `(last_read_message_id)`                         | cursor lookup; SET NULL on message delete                                                                        |
| `attachments`                                                      | `(message_id)`; `(task_id)`; `(workspace_id)`                                                                      | attachments per owner; workspace cleanup                                                                         |
| `boards`                                                           | `(workspace_id)`                                                                                                   | board list                                                                                                       |
| `board_columns`                                                    | `(board_id, position)`                                                                                             | ordered columns                                                                                                  |
| `tasks`                                                            | `(board_id, column_id, position)`; `(column_id)`; `(workspace_id, due_date)`                                       | rendering a board; column FK checks; due-soon queries                                                            |
| `notifications`                                                    | `(user_id, read_at, created_at)`; `(workspace_id)`                                                                 | inbox + unread count; workspace cascade                                                                          |

Not indexed on purpose: `created_by_id` / `uploaded_by_id` / `actor_id` (only touched by the rare
SET NULL on user deletion).

## Design notes

- **Messages.** One table for channels and conversations keeps threads, reactions, attachments,
  search and pagination uniform. Timelines page with keyset pagination on `(created_at, id)`;
  UUIDv7 ids are time-ordered, so `id` is a stable tiebreaker.
- **Soft delete.** `deletedAt` + redacted `content`: threads, reactions and "message deleted"
  placeholders keep working.
- **Ordering (`position`).** Float with midpoint insertion: a drag-and-drop move updates one row.
  `positionBetween()` in `@syncspace/shared` (used by client and server) reports when precision is
  exhausted, and the list is then respaced with `evenlySpacedPositions()`. No schema change is ever
  needed. Ties sort by `id`.
- **DM de-duplication.** `direct_key` = the two user ids sorted and joined with `:`. Find-or-create
  is "insert; on unique violation, read the existing row" — race-free.
- **Attachments.** Metadata only. Files live in object storage (S3, Cloudflare R2 or Cloudinary):
  `storage_key` is the object key, `url` the delivery URL (public CDN or signed on read).
  Binary data is never stored in PostgreSQL.
- **Notifications.** Intentionally denormalised: rendered text plus a loose pointer, no FK to the
  target (which may be deleted later). One row per recipient.
- **Presence.** Live presence and typing are realtime-only. `users.last_seen_at` is written at most
  occasionally (e.g. on disconnect) for "last active" displays.
- **Read state.** One cursor per user per destination — never per-message receipts. Every
  message with `created_at <= last_read_at` is read; no row means nothing has been read yet.
  Marking read sets `last_read_at` to the message's `created_at` (never moving backwards) and
  `last_read_message_id` to its id, which powers "jump to unread" and the "new messages" divider.
  Unread counts are messages after the cursor (excluding the reader's own and deleted messages),
  served by the existing `(channel_id | conversation_id, created_at, id)` timeline indexes and
  capped at `LIMITS.UNREAD_COUNT_CAP`. Thread replies are not tracked separately in the MVP.

## Working with the schema

```bash
npm run db:migrate         # prisma migrate dev: create/apply migrations locally
npm run db:seed            # development data (refuses to run in production)
npm run db:generate        # regenerate the client (also runs on npm install)
npm run db:validate --workspace @syncspace/api
```

- Never edit an applied migration; add a new one. Hand-written SQL (CHECKs, partial indexes,
  triggers) goes at the end of the migration that needs it, and is listed in the table above.
- Prisma ignores CHECK constraints, partial indexes and triggers when diffing, so they do not
  produce drift — but they also are not visible in `schema.prisma`, which is why this document
  lists them.
- Writes to rows with composite relations use **scalar ids** (`{ workspaceId, channelId, … }`),
  not nested `connect`.
