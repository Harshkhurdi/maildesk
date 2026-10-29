# Remaining setup

Keep the existing Vercel project, PostgreSQL, Neon Auth and encryption key. No Firebase or Office Document Server is required.

1. Set/check the existing environment variables from `.env.example` in staging.
2. Production Vercel builds apply the additive native-file migration automatically with the existing database environment. Keep database backups. Local/preview migrations remain explicit.
3. Let Vercel build pinned browser editor assets using `npm ci` and `npm run build`. Confirm static WASM encoding and cross-origin isolation headers on the preview deployment.
4. Enable Gmail and Calendar APIs and register the exact OAuth callback. Reconnect isolated staging Google accounts for explicitly selected new scopes.
5. Run real file acceptance tests and authorized staging mail/calendar checks, then promote the deployment. Review AGPL source/distribution obligations before merging the new engine integration.

No real mail send or calendar change is performed by automated acceptance tests. [The report](IMPLEMENTATION_REPORT.md) records checks and limitations.
