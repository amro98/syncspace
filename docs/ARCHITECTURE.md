# SyncSpace — Architecture Decisions

This document records decisions that are **settled**. Later phases build on them
instead of re-debating them. Changing one of these requires updating this file
in the same change, with the reason.

Each entry: **Decision** → **Why** → **Consequences / rules**.

---

## 1. Monorepo with npm workspaces

**Decision.** One repository, npm workspaces, three packages:

| Package             | Path              | Role                                      |
| ------------------- | ----------------- | ----------------------------------------- |
| `@syncspace/web`    | `apps/web`        | React SPA (Vite)                          |
| `@syncspace/api`    | `apps/api`        | Express REST API + Socket.IO server       |
| `@syncspace/shared` | `packages/shared` | Contracts shared by both: schemas, types… |

**Why.** Web and API change together (a new endpoint is a schema + route + hook).
One repo and one install keep them in lockstep. npm workspaces are enough at this
size; Turborepo/Nx would add config without a real payoff yet.

**Consequences.**

- Root scripts fan out with `--workspaces`; `npm run dev` runs api + web via `concurrently`.
- One lockfile at the root. Never install inside a workspace with a separate lockfile.
- Tooling (TypeScript, ESLint, Prettier) is configured once at the root and extended per package.

## 2. Shared package strategy (source-only internal package)

**Decision.** `@syncspace/shared` exports its **TypeScript source**
(`"exports": { ".": "./src/index.ts" }`) and has no build step. Consumers compile it:
Vite for the web app; tsup (esbuild) bundles it into the API build (`noExternal`);
tsx/Vitest run it directly in development and tests.

**Why.** No watch process, no stale `dist`, instant type feedback across packages, and
no risk of the web and API drifting onto different contract versions.

**Rules.**

- Shared contains **contracts and pure domain rules only**: Zod schemas, inferred types,
  constants/enums, socket event maps, room helpers, the authorization policy
  (`permissions/`), and pure helpers both sides must compute identically (`domain/`: ordering
  positions, slugs, DM keys). No I/O, no persistence, no framework code.
- Runtime-agnostic: no DOM, no Node APIs, no React. Only dependency: `zod`. (ESLint enforces the
  forbidden imports.)
- Never imports from `apps/*`. Dependency direction is always `apps → shared`.
- Relative imports only inside shared (consumers compile it with their own config, so path aliases
  would not resolve).
- Types are **inferred from Zod schemas** (`z.infer`) — one definition serves runtime validation
  on the server and static typing on both sides. Do not hand-write a parallel interface.

## 3. PostgreSQL is the source of truth

**Decision.** Every persistent entity (users, workspaces, members, channels, messages,
reactions, boards, tasks, notifications, …) lives in PostgreSQL, accessed through Prisma.

**Why.** Durability, transactions, relational integrity, and a single place to answer
"what is the current state?".

**Rules.**

- Socket.IO state (connected sockets, rooms) is **never** treated as data. If the server restarts,
  nothing persistent is lost.
- Ephemeral signals (typing, presence heartbeats) may live in memory (later: Redis), never in place
  of a database write for something that must survive.

## 4. REST vs. Socket.IO responsibilities

| Concern                                         | Transport                    |
| ----------------------------------------------- | ---------------------------- |
| Initial page data (lists, details)              | REST `GET`                   |
| All create / update / delete of persistent data | REST `POST/PATCH/PUT/DELETE` |
| Pagination, search, filtering                   | REST `GET` with query params |
| Fan-out of committed changes to other clients   | Socket.IO (server → client)  |
| Presence, typing indicators                     | Socket.IO (both directions)  |
| Subscribing to what the user is viewing (rooms) | Socket.IO (client → server)  |

**Why.** REST gives us HTTP semantics (status codes, caching, retries, idempotency, easy
testing, rate limiting per route). Sockets are used for what HTTP cannot do: push.

**Rule.** Clients do **not** mutate persistent data over the socket. A "send message" is a REST
`POST`; the socket broadcasts the committed result.

## 5. Mutation → database → socket flow

Every mutation of persistent data follows this exact order:

1. **Validate** the request (Zod, via `validate()` middleware).
2. **Authorize** the user (membership/role check against the database).
3. **Write** to the database (inside a transaction when multiple rows change).
4. **Commit** successfully.
5. **Emit** the socket event with `realtime.emit(room, event, payload)`.
6. **Respond** to the HTTP request with the committed resource.

**Rules.**

- Never emit before commit or from inside a transaction callback — a rollback would leave
  other clients showing data that does not exist.
