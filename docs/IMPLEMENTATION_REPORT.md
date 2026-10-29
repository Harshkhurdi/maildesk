# MailDesk implementation report

29 October 2026. Five-product suite on the existing Next.js/React/TypeScript/PostgreSQL foundation. All app/server code stays on Vercel; editing/conversion run in the user's browser. Firebase and a separate Office Document Server are not part of this implementation.

## Implemented

- Word, Excel, PowerPoint, Outlook and Free AI Studio navigation, responsive file library, templates, imports, naming and earlier-file conversion.
- Pinned browser Office engine (offline ONLYOFFICE SDK/x2t WebAssembly), reproducible static build, iframe protocol, same-origin message/source checks and explicit AI separation. Native DOCX/XLSX/PPTX files remain native; no flattened JSON editor substitutes for them.
- Browser workers for creation/CSV/legacy conversion and bounded full archive validation. Server checks bounded directory metadata/hash without decompression.
- Owned native uploads/downloads, version 1 originals, atomic versioned saves, revision conflict protection, unchanged-byte deduplication, acknowledgement-based status and failed-upload recovery download.
- Dirty-only browser autosave after 30 seconds, no editor status polling/heartbeat or continuous retry, metadata-only lists/lookups, cached free-model catalog reused by chat.
- Gmail mail/label/thread/search/draft/compose/reply/forward/attachment/PDF/status/archive/trash/move flows; multiple accounts and local signatures. Calendar views/timed events/guests/reminders/timezones and ETags.
- Preserved existing auth/owner gate, token encryption, AI history, legacy files, retired tables and guest data. Disconnect disables credentials without deleting records. Existing app data is not deleted or rewritten. Production builds apply the additive native schema.
- Removed active calling/messaging/code/task/web utility routes and CodeMirror dependencies. Existing old schema definitions remain for safe recovery.

## Office design and production release

The public sign-in and authenticated app now share a Microsoft Office-inspired visual language: Segoe typography, app-specific blue/green/orange themes, a compact app rail, search, template previews and recent-file list/grid views. All template/import/editor/email actions retain their real implementations. Document generation uses readable Calibri defaults, styled headings and full-width tables.

`prepare-production.mjs` applies pending additive migrations only when `VERCEL_ENV=production`. Migration execution uses a transaction/advisory lock and the existing Drizzle journal, supports older manually initialized tables without dropping data, validates the native schema and prevents release on failure. Local/preview builds do not migrate implicitly. PostgreSQL WASM integration verified preservation of an existing file row, native table creation and idempotent reruns; the advisory lock was mocked for that single-process fixture. Four migration unit tests cover success, repeat builds, rollback and additive syntax.

## Dependencies and license

The browser engine is pinned at `ranuts/document@e975654679d2cc3ef61d67d93fdce2839327676c`. It is AGPL-3.0 and bundles third-party editor/converter components. Original LICENSE/NOTICE, corresponding-source pointers and build instructions are retained in `third_party/browser-office` and the built assets. An English Hunspell/SCOWL dictionary with its COPYRIGHT notice resolves dictionary requests as static files. Review these terms/source-distribution obligations before merging or offering a proprietary hosted derivative; existing repository code has not silently been relicensed. No commercial license is included.

Existing `docx`, `exceljs`, `pptxgenjs`, `jszip` and XML parsing libraries remain for browser workers/tests, not Office API execution. Playwright is a development dependency. GenOffice was reviewed as a workflow reference; no source/assets were copied and no Rust rewrite was introduced.

## Verification recorded

