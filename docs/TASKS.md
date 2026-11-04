# Boards, tasks and notifications

This document covers the task-management side of SyncSpace: the board model, ordering, drag and
drop, the optimistic strategy, realtime events, notifications, filters and mobile behaviour.
Authorization rules are in [`PERMISSIONS.md`](PERMISSIONS.md). General realtime and state
conventions are in [`ARCHITECTURE.md`](ARCHITECTURE.md) §4–§7.

## 1. Model

| Entity           | Notes                                                                                       |
| ---------------- | ------------------------------------------------------------------------------------------- |
| **Board**        | Workspace-wide (no private boards). `archivedAt` makes it read-only.                        |
| **Column**       | Belongs to a board, ordered by `position`. New boards get To Do / In Progress / Done.       |
| **Task**         | Belongs to a board and one of its columns (composite FK). Ordered by `position` per column. |
| **Assignee**     | Task ↔ workspace member (composite FK: leaving the workspace unassigns).                    |
| **Label**        | Workspace-wide, `name` unique per workspace, `#RRGGBB` colour (CHECK constraint).           |
| **Notification** | Per recipient; a loose pointer (`entityType` + `entityId`) plus pre-rendered title/body.    |

Task fields: title, plain-text multiline description, priority (`LOW`, `MEDIUM`, `HIGH`,
`URGENT`), due date, `completedAt`, `archivedAt`, creator, assignees, labels, and attachment
metadata (foundation only: there are no uploads yet).

**Who can do what** (the shared policy, enforced by the API):

- Any member creates boards, and creates, edits, moves, assigns, labels, completes and
  archives tasks on active boards.
- Board settings and columns: the board's creator and OWNER/ADMIN.
- Labels: OWNER/ADMIN create, rename and delete them. Any member applies them.
- Archived boards: read-only for everyone (403 with an explanatory message). Only managers can
  restore them.

## 2. API

| Method & path                                                                    | Purpose                                                      |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `GET /workspaces/:wid/boards`                                                    | Boards with `columnCount` and active `taskCount`             |
| `POST /workspaces/:wid/boards`                                                   | Create (with default columns, one transaction)               |
| `GET /workspaces/:wid/boards/:bid`                                               | Board + ordered columns + active tasks                       |
| `PATCH /workspaces/:wid/boards/:bid`                                             | Rename / describe                                            |
| `POST /workspaces/:wid/boards/:bid/archive` · `/restore`                         | Archive state                                                |
| `GET /workspaces/:wid/boards/:bid/archived-tasks`                                | Archived tasks, most recent first                            |
| `POST /boards/:bid/columns`                                                      | Append a column                                              |
| `PATCH /boards/:bid/columns/:cid`                                                | Rename                                                       |
| `POST /boards/:bid/columns/reorder`                                              | Move `{ columnId, afterColumnId }`                           |
| `DELETE /boards/:bid/columns/:cid`                                               | Delete (409 `COLUMN_NOT_EMPTY` with active tasks)            |
| `POST /boards/:bid/tasks`                                                        | Create (`columnId`, `title`, …, `assigneeIds`, `labelIds`)   |
| `GET /tasks/:tid` · `PATCH /tasks/:tid`                                          | Read / edit (title, description, priority, due, `completed`) |
| `POST /tasks/:tid/move`                                                          | Move `{ columnId, afterTaskId }`                             |
| `PUT /tasks/:tid/assignees` · `PUT /tasks/:tid/labels`                           | Replace the assignee / label set                             |
| `POST /tasks/:tid/archive` · `/restore`                                          | Archive state (no hard delete)                               |
| `GET /workspaces/:wid/tasks/search?q=`                                           | Substring search over active tasks                           |
| `GET` · `POST /workspaces/:wid/task-labels`, `PATCH` · `DELETE /task-labels/:id` | Labels                                                       |
| `GET /notifications?filter=all\|unread&cursor=`                                  | Inbox page (+ `unreadCount`)                                 |
| `GET /notifications/unread-count`                                                | Badge count                                                  |
| `POST /notifications/:id/read` `{ read }`                                        | Mark read (or unread with `read: false`)                     |
| `POST /notifications/read-all`                                                   | Mark everything read                                         |

