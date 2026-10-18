# SyncSpace

SyncSpace is a real-time team workspace: Slack-style channels and direct messages combined with
Trello-style task boards, in one app.

> **Status: foundation.** This repository currently contains the architecture, tooling and
> infrastructure (monorepo, typed contracts, API skeleton, realtime layer, app shell, design
> tokens, tests). Product features are built on top of it in the phases listed below.

- Architecture decisions: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- Feature folder conventions: [`apps/web/src/features/README.md`](apps/web/src/features/README.md)

## Tech stack

| Layer     | Technology                                                                                        |
| --------- | ------------------------------------------------------------------------------------------------- |
| Web       | React 19, Vite 8, TypeScript, React Router 7, TanStack Query 5, Zustand 5, React Hook Form, Zod 4 |
| UI        | Tailwind CSS 4, shadcn/ui-compatible tokens, lucide-react, @dnd-kit, @tanstack/react-virtual      |
| API       | Node.js, Express 5, Socket.IO 4, Zod 4, Prisma 7 (PostgreSQL), pino, helmet, cors, JWT (cookies)  |
| Shared    | `@syncspace/shared` — Zod schemas, DTO types, constants, typed socket events, room helpers        |
| Quality   | TypeScript 6 (strict), ESLint 10 (type-aware), Prettier, Vitest 4, Testing Library, supertest     |
| Platforms | Vercel (web), Render (API), PostgreSQL                                                            |

## Repository layout

```
.
├── apps/
│   ├── api/                    Express + Socket.IO server
│   │   ├── prisma/             schema.prisma (provisional — no models yet)
│   │   ├── prisma.config.ts
│   │   └── src/
│   │       ├── app.ts          Express app factory (used by server and tests)
│   │       ├── server.ts       HTTP + Socket.IO bootstrap, graceful shutdown
│   │       ├── config/         validated env, CORS, auth constants
│   │       ├── middleware/     logging, validation, auth, origin check, errors
│   │       ├── modules/        feature modules (health so far)
│   │       ├── sockets/        socket server, handshake auth, rooms, realtime publisher
│   │       ├── lib/            logger, prisma, errors, tokens
│   │       ├── utils/          small pure helpers
│   │       └── types/          Express type augmentation
│   └── web/                    React SPA
│       └── src/
│           ├── app/            router, providers, layouts (AppShell, AuthLayout)
│           ├── components/     ui/ (shadcn primitives), shared/
│           ├── features/       per-domain feature folders (added per phase)
│           ├── hooks/  lib/  stores/  styles/  types/  test/
├── packages/
│   └── shared/                 contracts shared by web and api
│       └── src/  constants/  schemas/  socket/  types/  index.ts
├── docs/ARCHITECTURE.md
├── eslint.config.js  .prettierrc.json  tsconfig.base.json
└── package.json                npm workspaces + root scripts
```

## Getting started

### Prerequisites

- **Node.js 22 LTS** recommended (`^20.19` or `>=22.12` supported)
- **npm 10+** recommended
- **PostgreSQL 15+** — optional until the database phase (the API boots without it)

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

| Variable       | Default                 | Notes                                                             |
| -------------- | ----------------------- | ----------------------------------------------------------------- |
| `PORT`         | `4000`                  |                                                                   |
| `NODE_ENV`     | `development`           | `development` \| `test` \| `production`                           |
| `DATABASE_URL` | —                       | `postgresql://…`. Optional in development, required in production |
| `FRONTEND_URL` | `http://localhost:5173` |                                                                   |
| `CORS_ORIGIN`  | `http://localhost:5173` | Comma-separated list of allowed origins (credentials on)          |
| `JWT_SECRET`   | dev fallback            | ≥ 32 chars. Required in production                                |
| `LOG_LEVEL`    | `debug` (dev)           | `trace` … `fatal`, `silent`                                       |

Configuration is validated at startup (`apps/api/src/config/env.ts`). In production, a missing
`DATABASE_URL` or a missing/weak `JWT_SECRET` stops the server immediately.

**`apps/web/.env`**

| Variable            | Default                 |
| ------------------- | ----------------------- |
| `VITE_API_BASE_URL` | `http://localhost:4000` |

### Run

```bash
npm run dev
```

- Web: http://localhost:5173 — the top bar shows **API online** when the web app can reach the API
- API: http://localhost:4000/health (liveness) and http://localhost:4000/health/ready (database)

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
| `npm run db:studio`    | Prisma Studio                                              |

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

| Phase | Scope                                                                                          |
| ----- | ---------------------------------------------------------------------------------------------- |
| 0     | **Foundation** (this) — monorepo, contracts, API/realtime skeleton, app shell, tokens          |
| 1     | Database design — Prisma schema for all MVP entities, migrations, seed data                    |
| 2     | Authentication — register/login/logout, refresh rotation, session query, route guards          |
| 3     | Workspaces, members and roles — CRUD, invitations, room-access policy                          |
| 4     | Channels and direct messages — lists, membership, navigation                                   |
| 5     | Real-time messaging — send/edit/delete, history pagination, virtualization, replies, reactions |
| 6     | Presence and typing indicators                                                                 |
| 7     | Attachments — file/image upload and previews                                                   |
| 8     | Kanban boards and tasks — columns, drag and drop, assignees, priorities, due dates             |
| 9     | Notifications and search                                                                       |
| 10    | Polish and deployment — responsive pass, accessibility, Vercel + Render + PostgreSQL           |
