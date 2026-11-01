# Chat: channels, direct messages and realtime

This document describes how SyncSpace chat works end to end: the data flow, the REST API, the
socket events, pagination, read state, presence, typing, the optimistic UI, reconnects and the
attachment foundation. Authorization rules are in [`PERMISSIONS.md`](PERMISSIONS.md). The
general realtime and state conventions are in [`ARCHITECTURE.md`](ARCHITECTURE.md) §4–§7.

## 1. Concepts

| Concept          | What it is                                                                             |
| ---------------- | -------------------------------------------------------------------------------------- |
| **Channel**      | A named topic in a workspace. `PUBLIC` (every member) or `PRIVATE` (explicit members). |
| **Conversation** | A `DIRECT` message between two people (or a self-note) or a `GROUP` of 3–9 people.     |
| **Destination**  | `{ kind: 'channel' \| 'conversation', id }`: where a message lives.                    |
| **Thread**       | Replies to a top-level message. Threads are one level deep (no reply to a reply).      |
| **Read cursor**  | Per user and destination: `lastReadAt` + `lastReadMessageId`. Only ever moves forward. |

Both destination kinds share **one message implementation** (`messages.service.ts`). Only access
loading differs (`destinations.ts`: `loadChannel` / `loadConversation`), and it produces a common
`DestinationAccess`: Prisma `where` fragment, permission context and socket audience.

## 2. Request flow

Every mutation follows **validate → authorize → write (transaction) → commit → emit → respond**:

```
POST /workspaces/:wid/channels/:cid/messages { content, clientMessageId }
  ├─ requireAuth, requireWorkspaceMember        (session + membership)
  ├─ loadChannel  → 404 if the viewer cannot see it (never reveals existence)
  ├─ authorize(canPostMessage)                   → 403 (archived / not a private member)
  ├─ prisma.$transaction:
  │    create message
  │    advance the author's read cursor (top-level messages only)
  ├─ emit message:created { message, clientMessageId, parent } to the destination audience
  └─ 201 Message DTO
```

Events are emitted only after the transaction commits, so a client never sees data that was
rolled back.

### Audiences (who receives a message event)

| Destination     | Rooms                                                 |
| --------------- | ----------------------------------------------------- |
| Public channel  | `channel:<id>` + `workspace:<wid>`                    |
| Private channel | `channel:<id>` + `user:<memberId>` for every member   |
| Conversation    | `conversation:<id>` + `user:<participantId>` for each |

Socket.IO deduplicates per socket, so one emit reaches each tab once. Private content never goes
to the workspace room. Workspace admins who are not members of a private channel get its events
only while they have it open (they joined its `channel:` room, which the access policy allows for
oversight).

## 3. REST API

Paths are as mounted on the API server (the web app reaches them through `VITE_API_BASE_URL`).
Workspace-scoped routes require membership. Lists follow the
`{ items, nextCursor }` convention.

| Method & path                                                  | Purpose                                         |
| -------------------------------------------------------------- | ----------------------------------------------- |
| `GET /workspaces/:wid/members?q=`                              | Member directory (name, avatar, role, presence) |
| `GET /workspaces/:wid/channels`                                | Visible channels + unread state                 |
| `POST /workspaces/:wid/channels`                               | Create (`name`, `description?`, `type`)         |
| `PATCH /workspaces/:wid/channels/:cid`                         | Rename / describe (OWNER/ADMIN)                 |
| `POST /workspaces/:wid/channels/:cid/archive` · `/unarchive`   | Archive state (OWNER/ADMIN)                     |
| `GET /workspaces/:wid/channels/:cid/members`                   | Private channel members                         |
| `POST /workspaces/:wid/channels/:cid/members`                  | Add a member (`userId`)                         |
| `DELETE /workspaces/:wid/channels/:cid/members/:uid`           | Remove a member, or leave                       |
| `GET /workspaces/:wid/conversations`                           | The viewer's conversations + unread state       |
| `POST /workspaces/:wid/conversations/direct`                   | Find-or-create a DM (`201` new, `200` existing) |
| `POST /workspaces/:wid/conversations/group`                    | Create a group (`participantIds`, `name?`)      |
| `GET /workspaces/:wid/{channels\|conversations}/:id/messages`  | History page (`before`, `limit`)                |
| `POST /workspaces/:wid/{channels\|conversations}/:id/messages` | Send (`content`, `clientMessageId?`)            |
| `POST /workspaces/:wid/{channels\|conversations}/:id/read`     | Mark read up to `messageId`                     |
| `GET /workspaces/:wid/search/messages?q=`                      | Search readable messages                        |
| `PATCH /messages/:id`                                          | Edit (author only)                              |
| `DELETE /messages/:id`                                         | Soft delete (author; admins in channels)        |
| `GET /messages/:id/replies` · `POST /messages/:id/replies`     | Thread read / reply                             |
| `POST /messages/:id/reactions`                                 | Toggle a reaction (`emoji`)                     |

Rules worth knowing:

