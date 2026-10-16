# Maildesk code audit — 15 October 2026

The audit used Astra to coordinate GPT-6.1 backend and frontend reviewers. The main agent reviewed the integrated changes and handles release/browser verification. The original design is preserved. No database migration is required.

## Findings repaired

| Area | Problem and repair |
| --- | --- |
| Authentication | Upstream authentication outages were treated as signed-out sessions. Retry one verified provider read, then return temporary unavailability rather than a false 401. Rejected credentials remain signed out. |
| Gmail reconnect | Ten occupied slots prevented reconnecting a revoked account. Per-account Reconnect now uses an owner-bound, single-use persisted OAuth target; choosing another Google account cannot replace its credentials. |
| Gmail recovery | Expired history could leave removed mail cached after a rescan. Rescan now proceeds through bounded cached-thread reconciliation and history catchup. Only authoritative Gmail 404 responses remove cached content; related tasks remain flagged for review. Failed batches preserve their checkpoint. |
| Calls | Early SDP/ICE signals could be acknowledged before the peer existed. Keep them pending until handled; isolate call generations, bound pending ICE, and restart the disconnection timer after recovery. |
| Call actions | A lost response after a successful start/accept could strand the device. One authorized read can recover only the matching room, person, device, kind and call; no mutation is repeated. |
| X | A timeline timeout could roll back newly rotated credentials. Commit credentials and retry checkpoint first, then fetch; conditionally save the result only if the connection still matches. Malformed responses preserve the old timeline. |
| Spreadsheet calculations | Shared dependencies caused exponential work. Memoize within one calculation snapshot, use a finite work/depth budget, support absolute references, and correct aggregate blank/text handling. |
| Spreadsheet imports | Leading blank XLSX rows could shift cells or produce invalid dimensions. Preserve original positions and reject overflow instead of truncating. |
| Spreadsheet saves | The editor supported 13,000 cells but the server accepted only 5,000. Align visible/saved bounds to 500 rows × 26 columns and reject hidden out-of-grid values. |
| Word exports | Selecting only leaf blocks omitted surrounding root/nested text. Traverse blocks and inline content in order, retaining ordered-list numbering. |
| Pending saves | Office/code save completions could overwrite newer metadata or edits. Adopt saved identity/revision while keeping newer work dirty. Disable task and shopping form editing during their save. |
| Code backups | Valid backups larger than the individual source-file limit were rejected; downloaded/renamed backups were recognized only by name. Validate project shape independently, with a larger bounded backup import limit. |
| PDF search | Visited pages used different whitespace from pages first searched. Normalize matching text consistently while retaining readable line breaks in text view. |
| AI requests | Individually accepted attachments or accumulated history could exceed the request body limit. Validate the exact complete outgoing payload before saving/clearing the composer; preserve rejected drafts and attachments. |
| AI streaming | Premature stream EOF could appear as a completed reply. Require a completion marker or finish reason; retain partial text and report interruption. |
| Guest usability | Room-only users lacked a sign-out control. Add the existing sign-out route to the conversation header. |
| Task labels | Personal tasks were displayed as General in list rows. Display the saved category correctly. |

## Validation boundaries

`npm test` runs deterministic tests, including real route logic with isolated provider/database fixtures. These do not grant production identities or bypass authentication. Inherited Sites API scripts are excluded because they target the old fixture application on port 5173; they are not release tests.

The production build and TypeScript checks pass. Final test totals and post-deployment browser checks are recorded in the release verification output. Previous successful authenticated live checks are documented separately in [LIVE_AUDIT.md](LIVE_AUDIT.md); they are not automatically evidence for this new release.

Gmail OAuth credentials are configured privately in Vercel for the owner-created Google project `maildesk-harsh-20261015`; individual account sign-in/consent and a successful sync are still outstanding. X developer access, merchant APIs and a TURN relay remain external setup requirements. No credentials are included in this repository.

Automatic merchant prices/orders are not implemented. Shopping remains official search links and manually saved quotes. Arbitrary PDF compatibility, every network condition, and upstream AI model/image availability cannot be established by these tests. No claim is made that every integration is operational.

## Guest mode and security follow-up

Added a public `/guest` workspace and “Continue as guest” on the email sign-in page. It creates no server identity and does not bypass any private API guard. Guest tasks, office files, code projects, shopping details and web bookmarks use a separate, bounded browser storage key. PDFs remain local. Linked file/task records are validated; stale file/tool revisions, invalid content, quota errors and corrupt saved data are surfaced without silently replacing the saved copy. A guest backup can be exported from Accounts & settings. Guest data is shared by people using that browser profile, does not sync across devices, and is not automatically moved into an email account.

Gmail, AI Studio, X and conversation rooms retain real sign-in requirements. Tests exercise guest mounting with an existing session and verify that it makes no private workspace request; the local tool adapter never calls a server.

Reviewed non-breaking dependency updates reduce the audit report from 19 findings (11 high, 7 moderate, 1 low) to 13 (7 high, 6 moderate; no critical). Existing top-level dependency versions are unchanged. Remaining findings include inherited build/lint dependencies and exporter dependencies; automatic fixes propose breaking downgrades. They remain documented rather than forcing a framework/exporter downgrade.

Google credentials were configured privately on Vercel using the owner's downloaded client JSON. The owner enabled Gmail API and added the three known test addresses. Google reached the exact read-only consent screen. The first callback did not produce a connected account; a fresh attempt reached Google's passkey identity check. The owner subsequently requested leaving that setup, so actual Gmail syncing remains unverified. The approved second QA room received a real guest reply and owner read receipt; the newer voice/video re-test was not completed before the owner asked to leave it. The earlier successful call audit is separately documented above.

