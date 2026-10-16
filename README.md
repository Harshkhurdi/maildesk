# Maildesk on Vercel

Maildesk keeps email, reviewed tasks, basic office editors, PDFs, conversations, and small personal tools in one private workspace. This Vercel edition preserves the original Maildesk design and uses Next.js 16.4.1, React, TypeScript, Drizzle, and PostgreSQL. The original Sites application remains separate.

Production: https://maildesk-theta.vercel.app

Repository: https://github.com/Harshkhurdi/maildesk

Vercel is connected to this repository. Pushes to the production branch deploy the app; keep migrations explicit and apply them before deploying schema-dependent code. Production secrets are managed in Vercel, outside Git.

## Sign in and privacy

Use the sign-in page to request a one-time code for your email. The personal workspace is restricted to the verified `WORKSPACE_OWNER_EMAIL` address. Every personal API checks the verified server session and ownership; caller-supplied authentication headers are ignored. Guests can sign in with their own verified email and see only rooms addressed to that email. Creating a room does not send an invitation email automatically. Copy its link to share it yourself.

Gmail task detection uses rules and manual review. Maildesk does not automatically send email bodies to AI. AI Studio sends only the prompts and attachments you deliberately submit. It allows verified free model variants and applies zero-price provider limits; external free-service quotas still apply.

## Guest access without email

Choose **Continue as guest** on the sign-in page, or open https://maildesk-theta.vercel.app/guest. Guest tasks, documents, presentations, spreadsheets, PDFs, code projects and bookmarks work without an email account. Saved guest work stays in that browser profile, is accessible to anyone using it, and does not sync across devices. Export your work before clearing browser data. Use **Accounts & settings → Restore guest backup** to bring an exported guest workspace into another browser. Review the item counts before restoring; identical records are skipped and changed records become separate copies, keeping existing work and imported task links. Guest records are separate from signed-in data and are not automatically imported when you sign in. Connected Gmail, AI and conversation rooms still require verified sign-in.

## Tools

| Tool | What you can use |
| --- | --- |
| Gmail | Connect up to ten accounts using read-only Google OAuth; manually refresh only the newest 25 emails per account, search that recent window, open original Gmail threads, and review suggested tasks |
| Tasks | Review, confirm, prioritize, date, snooze, complete, and link tasks to files and source emails |
| Documents, presentations, spreadsheets | Basic editors, private saves, linked tasks/emails, and DOCX/PPTX/XLSX downloads; these are not full Microsoft Office replacements |
| PDF viewer | Local PDF opening, page navigation, zoom, search, text view, and supported Gmail PDF attachments |
| Calls & messages | One-to-one rooms, text messages, read receipts, saved file copies, voice/video calls, mute/camera controls, and call history |
| AI Studio | Manual chats, verified free model choices, attachments where supported, streaming, local chat history, history export/import, and settings. Image generation is removed because no verified free image models are currently available |
| Code editor | Multiple saved projects and files, syntax highlighting, search, indentation, import/download, optimistic save conflicts, and an isolated HTML/CSS/JavaScript preview |
| Web search | Real Google searches in browser tabs, private saved searches/bookmarks, exports, and restricted reading previews for embeddable public HTTPS websites |

## Honest connection limits

- **Gmail** needs your own Google Cloud OAuth client and consent configuration. No Gmail accounts were copied or preconnected. Each manual refresh requests one page of at most 25 individual messages, excludes spam/trash, and never follows older pages or downloads whole threads. The cache is replaced only after a successful complete fetch. Saved tasks and office files remain when their source email falls outside this window; open Gmail for older context. Wait at least one minute between refresh attempts. Enable Gmail API, add the exact callback shown in Accounts & settings, and configure test users/verification as appropriate. Read-only Gmail scopes can require Google verification.
- **Calls** use direct WebRTC with STUN by default. Restricted networks may require a configured TURN relay. Optional `CF_TURN_KEY_ID` and `CF_TURN_API_TOKEN` enable the existing Cloudflare relay adapter. Camera and microphone permission is requested when you start/accept a call. Calls are not recorded or transcribed.
- **Code** previews block network requests and run without access to the parent app. Python, TypeScript, and other languages can be edited/downloaded; there is no server execution, terminal, package installer, or remote filesystem. Maximum 30 files and 900 KB per saved project; up to 100 projects. A looping script can still require stopping/reloading its browser frame.
- **Web** does not proxy websites or bypass their framing restrictions. Google results open in a normal browser tab. The restricted embedded preview has scripts/forms disabled and many sites will decline to display.
- **AI history** lives in the browser, scoped to its account/origin. Export conversations from the old site for your records; browser history does not automatically migrate to the Vercel origin. Use **Import JSON** in AI Studio to restore an exported conversation as a new local copy. Imports do not send messages to any AI provider. Provider free-pool limits can temporarily prevent replies even when the app is correctly configured.

