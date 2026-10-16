# Maildesk: Gmail connection only

Updated 16 October 2026. X, Shopping and AI image generation have been removed from the active app. Cloudflare setup is skipped. Existing direct calls/chat, Google web search, office editors, PDF viewer, code editor, AI chat and guest mode remain.

Google client credentials are already configured.

1. Open https://maildesk-theta.vercel.app/?view=accounts and sign in as **harshkhurdi.ai@gmail.com** if needed. Guest mode cannot connect inboxes.
2. Click **Connect Gmail**, choose the inbox, complete Google's identity check yourself, and approve read-only Gmail access.
3. After returning to Maildesk, click **Refresh latest 25**. Maildesk fetches one page, with at most 25 individual messages per account; it does not fetch older pages or whole threads. Spam and Trash are excluded.
4. Wait at least one minute between refresh attempts. Refreshes are manual and one batch per account.
5. Repeat for other inboxes, up to ten. Add extra addresses under **Google Auth Platform → Audience → Test users** in project `maildesk-harsh-20261015`, managed as **harshkhurdi@gmail.com**, before connecting them.

The callback stays `https://maildesk-theta.vercel.app/api/gmail/callback`. Testing-mode Gmail refresh tokens normally expire after seven days ([Google documentation](https://developers.google.com/identity/protocols/oauth2/)). No new project or client is needed. Keep passwords, codes, and secrets out of chat.

Saved tasks and office files are kept when a source email leaves the newest-25 window. A failed refresh keeps the previous cache. Maildesk shows source-window warnings rather than treating older emails as deleted or tasks as complete.

Tell me which inbox connected or the exact error shown. Actual Gmail sync remains unverified until an inbox has completed this consent and refresh.