Synthetic records from this follow-up use `Maildesk QA2 6c42`. These remain in the live workspace for review; no unrelated records were read or deleted. Guest verification uses a separate `Guest QA` label in browser-only storage.

## Completion follow-up — 16 October 2026

Guest backups now have a restore workflow in Accounts & settings. Import is reviewed before it writes. Existing work remains; identical records are skipped, changed IDs are copied, and imported task/file links are remapped together. Invalid or oversized backups, combined capacity overflow, another-tab changes after review, and storage quota failures cannot replace the existing saved copy. Restore does not import accounts, email, authentication, or secrets. A saved-list selector makes restored shopping lists accessible alongside the current list and asks before discarding unsaved edits when switching.

AI Studio now imports a bounded JSON conversation export into a fresh local conversation. It validates messages and embedded attachments, strips unsupported settings/metadata, and never sends imported content to a provider. IndexedDB writes/deletes resolve only when their transaction commits, including image-gallery storage, and abort/quota/load/delete failures are surfaced. AI exports retain the conversation’s saved model identity.

All 169 deterministic regression checks and TypeScript checks passed. Build and live checks for this follow-up are recorded in the release verification artifact. A fresh compatible dependency dry run offered no changes: 13 findings remain (7 high, 6 moderate, no critical). The affected chains are inherited braces/glob tooling, the PowerPoint image parser, ExcelJS UUID, and esbuild tooling. Production dependency inspection still reports 8 entries; the app does not invoke the affected esbuild serve API. Forced fixes suggest incompatible downgrades and were not applied. Gmail verification remains paused at the owner’s request. X, automatic shopping APIs/orders and TURN are external prerequisites, not completed integrations.

## Dependency remediation follow-up — 16 October 2026

Beyond the automatic updater, reviewed scoped overrides replace ExcelJS's installed UUID with 11.1.1, PptxGenJS's image-size dependency with 2.0.3, and esbuild-kit's transform dependency with 0.28.2. No top-level framework/editor version is changed. Excel conditional-format UUID creation, formula/value XLSX round trips, and PowerPoint text/notes/PNG archive checks cover actual changed interfaces. esbuild sync/async TS/CTS transforms were executed; Drizzle schema generation is checked without connecting a database or applying migrations. ExcelJS's browser prebundle still embeds older UUID code; its used v4 path is outside the advisory's affected v3/v5/v6 custom-buffer APIs.

The remaining braces/glob ESLint chain has no patched braces release currently published. It stays documented as development tooling; the production audit is checked separately. Exact current counts, clean install, build and live browser evidence belong to the accompanying release verification artifact. Account setup instructions are in [REMAINING_SETUP.md](REMAINING_SETUP.md). Provider access is not claimed complete merely because credentials, tests or setup documentation exist.

A clean install and 171 regression tests passed after the overrides. The fresh full package audit reports five high development-only entries in the braces/glob ESLint chain; the production package audit reports zero findings. This package audit does not establish that all browser-vendored code or future vulnerabilities are absent. Drizzle schema generation succeeded against the ignored local output directory only; no database connection or migration was applied.

## Simplification and recent-mail refresh — 16 October 2026

Current Gmail refresh requests one messages.list page capped at 25, then at most 25 messages.get calls. No history walk, pagination, profile recount or thread expansion runs during refresh. Four provider requests can run concurrently under a shared 90-second deadline. All messages must pass validation before one transaction replaces the owned account cache, reviews suggestions and releases the same lease. Failed or malformed fetches preserve cached mail. Refresh attempts have a one-minute per-account cooldown. Existing user decisions, tasks, files and links are retained; task sources outside the recent window are flagged accurately.

Mail reads and searches enforce the 25-per-account window even for older caches that have not been refreshed. Workspace counts respect that bound. Manual refresh never loops based on a legacy incomplete response. No schema migration is needed.

X and Shopping navigation, pages, components and external API implementations are removed. Shopping has no verified free live price/order integration across the requested merchants; store search remains possible through Web search. Existing stored legacy records are retained rather than erased. AI image generation is also removed after the current provider catalog returned zero verified free image models; free chat/attachments/history remain. Cloudflare setup is skipped as requested and direct call/chat behavior is unchanged. Historical audits above describe earlier releases, not current available features.

The simplified release passes 175 deterministic tests, the production build and the standalone TypeScript check. Regression coverage includes the capped provider request count, failures preserving cache, ownership/lease races, cooldown, old task/file references, bounded API search, legacy cache counts, manual non-looping refresh, and preservation of retired shopping records in guest backups. Actual Gmail access still requires the owner to complete Google consent.

## Retained tools and Office opening follow-up — 16 October 2026

Added Open file to document, presentation and spreadsheet libraries, including guest mode. Modern DOCX/PPTX/XLSX plus CSV/TXT/HTML open as bounded editable copies after a visible import notice. Files are parsed locally; exact Office layout/media limitations are documented in OFFICE_FILES.md. ZIP directory and actual streamed expansion are bounded before Office parsing.

Fixed a chat cursor race: a locally sent message no longer advances the incoming poll cursor past an unseen peer message. WebRTC offer/answer replay now recognizes an already-applied description, so a failed answer post can retry without applying SDP a second time. Real two-person media quality remains awaiting the user's test. The unchanged relay limitation is visible in the call UI.

Fixed document word-count layout so its number and label stay together. HTML email previews preserve cell separators, semantic block breaks and numeric encoded spaces; document HTML imports preserve semantic block boundaries. The existing cream/green design remains.

All 187 deterministic tests, typecheck and production build pass locally. Production dependencies have zero reported advisories at this check. Live deployment verification is recorded separately after publication, rather than inferred from these checks.
