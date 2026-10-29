import { migrateDatabase } from "./database-migrations.mjs";
// User-authorized production release: apply additive schema once during build,
// never during page renders, API requests, local development or preview builds.
if (process.env.VERCEL_ENV === "production") await migrateDatabase();
else
  console.log(
    "Production database migration skipped outside a production Vercel build.",
  );
