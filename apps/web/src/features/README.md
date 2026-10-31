# Features

One folder per product domain, created in the phase that implements it. Present: `auth`,
`workspaces`, `invites`, `realtime`. Planned: `members`, `channels`, `messages`,
`conversations`, `presence`, `boards`, `tasks`, `notifications`, `search`.

```
features/<feature>/
  api.ts        calls to `apiClient`, typed with schemas from @syncspace/shared
  hooks.ts      TanStack Query hooks (server state) and feature hooks
  components/   feature UI
  routes/       pages mounted by app/router/routes.tsx
  *.test.tsx    behaviour tests through the real route tree (src/test/render.tsx)
```

Small features keep `api.ts` / `hooks.ts` as single files; split them into folders when they
grow. Route pages are imported eagerly today; switch a feature's routes to React Router `lazy`
once bundle size warrants it.

Rules:

- Server data is fetched with TanStack Query using keys from `@/lib/query-keys`.
- HTTP goes through `@/lib/api-client`; sockets through `@/lib/socket`.
- Request/response shapes come from `@syncspace/shared` — do not redeclare them.
- Permission checks for showing controls use the shared policy (`canInviteMember`, …); the API
  enforces the same rules.
- Features may depend on `components/`, `lib/`, `stores/` and other features;
  `components/` and `lib/` never import features.