- **Channel visibility.** Members see public channels and the private channels they belong to.
  OWNER/ADMIN also see every private channel (read and moderate, but not post unless they are a
  member).
- **Archiving.** Archived channels are read-only for everyone. The last active public channel
  cannot be archived (`409 CONFLICT`), so a workspace always has somewhere to talk.
- **Slugs.** Channel slugs are unique per workspace (`general`, `general-2`…) and follow renames.
- **Deletion.** Soft delete: `deletedAt` is set and the content is wiped. The row stays so replies
  and ordering remain intact. The DTO shows an empty, reaction-less "deleted" message.
- **Moderation.** OWNER/ADMIN may delete others' messages in channels. **Admins never moderate
  DMs or group conversations.** Nobody edits someone else's message.
- **Search.** Case-insensitive substring match (`ILIKE`, wildcards escaped). It only covers
  destinations the viewer can read (public channels, own private channels or all private ones for
  admins, own conversations), skips deleted messages, and returns a plain-text snippet.
- **Member lookup.** Returns public profile fields, email, role and presence only. Nothing
  related to authentication.

## 4. Socket events

Typed once in `@syncspace/shared` (`CLIENT_EVENTS`, `SERVER_EVENTS`, payload schemas).

**Client → server** (validated, acknowledged with `SocketAck` unless noted):

| Event                                      | Purpose                                                     |
| ------------------------------------------ | ----------------------------------------------------------- |
| `workspace:join` / `workspace:leave`       | Workspace-wide events + public channel messages             |
| `channel:join` / `channel:leave`           | Open-channel room (typing, admin oversight of private ones) |
| `conversation:join` / `conversation:leave` | Open-conversation room (participants only)                  |
| `typing:start` / `typing:stop` (no ack)    | Ephemeral typing; ignored unless the socket is in the room  |

**Server → client:**

| Event                               | Payload                                                  | Client effect                          |
| ----------------------------------- | -------------------------------------------------------- | -------------------------------------- |
| `message:created`                   | `{ message, clientMessageId, parent }`                   | Insert/replace in timeline or thread   |
| `message:updated` / `:deleted`      | `{ message }`                                            | Replace in timeline and thread         |
| `reaction:updated`                  | `{ messageId, destination, parentMessageId, reactions }` | Replace reaction summary               |
| `channel:created` / `:updated`      | `{ channel }`                                            | Upsert in the channel list             |
| `channel:removed`                   | `{ workspaceId, channelId }`                             | Drop channel + its cached messages     |
| `conversation:created` / `:updated` | `{ conversation }`                                       | Upsert in the conversation list        |
| `read:updated`                      | `{ destination, cursor }`                                | Sync read state across the user's tabs |
| `typing:updated`                    | `{ destination, userIds }`                               | Typing indicator (Zustand)             |
| `presence:updated`                  | `{ userId, status, lastActiveAt }`                       | Patch the member directory cache       |

A reply is a `message:created` whose `parent` carries `{ id, replyCount }`, so the parent's
counter updates without a refetch.

**Access changes.** When a member is removed from a private channel, the server removes all of
their sockets from `channel:<id>` (`socketsLeave`) and sends `channel:removed` to their user room
(unless they keep admin oversight). When a member is added, they get `channel:created` in their
user room. Archive and unarchive are `channel:updated` with `archivedAt`.

## 5. Pagination

History is keyset-paginated on `(createdAt, id)`, newest first, 50 per page (max 100):

- `GET …/messages` returns the newest page. `nextCursor` is the id of the oldest message on the
  page, or `null` at the beginning of history.
- `GET …/messages?before=<id>` returns the page before that message.
- Pages contain top-level messages only. Replies are loaded with their thread.

On the client this is a `useInfiniteQuery`: page 0 is the newest, and `fetchNextPage` loads
older messages. A sentinel at the top of the list (IntersectionObserver, plus a scroll-position
check) triggers the next page. Before prepending, the timeline records `scrollHeight` and
`scrollTop`, then restores the visual position in a layout effect, so the view does not jump.

## 6. Read state and unread counts

- **Unread count** = top-level, non-deleted messages by others, newer than
  `COALESCE(lastReadAt, joinedAt)`. It is computed in one SQL query per list, and capped at
  `LIMITS.UNREAD_COUNT_CAP` (100) with a `LIMIT` subquery so huge backlogs stay cheap. The UI
  shows the cap as **"99+"**.
- **Mark read** (`POST …/read { messageId }`) moves the cursor to that message, but never
  backwards: the update only applies when `lastReadAt < message.createdAt`, which is race-safe.
  It emits `read:updated` to the user's other tabs.
- **Sending a message** advances the author's cursor (you have read what you wrote).
- **Client:** the timeline marks read (debounced 400 ms) when the newest message is on screen
  and the tab is visible. While that is true, the store's `readingKey` makes the realtime layer
  skip unread bumps for that destination. Other destinations get `unreadCount + 1` per incoming
  message (capped), with no refetch.
- **"New messages" divider:** placed before the first message by someone else after the
  `lastReadAt` that was current when the destination was opened. It is a snapshot, so the divider
  stays put while the user reads. "Jump to unread" and "Jump to newest" buttons appear when those
  positions are off-screen.

