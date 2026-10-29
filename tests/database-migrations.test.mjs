import test from "node:test";
import assert from "node:assert/strict";
import { readMigrationFiles } from "drizzle-orm/migrator";
import {
  additiveStatement,
  applyMigrations,
} from "../scripts/database-migrations.mjs";
const migrations = readMigrationFiles({ migrationsFolder: "db/migrations" });
function database(last = 0, fail = false) {
  const queries = [],
    entries = [];
  let committed = false,
    rolledBack = false;
  return {
    queries,
    entries,
    get committed() {
      return committed;
    },
    get rolledBack() {
      return rolledBack;
    },
    async query(sql, params) {
      queries.push(sql);
      if (sql.startsWith("SELECT created_at"))
        return { rows: last ? [{ created_at: last }] : [] };
      if (fail && /CREATE TABLE IF NOT EXISTS "office_files"/.test(sql))
        throw Error("Fixture permission denied");
      if (sql.startsWith("INSERT INTO drizzle")) entries.push(params);
      if (sql === "COMMIT") committed = true;
      if (sql === "ROLLBACK") rolledBack = true;
      return { rows: [] };
    },
  };
}
test("upgrading an existing install preserves its tables and journals the additive native schema", async () => {
  const db = database();
  assert.equal(await applyMigrations(db, migrations), 2);
  assert(db.committed);
  assert(!db.rolledBack);
  assert.equal(db.entries.length, 2);
  assert(
    db.queries.some((q) => q.includes('CREATE TABLE IF NOT EXISTS "files"')),
  );
  assert(
    db.queries.some((q) =>
      q.includes('CREATE TABLE IF NOT EXISTS "office_files"'),
    ),
  );
  assert(!db.queries.some((q) => /\b(DROP|DELETE|TRUNCATE|UPDATE)\b/i.test(q)));
  assert.equal(db.entries[0][0], migrations[0].hash);
  assert(
    db.queries.findIndex((q) => q.includes("pg_advisory_xact_lock")) <
      db.queries.findIndex((q) => q.includes("CREATE TABLE")),
  );
});
test("a repeated production build skips completed migrations and validates native table shape", async () => {
  const db = database(migrations.at(-1).folderMillis);
  assert.equal(await applyMigrations(db, migrations), 0);
  assert.equal(db.entries.length, 0);
  assert(
    !db.queries.some((q) =>
      q.includes('CREATE TABLE IF NOT EXISTS "office_files"'),
    ),
  );
  assert(
    db.queries.some((q) => q.includes("FROM public.office_files LIMIT 0")),
  );
  assert(db.committed);
});
test("a migration failure rolls back and prevents deployment acknowledgement", async () => {
  const db = database(0, true);
  await assert.rejects(applyMigrations(db, migrations), /permission denied/);
  assert(db.rolledBack);
  assert(!db.committed);
});
test("additive CREATE handling is idempotent and does not rewrite future alterations", () => {
  for (const sql of [
    'CREATE TABLE "safe" (id text)',
    'CREATE UNIQUE INDEX "idx" ON "safe" (id)',
    'CREATE INDEX "idx" ON "safe" (id)',
  ]) {
    const transformed = additiveStatement(sql);
    assert.match(transformed, /IF NOT EXISTS/);
    assert.equal(additiveStatement(transformed), transformed);
  }
  assert.equal(
    additiveStatement('ALTER TABLE "safe" ADD COLUMN label text'),
    'ALTER TABLE "safe" ADD COLUMN label text',
  );
});