- A lost socket event must at worst cause a stale view that the next refetch corrects. Clients
  therefore invalidate active queries on socket reconnect.
- The originating client also receives the event. Handlers must be idempotent (keyed by entity id),
  so the echo is harmless.
- `realtime` (`apps/api/src/sockets/realtime.ts`) is the only publishing API. Modules never touch
  the `io` instance directly.

## 6. Realtime rooms and events

**Room naming** — always built with `rooms.*()` from `@syncspace/shared`:

| Room                            | Members                                        |
| ------------------------------- | ---------------------------------------------- |
| `workspace:<workspaceId>`       | sockets currently viewing that workspace       |
| `channel:<channelId>`           | sockets currently viewing that channel         |
| `conversation:<conversationId>` | open conversation (participants only)          |
| `user:<userId>`                 | every socket of one user (multi-tab / devices) |

**Rules.**

- Sockets join `user:<userId>` automatically on connect. Notifications and per-user sync target it.
- Joining any other room is **authorized against persistent membership** via the
  `RoomAccessPolicy` seam (`apps/api/src/sockets/room-access.ts`). The server uses
  `membershipRoomAccess` (workspace membership; channel rules via `canAccessChannel`); without a
  policy, every join is denied (secure by default).
- Socket handshake authentication uses the same httpOnly access-token cookie as REST.

**Event naming.**

- Client → server commands: `<entity>:<verb>` (`workspace:join`, `channel:leave`, `typing:start`).
- Server → client facts: `<entity>:<past-tense>` (`workspace:updated`, `notification:created`).
- Names live in `CLIENT_EVENTS` / `SERVER_EVENTS`; payload types in `ClientToServerEvents` /
  `ServerToClientEvents`. Both server (`Server<…>`) and client (`Socket<…>`) are typed from these
  maps, so they cannot drift.
- Every client → server payload is validated server-side with its shared Zod schema.
- Client → server events reply through an acknowledgement shaped as `SocketAck`
  (`{ ok: true, data }` or `{ ok: false, error: { code, message } }`) — the same error codes as REST.

**Payloads.** Server events carry the committed DTO (the same shape REST returns), so clients
write it straight into the TanStack cache instead of refetching. Message events echo the sender's
`clientMessageId` for optimistic-row matching.

**Delivery audiences.** A message event is emitted once to the destination's _audience_: public
channel → `channel:<id>` + `workspace:<wid>`; private channel → `channel:<id>` + each member's
`user:<id>`; conversation → `conversation:<id>` + each participant's `user:<id>`. Private content
never reaches the workspace room. Losing access removes the user's sockets from the room
(`socketsLeave`) and sends `channel:removed`.

**Ephemeral state.** Presence (per-user socket counts with an offline grace period, `lastSeenAt`
persisted on going offline) and typing (6 s server TTL, accepted only from sockets in the room)
are in-memory per API instance. The full chat event catalogue, pagination, read-state and
reconnect rules are in [`CHAT.md`](CHAT.md).

## 7. Client state: TanStack Query vs. Zustand vs. URL

| State                                                                                                        | Owner                                |
| ------------------------------------------------------------------------------------------------------------ | ------------------------------------ |
| Anything that comes from the server (workspaces, channels, messages, tasks, members, notifications, session) | **TanStack Query**                   |
| Which workspace/channel/board is active                                                                      | **URL** (route params)               |
| Ephemeral UI: drawers, modals, theme, composer drafts, typing/presence indicators                            | **Zustand**                          |
| Form state                                                                                                   | **React Hook Form** (+ Zod resolver) |

**Rules.**

- Never copy server data into Zustand. Realtime events update the **TanStack Query cache**
  (`invalidateQueries` or `setQueryData`), not a parallel store.
- The URL is the source of truth for selection, so deep links, refresh and back/forward work.
  Zustand may remember the _last visited_ workspace for redirecting `/app`, nothing more.
- Query keys come only from the factory in `apps/web/src/lib/query-keys.ts`. Keys are hierarchical
  (`['workspaces', id, 'channels']`) so invalidating a workspace refreshes everything inside it.
- Default query behaviour: `staleTime` 30s, no retries on 4xx, mutations never auto-retry.
- Chat routes: `/app/workspaces/:workspaceId/channel/:channelId`,
  `/app/workspaces/:workspaceId/dm/:conversationId`, plus `?thread=<messageId>` for the thread
  panel. The workspace index redirects to the first active channel.