## 7. Presence

- The server counts sockets per user (`sockets/presence.ts`). The first connection makes the
  user `online`, which is broadcast as `presence:updated` to every workspace room they belong to.
- When the last socket disconnects, a **grace period** (5 s by default, 0 in tests) absorbs page
  reloads and brief drops. After it, the user goes `offline`, `User.lastSeenAt` is persisted and
  the offline event is broadcast.
- The member directory (`GET …/members`) includes `online` and `lastSeenAt`. The client keeps it
  in the TanStack cache and patches it from `presence:updated`. Sidebar DMs, DM headers
  ("Active now" / "Last seen 5 minutes ago") and pickers read from it.
- Presence is in-memory per API instance. Horizontal scaling would need the Socket.IO Redis
  adapter plus a shared presence store; see ARCHITECTURE §16.

## 8. Typing indicators

- The composer emits `typing:start` at most every 2.5 s while the user types. It emits
  `typing:stop` after 3 s idle, on send, on blur and on leaving the destination.
- The server keeps typers per destination with a **6 s TTL**, so a crashed tab cannot leave
  "is typing…" behind. It broadcasts the full `userIds` list on every change, and clears a
  socket's typing state on disconnect.
- Typing is accepted only from sockets already in the destination's room, which was authorized
  on join.
- Typing state lives in Zustand (ephemeral UI), keyed by destination. The indicator subscribes
  only to its own key, so typing does not re-render the timeline.

## 9. Optimistic sending and deduplication

1. The composer generates a `clientMessageId` (UUID) and inserts a `sending` row
   (`id: temp:<clientMessageId>`) at the end of the newest page. The row is dimmed, with an
   sr-only "Sending…".
2. `POST …/messages { content, clientMessageId }`.
3. The REST response and the `message:created` echo (which carries `clientMessageId`) race.
   Whichever arrives first replaces the optimistic row. The second one is dropped because the
   real id is already present. The timeline never shows duplicates.
4. On failure the row becomes `failed`, with **Retry** (re-send) and **Discard**.

Edits, deletes and reactions are confirmed by the server and then written into every cache that
shows the message: the timeline and, when open, the thread. Remote changes arrive through the same
cache helpers (`features/chat/cache.ts`).

## 10. Reconnect strategy

- The topbar shows **Connecting…**, **Live** or **Offline** from the realtime store.
- Socket.IO reconnects automatically. On reconnect the client re-joins the workspace room and the
  open destination's room. It then invalidates only the chat lists (channels, conversations,
  members) and the message timelines that may have missed events. Because inserts deduplicate by
  id, refetching is safe.
- Nothing else refetches globally. During normal operation every event is a targeted
  `setQueryData`.

## 11. Frontend structure

```
features/chat/
  api.ts           REST calls (validated with shared schemas)
  hooks.ts         queries + mutations (optimistic send, mark read, channel/conversation actions)
  realtime.ts      socket → cache wiring, destination rooms, typing emitter
  cache.ts         pure cache transforms (insert/dedupe/replace/unread) — unit tested
  policy.ts        DTO → shared permission context; posting-blocked reasons
  display.ts       pure display helpers (emoji set, typing text, search links)
  components/      ChatSidebar, ChatView, MessageTimeline, MessageItem, Composer, ThreadPanel,
                   TypingIndicator, EmojiPicker, MemberPicker, dialogs (create channel,
                   channel settings, new message, search), RouteNotice
  routes/          ChannelPage, ConversationPage, WorkspaceIndexRedirect
```

- **Routes:** `/app/workspaces/:wid` opens the first active channel the user can post in (else
  `/overview`), `/channel/:channelId`, `/dm/:conversationId`, and `?thread=<messageId>` opens the
  thread panel. The URL is the only source of the selection.
- **Layout:** desktop shows sidebar | conversation | thread panel. On mobile the sidebar is a
  drawer and the thread is a full-screen layer.
- **Losing access:** if the open channel or conversation disappears from the list (removed from
  a private channel, deleted), the page redirects to the workspace with a notice. It never
  renders stale private content.

## 12. Attachments (foundation only)

The schema already has `Attachment` rows linked to messages, and every `Message` DTO carries
`attachments: Attachment[]` (empty for now). The composer keeps a toolbar slot for an attach
button. Uploading needs:

1. a storage adapter (S3-compatible) with pre-signed uploads;
2. `POST /attachments` to issue upload URLs, then send the message with `attachmentIds`;
3. rendering previews in `MessageItem`.

None of this ships in this phase. No files are accepted, stored or served.

## 13. Known limitations

- Messages render without list virtualization. Paging keeps the DOM bounded to what the user
  scrolled through. Virtualization is a later optimization.
- Search is substring (`ILIKE`). Full-text ranking (`tsvector`) is a later improvement.
- Presence and typing are per API instance (see §7).
- Thread replies are not optimistic (they appear on server confirmation, typically within
  milliseconds).
