# SyncSpace — Authentication & Onboarding

How users sign in, how sessions work, and how they get into a workspace. Authorization (who may
do what inside a workspace) is in [`PERMISSIONS.md`](PERMISSIONS.md).

## Sessions

| Aspect              | Behaviour                                                                                                                                                                                                                                 |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Transport           | One httpOnly cookie, `ss_session`, holding a JWT (`sub` = user id, `ver` = `User.tokenVersion`). JavaScript never sees it; nothing auth-related is stored in localStorage.                                                                |
| Remember me **off** | Browser-session cookie (no `Max-Age`, cleared when the browser closes); JWT expires after **12 hours**.                                                                                                                                   |
| Remember me **on**  | Persistent cookie and JWT, **30 days**.                                                                                                                                                                                                   |
| Verification        | Every authenticated request (REST and the Socket.IO handshake) checks signature, expiry **and** that `ver` equals the user's current `tokenVersion`.                                                                                      |
| Revocation          | A password reset increments `tokenVersion`: all existing sessions stop working immediately. Logout clears this browser's cookie.                                                                                                          |
| Development         | `Secure` off (plain HTTP on localhost works), `SameSite=Lax`, `localhost:5173` → `localhost:4000` is same-site.                                                                                                                           |
| Production          | `Secure` on, `SameSite` from `COOKIE_SAME_SITE` (default `lax`). Serve web and API on the same registrable domain (`app.example.com` + `api.example.com`) so the cookie is first-party; set `COOKIE_DOMAIN=.example.com` if both need it. |

There is no session table and no refresh token: the version check provides server-side revocation
with a single primary-key lookup.

## Passwords

- bcrypt (`bcryptjs`, cost 12). Unknown email and wrong password return the same
  `INVALID_CREDENTIALS` error after the same bcrypt work (no timing oracle).
