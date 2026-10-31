# SyncSpace

SyncSpace is a real-time team workspace: Slack-style channels and direct messages combined with
Trello-style task boards, in one app.

> **Status:** foundation, data model and **authentication + workspace onboarding** are done:
> email/password and Google/GitHub sign-in, password reset, workspaces, invitations and the
> workspace switcher. Chat and task boards come next (see the roadmap).

- Architecture decisions: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- Data model, invariants and delete rules: [`docs/DATA_MODEL.md`](docs/DATA_MODEL.md)
- Authentication, sessions, OAuth setup, invites: [`docs/AUTH.md`](docs/AUTH.md)
- Authorization rules: [`docs/PERMISSIONS.md`](docs/PERMISSIONS.md)
- Feature folder conventions: [`apps/web/src/features/README.md`](apps/web/src/features/README.md)

## Tech stack

| Layer     | Technology                                                                                        |
| --------- | ------------------------------------------------------------------------------------------------- |
| Web       | React 19, Vite 8, TypeScript, React Router 7, TanStack Query 5, Zustand 5, React Hook Form, Zod 4 |
| UI        | Tailwind CSS 4, shadcn/ui-compatible tokens, lucide-react, @dnd-kit, @tanstack/react-virtual      |
| API       | Node.js, Express 5, Socket.IO 4, Zod 4, Prisma 7 (PostgreSQL), pino, helmet, cors, JWT (cookies)  |
| Shared    | `@syncspace/shared` — Zod schemas, enums, typed socket events, permission policy, domain helpers  |
| Quality   | TypeScript 6 (strict), ESLint 10 (type-aware), Prettier, Vitest 4, Testing Library, supertest     |
| Platforms | Vercel (web), Render (API), PostgreSQL                                                            |

## Repository layout

```
.
├── apps/
│   ├── api/                    Express + Socket.IO server
│   │   ├── prisma/             schema.prisma, migrations/, seed.ts
│   │   ├── prisma.config.ts
│   │   └── src/
│   │       ├── app.ts          Express app factory (used by server and tests)
│   │       ├── server.ts       HTTP + Socket.IO bootstrap, graceful shutdown
│   │       ├── config/         validated env, CORS, auth constants
│   │       ├── middleware/     logging, validation, auth, origin check, errors
│   │       ├── modules/        auth (+ oauth), workspaces (+ invites), health, dev mail
│   │       ├── sockets/        socket server, handshake auth, rooms, realtime publisher
│   │       ├── lib/            logger, prisma, errors, tokens, password, mail/, permissions/
│   │       ├── utils/          small pure helpers
│   │       └── types/          Express type augmentation
│   └── web/                    React SPA
│       └── src/
│           ├── app/            router, providers, layouts (AppShell, AuthLayout)
│           ├── components/     ui/ (shadcn primitives), shared/
│           ├── features/       auth, workspaces, invites, realtime (more per phase)
│           ├── lib/  stores/  styles/  types/  test/
├── packages/
│   └── shared/                 contracts shared by web and api
│       └── src/  constants/  domain/  permissions/  schemas/  socket/  types/  index.ts
├── docs/                       ARCHITECTURE.md, AUTH.md, DATA_MODEL.md, PERMISSIONS.md
├── eslint.config.js  .prettierrc.json  tsconfig.base.json
└── package.json                npm workspaces + root scripts
```

## Getting started

### Prerequisites

- **Node.js 22 LTS** recommended (`^20.19` or `>=22.12` supported)
- **npm 10+** recommended
- **PostgreSQL 15+** for running the app (tests use an embedded PostgreSQL automatically)

### Install

```bash
npm install          # installs all workspaces and generates the Prisma client
```

### Configure environment

```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
```

**`apps/api/.env`**

| Variable                                                                           | Default                 | Notes                                                                                     |
| ---------------------------------------------------------------------------------- | ----------------------- | ----------------------------------------------------------------------------------------- |
| `PORT`                                                                             | `4000`                  |                                                                                           |
| `NODE_ENV`                                                                         | `development`           | `development` \| `test` \| `production`                                                   |
| `DATABASE_URL`                                                                     | —                       | `postgresql://…`. Required to use the app (and in production)                             |
| `FRONTEND_URL`                                                                     | `http://localhost:5173` | Web app URL for email links and OAuth redirects. Required in production                   |
| `API_PUBLIC_URL`                                                                   | `http://localhost:4000` | API URL for OAuth callbacks. Required in production                                       |
| `CORS_ORIGIN`                                                                      | `http://localhost:5173` | Comma-separated list of allowed origins (credentials on)                                  |
| `JWT_SECRET`                                                                       | dev fallback            | ≥ 32 chars. Required in production                                                        |
| `COOKIE_SAME_SITE` / `COOKIE_DOMAIN`                                               | `lax` / —               | Session cookie attributes (see docs/AUTH.md)                                              |
| `GOOGLE_CLIENT_ID` / `_SECRET`                                                     | —                       | Enables Google sign-in                                                                    |
| `GITHUB_CLIENT_ID` / `_SECRET`                                                     | —                       | Enables GitHub sign-in                                                                    |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` | —                       | Outgoing email. Without SMTP, development captures mail at http://localhost:4000/dev/mail |
| `LOG_LEVEL`                                                                        | `debug` (dev)           | `trace` … `fatal`, `silent`                                                               |

Configuration is validated at startup (`apps/api/src/config/env.ts`). In production, missing
`DATABASE_URL`, `FRONTEND_URL` or `API_PUBLIC_URL`, or a missing/weak `JWT_SECRET`, stops the
server immediately. OAuth setup (console links, callback URLs): [`docs/AUTH.md`](docs/AUTH.md#provider-setup).

**`apps/web/.env`**

| Variable            | Default                 |
| ------------------- | ----------------------- |
| `VITE_API_BASE_URL` | `http://localhost:4000` |

