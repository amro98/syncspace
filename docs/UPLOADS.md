# Uploads: attachments and object storage

How files attach to messages and tasks: storage providers, validation, access control, the
upload lifecycle and cleanup.

## 1. Storage architecture

All file I/O goes through one interface, `ObjectStorage` in `apps/api/src/lib/storage/`:

| Method                 | Purpose                                                  |
| ---------------------- | -------------------------------------------------------- |
| `put(key, body, type)` | Store an object under an API-generated key               |
| `delete(key)`          | Remove an object                                         |
| `access(key, opts)`    | How the client gets the bytes: a signed URL, or a stream |
| `check()`              | Cheap reachability probe (readiness)                     |

| Adapter  | When                  | Behaviour                                                                       |
| -------- | --------------------- | ------------------------------------------------------------------------------- |
| `local`  | Development (default) | Files under `apps/api/.uploads/`, streamed by the API after its access check    |
| `s3`     | Production            | Any S3-compatible bucket; downloads are short-lived signed URLs (default 5 min) |
| `memory` | Tests                 | In memory, with failure injection (`failNext`)                                  |

Routes and services never import a provider SDK. Swapping providers only means changing env
vars.

### Provider: Cloudflare R2, through the S3 API

R2 is recommended for production:

- It speaks the S3 API, so the same adapter also works with AWS S3, Backblaze B2 or MinIO.
- Egress is free, and attachments are read far more often than they are written.
- It has a free tier (10 GB storage, 1M writes and 10M reads per month).
- The bucket stays private: signed URLs are generated locally by the API, with no extra network
  round trip.

Cloudinary was considered and rejected. Its strength is image transformation, which we don't use
yet. It would put a second, image-specific SDK in the code path, and its access model (signed
delivery) is harder to keep strictly private.

**Production never writes uploads to the API container's disk.** Hosts such as Render have
ephemeral filesystems. The API refuses to boot with `STORAGE_DRIVER=local` in production, and
also with `STORAGE_DRIVER=s3` but missing credentials. `STORAGE_DRIVER=disabled` turns uploads
off (503 `STORAGE_UNAVAILABLE`) while chat and tasks keep working.

## 2. Configuration

| Variable                 | Default    | Notes                                                              |
| ------------------------ | ---------- | ------------------------------------------------------------------ |
| `STORAGE_DRIVER`         | `local`    | `local` (dev only), `s3`, `disabled`                               |
| `LOCAL_STORAGE_DIR`      | `.uploads` | Relative to the API's working directory                            |
| `S3_BUCKET`              | —          | Required for `s3`. Must be private (no public access)              |
| `S3_REGION`              | `auto`     | `auto` for R2; the bucket's region for AWS                         |
| `S3_ENDPOINT`            | —          | R2: `https://<account-id>.r2.cloudflarestorage.com`; empty for AWS |
| `S3_ACCESS_KEY_ID`       | —          | Required for `s3`. Scope the key to this bucket only               |
| `S3_SECRET_ACCESS_KEY`   | —          | Required for `s3`                                                  |
| `S3_FORCE_PATH_STYLE`    | `false`    | `true` for MinIO / some self-hosted providers                      |
| `UPLOAD_URL_TTL_SECONDS` | `300`      | Lifetime of signed download URLs (30–3600)                         |

**R2 setup:**

1. Create a bucket. Leave public access off.
2. Create an API token with _Object Read & Write_ on that bucket only.
3. Set `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID` and `S3_SECRET_ACCESS_KEY`.

No CORS rule is needed: browsers never upload to the bucket directly. They follow a redirect
to a signed `GET` URL.

## 3. File rules

One table, `ALLOWED_FILE_TYPES` in `@syncspace/shared`, drives the server validation, the file
picker's `accept` list and the client's early checks.

| Kind      | Types                      |
| --------- | -------------------------- |
| Images    | JPG / JPEG, PNG, WebP, GIF |
| Documents | PDF, TXT, CSV, DOCX        |

- At most **10 MB per file** (`ATTACHMENT_MAX_BYTES`) and **10 files per request**. Limits are
  enforced while streaming, so an oversized file is rejected before it is fully read (413
  `FILE_TOO_LARGE`).
- The **content decides**, not the name or the browser's MIME type:
  - images, PDF and DOCX must have the right signature (magic bytes);
  - TXT and CSV must be valid UTF-8 with no NUL bytes.

  A `.png` that is really HTML is rejected (415 `FILE_TYPE_NOT_ALLOWED`). SVG, HTML and
  executables are never accepted.

- The stored MIME type always comes from the allow-list.
- The client checks extension and size first for instant feedback. The server remains the
  authority.

## 4. Names and keys

- **Storage keys** are generated: `<workspaceId>/<yyyy>/<mm>/<random-uuid>.<ext>`. No user input
  ever appears in a key, so there is no path traversal, no collisions and no Unicode tricks. The
  local adapter also checks that a key cannot leave its root directory.
