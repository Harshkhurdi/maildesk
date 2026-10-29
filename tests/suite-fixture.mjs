import { readFile } from "node:fs/promises";
import ts from "typescript";
export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
export const json = (value, status = 200) => Response.json(value, { status });
export const failure = (error) =>
  json({ error: error.message }, error.status ?? 500);
export async function isolated(path, bindings) {
  const source = await readFile(new URL(path, import.meta.url), "utf8");
  const parsed = ts.createSourceFile(
    path,
    source,
    ts.ScriptTarget.Latest,
    true,
  );
  const imports = parsed.statements.filter(ts.isImportDeclaration);
  let stripped = source;
  for (const node of [...imports].reverse())
    stripped =
      stripped.slice(0, node.getFullStart()) + stripped.slice(node.end);
  const code = ts.transpileModule(stripped, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
  const key = "suite_fixture_" + crypto.randomUUID().replaceAll("-", "");
  globalThis[key] = bindings;
  try {
    return await import(
      "data:text/javascript;base64," +
        Buffer.from(
          `const {${Object.keys(bindings).join(",")}} = globalThis[${JSON.stringify(key)}];\n${code}`,
        ).toString("base64")
    );
  } finally {
    delete globalThis[key];
  }
}
export const eq = (field, value) => (row) => row[field.key] === value;
export const and =
  (...conditions) =>
  (row) =>
    conditions.every((condition) => condition(row));
export const desc = (field) => field;
export const sql = (strings, field) => ({ increment: field.key });
export function memoryDatabase() {
  const table = (name, keys) =>
    Object.assign(
      { tableName: name },
      Object.fromEntries(keys.map((key) => [key, { key, table: name }])),
    );
  const officeFiles = table("officeFiles", [
    "id",
    "ownerId",
    "revision",
    "data",
    "hash",
    "epoch",
    "lastClosedKey",
    "updatedAt",
    "sourceFileId",
    "extension",
    "kind",
    "title",
    "createdAt",
  ]);
  const officeVersions = table("officeVersions", [
    "fileId",
    "ownerId",
    "revision",
    "data",
    "hash",
    "createdAt",
  ]);
  const files = table("files", ["id", "ownerId", "kind", "content", "title"]);
  const tables = { officeFiles, officeVersions, files },
    state = { officeFiles: [], officeVersions: [], files: [] };
  let queue = Promise.resolve();
  const db = {
    select(projection) {
      let name,
        condition = () => true,
        limit = Infinity;
      const result = () =>
        state[name]
          .filter(condition)
          .slice(0, limit)
          .map((row) =>
            projection
              ? Object.fromEntries(
                  Object.entries(projection).map(([key, column]) => [
                    key,
                    row[column.key],
                  ]),
                )
              : { ...row },
          );
      const query = {
        from(table) {
          name = table.tableName;
          return query;
        },
        where(fn) {
          condition = fn;
          return query;
        },
        orderBy() {
          return query;
        },
        limit(n) {
          limit = n;
          return query;
        },
        for() {
          return query;
        },
        then(resolve, reject) {
          return Promise.resolve(result()).then(resolve, reject);
        },
      };
      return query;
    },
    insert(table) {
      return {
        values(value) {
          const row =
            table === officeFiles
              ? { revision: 1, epoch: 1, lastClosedKey: null, ...value }
              : { ...value };
          let done = false;
          const run = () => {
            if (!done) {
              if (
                table === officeVersions &&
                state.officeVersions.some(
                  (v) => v.fileId === row.fileId && v.revision === row.revision,
                )
              )
                throw Error("Duplicate version");
              state[table.tableName].push(row);
              done = true;
            }
            return [{ ...row }];
          };
          return {
            returning: async () => run(),
            then(resolve, reject) {
              return Promise.resolve().then(run).then(resolve, reject);
            },
          };
        },
      };
    },
    update(table) {
      return {
        set(values) {
          return {
            where(fn) {
              let done = false;
              let result;
              const run = () => {
                if (!done) {
                  result = state[table.tableName].filter(fn);
                  for (const row of result)
                    for (const [key, value] of Object.entries(values))
                      row[key] = value?.increment
                        ? row[value.increment] + 1
                        : value;
                  done = true;
                }
                return result.map((r) => ({ ...r }));
              };
              return {
                returning: async () => run(),
                then(resolve, reject) {
                  return Promise.resolve().then(run).then(resolve, reject);
                },
              };
            },
          };
        },
      };
    },
    transaction(callback) {
      const run = queue.then(async () => {
        const backup = structuredClone(state);
        try {
          return await callback(db);
        } catch (e) {
          Object.assign(state, backup);
          throw e;
        }
      });
      queue = run.catch(() => {});
      return run;
    },
  };
  return { tables, state, db };
}
