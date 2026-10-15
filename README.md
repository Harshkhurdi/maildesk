# Maildesk on Vercel

Maildesk keeps email, reviewed tasks, basic office editors, PDFs, conversations, and small personal tools in one private workspace. This Vercel edition preserves the original Maildesk design and uses Next.js 16.4.1, React, TypeScript, Drizzle, and PostgreSQL. The original Sites application remains separate.

Production: https://maildesk-theta.vercel.app

Repository: https://github.com/Harshkhurdi/maildesk

Vercel is connected to this repository. Pushes to the production branch deploy the app; keep migrations explicit and apply them before deploying schema-dependent code. Production secrets are managed in Vercel, outside Git.

## Sign in and privacy

Use the sign-in page to request a one-time code for your email. The personal workspace is restricted to the verified `WORKSPACE_OWNER_EMAIL` address. Every personal API checks the verified server session and ownership; caller-supplied authentication headers are ignored. Guests can sign in with their own verified email and see only rooms addressed to that email. Creating a room does not send an invitation email automatically. Copy its link to share it yourself.

Gmail task detection uses rules and manual review. Maildesk does not automatically send email bodies to AI. AI Studio sends only the prompts and attachments you deliberately submit. It allows verified free model variants and applies zero-price provider limits; external free-service quotas still apply.

## Tools

| Tool | What you can use |
| --- | --- |
| Gmail | Connect up to ten accounts individually using read-only Google OAuth; pause/resume scans, search cached mail, open the original thread, inspect suggested tasks |
| Tasks | Review, confirm, prioritize, date, snooze, complete, and link tasks to files and source emails |
| Documents, presentations, spreadsheets | Basic editors, private saves, linked tasks/emails, and DOCX/PPTX/XLSX downloads; these are not full Microsoft Office replacements |
| PDF viewer | Local PDF opening, page navigation, zoom, search, text view, and supported Gmail PDF attachments |
| Calls & messages | One-to-one rooms, text messages, read receipts, saved file copies, voice/video calls, mute/camera controls, and call history |
| AI Studio | Manual chats, verified free model choices, attachments where supported, streaming, local chat history, history export/import, and settings |
| Code editor | Multiple saved projects and files, syntax highlighting, search, indentation, import/download, optimistic save conflicts, and an isolated HTML/CSS/JavaScript preview |
| Shopping | Product-search links to five stores, private address/PIN storage, manually saved real-price quotes, totals including delivery fees, exports, and merchant checkout links |
| Web search | Real Google searches in browser tabs, private saved searches/bookmarks, exports, and restricted reading previews for embeddable public HTTPS websites |
| X posts | Open the real X website immediately; optional read-only official OAuth feed with manual refresh, once developer credentials and API access are configured |

## Honest connection limits

- **Gmail** needs your own Google Cloud OAuth client and consent configuration. No Gmail accounts were copied or preconnected. Enable Gmail API, add the exact callback shown in Accounts & settings, and configure test users/verification as appropriate. Read-only Gmail scopes can require Google verification.
- **Calls** use direct WebRTC with STUN by default. Restricted networks may require a configured TURN relay. Optional `CF_TURN_KEY_ID` and `CF_TURN_API_TOKEN` enable the existing Cloudflare relay adapter. Camera and microphone permission is requested when you start/accept a call. Calls are not recorded or transcribed.
- **Code** previews block network requests and run without access to the parent app. Python, TypeScript, and other languages can be edited/downloaded; there is no server execution, terminal, package installer, or remote filesystem. Maximum 30 files and 900 KB per saved project; up to 100 projects. A looping script can still require stopping/reloading its browser frame.
- **Shopping** has no connected merchant price/order API. It does not claim that saved quotes are current live prices and does not place orders automatically. Log in, select the delivery address, review availability and total, and pay on each merchant's own website. Swiggy's official MCP service requires production approval. See https://mcp.swiggy.com/builders/docs/start/developer/ . Up to 50 saved quotes in the shopping list.
- **Web** does not proxy websites or bypass their framing restrictions. Google results open in a normal browser tab. The restricted embedded preview has scripts/forms disabled and many sites will decline to display.
- **X** requires `X_CLIENT_ID`, `X_CLIENT_SECRET`, and deliberate `X_API_ENABLED=true`, plus a developer plan/credits permitting timeline reads. Register `/api/x/callback` on this app's exact origin. The optional feed uses `tweet.read users.read offline.access`, stores encrypted tokens, fetches at most 25 posts per manual request, and limits refresh attempts to once per minute. It does not reproduce the entire For You feed or fetch all historical posts. X may charge API credits. No automatic polling or write actions. See https://docs.x.com/fundamentals/authentication/oauth-2-0/authorization-code . Disconnect removes saved data; revoke the permission in X settings too.
- **AI history** lives in the browser, scoped to its account/origin. Export conversations from the old site for your records; browser history does not automatically migrate to the Vercel origin, and this edition does not include a history-import control. Provider free-pool limits can temporarily prevent replies even when the app is correctly configured.

