# Architecture and reference assessment

MailDesk retains Next.js/React/TypeScript, Neon Auth and PostgreSQL. All application computation is hosted by the Vercel app or runs in the user's browser. Firebase and a separately hosted Office Document Server are not used.

## Native editing and CPU

The prior basic editor flattened files into narrow HTML/cell/slide JSON. Native archives now remain the source of truth. `ranuts/document` at `e975654679d2cc3ef61d67d93fdce2839327676c` supplies an offline ONLYOFFICE SDK and x2t WebAssembly converter for the browser, under AGPL-3.0. The pinned build produces static resources, not server code. Versioned application chunks are cached; the SDK's absolute static paths are rewritten to bundled resources. COOP/COEP enable SharedArrayBuffer; Brotli-compressed WASM is served with its encoding header. The iframe's optional remote/AI connections are restricted by CSP.

Creation/import/legacy conversion run in a short-lived Web Worker. Full ZIP expansion limits are checked there. Upload routes never import Office-generation libraries or decompress a document. They inspect bounded directory metadata and hash the bytes. File lists and owner lookup select metadata only. No editor poll loop, heartbeat, cron, background sync or server conversion job is required.

## Save lifecycle

1. A verified owner creates/converts a native file locally or imports a bounded archive. Legacy JSON sources are read through an owned endpoint.
2. A multipart upload stores current bytes and version 1 in a transaction. The original upload is retained exactly.
3. The parent downloads the owned file once and passes an ArrayBuffer through the iframe protocol. Authentication tokens and backend URLs are not passed into the engine.
4. Messages are accepted only from the expected iframe window and the app's exact origin. A unique request ID binds export/open responses; timeout never opts into returning the original unchanged file.
5. Dirty notifications schedule one browser save after 30 seconds. Idle editors make no save requests. Explicit Save and Back also wait for durable acknowledgement.
6. The engine exports actual edited bytes. The parent retains this recovery copy until an authenticated PATCH upload succeeds.
7. The server locks the owned metadata row, verifies the expected revision/type and hashes the upload. Identical bytes return without a new version. Changed bytes and a new historical snapshot commit atomically. A stale revision returns 409.
8. The UI declares saved only after the response. Concurrent new edits remain dirty; failed storage leaves the previous snapshot intact and exposes recovery download. It does not retry indefinitely.

Versions are full snapshots, downloadable independently. Visual per-change history and automatic in-place restore are not implemented. Keep the editor open when unsaved; no durable offline recovery is claimed.

## Reference and engine selection

GenOffice was reviewed at `b613c308cfedc71b6a6a0b41004d6ab27747d842`: its native-file workflow, shared apps, recovery and explicit AI panel informed this UI. Its Electron preload APIs/native resources/Rust spreadsheet sidecar are not a drop-in Vercel dependency. No GenOffice source or branding was copied, and no language rewrite was justified by benchmarks.

Text-only browser editors do not supply the required document/spreadsheet/presentation suite. A remote ONLYOFFICE Document Server would introduce a separate compute host; the selected offline engine keeps editing/conversion in the browser. This choice adds a large static distribution, browser memory requirements and AGPL obligations. Source, build recipe and notices are in `third_party/browser-office`. Not every Microsoft-specific feature is guaranteed.

## Mail, calendar and auth

The existing auth provider, owner gate and AES-encrypted Google credentials remain. Read-only default consent and separately enforced mail/calendar scopes protect writes. Mail is read on demand with bounded concurrency; threads/attachments are fetched when opened. There is no retired task-generation/sync pipeline. Disconnect disables the credential without deleting records.

HTML mail is sanitized, with tracking images/styles/scripts/forms removed. PDF viewing is contextual. Calendar uses explicit IANA timezones/instants and ETags for updates/deletes. Recurring/all-day editing stays in Google Calendar. Outlook/Exchange/IMAP and full Contacts sync are not implemented.

AI Studio preserves explicit attachments and free-only validation. The model catalog has a short shared cache; no open file or message is automatically submitted to AI. Retired tables/browser keys stay available for recovery, and migrations are additive.
