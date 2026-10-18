# Features

One folder per product domain. Created in the phase that implements the
feature — no placeholder folders. Planned: `auth`, `workspaces`, `members`,
`channels`, `messages`, `conversations`, `presence`, `boards`, `tasks`,
`notifications`, `search`.

```
features/<feature>/
  api/          queryFn/mutationFn wrappers around `apiClient` + query/mutation hooks
  components/   feature UI
  hooks/        feature-specific hooks (non-server state)
  realtime/     socket event -> TanStack Query cache handlers
  routes/       lazy-loaded route modules (pages)
  index.ts      public surface — other features import only from here
```

Rules:

- Server data is fetched with TanStack Query using keys from `@/lib/query-keys`.
- HTTP goes through `@/lib/api-client`; sockets through `@/lib/socket`.
- Request/response shapes come from `@syncspace/shared` — do not redeclare them.
- Features may depend on `components/`, `hooks/`, `lib/`, `stores/`, and other
  features' `index.ts`; `components/`, `hooks/`, `lib/` never import features.
