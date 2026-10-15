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

Gmail credentials and individual account consents, X developer access, merchant APIs and a TURN relay remain external setup requirements. A new Google project was reported created by the owner as `maildesk-harsh-20261015`; Google Cloud Console fails to load in the test browser, so API/client setup is not yet confirmed. No credentials are included in this repository.

Automatic merchant prices/orders are not implemented. Shopping remains official search links and manually saved quotes. Arbitrary PDF compatibility, every network condition, and upstream AI model/image availability cannot be established by these tests. No claim is made that every integration is operational.