### Database

No PostgreSQL installed? `npm run db:local --workspace @syncspace/api` serves an embedded
PostgreSQL (PGlite) on port 54329 with data kept in `apps/api/.pglite/` — development only. Use
`DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54329/postgres?sslmode=disable`.

```bash
# with DATABASE_URL set in apps/api/.env
npm run db:migrate   # apply migrations (or `npm run db:deploy --workspace @syncspace/api`)
npm run db:seed      # demo workspace "acme" with two users (below)
```

Seeded **development-only** accounts (password `SyncSpace-dev-1`): `alex@example.com` (owner)
and `sam@example.com` (member). The seed refuses to run in production.

### Run

```bash
npm run dev
```

- Web: http://localhost:5173 — register or sign in; new users are guided through creating a workspace
- API: http://localhost:4000/health (liveness) and http://localhost:4000/health/ready (database)
- Dev mail (password resets, invitations): http://localhost:4000/dev/mail

## Scripts

Run from the repository root.

| Script                 | What it does                                               |
| ---------------------- | ---------------------------------------------------------- |
| `npm run dev`          | API and web together (concurrently)                        |
| `npm run dev:web`      | Vite dev server only                                       |
| `npm run dev:api`      | API only (`node --watch` + tsx loader)                     |
| `npm run build`        | Typecheck shared, bundle the API (tsup), build the web app |
| `npm run typecheck`    | `tsc` in every workspace                                   |
| `npm run lint`         | ESLint (type-aware) across the repo                        |
| `npm run lint:fix`     | ESLint with autofix                                        |
| `npm run format`       | Prettier write                                             |
| `npm run format:check` | Prettier check                                             |
| `npm test`             | Vitest in every workspace                                  |
| `npm run db:generate`  | Regenerate the Prisma client                               |
| `npm run db:migrate`   | `prisma migrate dev`                                       |
| `npm run db:seed`      | Development seed data (refuses to run in production)       |
| `npm run db:studio`    | Prisma Studio                                              |

**API tests run against a real PostgreSQL engine with no setup:** the suite starts an embedded
PGlite database and applies the migrations. To use a regular PostgreSQL server instead, point
`TEST_DATABASE_URL` at a dedicated, migrated database:

```bash
DATABASE_URL=<url> npm run db:deploy --workspace @syncspace/api
TEST_DATABASE_URL=<url> npm run test --workspace @syncspace/api
```

Workspace-specific: `npm run <script> --workspace @syncspace/<web|api|shared>`
(e.g. `npm run test:watch --workspace @syncspace/web`).

## Core rules (summary)

The full reasoning is in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

**Data and realtime**

- PostgreSQL is the source of truth. Socket state is never treated as data.
- REST handles initial data, every create/update/delete, pagination and search.
- Socket.IO handles fan-out of committed changes, presence and typing.
- Mutation order is always: **validate → authorize → write → commit → emit socket event → respond**.
- Rooms: `workspace:<id>`, `channel:<id>`, `conversation:<id>`, `user:<id>`, built only with
  `rooms.*()` from `@syncspace/shared`. Joins are authorized server-side.
- Socket event names and payloads are defined once in `@syncspace/shared` and type both ends.

**Client state**

- **TanStack Query** owns all server data. Realtime events update its cache.
- **Zustand** holds only ephemeral UI state (drawers, modals, theme, typing indicators).
- **The URL** owns the active workspace/channel.
- Query keys come only from `lib/query-keys.ts`. HTTP goes only through `lib/api-client.ts`.

**API conventions**

- Success responses return the resource directly; lists are `{ items, nextCursor }`.
- Errors are always `{ error: { code, message, issues?, requestId } }`, with stable `code` values
  shared with the client.

**Code**

- Path alias `@/` → `src/` in both apps. Shared types come from `@syncspace/shared` and are never
  redeclared.
- Components use semantic design tokens (`bg-primary`, `text-muted-foreground`), never raw colors.

## Roadmap

| Phase | Scope                                                                                             |
| ----- | ------------------------------------------------------------------------------------------------- |
| 0     | ✅ **Foundation** — monorepo, contracts, API/realtime skeleton, app shell, tokens                 |
| 1     | ✅ **Database schema + permissions** — MVP schema, migration, invariants, policy, seed            |
| 2     | ✅ **Auth + onboarding** — password & Google/GitHub sign-in, reset, workspaces, invites, switcher |
| 3     | Members and roles — member list, role changes, removal, ownership transfer, pending invites       |
| 4     | Channels and direct messages — lists, membership, navigation                                      |
| 5     | Real-time messaging — send/edit/delete, history pagination, virtualization, replies, reactions    |
| 6     | Presence and typing indicators                                                                    |
| 7     | Attachments — file/image upload and previews                                                      |
| 8     | Kanban boards and tasks — columns, drag and drop, assignees, priorities, due dates                |
| 9     | Notifications and search                                                                          |
| 10    | Polish and deployment — responsive pass, accessibility, Vercel + Render + PostgreSQL              |