- **The original name** is metadata only. It is shown in the UI and used in `Content-Disposition`.
  It is sanitized:
  - directories are stripped;
  - control and bidi-override characters (e.g. `inv‮fdp.exe`) are removed;
  - it is NFC-normalized and capped at 180 characters.

## 5. Lifecycle

The database requires every attachment to belong to exactly one message or task
(`attachments_owner_xor_check`), so there is no "pending upload" row. Files travel in the
**same request** that creates or extends their owner:

```
multipart request
  → authorize (before anything is stored)
  → validate every file (nothing stored if one is rejected)
  → store objects one by one ── failure → delete the ones already stored → 503
  → DB transaction: owner (message) + attachment rows ── failure → delete all stored objects → error
  → commit → realtime event (message:created / task:updated carries the attachments)
```

- **Messages:** `POST …/channels/:id/messages` and `…/conversations/:id/messages` (and
  `POST /messages/:id/replies`) accept JSON for text or `multipart/form-data` with fields
  `content` and `clientMessageId` plus files under `files`. A message can be text, files, or
  both. The optimistic row stays "sending", with the files shown as uploading, until the server
  confirms. If the request fails, the row offers **Retry** with the same text and files: the
  `File` objects wait in an in-memory outbox and are never put in the query cache. The draft is
  never lost.
- **Tasks:** `POST /tasks/:id/attachments` (multipart) adds files. It requires task-edit access
  and an active board and task.
- **Removing:** `DELETE /attachments/:id`.
  - Message files: the message's author only, like editing. A message left with neither text
    nor files is deleted.
  - Task files: anyone who can edit the task.
  - Deleting a message removes all its files.

**Deleting an object after the database change.** The row goes first; then the object is
deleted with three quick retries. If it still fails, the key is logged at error level as
`orphanedStorageKey`. That object can never be served again, because every download goes
through a database row. It only costs storage until it is cleaned up.

**Orphan handling.** With no pending state, orphans only arise in two cases:

- an object deletion failed (logged as above);
- a whole workspace was deleted: rows cascade, objects under `<workspaceId>/` remain.

A future scheduled job can list keys under a prefix, compare them with `attachments.storage_key`,
and delete the leftovers, or simply delete the `<workspaceId>/` prefix. This is not built: it
isn't needed for correctness.

## 6. Access control

Files are only reachable through `GET /attachments/:id/content[?download=1]`, which requires a
session and checks access to the owner exactly like the owner's own routes:

| Owner                   | Who can read                              |
| ----------------------- | ----------------------------------------- |
| Public channel message  | Workspace members                         |
| Private channel message | Channel members (+ OWNER/ADMIN oversight) |
| DM / group message      | Participants only (admins never)          |
| Task                    | Members of the task's workspace           |

Anyone else gets 404, so the file's existence isn't revealed. A deleted message's files are gone.

- **S3:** the API answers `302` to a signed `GetObject` URL valid for `UPLOAD_URL_TTL_SECONDS`.
  The URL carries the response `Content-Type` and `Content-Disposition`. The redirect is
  `Cache-Control: no-store`, and signed URLs are never logged: the request log drops response
  headers and query values.
- **Local:** the API streams the file itself.
- **Response headers:**
  - `X-Content-Type-Options: nosniff`.
  - A sandboxing `Content-Security-Policy`.
  - `inline` only for images and PDF; everything else downloads.
  - `Cross-Origin-Resource-Policy: same-site` (or `cross-origin` when `COOKIE_SAME_SITE=none`),
    so the web app can show images from the API origin.

**Trade-off.** A signed URL works for anyone who has it until it expires: by default, 5 minutes.
Keep the TTL short. A new URL is issued on every open, so lowering it costs nothing but a redirect.

**Uploads are rate limited** per user: 100 multipart requests per 15 minutes in production. Like
every other mutating request, they also pass the CSRF origin check.

## 7. UI

- **Composer:** paperclip button, drag and drop onto the composer, and pasting images from the
  clipboard. Pending files show as chips with name, size and a remove button. Unsupported or
  oversized files are explained before upload.
- **Messages and the task panel:**
  - Images render as thumbnails in a **fixed 224×160 box**, so the virtualized timeline never
    jumps when they load. Clicking opens a larger preview with "Open original" and "Download".
  - Other files render as cards with an icon, name, type, size, and Open (PDF) / Download.
  - Images that fail to load show "Image unavailable".
- **Task panel:** file picker plus drop zone, with the upload state shown; task cards show a
  paperclip count.

## 8. Known limitations

- There are no server-side thumbnails or image resizing: the original image is shown, scaled by
  CSS. A CDN image resizer or a background job could add them later.
- Uploads go through the API (buffered in memory, at most 10 × 10 MB per request). Very large
  files would want direct-to-bucket presigned uploads plus a confirmation step. That isn't
  needed at these limits.
- There is no virus scanning. Files are type-checked and never served as active content, but
  they aren't scanned. Add a scanner (for example ClamAV, or the provider's offering) before
  accepting untrusted public users.
- There is no automatic orphan sweep (see §5).
