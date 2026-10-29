import { readMigrationFiles } from "drizzle-orm/migrator";
import { fileURLToPath } from "node:url";
// Existing installs may predate Drizzle's journal. All current migrations only
// create tables/indexes. Adopting those objects must never drop or replace data.
export function additiveStatement(statement) {
  return statement
    .replace(
      /^(\s*CREATE\s+TABLE)\s+(?!IF\s+NOT\s+EXISTS)/i,
      "$1 IF NOT EXISTS ",
    )
    .replace(
      /^(\s*CREATE\s+(?:UNIQUE\s+)?INDEX)\s+(?!IF\s+NOT\s+EXISTS)/i,
      "$1 IF NOT EXISTS ",
    );
}
export async function applyMigrations(client, migrations) {
  await client.query("BEGIN");
  try {
    await client.query("SET LOCAL lock_timeout = '20s'");
    await client.query("SET LOCAL statement_timeout = '60s'");
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext('maildesk.schema.migrations'))",
    );
    await client.query("CREATE SCHEMA IF NOT EXISTS drizzle");
    await client.query(
      "CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at bigint)",
    );
    const { rows } = await client.query(
      "SELECT created_at FROM drizzle.__drizzle_migrations ORDER BY created_at DESC LIMIT 1",
    );
    const last = Number(rows[0]?.created_at ?? 0);
    let applied = 0;
    for (const migration of migrations) {
      if (migration.folderMillis <= last) continue;
      for (const statement of migration.sql) {
        if (statement.trim()) await client.query(additiveStatement(statement));
      }
      await client.query(
        "INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ($1, $2)",
        [migration.hash, migration.folderMillis],
      );
      applied++;
    }
    // Refuse to promote an incompatible manually-created native schema.
    await client.query(
      "SELECT id,owner_id,kind,title,extension,data,hash,revision,source_file_id,created_at,updated_at FROM public.office_files LIMIT 0",
    );
    await client.query(
      "SELECT file_id,owner_id,revision,data,hash,created_at FROM public.office_versions LIMIT 0",
    );
    await client.query("COMMIT");
    return applied;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}
export async function migrateDatabase(environment = process.env) {
  const connectionString =
    environment.DATABASE_URL_UNPOOLED || environment.DATABASE_URL;
  if (!connectionString)
    throw Error("MailDesk DATABASE_URL is required before release.");
  const { Pool } = await import("pg"),
    pool = new Pool({
      connectionString,
      max: 1,
      connectionTimeoutMillis: 15000,
    });
  let client;
  try {
    client = await pool.connect();
    const applied = await applyMigrations(
      client,
      readMigrationFiles({
        migrationsFolder: fileURLToPath(
          new URL("../db/migrations/", import.meta.url),
        ),
      }),
    );
    console.log(`MailDesk database ready (${applied} migrations applied).`);
  } finally {
    client?.release();
    await pool.end();
  }
}
