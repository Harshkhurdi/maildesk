# Maildesk live audit — 15 October 2026

Production: https://maildesk-theta.vercel.app

The owner authorized testing in production. Synthetic records use `Maildesk QA audit 8f31`; cleanup targets their exact IDs. No email or account-token snapshot was taken. The original design is preserved.

## Sign-in repair

The exact production origin was missing from Neon Auth's trusted domains. It was registered in Neon Settings → Better Auth → Domains. The real send-code request then succeeded, the owner completed the code, and the signed-in workspace survived a reload. An invalid-code rejection alone had previously been mistaken for evidence that the full sign-in flow worked; this audit corrects that boundary.

The app now gives an actionable origin-error explanation and clearer expired-code guidance. Authentication, verified-email checks, exact-origin enforcement, and guest restrictions remain in place.

## Verified through the live browser

| Feature | Result |
| --- | --- |
| Owner authentication | Real code delivery, successful sign-in, and session restoration verified |
| Tasks | Created a task with notes and an external link; confirmed dashboard count and completion |
| Documents | Saved, linked to a task, reopened, edited, and saved again |
| Word export | Downloaded an actual DOCX and checked its ZIP/XML text |
| Presentations | Saved two slides with notes; presentation mode and previous-slide navigation verified |
| PowerPoint export | Actual PPTX contains both slides, expected text, and speaker notes |
| Spreadsheets | Entered 10 and 20; SUM produced 30; saved workbook |
| Excel export | Actual XLSX reopened with formula SUM(A1:A2) and cached result 30 |
| PDF reader | Opened a local synthetic two-page PDF; page navigation, extracted text, cross-page search, 125% zoom, and 90-degree rotation verified |
| Free AI | A real free-router prompt returned the requested text; no email content was sent |
| Code editor | Saved a project, edited HTML, rendered it in the isolated preview, reopened its saved version, and downloaded a project backup |
| Shopping | Official store search links generated; a saved synthetic quote correctly totaled ₹100 × 2 + ₹15 = ₹215 |
| Web search | Saved a private search bookmark and opened actual Google results in a new tab |
| Conversations | Created an approved room; real second-account reply and read receipts verified; shared and opened a read-only document copy; converted a message to a private task |
| Voice/video calls | Both reached Connected between the owner and invited account; microphone/camera toggles responded; both hung up and appeared as ended in call history |
| Navigation | Mobile navigation opens and switches to PDF view; primary design retained |

## Fixes from the audit

- Added sign-in error guidance and documented exact trusted-domain registration.
- Replaced obsolete Sites viewer instructions with the Vercel email-code and room-only invitation flow.
- Rejected null, arrays, and scalar JSON bodies with a validation error before handlers access fields, avoiding accidental server errors.
- Added visible guidance while a call waits for browser microphone/camera permission, using the existing notice styling.
- Added a repeatable `npm test` command for current pure tests; inherited Sites fixture API scripts are not live-release tests.

## Not yet verified or configured

- Gmail's Google OAuth client and secret are absent, with no connected inboxes. Actual synchronization, attachments, task extraction from real mail, and ten-account operation require these and individual Google consent. The UI correctly explains the missing setup.
- X's developer credentials and deliberately enabled API access are absent. The connect button remains disabled, with an external X sign-in link and setup explanation.
- Merchant price feeds and order APIs are absent. Shopping currently compares manually entered quotes and opens merchant checkout; automatic ordering is not implemented.
- Real guest messaging and voice/video connection were verified. Guest restrictions have policy-test coverage, but this audit did not directly inspect the guest's separate private-browser UI or independently measure audio/video quality.
- TURN relay is absent, so calling across restrictive networks is unverified.
- A conversation polling request briefly reported a sign-in interruption during the video test, then recovered automatically. The owner session survived a reload and both calls ended normally. This is a remaining transient-auth observation, not a reproduced permanent sign-out.
- Successful sign-out was not exercised in the owner's live browser, to preserve their signed-in session. Invalid/expired-code behavior has unit coverage; authentication failures and unauthenticated access are checked separately.
- PDF password, damaged-file recovery, 100 MB files, arbitrary PDF compatibility, and every supported office import format were not exhaustively tested.
- AI image availability and free-provider quotas depend on the upstream provider; a successful chat response does not establish image generation.

## Local checks

56 pure tests cover task extraction, spreadsheet formulas/CSV, room and device policies, free-model rules, streaming errors, URL/merchant validation, preview restrictions, sign-in errors, and JSON body validation. Office archive round-trip checks and the Next.js production build passed.

The historical migration API assertions used an isolated fixture harness. They must not be represented as authenticated live API coverage in this audit. Remaining dependency warnings are documented in README; this audit does not claim a clean dependency audit.

## Cleanup and deployment

Removed the exact QA tasks (3), office files (3), code project (1), bookmark (1), synthetic shopping row (1), and approved test room (1), including its messages (3), ended calls (2), and signaling records (30). Cleanup used unique labels plus captured IDs and guarded predicates. The test accounts remain valid authenticated users; removing the room leaves the guest with no invited rooms. No real mail, account tokens, or unrelated user records were deleted.

The code fixes were published to the connected GitHub repository and verified on the stable Vercel URL. Release identifiers and final access checks are recorded in the separate `Maildesk_Release_Verification.json` output.