- Automated tests: **110/110 passing**, zero skipped. Real native file generation and archive validation, owned HTTP upload/download, exact original retention, conflict/concurrent-save behavior, atomic history/deduplication, auth/Google consent boundaries, MIME/calendar policy, sanitization/product scope and existing AI tests.
- TypeScript passed. ESLint passed with zero errors and two existing full-navigation advice warnings. Clean production build passed and excludes retired routes.
- Actual Chromium browser smoke passed with mocked storage/Google APIs. Created Word/Excel/PowerPoint files through the real Web Worker, opened actual bundled editors, entered text/cell/slide edits through keyboard input, saved through the iframe API and inspected exported OOXML for the edited values. Excel and PowerPoint PDF downloads had valid PDF signatures. Deliberate Word storage failure exposed recovery download; retry retained edited content. Idle editor made no save polling requests. Tested versions/AI panel, mail sanitization, reply draft/send, calendar views/event form and 390px mobile Word layout. No real mail/event writes.
- Production Office API file traces contained **zero** files from `docx`, `exceljs`, `pptxgenjs` or `jszip` packages. Static editor files are not request-time build jobs.
- Local component benchmark: a 500-cell, ~10 KB workbook took approximately **0.07 ms CPU/file** for directory/hash inspection versus **5.18 ms CPU/file** for full archive validation, which now runs on the client. Reproduce with `node scripts/office-cpu-benchmark.mjs`. This is not an end-to-end Vercel measurement and excludes auth, DB, cold start and provider work. No production Fluid CPU reduction or quota guarantee is claimed.
- Earlier native-generation smoke opened generated DOCX/XLSX/PPTX in headless LibreOffice and exported PDFs. This verified generated-file readability, not comprehensive Microsoft round-trip fidelity.

Route tests use isolated in-memory database boundaries. They verify behavior and rollback expectations, not a real PostgreSQL deployment. Browser tests never relax production auth: their temporary development-only route is removed after testing and must not ship.

## Remaining acceptance work and limits

1. Production builds now run locked, journaled additive migrations using the existing database credentials. Live owner authentication and authorized Google operations still require the owner’s session; they are not replaced by mocked acceptance tests. Keep existing encryption/auth secrets.
2. Basic real editing and native save were tested in Chromium. This is not complete Microsoft parity: complex pagination, tracked changes/comments, charts/pivots, large-workbook responsiveness, all slide animations/transitions and Microsoft-specific extensions need representative corpus tests. Macros/ActiveX and legacy binary DOC/XLS/PPT imports are not supported.
3. Native history is a list of downloadable snapshots, not visual per-change history or automatic in-place restore. Import a historical copy as a new file. No collaborative live editing is provided by this local engine.
4. Snapshots are full copies in PostgreSQL and require storage monitoring. Native files/checkpoints are capped at 3 MB. CSV and mail limits are in README. Browser memory and static bandwidth are material, especially first open/mobile devices; the generated engine is about 510 MB total, loaded on demand in parts.
5. Save failures preserve the previous server snapshot and offer the exported recovery copy. Keep the editor open; no durable offline recovery from a browser crash is claimed. PDF/CSV exports are contextual engine outputs, not standalone PDF/utility apps.
6. Google provider operations are mocked in automated/browser tests. Real staging credentials, grants, sending, attachment reads and invitation delivery still need authorized acceptance. Outlook here means Gmail/Google Calendar UI; Exchange, Microsoft Graph and IMAP are not implemented.
7. Recurring/all-day events are viewable, edited in Google Calendar. Recipient suggestions use loaded headers, not full Contacts. Email drafts save explicitly. Signatures and AI/guest history stay browser-local.
8. Authentication and authorized storage/mail operations still use Vercel CPU. There is no cron/polling conversion service, but zero CPU or a fixed savings percentage is not promised.

## Deploy and rollback

Apply the additive migration to a backed-up staging database, retain all existing env/auth/encryption credentials, let the existing Vercel project run `npm ci` and `npm run build`, reconnect staging Google accounts for selected scopes and complete acceptance. No Firebase credentials or external Office host is needed. See README and REMAINING_SETUP.

To roll back, restore the earlier application revision and retain the additive tables. Never generate destructive migrations for retired tables. Legacy file conversion always creates a separate native copy.
