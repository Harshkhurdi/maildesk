import test from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import JSZip from "jszip";
import { createNativeFile } from "../lib/office-native.ts";
import * as security from "../lib/office-security.ts";
import {
  isolated,
  memoryDatabase,
  eq,
  and,
  desc,
  sql,
  HttpError,
  json,
  failure,
} from "./suite-fixture.mjs";
const context = (id) => ({ params: Promise.resolve({ id }) });
function upload(bytes, name = "Native.docx", revision) {
  const form = new FormData();
  form.set("file", new File([bytes], name));
  if (revision !== undefined) form.set("revision", String(revision));
  return new Request("https://app.example.test/api/office/files", {
    method: revision === undefined ? "POST" : "PATCH",
    body: form,
  });
}
async function fixture() {
  const memory = memoryDatabase();
  let signed = true,
    userId = "owner";
  const bindings = {
    ...memory.tables,
    ...security,
    eq,
    and,
    desc,
    sql,
    HttpError,
    json,
    failure,
    z,
    getDb: () => memory.db,
    body: (r) => r.json(),
    now: () => new Date().toISOString(),
    uid: () => crypto.randomUUID(),
    guard: async () => {
      if (!signed) throw new HttpError(401, "Sign in");
      return { user: { userId }, db: memory.db };
    },
  };
  const server = await isolated("../lib/office-server.ts", bindings);
  Object.assign(bindings, server);
  const files = await isolated("../app/api/office/files/route.ts", bindings),
    patch = await isolated("../app/api/office/files/[id]/route.ts", bindings),
    download = await isolated(
      "../app/api/office/files/[id]/download/route.ts",
      bindings,
    );
  const original = await createNativeFile("document", "Original");
  const create = async () => {
    const r = await files.POST(upload(original));
    assert.equal(r.status, 201);
    return (await r.json()).file;
  };
  return {
    ...memory,
    files,
    patch,
    download,
    create,
    original,
    setUser(id) {
      userId = id;
    },
    signOut() {
      signed = false;
    },
  };
}
test("native upload retains original bytes, metadata excludes blobs and download enforces ownership", async () => {
  const f = await fixture(),
    zip = await JSZip.loadAsync(f.original);
  zip.file("customXml/vendor.xml", "<vendor>untouched</vendor>");
  const original = await zip.generateAsync({ type: "uint8array" });
  const r = await f.files.POST(upload(original)),
    meta = (await r.json()).file;
  assert.equal(r.status, 201);
  assert.equal(meta.data, undefined);
  assert.equal(meta.ownerId, undefined);
  assert.equal(f.state.officeVersions.length, 1);
  const saved = await f.download.GET(
    new Request("https://app.example.test/download"),
    context(meta.id),
  );
  assert.deepEqual(
    Buffer.from(await saved.arrayBuffer()),
    Buffer.from(original),
  );
  const list = await (await f.files.GET()).json();
  assert.equal(list.files[0].data, undefined);
  f.state.officeFiles[0].ownerId = "other";
  assert.equal(
    (
      await f.download.GET(
        new Request("https://app.example.test/download"),
        context(meta.id),
      )
    ).status,
    404,
  );
});
test("unchanged checkpoints are deduplicated and edited checkpoints save atomically with history", async () => {
  const f = await fixture(),
    meta = await f.create();
  let r = await f.patch.PATCH(
    upload(f.original, "Native.docx", 1),
    context(meta.id),
  );
  assert.equal(r.status, 200);
  assert.equal(f.state.officeVersions.length, 1);
  const edited = await createNativeFile("document", "Edited");
  r = await f.patch.PATCH(upload(edited, "Native.docx", 1), context(meta.id));
  assert.equal(r.status, 200);
  assert.equal((await r.json()).file.revision, 2);
  assert.equal(f.state.officeVersions.length, 2);
  const old = await f.download.GET(
    new Request("https://app.example.test/download?revision=1"),
    context(meta.id),
  );
  assert.deepEqual(
    Buffer.from(await old.arrayBuffer()),
    Buffer.from(f.original),
  );
  const current = await f.download.GET(
    new Request("https://app.example.test/download"),
    context(meta.id),
  );
  assert.deepEqual(
    Buffer.from(await current.arrayBuffer()),
    Buffer.from(edited),
  );
});
test("stale, concurrent and malformed saves cannot overwrite the saved version", async () => {
  const f = await fixture(),
    meta = await f.create(),
    edited = await createNativeFile("document", "Edit");
  const results = await Promise.all([
    f.patch.PATCH(upload(edited, "Native.docx", 1), context(meta.id)),
    f.patch.PATCH(upload(edited, "Native.docx", 1), context(meta.id)),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
  const before = f.state.officeFiles[0].data;
  assert.equal(
    (
      await f.patch.PATCH(
        upload(new Uint8Array([1, 2, 3]), "Native.docx", 2),
        context(meta.id),
      )
    ).status,
    400,
  );
  assert.equal(f.state.officeFiles[0].data, before);
  assert.equal(f.state.officeVersions.length, 2);
});
test("save enforces owner and format; no signed URL or callback bypasses login", async () => {
  const f = await fixture(),
    meta = await f.create();
  const xlsx = await createNativeFile("sheet", "Wrong");
  assert.equal(
    (await f.patch.PATCH(upload(xlsx, "Wrong.xlsx", 1), context(meta.id)))
      .status,
    400,
  );
  f.state.officeFiles[0].ownerId = "other";
  assert.equal(
    (
      await f.patch.PATCH(
        upload(f.original, "Native.docx", 1),
        context(meta.id),
      )
    ).status,
    404,
  );
  f.signOut();
  assert.equal(
    (
      await f.download.GET(
        new Request("https://app.example.test/download?token=obsolete"),
        context(meta.id),
      )
    ).status,
    401,
  );
  assert.equal((await f.files.POST(upload(f.original))).status, 401);
});
test("server refuses JSON conversion jobs; browser supplies the native file", async () => {
  const f = await fixture();
  const r = await f.files.POST(
    new Request("https://app.example.test/api/office/files", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "document", title: "No server conversion" }),
    }),
  );
  assert.equal(r.status, 400);
  assert.equal(f.state.officeFiles.length, 0);
});

