# Production deployment

The production setup for SyncSpace:

| Part             | Where              |
| ---------------- | ------------------ |
| Web              | Vercel             |
| API and realtime | Render             |
| Database         | Managed PostgreSQL |
| Attachments      | Cloudflare R2      |

Nothing in this repository deploys automatically. Follow this checklist.

## 1. Topology

```
app.example.com (Vercel, static SPA) ──HTTPS + cookies──▶ api.example.com (Render, Node + Socket.IO)
                                                              │                │
                                                              ▼                ▼
                                                     PostgreSQL (managed)   R2 bucket (private)
```

- Use **same-site custom domains** (`app.` and `api.` of one registrable domain). Then the session
  cookie stays `SameSite=Lax` and attachment images load with
  `Cross-Origin-Resource-Policy: same-site`.
- On two unrelated domains (e.g. `*.vercel.app` + `*.onrender.com`), set `COOKIE_SAME_SITE=none`.
  This needs HTTPS, which production has. Attachments then switch to `cross-origin` automatically.
- Run **one API instance**. Presence, typing and rate-limit counters are in memory. Scaling out
  would need the Socket.IO Redis adapter and a shared store; see ARCHITECTURE §16.

## 2. API environment (Render)

| Variable                                                                           | Required    | Value                                                                                      |
| ---------------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------ |
| `NODE_ENV`                                                                         | ✅          | `production`                                                                               |
| `DATABASE_URL`                                                                     | ✅          | `postgresql://…?sslmode=require`                                                           |
| `JWT_SECRET`                                                                       | ✅          | ≥ 32 random chars (`openssl rand -base64 48`)                                              |
| `FRONTEND_URL`                                                                     | ✅          | `https://app.example.com`                                                                  |
| `API_PUBLIC_URL`                                                                   | ✅          | `https://api.example.com`                                                                  |
| `CORS_ORIGIN`                                                                      | ✅          | `https://app.example.com` (comma-separated if several)                                     |
| `STORAGE_DRIVER`                                                                   | ✅          | `s3` (or `disabled`; `local` is refused)                                                   |
| `S3_BUCKET`                                                                        | ✅ with s3  | Private bucket name                                                                        |
| `S3_ENDPOINT`                                                                      | R2          | `https://<account-id>.r2.cloudflarestorage.com`                                            |
| `S3_REGION`                                                                        |             | `auto` (R2) or the AWS region                                                              |
| `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY`                                        | ✅ with s3  | Token scoped to the bucket                                                                 |
| `UPLOAD_URL_TTL_SECONDS`                                                           |             | Default `300`                                                                              |
| `COOKIE_SAME_SITE`                                                                 |             | `lax` (default) or `none` across sites                                                     |
| `COOKIE_DOMAIN`                                                                    |             | Optional, e.g. `.example.com`                                                              |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` | recommended | Without SMTP, production emails are not sent: password reset and invite links won't arrive |
| `GOOGLE_CLIENT_ID` / `_SECRET`, `GITHUB_CLIENT_ID` / `_SECRET`                     | optional    | Callback: `<API_PUBLIC_URL>/auth/oauth/<provider>/callback`                                |
| `LOG_LEVEL`                                                                        |             | Default `info`                                                                             |

The API **fails at boot** with a clear message if a required value is missing or unsafe. For
example: a short JWT secret, local storage, or S3 without credentials.

**Render service:**

| Setting            | Value                                                                                                                                                                                                |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Build command      | `npm ci && npm run build --workspace @syncspace/api` (`npm ci` runs `prisma generate`; tsup bundles the shared package)                                                                              |
| Pre-deploy command | `npm run db:deploy --workspace @syncspace/api` (`prisma migrate deploy`)                                                                                                                             |
| Start command      | `npm run start --workspace @syncspace/api`                                                                                                                                                           |
| Health check path  | `/health/ready`. Ready = the database answers. Storage status is reported (`checks.storage`) but never fails readiness, so an R2 outage degrades uploads, not chat. Use `/health` for pure liveness. |
| Node version       | `22` (`.nvmrc`); `20.19+` also works                                                                                                                                                                 |

## 3. Web environment (Vercel)

| Setting        | Value                                                    |
| -------------- | -------------------------------------------------------- |
| Root directory | `apps/web`                                               |
| Install        | `npm ci` (from the repository root)                      |
| Build          | `npm run build`                                          |
| Output         | `dist`                                                   |
| Env            | `VITE_API_BASE_URL=https://api.example.com` (build-time) |

`apps/web/vercel.json` provides the SPA rewrite (deep links such as `/app/workspaces/…` serve
`index.html`) and baseline security headers.

## 4. Database checklist (PostgreSQL)

1. Create the database (PostgreSQL 15+; tests run against PostgreSQL 18 via PGlite).
2. Apply all migrations. Never edit historical migrations.
   ```bash
   DATABASE_URL=… npm run db:deploy --workspace @syncspace/api     # prisma migrate deploy
   DATABASE_URL=… npx prisma migrate status --schema apps/api/prisma/schema.prisma
   ```
   `migrate status` must report _Database schema is up to date_.
3. Check there is no drift between the schema and the database:
   ```bash
   cd apps/api
   npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code
   ```
   Exit code 0 means no drift. Any output means the database and `schema.prisma` disagree:
   investigate before going live.
4. Optional demo data: `npm run db:seed --workspace @syncspace/api` (demo users, development
   only). **Don't seed production.**
5. Backups: enable the provider's automated backups / point-in-time recovery.

The migrations include raw SQL invariants: CHECK constraints, partial unique indexes and
composite foreign keys. They are part of the schema, so always migrate with
`prisma migrate deploy`, never `db push`.

## 5. Object storage checklist (R2)

1. Create a **private** bucket (no public access, no `r2.dev` URL).
2. Create an API token: _Object Read & Write_, restricted to that bucket.
3. Set the S3 variables above. No bucket CORS is required.
4. After deploy, `GET /health/ready` must show `"storage":"ok"`. Then upload a file in the app and
   open it.

## 6. Post-deploy smoke test

1. `GET /health` → 200; `GET /health/ready` → `{"status":"ok","checks":{"database":"ok","storage":"ok"}}`.
2. Register, then create a workspace. Confirm `#general` exists.
3. In a second browser profile, accept an invite: realtime chat, typing and presence should work
   both ways.
4. Upload an image to a message: the other user sees the thumbnail instantly. Its URL 302s to
   the bucket, and opening it while signed out returns 404.
5. Create a board, drag a task, assign the second user. The notification should arrive.
6. Sign out: you land on `/login` with no way back into the old pages.

## 7. Runtime versions

| Node        | Status                                                           |
| ----------- | ---------------------------------------------------------------- |
| 22.23 (LTS) | ✅ Typecheck, lint, build and all test suites pass (recommended) |
| 20.19       | ✅ Same suites pass (local development default)                  |

npm 10 (bundled with Node 22) is recommended for installs.
