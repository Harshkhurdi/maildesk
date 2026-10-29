// Isolated browser UI checks. Providers are mocked; no real email/calendar action is sent.
import assert from "node:assert/strict";
import JSZip from "jszip";
import { access, mkdir, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
const { chromium } = await import(
  process.env.MAILDESK_PLAYWRIGHT_MODULE || "playwright"
);
const root = new URL("../", import.meta.url),
  routeDirectory = new URL("app/maildesk-qa-fixture/", root);
const externalServer = process.env.MAILDESK_QA_BASE_URL;
const base = externalServer || "http://127.0.0.1:5274";
let server,
  browser,
  created = false;
const screenshotDirectory =
  process.env.MAILDESK_QA_SCREENSHOTS || "/tmp/maildesk-ui-smoke";
const today = new Date(),
  todayStart = new Date(today);
todayStart.setHours(9, 0, 0, 0);
const todayEnd = new Date(todayStart);
todayEnd.setHours(10);
const now = "2026-10-29T06:00:00.000Z";
const native = {
  id: "fixture-native",
  kind: "document",
  title: "Quarterly report",
  extension: "docx",
  revision: 1,
  updatedAt: now,
  createdAt: now,
  sourceFileId: null,
  hash: "fixture",
};
const account = {
  id: "fixture-account",
  email: "owner@example.test",
  syncedAt: now,
  capabilities: { read: true, mail: true, calendar: true },
};
const message = {
  id: "fixture-mail",
  threadId: "fixture-thread",
  subject: "Project update",
  from: "Colleague <colleague@example.test>",
  replyTo: "colleague@example.test",
  to: account.email,
  cc: "",
  bcc: "",
  date: now,
  text: "Project review is ready.",
  html: '<p>Project review is <strong>ready</strong>.</p><img src="https://tracking.invalid/pixel"><script>window.injected = true</script>',
  snippet: "Project review is ready.",
  labels: ["INBOX", "UNREAD"],
  attachments: [],
  messageId: "<fixture@example.test>",
  references: "",
};
const event = {
  id: "fixture-event",
  etag: '"version1"',
  summary: "Fixture review",
  description: "Review status",
  location: "Office",
  start: { dateTime: todayStart.toISOString() },
  end: { dateTime: todayEnd.toISOString() },
  attendees: [],
  reminders: { overrides: [{ method: "popup", minutes: 30 }] },
};
let nativeBytes = null,
  failSave = true,
  officeRequests = 0;
const providerWrites = [],
  errors = [];
try {
  if (!externalServer) {
    await assert.rejects(access(routeDirectory), { code: "ENOENT" });
    await mkdir(routeDirectory);
    created = true;
    await writeFile(
      new URL("page.tsx", routeDirectory),
      'import {notFound} from "next/navigation"; import Maildesk from "@/components/maildesk-workspace"; export default function QA(){if(process.env.NODE_ENV!=="development")notFound();return <Maildesk/>;}\n',
    );
    server = spawn(
      process.execPath,
      [
        "node_modules/next/dist/bin/next",
        "dev",
        "--webpack",
        "--hostname",
        "127.0.0.1",
        "--port",
        "5274",
      ],
      { cwd: root, stdio: ["ignore", "inherit", "inherit"] },
    );
    let available = false;
    for (let attempt = 0; attempt < 120; attempt++) {
      try {
        const response = await fetch(base + "/maildesk-qa-fixture", {
          signal: AbortSignal.timeout(1500),
        });
        if (response.ok) {
          available = true;
          break;
        }
        if (attempt === 0)
          console.error("Initial QA response:", response.status);
      } catch (error) {
        if (attempt === 0)
          console.error(
            "Initial QA connection:",
            error.cause?.code || error.message,
          );
      }
      await delay(500);
    }
    assert(available, "Local QA server did not start.");
  }
  const args = process.env.MAILDESK_CHROMIUM_ARGS
    ? JSON.parse(process.env.MAILDESK_CHROMIUM_ARGS)
    : [];
  browser = await chromium.launch({
    headless: true,
    args,
    executablePath: process.env.MAILDESK_CHROMIUM_PATH || undefined,
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  await context.route(base + "/api/**", async (route) => {
    const request = route.request(),
      url = new URL(request.url()),
      path = url.pathname,
      method = request.method();
    const send = (json, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(json),
      });
    if (path === "/api/workspace")
      return send({
        accounts: [account],
        legacyFiles: [],
        configured: true,
        callbackUrl: "https://app.example.test/api/gmail/callback",
        userName: "Fixture Owner",
      });
    if (path === "/api/office/files" && method === "GET")
      return send({ files: [native], configured: true });
    if (path === "/api/office/files" && method === "POST") {
      const form = await new Response(request.postDataBuffer(), {
        headers: { "content-type": request.headers()["content-type"] },
      }).formData();
      nativeBytes = new Uint8Array(await form.get("file").arrayBuffer());
      native.title = String(form.get("title"));
      native.extension = form.get("file").name.split(".").pop();
      native.kind = { docx: "document", xlsx: "sheet", pptx: "slides" }[
        native.extension
      ];
      native.revision = 1;
      return send({ file: native }, 201);
    }
    if (path.endsWith("/download"))
      return route.fulfill({
        status: 200,
        contentType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        body: Buffer.from(nativeBytes),
      });
    if (path === "/api/office/files/fixture-native" && method === "PATCH") {
      officeRequests++;
      if (failSave) {
        failSave = false;
        return send(
          { error: "Fixture storage unavailable. Retry or download recovery." },
          503,
        );
      }
      const form = await new Response(request.postDataBuffer(), {
        headers: { "content-type": request.headers()["content-type"] },
      }).formData();
      assert.equal(Number(form.get("revision")), native.revision);
      nativeBytes = new Uint8Array(await form.get("file").arrayBuffer());
      native.revision++;
      return send({ file: native });
    }
    if (path.endsWith("/versions"))
      return send({ versions: [{ revision: 1, createdAt: now }] });
    if (path === "/api/outlook/accounts") return send({ accounts: [account] });
    if (path === "/api/outlook/labels")
      return send({
        labels: [{ id: "Label_Project", name: "Projects", type: "user" }],
      });
    if (path === "/api/outlook/messages" && method === "GET")
      return send(
        url.searchParams.has("threadId")
          ? { messages: [message] }
          : { messages: [message], nextPageToken: null, syncedAt: now },
      );
    if (path === "/api/outlook/messages" && method === "POST") {
      providerWrites.push(request.postDataJSON());
      return send({ id: "fixture-draft" });
    }
    if (path === "/api/outlook/calendar" && method === "GET")
      return send({ items: [event] });
    if (path === "/api/outlook/calendar" && method !== "GET") {
      providerWrites.push(request.postDataJSON());
      return send(event);
    }
    if (path === "/api/ai/models")
      return send({ models: [], configured: false });
    throw Error(`Unexpected API request: ${method} ${path}`);
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("dialog", (dialog) => dialog.accept());
  await page.goto(base + "/maildesk-qa-fixture");
  await page.getByRole("heading", { name: "MailDesk Word." }).waitFor();
  assert.equal(
    await page
      .getByRole("navigation", { name: "Applications" })
      .getByRole("link")
      .count(),
    5,
  );
  await page.getByRole("button", { name: "Create a blank document" }).click();
  await page
    .getByRole("textbox", { name: "File name", exact: true })
    .fill("Browser QA report");
  await page
    .getByRole("combobox", { name: "Template", exact: true })
    .selectOption("report");
  await page.getByRole("button", { name: "Create file", exact: true }).click();
  const editorFrame = page
    .frameLocator('iframe[title$="browser Office editor"]')
    .frameLocator('iframe[name="frameEditor"]');
  const input = editorFrame.locator("#area_id");
  await input.waitFor({ state: "attached", timeout: 120_000 });
  await page
    .getByRole("button", { name: "Save checkpoint", exact: true })
    .waitFor();
  const sdk = editorFrame.locator("#editor_sdk");
  await sdk.click({ position: { x: 300, y: 200 } });
  await input.focus();
  await page.keyboard.insertText("MAIL_DESK_EDIT_VERIFIED");
  await page
    .getByRole("status")
    .filter({ hasText: "Unsaved changes" })
    .waitFor({ timeout: 30_000 });
  await page
    .getByRole("button", { name: "Save checkpoint", exact: true })
    .click();
  await page
    .getByRole("alert")
    .filter({ hasText: "Fixture storage unavailable" })
    .waitFor({ timeout: 120_000 });
  assert(
    await page
      .getByRole("button", { name: "Download recovery copy" })
      .isVisible(),
  );
  await page
    .getByRole("button", { name: "Save checkpoint", exact: true })
    .click();
  await page
    .getByRole("status")
    .filter({ hasText: "Saved to your workspace" })
    .waitFor({ timeout: 120_000 });
  const savedZip = await JSZip.loadAsync(nativeBytes);
  assert.match(
    await savedZip.file("word/document.xml").async("string"),
    /MAIL_DESK_EDIT_VERIFIED/,
  );
  const before = officeRequests;
  await delay(1200);
  assert.equal(officeRequests, before, "Idle editor must not poll the server");
  await page.getByRole("button", { name: "Versions", exact: true }).click();
  await page.getByRole("dialog", { name: "Version history" }).waitFor();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "Free AI", exact: true }).click();
  await page
    .getByText("This editor does not send the open document to AI.")
    .waitFor();
  await page.getByRole("button", { name: "Close AI panel" }).click();
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await mkdir(screenshotDirectory, { recursive: true });
  await page.screenshot({
    path: screenshotDirectory + "/word-desktop.png",
    fullPage: true,
  });
  for (const [name, heading] of [
    ["Excel", "MailDesk Excel."],
    ["PowerPoint", "MailDesk PowerPoint."],
  ]) {
    await page
      .getByRole("navigation", { name: "Applications" })
      .getByRole("link", { name, exact: true })
      .click();
    await page.getByRole("heading", { name: heading, exact: true }).waitFor();
    const isSheet = name === "Excel",
      marker = isSheet ? "SHEET_EDIT_VERIFIED" : "SLIDE_EDIT_VERIFIED";
    await page
      .getByRole("button", {
        name: isSheet
          ? "Create a blank workbook"
          : "Create a blank presentation",
      })
      .click();
    await page
      .getByRole("textbox", { name: "File name", exact: true })
      .fill(name + " browser QA");
    await page
      .getByRole("button", { name: "Create file", exact: true })
      .click();
    const frame = page
      .frameLocator('iframe[title$="browser Office editor"]')
      .frameLocator('iframe[name="frameEditor"]');
    const capture = frame.locator("#area_id");
    await capture.waitFor({ state: "attached", timeout: 120_000 });
    await page.waitForFunction(
      () => {
        const frame = document.querySelector(
          'iframe[title$="browser Office editor"]',
        );
        const inner = frame?.contentWindow?.document.querySelector(
          'iframe[name="frameEditor"]',
        );
        const sdk = inner?.contentWindow?.Asc?.editor;
        return sdk?.isDocumentLoadComplete && sdk?.isLoadFullApi;
      },
      undefined,
      { timeout: 120_000 },
    );
    await capture.focus();
    if (isSheet) {
      await page.keyboard.press("Control+Home");
      await page.keyboard.insertText(marker);
      await page.keyboard.press("Enter");
    } else {
      await page.keyboard.press("Tab");
      await page.keyboard.press("Enter");
      await page.keyboard.insertText(marker);
      await page.keyboard.press("Escape");
    }
    await page
      .getByRole("status")
      .filter({ hasText: "Unsaved changes" })
      .waitFor({ timeout: 30_000 });
    await page
      .getByRole("button", { name: "Save checkpoint", exact: true })
      .click();
    await page
      .getByRole("status")
      .filter({ hasText: "Saved to your workspace" })
      .waitFor({ timeout: 120_000 });
    const zip = await JSZip.loadAsync(nativeBytes);
    const entries = Object.values(zip.files).filter(
      (f) => !f.dir && /\.xml$/.test(f.name),
    );
    const xml = (await Promise.all(entries.map((f) => f.async("string")))).join(
      "",
    );
    assert.match(xml, new RegExp(marker));
    const downloadEvent = page.waitForEvent("download", { timeout: 120_000 });
    await page.getByRole("button", { name: "Export PDF", exact: true }).click();
    const exported = await downloadEvent;
    const pdf = await import("node:fs/promises").then((fs) =>
      exported.path().then((p) => fs.readFile(p)),
    );
    assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
    await page.getByRole("button", { name: "Back", exact: true }).click();
  }
  await page
    .getByRole("navigation", { name: "Applications" })
    .getByRole("link", { name: "Outlook", exact: true })
    .click();
  await page.getByRole("button", { name: /Colleague/ }).waitFor();
  await page.getByRole("button", { name: /Colleague/ }).click();
  await page
    .getByRole("heading", { name: "Project update", exact: true })
    .waitFor();
  assert.equal(
    await page.locator(".email-rendered img, .email-rendered script").count(),
    0,
  );
  assert.equal(await page.evaluate(() => window.injected), undefined);
  await page.getByRole("button", { name: "Reply", exact: true }).click();
  const compose = page.getByRole("dialog", { name: "Compose email" });
  await compose.waitFor();
  assert.equal(
    await compose.getByLabel("To", { exact: true }).inputValue(),
    "colleague@example.test",
  );
  await compose
    .getByRole("textbox", { name: "Message body", exact: true })
    .fill("A browser-only fixture reply.");
  await compose
    .getByRole("button", { name: "Save draft", exact: true })
    .click();
  await compose
    .getByRole("heading", { name: "Edit draft", exact: true })
    .waitFor();
  assert.equal(providerWrites.at(-1).action, "draft");
  assert(providerWrites.at(-1).html.includes("browser-only fixture"));
  await compose.getByRole("button", { name: "Send", exact: true }).click();
  await compose.waitFor({ state: "hidden" });
  assert.equal(providerWrites.at(-1).action, "send");
  assert.equal(providerWrites.at(-1).draftId, "fixture-draft");
  await page.screenshot({
    path: screenshotDirectory + "/outlook-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Calendar", exact: true }).click();
  await page.getByRole("button", { name: /Fixture review/ }).waitFor();
  assert.equal(await page.locator(".calendar-day").count(), 42);
  await page
    .getByRole("combobox", { name: "Calendar view" })
    .selectOption("week");
  assert.equal(await page.locator(".calendar-day").count(), 7);
  await page
    .getByRole("combobox", { name: "Calendar view" })
    .selectOption("day");
  assert.equal(await page.locator(".calendar-day").count(), 1);
  await page.getByRole("button", { name: "New event", exact: true }).click();
  const eventDialog = page.getByRole("dialog", { name: "Calendar event" });
  await eventDialog
    .getByRole("textbox", { name: "Title", exact: true })
    .fill("Browser-only event");
  await eventDialog
    .getByRole("button", { name: "Save event", exact: true })
    .click();
  await eventDialog.waitFor({ state: "hidden" });
  assert.equal(providerWrites.at(-1).event.summary, "Browser-only event");
  await page.screenshot({
    path: screenshotDirectory + "/calendar-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("navigation", { name: "Applications" })
    .getByRole("link", { name: "Word", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "MailDesk Word.", exact: true })
    .waitFor();
  await page.screenshot({
    path: screenshotDirectory + "/word-mobile.png",
    fullPage: true,
  });
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    "Word workspace overflows the mobile viewport",
  );
  assert.deepEqual(errors, [], "Browser console errors");
  console.log(
    "PASS: five-app navigation, real Word/Excel/PowerPoint create/edit/save, failed-save recovery, PDF exports, history/AI panel, sanitized threads, reply draft/send, calendar views/event form, mobile Word layout. All provider writes were mocked.",
  );
} finally {
  await browser?.close();
  server?.kill("SIGTERM");
  if (created) {
    await rm(routeDirectory, { recursive: true, force: true });
    await assert.rejects(access(routeDirectory), { code: "ENOENT" });
  }
}