Routes addressed by entity id (`/boards/:id`, `/tasks/:id`, `/task-labels/:id`) resolve the
entity's workspace and require membership. Anything the caller cannot see is a 404, so ids from
other workspaces look like they don't exist. The board detail is a fixed handful of queries
however many tasks the board has (no N+1).

## 3. Ordering

Columns and tasks carry a floating-point `position`. They are sorted by position, with ties broken by
id. One shared helper, `planInsert` in `@syncspace/shared`, computes a placement:

- The moved item gets the **midpoint** of its new neighbours, so a move updates one row.
- When doubles run out of precision (or two items tie), the whole list (one column's active tasks,
  or one board's columns) is **re-spaced evenly** in the same transaction.
- Moves name an anchor: `afterTaskId` / `afterColumnId` (null = first). The server finds the
  following neighbour itself, so a client never needs exact positions.

The client runs the same helper for its optimistic preview, so the preview and the server's
result agree.

Completing a task never moves it between columns. Archiving keeps its column and position, and
restoring puts it back in place. Deleting a column is refused while it has active tasks. Archived
tasks in it move to the end of the first remaining column.

## 4. Drag and drop

The web app uses **dnd-kit**:

- **Sensors.**
  - Pointer: starts after 6 px of movement, so clicking still opens a card.
  - Touch: press and hold for about 0.2 s, so swiping still scrolls the board.
  - Keyboard: Space picks up and drops, arrow keys move, Escape cancels, Enter opens the task.
- **Tasks** are sortable within and across columns. While dragging, a local arrangement shows
  where the card will land, and a `DragOverlay` follows the pointer.
- **Columns** are sortable by their grip handle. Columns only collide with columns.
- **Screen readers:** dnd-kit live-region announcements are customised with task titles and column
  names.
- **Non-drag alternatives:**
  - the task panel's column select and "Move up/down" buttons;
  - the column menu's "Move left/right".

  Both use the same move endpoints.

## 5. Optimistic strategy

On drop, or on a move from the panel (`useMoveTask`):

1. Snapshot the board cache and apply the planned placements immediately.
2. `POST /tasks/:id/move`.
3. On success, write the server's placements. These are authoritative: the same values when
   nothing raced, or the re-spaced column after a rebalance.
4. On failure, restore the snapshot and show the reason (e.g. "This board is archived").

The socket echo of your own move carries the same placements. Cache writes _set_ values and
never increment, so applying them again is a no-op: nothing is duplicated or reordered. To avoid
a flicker after a drop, the canvas keeps its drag arrangement until the optimistic cache write
replaces the board. Column moves work the same way (`useMoveColumn`).

**Concurrent moves:** the server's state wins. If someone else moves a task while you drag it,
their `task:moved` updates your cache. When your drop commits, the board converges on the
committed order. There is no CRDT and no locking; last write wins per task.

## 6. Realtime events

All board events go to the workspace room, emitted **after commit**:

| Event                   | Payload                                                     | Client effect                         |
| ----------------------- | ----------------------------------------------------------- | ------------------------------------- |
| `board:created`         | `{ board }`                                                 | Add to the board list / sidebar       |
| `board:updated`         | `{ board }` (archive/restore via `archivedAt`)              | Replace; archived → read-only UI      |
| `board:columns-updated` | `{ boardId, columns }` (full ordered list)                  | Replace the board's columns           |
| `task:created`          | `{ task }`                                                  | Insert                                |
| `task:updated`          | `{ task }` (edits, assignees, labels, completion, archive)  | Replace; archived → remove from board |
| `task:moved`            | `{ boardId, placements: [{ taskId, columnId, position }] }` | Apply placements                      |
| `labels:updated`        | `{ labels }` (full list)                                    | Replace labels; update/strip on tasks |

`task:moved` is compact: one placement normally, or the whole column after a rebalance. A task
archived elsewhere while its panel is open shows an "Archived" banner, and its controls become
read-only. When a board is archived, the open board switches to read-only at once.

After a reconnect, the board list, board details and labels are invalidated once (writes are
idempotent). During normal operation nothing refetches.

## 7. Notifications

**Triggers.** These are the only events that create notifications, always after commit, never
for the actor:

| Type            | When                                                                                                                                                      |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TASK_ASSIGNED` | Someone else adds you to a task (on create or later). Re-sending the same set is silent.                                                                  |
| `TASK_UPDATED`  | Someone else completes a task assigned to you.                                                                                                            |
| `MESSAGE`       | A DM or group message while you **don't have that conversation open** (no socket in its room). There is at most one unread notification per conversation. |
| `INVITE`        | Someone accepted the invitation you sent.                                                                                                                 |

Channel messages don't notify (unread badges cover them). @mentions and "due soon" reminders
aren't implemented (see §10).

**Delivery and state.**

- Each notification is pushed to `user:<id>` as `notification:created { notification,
unreadCount }`.
- Marking one read or unread pushes `notification:updated`, and read-all pushes
  `notifications:read`, so every tab updates its badge without refetching.
- The inbox is keyset-paginated (newest first) with an `all` / `unread` filter. Only the
  recipient can read or change a notification (others get 404).

**Links.** The server resolves `link` when notifications are read:

- `task` → workspace, board and task;
- `message` → destination and thread;
- `destination` → channel or DM;
- `workspace` → the workspace.

A link follows a task that moved. It is `null` once the target is gone, and the UI then says it
is no longer available. Opening a notification marks it read and navigates there: task links
open the board with `?task=<id>`, which fetches the task by id if it isn't on the loaded board.

**UI.** The topbar bell shows the unread count ("99+" cap), with the number also in its
accessible name. On desktop it opens a popover; on mobile, a full-screen sheet. Items show a
type icon, title, snippet, workspace and time. Unread items are marked with a dot plus the
screen-reader text "Unread", so the state isn't conveyed by colour alone. Each item has a
mark read/unread toggle, and the panel has "Mark all read".

## 8. Filters and search

Board filters live in the URL, so a filtered board can be shared and survives a reload. They
combine:

- `assignee`: a user id, `me` or `none`;
- `priority`;
- `label`;
- `due`: `overdue`, `today`, `week` or `none`;
- `status`: `open` or `done`;
- `q`: substring search of title and description.

Filtering is client-side over the loaded board and never changes server state. Columns show
"shown/total" counts while filters are active. Workspace-wide task search (`GET …/tasks/search`)
appears in the global search dialog (Ctrl/Cmd+K) next to message results.

**Due dates** are stored as instants (UTC). Picking a date stores the end of that day in the
picker's local timezone. The UI derives overdue, due today, this week or later, and done, in the
viewer's timezone. Formatted dates are never stored.

## 9. Routes and mobile

- `/app/workspaces/:wid/tasks` opens the last board used in that workspace (a UI preference,
  re-validated), else the first active board, else a "Create your first board" empty state.
- `/app/workspaces/:wid/tasks/:boardId?task=<id>&<filters>`: the URL is the only source of
  the selection.
- **Desktop:** sidebar (channels, DMs, boards) | board header, filters, horizontally scrolling
  columns (fixed 18 rem width) | task panel as a right-hand drawer.
- **Mobile:**
  - Columns snap one at a time (85 % of the viewport width, so the next column peeks in).
  - Filters collapse behind a "Filters" button.
  - The task panel is a full-screen sheet.
  - Dragging uses press-and-hold, and the panel's column select is the always-available
    alternative.

## 10. Not built (by design or for later)

- Time tracking, recurring tasks, subtasks, dependencies, calendar or Gantt views, automation,
  AI. (Task attachments are built: see [`UPLOADS.md`](UPLOADS.md).)
- **@mentions:** a mention needs member autocomplete in the composer and mention metadata on
  messages. It's deferred to keep this phase focused. The notification type `MENTION` and the
  `message` link kind are already supported.
- **Due-soon reminders:** these need a scheduler (cron or queue). The index on
  `(workspace_id, due_date)` is in place for it.
- Boards are not virtualized, because column virtualization would fight drag and drop. Boards
  stay responsive at several hundred tasks (tested with 400):
  - cards are memoized;
  - each column re-renders only when its own ids or task objects change (custom `memo`
    comparator);
  - cache writes keep untouched tasks referentially identical;
  - filters take one clock reading per pass.

  A development fixture (`npm run db:seed:large`) creates a 400-task board.
