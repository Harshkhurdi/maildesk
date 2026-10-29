# MailDesk

An Office-inspired private workspace with exactly five apps: **Word, Excel, PowerPoint, Outlook and Free AI Studio**. Next.js 16, React 19, TypeScript, existing Neon authentication and PostgreSQL remain the foundation. No Firebase, document-server host, Rust sidecar, cron, background sync, or paid AI is required.

The [GenOffice](https://github.com/genspark-ai/genoffice) reference informed the native-file workspace and optional AI panel. Its Electron/Rust desktop implementation is not bundled. Office editing uses a pinned [browser Office engine](https://github.com/ranuts/document/tree/e975654679d2cc3ef61d67d93fdce2839327676c), built from its AGPL-3.0 source and served as static assets on Vercel. The mature offline ONLYOFFICE SDK and WebAssembly converter do the work **on the user's machine**. This is not a claim of full Microsoft Office compatibility.

## Low CPU Vercel architecture

- Document creation, CSV/legacy conversion, full archive validation, editing and exports run in a browser/worker. They are never imported into the Office API routes.
- The editor and PDF assets load only when needed and are static files. Hashed editor assets use long-lived caching. WebAssembly uses same-origin isolation and correct Brotli headers.
- Loading a file makes an authenticated download request. Saving makes one bounded authenticated upload. There is no save-status polling, remote conversion job, heartbeat or idle request loop.
- Autosave runs only after edits, after 30 seconds. A file with no changes makes no save request. Failed saves show a recovery-download action; they do not retry continuously in the background.
- Server routes check ownership, bounded ZIP directory metadata, a SHA-256 hash and revision, then store an atomic checkpoint. Unchanged bytes do not create another version. Lists and ownership lookups select metadata without loading stored base64 blobs.
- Google reads happen on explicit navigation/search/refresh. Threads and attachments load on demand. Free-model verification shares the existing short-lived cached catalog rather than fetching a catalog for each chat request.

Authentication, authorized mail actions and database reads/writes still use Vercel Functions. CPU use cannot be zero or guaranteed under a quota; no production usage benchmark has been measured. Large static downloads use bandwidth and first opens can be slow. The generated editor distribution is roughly 510 MB across many files; it is built once during deployment, not downloaded on every app open.

## Office workspace and preserved data

Segoe/system typography, a shared app rail and search bar, app-specific colors, working template previews, list/grid file views and a matching public sign-in page. The editor uses the actual native Office ribbon. Outlook has a folder list, message list and reading pane. Template actions create real native files in browser workers.

Native DOCX/XLSX/PPTX creation, templates, uploads, CSV import, file naming, saved copies, historical downloads and conversion of earlier JSON files. Original uploads remain byte-for-byte version 1; edits save a separate native snapshot. A stale tab receives a conflict rather than overwriting newer work. The optional AI panel sends only prompts/files explicitly submitted by the user.

Outlook supports **Gmail and Google Calendar**, not Microsoft/Exchange accounts: folders, labels, search, pagination, threads, composing/replies/forwarding, drafts, attachments, contextual PDF preview, read/flag/archive/trash/move actions, account switching and browser-local signatures. Calendar has day/week/month views, timed event forms, guests, reminders, timezone and ETag conflict protection. Recurring/all-day event editing stays in Google Calendar. Recipient suggestions use loaded headers, not a complete Contacts sync.

Free AI Studio retains streaming, settings, saved browser conversations, explicit attachments and import/export, with verified zero-price model enforcement. Calling, person-to-person messaging, code execution, tasks, shopping and web utility routes are retired. The original tables and browser keys remain; no data-drop migration is included. Google disconnect disables the credential without deleting files, cached mail or retired records.

## PDF workspace and recent-file deletion

The **PDF** sidebar tool at `/pdf` is available to email users and guests. It opens local PDFs up to 100 MB without uploading them. Gmail attachments use the same viewer, with the existing 3 MB attachment limit. PDF.js and the export library load on demand from static assets; rendering, searching, forms and marked-copy generation run on the device, without a PDF API, conversion worker on Vercel, database writes or background polling.

The viewer includes lazy page thumbnails, bookmarks, page navigation, selectable/searchable text, zoom, view rotation, focus view, safe links, printing and original downloads. Users can highlight text/areas, draw, add Unicode sticky notes, undo/redo markups and fill common AcroForm text fields, checkboxes and dropdowns. **Save copy** downloads form values plus flattened highlight/ink marks and portable PDF sticky notes, leaving the original unchanged. Unsaved changes warn before closing or navigating away. Export may be unavailable for encrypted/signed files. OCR, redaction, digital signing, existing PDF text editing, XFA and full Acrobat parity are not included. Rotate changes the view only. Local PDF files do not appear in cloud recent files.

Each recent Word, Excel or PowerPoint file has a delete button in both list and grid views. A confirmation names the file and explains that all saved versions are permanently removed. The owner-scoped API locks the current row and validates the shown revision; concurrent changes return a refresh message. Current data and version history are deleted in one transaction, with no blob read and no effect on other users or files. Earlier legacy source files are kept. Failed requests retain the file in the UI and allow retry.

The responsive suite uses a bottom app bar on phones, full-width file libraries with swipeable templates, larger controls, and a mobile inbox-to-message view with a back action. PDF Studio has a separate welcome layout for desktop and mobile, a document header with a persistent **Save copy** action, a **More** menu for original downloads/printing/focus/close, and grouped page/zoom controls. Mobile navigation, search, text and comment panels overlay the reader instead of shrinking the page; markup tools float above the reading area. Device files, PDF form values, annotations and export behavior remain browser-local.

## Guest access and signup

The sign-in page offers **Continue as guest** and **Create an account**. Both can use all five apps. A guest gets a server-issued, HTTP-only, signed session and an independent workspace, without an email or password. Email signup uses the existing verified email-code flow; new verified users are no longer blocked by the original owner-only gate.

Guests connect **their own** Google accounts for Gmail/Calendar; no owner connection, file or credential is shared. Google’s consent-screen/testing-user/API restrictions still apply. File and provider queries enforce the current identity’s ownership, and mutation origins remain checked. AI history/settings are separated per identity in the browser, while the configured original owner keeps the existing AI database/settings keys.

Guest access lasts **30 days in the same browser**. Ending the guest session or clearing cookies removes access; download important work. Email signup opens a separate account workspace and does not automatically move guest files. Earlier guest backups remain on `/guest`, with no recovery/backup link on the sign-in page. Server records are not automatically purged, and there is no new background job or polling loop.

Guest session signing reuses the existing `NEON_AUTH_COOKIE_SECRET` with a separate HMAC purpose. No Firebase, extra auth service, database migration or new secret is required. Guest creation verifies the origin, bounds its input and clears earlier Neon browser cookies when explicitly switching to guest, preventing accidental owner access. Normal verified email sessions take priority over a saved guest cookie.

## Setup on Vercel

Use Node **24.x**. Keep all existing credentials and especially the token-encryption key.

```sh
npm ci
cp .env.example .env.local
```

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Existing PostgreSQL connection |
| `DATABASE_URL_UNPOOLED` | Optional direct connection for migrations |
| `NEON_AUTH_BASE_URL` | Existing Neon Auth endpoint |
| `NEON_AUTH_COOKIE_SECRET` | Existing authentication cookie secret |
| `WORKSPACE_OWNER_EMAIL` | Original owner identity used to preserve existing browser-local AI history; other verified accounts and guests have separate workspaces |
| `APP_ORIGIN` | Exact public HTTPS origin |
| `TOKEN_ENCRYPTION_KEY` | Existing 32-byte AES key, encoded as base64url |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google web OAuth client |
| `OPENROUTER_API_KEY` | Server key, limited by the app to verified free models |

There are **no Office server secrets or Firebase credentials**. Do not replace the existing database/auth provider or rotate encryption keys as part of this deployment.

```sh
# Supply environment variables to the migration process first.
npm run db:migrate
npm run build
npm run dev
```

Production Vercel builds apply pending additive migrations before building the app. The migration adds `office_files` and `office_versions`, preserves existing tables/rows, locks concurrent migrations and skips completed journal entries. Older manually initialized installs are adopted using idempotent CREATE statements. A failed migration stops release. Local/preview builds do not auto-migrate; use `npm run db:migrate` with explicit environment variables for staging. Scripts do not load `.env.local` automatically. No migration runs during a request.

Deploy using the existing Next.js Vercel project, `npm ci` and `npm run build`. `prebuild` fetches a pinned editor source commit, installs its frozen lockfile using pnpm 11.4.0 and builds/copies static assets into ignored `public/office`. This requires build-time access to GitHub and npm. Build cache is under `.cache`. Generated assets and nested dependencies are excluded from Git, TypeScript and ESLint. See [the build script](scripts/prepare-browser-office.mjs). No vendor installation/build runs in a request handler.

## Google consent

Enable Gmail API and Google Calendar API. Register exactly `APP_ORIGIN/api/gmail/callback`. Settings offers explicit mail/calendar permissions when connecting or reconnecting. The default remains read-only; old refresh tokens are not silently upgraded.

| Capability | Scope |
| --- | --- |
| Mail reading | `https://www.googleapis.com/auth/gmail.readonly` |
| Sending, drafts, mail actions | `https://www.googleapis.com/auth/gmail.modify` |
| Calendar events | `https://www.googleapis.com/auth/calendar.events` |

Granted scopes are encrypted with the refresh token and enforced server-side. Google consent-screen/test-user/verification restrictions still apply. Reconnect staging accounts to authorize additional capabilities. Never put the client secret, encryption key or refresh tokens in public variables.

## Limits and recovery

- Native uploads/checkpoints: **3 MB**, below the host's request limit with multipart overhead. Browser validation bounds total expanded data to 64 MB, XML entries to 16 MB, other entries to 32 MB and 4,096 entries. The server independently checks the directory before accepting bytes. Malformed contents are also rejected by browser parsing/editor open; upload is not a malware scan.
- CSV: 5,000 rows, 100 columns and 250,000 cells; formula-like CSV text stays inert. Use native XLSX for formulas/multiple sheets.
- Mail sending: 650 KB content/attachment budget, ten attachments maximum. Attachment/PDF download: 3 MB. Larger items stay in Gmail.
- Lists show 500 native/500 earlier files; history lists 200 checkpoints. Exact owned revision URLs remain downloadable.
- PostgreSQL stores complete snapshots, without pruning. Monitor storage and back up before deployment. A workspace JSON backup includes legacy/retired records and native metadata; native bytes/versions download separately.
- Save is acknowledged only after storage responds. An exported recovery copy remains available if upload fails. Keep the editor open until saved; browser process crashes/reloads can lose edits not yet exported. There is no claim of durable offline editing/recovery.
- Earlier guest data remains under `maildesk.guest.v1`; `/guest` offers a raw backup. AI history retains its original browser storage. Neither is automatically uploaded.

## Licensing and validation

The browser engine and its embedded editor are **AGPL-3.0**, with upstream notices. [LICENSE, NOTICE and source/build information](third_party/browser-office/SOURCE.md) are retained and linked from Settings. Review the upstream terms and source-availability obligations before merging/redistributing; this change does not assign a license to pre-existing repository code. No commercial Office license is included. No GenOffice code was copied.

```sh
npm test
npm run typecheck
npm run lint
npm run build
npx playwright install chromium
npm run test:ui
```

Browser tests use a temporary development-only route and mock all Google/storage APIs, never production credentials. They exercise actual browser conversion/editor assets; tests do not send real mail or modify real events. Use `MAILDESK_CHROMIUM_PATH` and `MAILDESK_CHROMIUM_ARGS` for an existing browser. See [implementation report](docs/IMPLEMENTATION_REPORT.md) for recorded results and outstanding acceptance tests. Snapshot history is downloadable, not visual per-change history; import an old copy as a new file to restore it.