- Policy, enforced by one shared schema on client and server: 8–72 characters (and ≤ 72 bytes,
  bcrypt's limit), at least one uppercase, lowercase, number and special character.
- Forms are password-manager friendly: real `<form>` elements; login uses `name="email"
autocomplete="username"` and `name="password" autocomplete="current-password"`; register and
  reset use `autocomplete="new-password"`. Autocomplete is never disabled.

## Social sign-in (Google, GitHub)

Authorization-code flow with `state` and PKCE (S256), implemented with plain `fetch`.

```
browser ──GET /auth/oauth/google?redirect=…&remember=1──▶ API  (sets signed ss_oauth_state cookie)
        ◀── 303 to Google consent (state, code_challenge, scopes: openid email profile)
Google ──GET /auth/oauth/google/callback?code&state──▶ API
        API checks state (constant-time) against the cookie, exchanges code + verifier,
        reads the profile, then decides (below) and redirects to the web app.
```

GitHub is identical with scopes `read:user user:email`; the primary **verified** address from
`/user/emails` is used.

### Account rules

| Situation                                                                                                | Result                                                                                                                                                                                                                                  |
| -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Provider account already linked                                                                          | Signed in immediately.                                                                                                                                                                                                                  |
| Provider email missing or **not verified**                                                               | Refused (`OAUTH_EMAIL_UNVERIFIED`). Unverified emails are never used to create or link accounts.                                                                                                                                        |
| New provider account, no user with that email                                                            | **Pending sign-up** → `/auth/social/confirm` ("Continue with Google", name, verified email, provider). _Create account_ creates the user + link and signs in; _Cancel_ creates nothing.                                                 |
| New provider account, a user with that email exists                                                      | **Pending link** → `/auth/social/link` ("An account already exists with this email. Link Google to your existing account?"). _Link & Continue_ adds the provider to the **same** user; _Cancel_ changes nothing. Never linked silently. |
| User already has a different account of that provider, or the provider account is linked to someone else | Refused (`OAUTH_ACCOUNT_CONFLICT`).                                                                                                                                                                                                     |

The pending state is a signed, httpOnly, 15-minute cookie holding only what the provider proved.
Confirming re-validates everything in a transaction: the provider account is still unlinked, the
email is still free (sign-up) or still belongs to that user (link).

One user can therefore sign in with email/password, Google **and** GitHub. Social-only users have
no password (`passwordHash = null`); a password login attempt tells them to continue with their
provider or use **Forgot password**, which sets their first password.

### Provider setup

1. Set `API_PUBLIC_URL` and `FRONTEND_URL` (defaults: `http://localhost:4000`, `http://localhost:5173`).
2. **Google** — [Cloud console → Credentials](https://console.cloud.google.com/apis/credentials) →
   OAuth client ID (Web application). Authorized redirect URI:
   `<API_PUBLIC_URL>/auth/oauth/google/callback`. Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.
3. **GitHub** — [Settings → Developer settings → OAuth Apps](https://github.com/settings/developers).
   Authorization callback URL: `<API_PUBLIC_URL>/auth/oauth/github/callback`. Set
   `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`.

A provider without credentials is reported by `GET /auth/providers` and shown disabled in the UI.

## Password reset

1. `POST /auth/forgot-password` always answers `202` with the same message, immediately; lookup,
   token creation and email happen in the background (no enumeration by body or timing).
2. Token: 256-bit random, URL-safe; only its **SHA-256** is stored; expires in **30 minutes**;
   requesting a new one deletes the user's older unused tokens.
3. Email links to `FRONTEND_URL/reset-password?token=…`. The page verifies the token first
   (`/auth/reset-password/verify`) and explains _invalid_, _expired_ or _already used_.
4. `POST /auth/reset-password` consumes the token exactly once, sets the new password, deletes the
   user's other reset tokens and increments `tokenVersion` (all sessions revoked).

## Email

| Configuration        | Behaviour                                                                                                                           |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `SMTP_HOST` set      | Sent through Nodemailer (`SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`).                                    |
| Development, no SMTP | Captured in memory; open **http://localhost:4000/dev/mail** to read them and click links. The log names the viewer, never the link. |
| Production, no SMTP  | Not sent; a warning is logged without any content. `/dev/mail` does not exist outside development.                                  |

## Rate limits

Per client IP per 15 minutes, on the auth endpoints only (development allows 10×):

| Endpoint                             | Limit                  |
| ------------------------------------ | ---------------------- |
| `POST /auth/login`                   | 10 **failed** attempts |
| `POST /auth/register`                | 10                     |
| `POST /auth/forgot-password`         | 5                      |
| `POST /auth/reset-password[/verify]` | 10                     |
| `GET /auth/oauth/*`                  | 30                     |

Counters are in memory (one API instance). A multi-instance deployment needs a shared store.

## Onboarding and workspaces

- After sign-in the app goes to the `redirect` it was given (e.g. an invitation) or `/app`.
- `/app` → **onboarding** when the user has no workspace; otherwise the last workspace opened
  (an id kept in localStorage, used only if the server's workspace list still contains it) or the
  first one.
- Onboarding: _Welcome_ → _Create workspace_ (name; slug generated from the name, editable,
  validated like the database) → _Invite teammates_ (optional) → the workspace.
- `POST /workspaces` creates the workspace, the creator's **OWNER** membership and a public
  **#general** channel in one transaction.
- The workspace switcher lists `GET /workspaces` (name, role, member count) and switches by URL.

## Invitations

1. `POST /workspaces/:id/invites { email, role }` — allowed per the central policy (OWNER invites
   ADMIN/MEMBER, ADMIN invites MEMBER, never OWNER). Re-inviting refreshes the pending invitation.
2. Token: 256-bit random; only the SHA-256 is stored; expires in **7 days**. The email (workspace,
   inviter, role) links to `FRONTEND_URL/invite/<token>`.
3. `/invite/:token` previews the invitation for anyone holding the link. Signed out → _Sign in to
   accept_ / _Create an account_ (email prefilled), both returning to the invitation. Signed in as
   another email → explanation and _Sign out and switch account_.
4. `POST /invites/accept { token }` requires the signed-in user's email to match, adds the member
   with the invited role and marks the invitation accepted. Accepting again is a harmless no-op.

Tokens for invites and resets are sent in request **bodies**, never API URLs, so they stay out of
request logs.

## Endpoints

| Method & path                                 | Auth             | Purpose                                                             |
| --------------------------------------------- | ---------------- | ------------------------------------------------------------------- |
| `POST /auth/register`                         | –                | Create account, start session                                       |
| `POST /auth/login`                            | –                | Start session                                                       |
| `POST /auth/logout`                           | –                | Clear session cookie                                                |
| `GET /auth/me`                                | session          | Current user (`id, name, email, avatarUrl, hasPassword, providers`) |
| `GET /auth/providers`                         | –                | Configured social providers                                         |
| `POST /auth/forgot-password`                  | –                | Request reset email (generic answer)                                |
| `POST /auth/reset-password/verify`            | –                | Check a reset token                                                 |
| `POST /auth/reset-password`                   | –                | Set new password                                                    |
| `GET /auth/oauth/:provider`                   | –                | Start Google/GitHub sign-in                                         |
| `GET /auth/oauth/:provider/callback`          | –                | Provider redirect target                                            |
| `GET /auth/oauth/pending`                     | pending cookie   | Pending sign-up/link details                                        |
| `POST /auth/oauth/pending/confirm` / `cancel` | pending cookie   | Confirm or discard                                                  |
| `GET /workspaces`                             | session          | The user's workspaces                                               |
| `POST /workspaces`                            | session          | Create workspace                                                    |
| `GET /workspaces/:id`                         | member           | Workspace + current membership                                      |
| `POST /workspaces/:id/invites`                | member + policy  | Invite by email                                                     |
| `POST /invites/preview`                       | –                | Invitation details for a token                                      |
| `POST /invites/accept`                        | session          | Accept an invitation                                                |
| `GET /dev/mail`                               | development only | Captured email viewer                                               |

Error codes (`EMAIL_TAKEN`, `INVALID_CREDENTIALS`, `PASSWORD_NOT_SET`, `RESET_TOKEN_*`, `OAUTH_*`,
`SLUG_TAKEN`, `ALREADY_MEMBER`, `INVITE_*`, …) are defined in
`packages/shared/src/constants/error-codes.ts` and use the standard error body.
