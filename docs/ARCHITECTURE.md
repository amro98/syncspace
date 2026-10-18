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
| `conversation:<conversationId>` | participants of a direct-message conversation  |
| `user:<userId>`                 | every socket of one user (multi-tab / devices) |

**Rules.**

- Sockets join `user:<userId>` automatically on connect. Notifications and per-user sync target it.
- Joining any other room is **authorized against persistent membership** via the
  `RoomAccessPolicy` seam (`apps/api/src/sockets/room-access.ts`). Until the membership modules
  exist, the default policy denies every join (secure by default).
- Socket handshake authentication uses the same httpOnly access-token cookie as REST.

**Event naming.**

- Client → server commands: `<entity>:<verb>` (`workspace:join`, `channel:leave`).
- Server → client facts: `<entity>:<past-tense>` (`workspace:updated`, `notification:created`).
- Names live in `CLIENT_EVENTS` / `SERVER_EVENTS`; payload types in `ClientToServerEvents` /
  `ServerToClientEvents`. Both server (`Server<…>`) and client (`Socket<…>`) are typed from these
  maps, so they cannot drift.
- Every client → server payload is validated server-side with its shared Zod schema.
- Client → server events reply through an acknowledgement shaped as `SocketAck`
  (`{ ok: true, data }` or `{ ok: false, error: { code, message } }`) — the same error codes as REST.

**Payloads.** Until domain DTOs exist, server events carry identifiers and act as invalidation
signals. When DTOs land, events may carry the committed entity so clients can write it straight
into the cache.

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

## 11. Authentication direction

- **Session transport:** httpOnly, `Secure` (in production) cookies. Tokens are never readable by
  JavaScript and never stored in localStorage.
- **Access token:** short-lived JWT (15 min, HS256, `sub` = user id) in the `ss_access` cookie.
  Verified by `requireAuth` (REST) and the Socket.IO handshake middleware.
- **Refresh token:** opaque random token, stored **hashed** in PostgreSQL, rotated on every use,
  in a separate cookie scoped to the refresh endpoint. Enables logout/revocation.
- **Passwords:** hashed with bcrypt (`bcryptjs`), added in the auth phase.
- **CSRF:** `SameSite=Lax` cookies + JSON-only bodies + `verifyOrigin` middleware rejecting
  state-changing requests from origins not in `CORS_ORIGIN`.
- **Deployment caveat:** Vercel and Render default domains are different _sites_, which makes the
  API cookie third-party — blocked by Safari and increasingly by other browsers. Production must
  serve web and API from the **same registrable domain** (e.g. `app.syncspace.dev` on Vercel and
  `api.syncspace.dev` on Render) so cookies stay first-party with `SameSite=Lax`.
- `JWT_SECRET` is mandatory (≥32 chars) in production; development uses a logged, insecure fallback.

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

- Feature routes mount under `/api/<resource>`; probes are `/health` (liveness) and
  `/health/ready` (database readiness).
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
- Database invariants: `apps/api/src/db/invariants.db.test.ts` exercises every constraint and
  trigger against a migrated PostgreSQL. It runs only when `TEST_DATABASE_URL` is set and is
  skipped otherwise — `npm test` never pretends a database was reached. Each test creates and
  cleans up its own uniquely named rows.
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