## Configuration

Required server settings: `DATABASE_URL` (pooled), `DATABASE_URL_UNPOOLED` (migrations), `NEON_AUTH_BASE_URL`, `NEON_AUTH_COOKIE_SECRET` (32+ random characters), `WORKSPACE_OWNER_EMAIL`, `TOKEN_ENCRYPTION_KEY` (base64url encoded random 32 bytes), `APP_ORIGIN` (exact production HTTPS origin). `OPENROUTER_API_KEY` enables AI Studio. Optional Google/X/relay settings are described above. Never prefix secrets with `NEXT_PUBLIC_`, commit env files, or include them in a downloaded backup.

Neon Auth uses email OTP. Register `https://maildesk-theta.vercel.app` explicitly in Neon → Settings → Better Auth → Domains. The OTP-sending endpoint checks this allowlist; a rejected incorrect OTP does not prove that code delivery works. Successful sign-in requires the actual code from the owner or guest inbox. See https://neon.com/docs/auth/guides/configure-domains . Follow Neon's production email-delivery guidance and configure custom SMTP for long-term production use: https://neon.com/docs/auth/production-checklist.md . The Neon account itself may separately request email activation before its dashboard can be managed.

## Development and deployment

1. `npm ci` with Node 24.
2. Create an ignored `.env.local` pointing at an isolated development database and Auth branch. Do not point local fixtures at production.
3. `node --env-file=.env.local scripts/migrate.mjs` (use the direct connection when available).
4. `npm run dev` opens the app at http://127.0.0.1:5174 . Real sign-in is required; no test bypass is shipped.
5. `npm run typecheck` and `npm run build` validate the release. `npm test` runs the pure policy, calculation, authentication-error, and request-validation checks.
6. Apply reviewed Drizzle migrations to the separate production database, then `vercel --prod --yes --scope harsh-1c69` from this folder. Inspect the returned deployment and verify the stable URL before claiming success.

The initial migration was verified against an isolated local PostgreSQL database before it was applied to the new, empty production database. No fictional production records were seeded. Local tests used a temporary owner and guest overlay which was removed before the release build. API scripts inherited from the Sites edition require that edition's local fixture harness; they are not production test scripts.

## Verification for this migration

- 52 pure task, spreadsheet, conversation, free-AI, stream, URL, checkout-domain, and preview-policy tests passed.
- 19 task/file API assertions, 43 conversation/access/call-state checks, and 22 utility/access/revision/URL/X-setup checks passed against isolated local PostgreSQL with two temporary test users.
- Browser verification covered the original overview design, runnable code preview, project saving, shopping search links, private address and quote saving (₹60 + ₹10 fees = ₹70), saved bookmarks, and real Google search results.
- Native Next.js 16.4.1 production build passed after replacing browser-incompatible PowerPoint Node imports with browser stubs. Text slides and notes remain supported; no unsupported filesystem/network image access is exposed in the browser.
- The initial migration checked rejection of an invalid OTP. That check did not establish successful code delivery. The subsequent production audit fixed the Neon trusted-domain setting and verified actual code delivery, owner sign-in, session restoration, task saving/completion, office editing and real DOCX/PPTX/XLSX downloads, local PDF controls, code preview, bookmarks, Google results, and manual quote totals. See `docs/LIVE_AUDIT.md` for evidence and remaining integration limits.

The Next.js and sharp audit findings were cleared by the framework update. The dependency audit still flags build/exporter dependencies, including image-size and uuid. This is not a clean dependency audit; Maildesk’s basic export editors do not accept image-parser input or expose the affected UUID buffer APIs. Review those upstream findings before extending the exporters or opening development tools beyond localhost.

Back up your tasks and office files through Accounts & settings. Code projects, shopping quotes, bookmarks, and AI chat history have their own export controls. Environment secrets and connected-account tokens are excluded from user exports.