- Chat UI state in Zustand (`stores/chat-store.ts`) is limited to typing users, composer drafts
  and which destination is being read (to suppress unread bumps). Messages, lists, read cursors
  and presence stay in the query cache.

## 8. Frontend API client

All HTTP goes through `apiClient` (`apps/web/src/lib/api-client.ts`):

- Base URL from `VITE_API_BASE_URL` (validated in `lib/env.ts`).
- `credentials: 'include'` on every request (cookie auth).
- Every failure becomes an `ApiError { status, code, message, issues?, requestId? }` — including
  network failures (`NETWORK_ERROR`, status 0) and schema mismatches (`INVALID_RESPONSE`).
- Optional `schema` option validates and types the response with a shared Zod schema.
- `ApiError` is registered as TanStack Query's default error type.
- Features never call `fetch` directly.

## 9. API response conventions

**Success** — the resource itself, no envelope:

| Case                  | Status | Body                                           |
| --------------------- | ------ | ---------------------------------------------- |
| Read one              | 200    | `{ ...resource }`                              |
| Read list (paginated) | 200    | `{ items: [...], nextCursor: string \| null }` |
| Create                | 201    | `{ ...createdResource }`                       |
| Update                | 200    | `{ ...updatedResource }`                       |
| Delete / no content   | 204    | _(empty)_                                      |

Lists use **cursor pagination** (`?cursor=&limit=`, default 50, max 100; see
`cursorPaginationQuerySchema`) — offset pagination breaks under realtime inserts.

**Errors** — always this shape (`apiErrorResponseSchema`):

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "issues": [{ "path": "name", "message": "Required" }],
    "requestId": "…"
  }
}
```

| Situation                 | Status | `code`                          |
| ------------------------- | ------ | ------------------------------- |
| Malformed request         | 400    | `BAD_REQUEST`                   |
| Schema validation failed  | 400    | `VALIDATION_ERROR` (+ `issues`) |
| Not signed in / bad token | 401    | `UNAUTHENTICATED`               |
| Signed in, not allowed    | 403    | `FORBIDDEN`                     |
| Missing resource or route | 404    | `NOT_FOUND`                     |
| Uniqueness/state conflict | 409    | `CONFLICT`                      |
| Body too large            | 413    | `PAYLOAD_TOO_LARGE`             |
| Rate limited              | 429    | `RATE_LIMITED`                  |
| Unexpected failure        | 500    | `INTERNAL_ERROR`                |
| Dependency down           | 503    | `SERVICE_UNAVAILABLE`           |

Clients branch on `code`, never on `message`. A resource the user cannot see returns **404, not
403**, so its existence does not leak.

## 10. Error handling

- Code throws `AppError` (via helpers `notFound()`, `forbidden()`, …). Zod errors thrown by
  validation are converted automatically.
- `toAppError()` (`apps/api/src/lib/errors.ts`) normalises anything thrown; both the Express error
  handler and socket acknowledgements use it, so REST and sockets report errors identically.
- Unknown errors become `INTERNAL_ERROR`. In production the message is generic; stack traces are
  **logged, never returned**.
- Every request has an id (`X-Request-Id`, reused from the proxy when sane); it is returned in the
  header and the error body and attached to every log line.
- Express 5 forwards rejected promises from async handlers to the error handler — no wrappers needed.

## 11. Authentication

Full design, flows and setup: [`AUTH.md`](AUTH.md).

- **Session transport:** one httpOnly session cookie (`ss_session`) carrying a JWT (HS256,
  `sub` = user id, `ver` = `User.tokenVersion`). Never readable by JavaScript, never in
  localStorage. Verified by `requireAuth` (REST) and the Socket.IO handshake.
- **Lifetime ("Remember me"):** off = browser-session cookie with a 12-hour JWT; on = persistent
  30-day cookie and JWT. The JWT expiry always equals the cookie lifetime.
- **Revocation:** every authenticated request compares the token's `ver` with
  `User.tokenVersion` (one primary-key lookup). A password reset increments it, revoking every
  session. _Decision:_ no session table and no refresh tokens — the version check gives
  server-side revocation without that machinery. Revisit only if per-device session management
  becomes a feature.
- **Passwords:** bcrypt (`bcryptjs`, cost 12). Policy (8–72 chars/bytes, upper, lower, number,
  special) is defined once in `@syncspace/shared`.
- **Social sign-in:** Google and GitHub via authorization code + `state` + PKCE. Verified emails
  only; new accounts and links to existing accounts always require explicit confirmation.
- **CSRF:** `SameSite=Lax` cookies + JSON-only bodies + `verifyOrigin` rejecting state-changing
  requests from origins not in `CORS_ORIGIN`.
- **Deployment:** Vercel and Render default domains are different _sites_, which makes the API
  cookie third-party. Production serves web and API from the **same registrable domain**
  (e.g. `app.syncspace.dev` / `api.syncspace.dev`) so `SameSite=Lax` cookies stay first-party.
- `JWT_SECRET`, `FRONTEND_URL` and `API_PUBLIC_URL` are mandatory in production.

## 12. Backend structure

```
apps/api/src/
  app.ts            builds the Express app (no listen) — used by server.ts and tests
  server.ts         HTTP server + Socket.IO + graceful shutdown
  config/           env (validated, fail-fast), cors, auth constants
  middleware/       request logging, validation, auth, origin check, errors
  modules/<domain>/ <domain>.router.ts, <domain>.service.ts, <domain>.schemas.ts (API-only schemas)
  sockets/          socket server, handshake auth, room handlers, `realtime` publisher
  lib/              infrastructure singletons/helpers: logger, prisma, errors, tokens
  utils/            small pure helpers
  types/            ambient type augmentation (Express Request)