## Configuration

Required server settings: `DATABASE_URL` (pooled), `DATABASE_URL_UNPOOLED` (migrations), `NEON_AUTH_BASE_URL`, `NEON_AUTH_COOKIE_SECRET` (32+ random characters), `WORKSPACE_OWNER_EMAIL`, `TOKEN_ENCRYPTION_KEY` (base64url encoded random 32 bytes), `APP_ORIGIN` (exact production HTTPS origin). `OPENROUTER_API_KEY` enables AI Studio. Optional Google/relay settings are described above. Never prefix secrets with `NEXT_PUBLIC_`, commit env files, or include them in a downloaded backup.

Neon Auth uses email OTP. Register `https://maildesk-theta.vercel.app` explicitly in Neon → Settings → Better Auth → Domains. The OTP-sending endpoint checks this allowlist; a rejected incorrect OTP does not prove that code delivery works. Successful sign-in requires the actual code from the owner or guest inbox. See https://neon.com/docs/auth/guides/configure-domains . Follow Neon's production email-delivery guidance and configure custom SMTP for long-term production use: https://neon.com/docs/auth/production-checklist.md . The Neon account itself may separately request email activation before its dashboard can be managed.

## Development and deployment

1. `npm ci` with Node 24.
2. Create an ignored `.env.local` pointing at an isolated development database and Auth branch. Do not point local fixtures at production.
3. `node --env-file=.env.local scripts/migrate.mjs` (use the direct connection when available).
4. `npm run dev` opens the app at http://127.0.0.1:5174 . Real sign-in is required; no test bypass is shipped.
5. `npm run typecheck` and `npm run build` validate the release. `npm test` runs deterministic policy, calculation, import, request, call-engine, and isolated integration regression checks. See `docs/CODE_AUDIT.md` for the latest audit fixes and verification boundaries.
6. Apply reviewed Drizzle migrations to the separate production database, then `vercel --prod --yes --scope harsh-1c69` from this folder. Inspect the returned deployment and verify the stable URL before claiming success.

The initial migration was verified against an isolated local PostgreSQL database before it was applied to the new, empty production database. No fictional production records were seeded. Local tests used a temporary owner and guest overlay which was removed before the release build. API scripts inherited from the Sites edition require that edition's local fixture harness; they are not production test scripts.

## Verification for this migration

- 52 pure task, spreadsheet, conversation, free-AI, stream, URL, checkout-domain, and preview-policy tests passed.
- 19 task/file API assertions, 43 conversation/access/call-state checks, and 22 utility/access/revision/URL/X-setup checks passed against isolated local PostgreSQL with two temporary test users.
- Browser verification covered the original overview design, runnable code preview, project saving, saved bookmarks, and real Google search results (earlier shopping checks are historical; the feature is now removed).
- Native Next.js 16.4.1 production build passed after replacing browser-incompatible PowerPoint Node imports with browser stubs. Text slides and notes remain supported; no unsupported filesystem/network image access is exposed in the browser.
- The initial migration checked rejection of an invalid OTP. That check did not establish successful code delivery. The subsequent production audit fixed the Neon trusted-domain setting and verified actual code delivery, owner sign-in, session restoration, task saving/completion, office editing and real DOCX/PPTX/XLSX downloads, local PDF controls, code preview, bookmarks, Google results, and manual quote totals. See `docs/LIVE_AUDIT.md` for evidence and remaining integration limits.

The Next.js and sharp findings were cleared by the framework update. A deeper compatibility review adds scoped overrides for ExcelJS→UUID 11.1.1, PptxGenJS→image-size 2.0.3, and esbuild-kit→esbuild 0.28.2. Exporter round trips and Drizzle transforms validate these changes. The remaining npm audit findings concern the development-only braces/glob ESLint chain, for which no patched braces release is published. ExcelJS's browser prebundle embeds older UUID code; the app uses its unaffected v4 path, and the package override does not rewrite vendor bundles. Production package audit results and live export evidence are recorded separately in the latest release report.

See [REMAINING_SETUP.md](docs/REMAINING_SETUP.md) for the remaining Gmail connection steps. Do not paste secrets in chat.

Back up your tasks and office files through Accounts & settings. Code projects, bookmarks, and AI chat history have their own export controls. Environment secrets and connected-account tokens are excluded from user exports.

## Current simplified scope

The X and Shopping tabs, pages and API routes are removed. Google web search remains free to open. Existing saved shopping records stay in storage/backups for safekeeping and are not used by active tools. Image generation is removed; AI chat, explicit image/PDF attachments where supported, and chat history continue. Cloudflare setup is skipped; existing direct voice/video calls and chat remain, with no claim that a relay or restrictive-network test is configured.
