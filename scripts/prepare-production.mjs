import { mkdirSync, writeFileSync } from "node:fs";
import { migrateDatabase } from "./database-migrations.mjs";
// User-authorized production release: prepare schema during build, never in a request.
const production = process.env.VERCEL_ENV === "production";
if (production) await migrateDatabase();
else
  console.log(
    "Production database migration skipped outside a production Vercel build.",
  );
// Public static diagnostics contain no account data or credentials. This lets the
// release check confirm both the new UI and completed build-time schema setup.
mkdirSync("public", { recursive: true });
writeFileSync(
  "public/maildesk-release.json",
  JSON.stringify({
    ui: "office-workspace-v2",
    guestAccess: true,
    pdfWorkspace: true,
    fileDeletion: true,
    environment: process.env.VERCEL_ENV ?? "local",
    databasePrepared: production,
    commit: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
  }),
);