test("guest workspace cannot list, download, rename or save another identity’s native files", async () => {
  const f = await fixture(),
    owner = await f.create();
  f.setUser("guest_isolated");
  const listing = await (await f.files.GET()).json();
  assert.deepEqual(listing.files, []);
  assert.equal(
    (
      await f.download.GET(
        new Request("https://app.example.test/download"),
        context(owner.id),
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await f.patch.PATCH(
        upload(f.original, "Native.docx", 1),
        context(owner.id),
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await f.patch.PATCH(
        new Request("https://app.example.test/file", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ title: "Unauthorized" }),
        }),
        context(owner.id),
      )
    ).status,
    404,
  );
  const response = await f.files.POST(upload(f.original, "Guest.docx"));
  assert.equal(response.status, 201);
  assert.notEqual((await response.json()).file.id, owner.id);
  assert.equal(f.state.officeFiles[0].ownerId, "owner");
  assert.equal(f.state.officeFiles[1].ownerId, "guest_isolated");
});

const deletion = (revision) =>
  new Request("https://app.example.test/api/office/files/file", {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ revision }),
  });
test("deleting a native file atomically removes its current data and all versions", async () => {
  const f = await fixture(),
    file = await f.create();
  await f.patch.PATCH(
    upload(await createNativeFile("document", "Saved edit"), "Native.docx", 1),
    context(file.id),
  );
  const kept = await f.create();
  assert.equal(f.state.officeVersions.length, 3);
  const response = await f.patch.DELETE(deletion(2), context(file.id));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).deleted, true);
  assert.equal(f.state.officeFiles.length, 1);
  assert.equal(f.state.officeFiles[0].id, kept.id);
  assert.equal(f.state.officeVersions.length, 1);
  assert.equal(f.state.officeVersions[0].fileId, kept.id);
  assert.equal(
    (
      await f.download.GET(
        new Request("https://app.example.test/download?revision=1"),
        context(file.id),
      )
    ).status,
    404,
  );
});
test("deletion rejects foreign users, stale revisions, missing files and signed-out requests", async () => {
  const f = await fixture(),
    file = await f.create();
  f.setUser("another-guest");
  assert.equal(
    (await f.patch.DELETE(deletion(1), context(file.id))).status,
    404,
  );
  f.setUser("owner");
  assert.equal(
    (await f.patch.DELETE(deletion(2), context(file.id))).status,
    409,
  );
  assert.equal(
    (await f.patch.DELETE(deletion(undefined), context(file.id))).status,
    400,
  );
  assert.equal(
    (await f.patch.DELETE(deletion(1), context("missing"))).status,
    404,
  );
  assert.equal(f.state.officeVersions.length, 1);
  f.signOut();
  assert.equal(
    (await f.patch.DELETE(deletion(1), context(file.id))).status,
    401,
  );
  assert.equal(f.state.officeFiles.length, 1);
});
test("a failed deletion rolls back removal of earlier versions", async () => {
  const f = await fixture(),
    file = await f.create(),
    remove = f.db.delete;
  f.db.delete = (table) => {
    if (table === f.tables.officeFiles) throw Error("Fixture storage failure");
    return remove(table);
  };
  assert.equal(
    (await f.patch.DELETE(deletion(1), context(file.id))).status,
    500,
  );
  assert.equal(f.state.officeFiles.length, 1);
  assert.equal(f.state.officeVersions.length, 1);
});