```

- Resources mount at the API root (`/auth`, `/workspaces`, `/invites`) — the API has its own
  origin, so a `/api` prefix adds nothing. Probes are `/health` (liveness) and `/health/ready`
  (database readiness). `/dev/mail` exists only in development.
- Workspace-scoped routes live under `/workspaces/:workspaceId/*` behind `requireWorkspaceMember`,
  which loads the membership once (404 for non-members) and exposes `req.workspaceAccess`.
- Routers do HTTP; services hold business logic and talk to Prisma; services call
  `realtime.emit` after committing.
- Configuration is read only through `config/env.ts`, never `process.env` elsewhere.
- Path alias `@/` → `src/` (same convention as the web app).

## 13. Database access

- Prisma 7 with the `prisma-client` generator and the `@prisma/adapter-pg` driver adapter.
  Config lives in `apps/api/prisma.config.ts`.
- The generated client is written to `apps/api/src/generated/prisma` (gitignored) and regenerated
  on `npm install` (postinstall) and with `npm run db:generate`.
- The Prisma client is created lazily (`getPrisma()`), so the API boots in development without a
  database; production requires `DATABASE_URL` at startup.
- **The MVP schema is final** — models, relations, constraints, indexes, delete rules and
  invariants are specified in [`DATA_MODEL.md`](DATA_MODEL.md). Highlights:
  - IDs: UUIDv7 (`@default(uuid(7)) @db.Uuid`) everywhere; validated as UUIDs at the API boundary.
  - Tenancy is enforced by the database: composite foreign keys pin every child row to its
    workspace, and membership-scoped rows reference the `(workspace_id, user_id)` membership.
  - Rules Prisma cannot express (CHECK constraints, partial unique indexes, deferred owner
    trigger, thread trigger) are hand-written in the migration. Prisma ignores them when diffing,
    so they cause no drift (verified with `prisma migrate diff`).
- Use **unchecked (scalar-id) inputs** for writes to rows with composite relations
  (`{ workspaceId, channelId, ... }` rather than nested `connect`), so the shared `workspace_id`
  is set once and explicitly.
- Migrations: `prisma migrate dev` locally; `prisma migrate deploy` in the deploy pipeline. Never
  edit an applied migration — add a new one. `npm run db:seed` loads development data (refuses to
  run in production).

## 14. Frontend structure and design system

```
apps/web/src/
  app/         router (route tree, path builders, error boundary), providers, layouts (AppShell, AuthLayout)
  components/  ui/ (shadcn/ui primitives) and shared/ (app-wide composites)
  features/    one folder per domain (see features/README.md) — created when implemented
  hooks/  lib/  stores/  styles/  types/  test/
```

- Path builders in `app/router/paths.ts` are the only way to build app URLs.
- Feature pages are code-split with React Router's route `lazy`.
- **Design tokens** live in `styles/globals.css` as shadcn/ui-compatible CSS variables
  (`background`, `foreground`, `card`, `muted`, `border`, `primary`, `secondary`, `success`,
  `warning`, `danger`, plus sidebar tokens). Components use semantic utilities only
  (`bg-primary`, `text-muted-foreground`) — never raw palette colours.
- Dark mode: `.dark` class on `<html>`; preference (`light`/`dark`/`system`) persisted by the theme
  store and applied pre-paint by an inline script to avoid a flash.
- New primitives come from the shadcn/ui CLI (`components.json` is configured).
- Naming: React components `PascalCase.tsx`; shadcn primitives, hooks and modules `kebab-case.ts`.

## 15. Testing direction

- **Vitest** in every package; tests are co-located (`*.test.ts[x]`).
- Web: React Testing Library + user-event, rendering the **real route tree and providers** with a
  memory router and isolated QueryClient (`src/test/render.tsx`).
- API: supertest against `createApp()` (no network port); Socket.IO tested end-to-end with
  `socket.io-client` on an ephemeral port.
- Shared: schema, domain-helper and **permission-policy** unit tests (table-driven across
  OWNER/ADMIN/MEMBER/non-member).
- **The API suite runs against a real PostgreSQL engine.** `src/test/global-setup.ts` starts an
  embedded PGlite (PostgreSQL compiled to WebAssembly), applies every migration, and serves it on a
  local port; set `TEST_DATABASE_URL` to use a regular PostgreSQL server instead. Auth, workspace,
  socket and invariant tests all use it. Tests create uniquely named rows, so a shared database
  works; files run sequentially.
- OAuth providers are faked at the `fetch` level; no real Google/GitHub credentials are needed.
- Later phases add Playwright end-to-end tests for critical flows (auth, messaging, drag-and-drop).
- Tests never depend on the developer's `.env` (the API test config clears `DATABASE_URL`).

## 16. Deployment target

| Part     | Target                                                                                 |
| -------- | -------------------------------------------------------------------------------------- |
| Frontend | **Vercel** (static SPA build of `apps/web`)                                            |
| Backend  | **Render** web service (`apps/api`, long-lived Node process — required for WebSockets) |
| Database | **PostgreSQL** (Render PostgreSQL or another managed Postgres)                         |

Notes for the deployment phase:

- Vercel: root directory `apps/web`, build `npm run build`, output `dist`, SPA rewrite of all paths
  to `/index.html`, `VITE_API_BASE_URL` set to the API's public URL.
- Render: build `npm ci && npm run build --workspace @syncspace/api`, pre-deploy
  `npm run db:deploy --workspace @syncspace/api`, start `npm run start --workspace @syncspace/api`,
  health check path `/health`. Set `NODE_ENV=production`, `DATABASE_URL`, `JWT_SECRET`,
  `CORS_ORIGIN`, `FRONTEND_URL`.
- Use same-site custom domains (see §11).
- Starts as a **single API instance**. Scaling horizontally requires the Socket.IO Redis adapter
  (and Redis-backed presence); the `InterServerEvents` map is reserved for that.

## 17. Runtime and tooling versions

- Node **22 LTS** recommended (`.nvmrc`); `^20.19 || >=22.12` supported (`engines`).
- npm **10+** recommended. npm 9 works with the committed lockfile but its dependency resolver can
  crash when _adding_ packages to this workspace.
- TypeScript 6.0 in strict mode (+ `noUncheckedIndexedAccess`, `noImplicitOverride`,
  `noUnusedLocals/Parameters`, `verbatimModuleSyntax`). TypeScript 7 is deferred until
  typescript-eslint supports it.
- ESLint (flat config, type-aware `strictTypeChecked`) + Prettier, configured at the root.
- API dev server uses `node --watch --import tsx`, **not** `tsx watch`: `tsx watch` reads stdin,
  and under `concurrently` on Windows that pending read on the shared stdin pipe blocks the server
  process before it can listen.

## 18. Authorization architecture

**Decision.** Authorization rules are pure functions in `@syncspace/shared/permissions`, re-exported
with enforcement helpers by `apps/api/src/lib/permissions`. Full rules: [`PERMISSIONS.md`](PERMISSIONS.md).

**Why.** One definition serves the API (authoritative enforcement) and the web client (showing or
hiding controls), so the UI can never offer an action the server rejects, or vice versa. Pure
functions over plain context objects are trivially unit-testable.

**Rules.**

- Policy functions take normalised contexts (`WorkspaceActor`, `ChannelContext`, …) — never
  Express requests, Prisma models or dates. Services load rows and map them with the `to*Context`
  helpers in `lib/permissions/context.ts`.
- Routes and services never compare roles directly (`role === 'ADMIN'`); they call a `can*` function.
- Enforcement order: `ensureVisible(canAccess…)` (404, no existence leak) then
  `authorize(canDo…)` (403).
- Client-side checks are UX only; every mutation is re-authorised by the API.
- The database enforces the structural invariants (tenancy, membership, ownership) independently,
  as a backstop for bugs in application code.
