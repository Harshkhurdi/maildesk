import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  PDFDocument,
  PDFName,
  PDFDict,
  PDFHexString,
  PDFString,
} from "pdf-lib";
export async function checkPdfWorkspace(page, base, screenshots) {
  const doc = await PDFDocument.create(),
    first = doc.addPage([612, 792]),
    second = doc.addPage([612, 792]);
  first.drawText("PDF workspace search example", { x: 45, y: 720, size: 20 });
  second.drawText("Another search example on page two", {
    x: 45,
    y: 720,
    size: 18,
  });
  const form = doc.getForm(),
    name = form.createTextField("Reader name");
  name.addToPage(first, { x: 45, y: 600, width: 250, height: 30 });
  const approved = form.createCheckBox("Approved");
  approved.addToPage(first, { x: 45, y: 550, width: 20, height: 20 });
  const root = doc.context.obj({ Type: "Outlines", Count: 1 }),
    rootRef = doc.context.register(root),
    child = doc.context.register(
      doc.context.obj({
        Title: PDFString.of("Page two bookmark"),
        Parent: rootRef,
        Dest: [second.ref, "Fit"],
      }),
    );
  root.set(PDFName.of("First"), child);
  root.set(PDFName.of("Last"), child);
  doc.catalog.set(PDFName.of("Outlines"), rootRef);
  const bytes = Buffer.from(await doc.save());
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(base + "/pdf");
  await page.getByRole("heading", { name: /Your documents/ }).waitFor();
  await page.getByLabel("Choose a PDF file").setInputFiles({
    name: "Reader fixture.pdf",
    mimeType: "application/pdf",
    buffer: bytes,
  });
  const rendered = async () => {
    await page.getByRole("img", { name: /PDF page/ }).waitFor();
    await page.locator(".pdf-rendering").waitFor({ state: "hidden" });
    await page.locator(".textLayer span").first().waitFor();
  };
  await rendered();
  assert.equal(
    await page.getByRole("button", { name: /^Go to page \d+$/ }).count(),
    2,
  );
  await page
    .getByRole("button", { name: "Next PDF page", exact: true })
    .click();
  await page.waitForFunction(
    () =>
      document.querySelector('[aria-label="PDF page number"]').value === "2",
  );
  await rendered();
  await page
    .getByRole("button", { name: "Previous PDF page", exact: true })
    .click();
  await rendered();
  await page.getByRole("combobox", { name: "PDF zoom" }).selectOption("1.5");
  await rendered();
  await page.getByRole("button", { name: "Rotate PDF clockwise" }).click();
  await rendered();
  for (let n = 0; n < 3; n++) {
    await page.getByRole("button", { name: "Rotate PDF clockwise" }).click();
    await rendered();
  }
  await page.getByRole("combobox", { name: "PDF zoom" }).selectOption("fit");
  await rendered();
  await page.getByRole("button", { name: "Bookmarks", exact: true }).click();
  await page
    .getByRole("button", { name: "Page two bookmark", exact: true })
    .click();
  await page.waitForFunction(
    () =>
      document.querySelector('[aria-label="PDF page number"]').value === "2",
  );
  await rendered();
  await page.getByRole("button", { name: "Search PDF text" }).click();
  await page
    .getByRole("textbox", { name: "Search within PDF" })
    .fill("search example");
  await page
    .getByRole("status")
    .filter({ hasText: "2 matches on 2 pages" })
    .waitFor();
  await page.locator(".pdf-search-result").first().click();
  await rendered();
  await page.getByRole("button", { name: "Toggle PDF sidebar" }).click();
  await rendered();
  await page
    .getByRole("textbox", { name: "Reader name", exact: true })
    .fill("Guest reader");
  await page.getByRole("checkbox", { name: "Approved", exact: true }).check();
  const layer = page.getByLabel("PDF markup layer"),
    box = await layer.boundingBox();
  assert(box);
  await page
    .getByRole("button", { name: "Highlight PDF", exact: true })
    .click();
  await page.mouse.move(box.x + 60, box.y + 100);
  await page.mouse.down();
  await page.mouse.move(box.x + 240, box.y + 122);
  await page.mouse.up();
  assert.equal(await layer.locator("rect").count(), 1);
  await page.getByRole("button", { name: "Draw on PDF" }).click();
  await page.mouse.move(box.x + 70, box.y + 160);
  await page.mouse.down();
  await page.mouse.move(box.x + 90, box.y + 170);
  await page.mouse.move(box.x + 120, box.y + 155);
  await page.mouse.up();
  assert.equal(await layer.locator("polyline").count(), 1);
  await page.getByRole("button", { name: "Undo PDF markup" }).click();
  assert.equal(await layer.locator("polyline").count(), 0);
  await page.getByRole("button", { name: "Redo PDF markup" }).click();
  assert.equal(await layer.locator("polyline").count(), 1);
  await page.getByRole("button", { name: "Add PDF note", exact: true }).click();
  await page.mouse.click(box.x + 140, box.y + 210);
  const dialog = page.getByRole("dialog", {
    name: "Add PDF note",
    exact: true,
  });
  await dialog
    .getByRole("textbox", { name: "PDF note text" })
    .fill("Review café — guest ✓");
  await dialog.getByRole("button", { name: "Add note", exact: true }).click();
  await page
    .locator(".pdf-comments-panel")
    .getByText("Review café — guest ✓", { exact: true })
    .first()
    .waitFor();
  await page.screenshot({
    path: screenshots + "/pdf-desktop.png",
    fullPage: true,
  });
  const originalEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "More PDF actions" }).click();
  await page.getByRole("button", { name: "Download PDF", exact: true }).click();
  assert.deepEqual(await readFile(await (await originalEvent).path()), bytes);
  const savedEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download marked PDF" }).click();
  const exported = await readFile(await (await savedEvent).path()),
    copy = await PDFDocument.load(exported);
  assert.equal(
    copy.getForm().getTextField("Reader name").getText(),
    "Guest reader",
  );
  assert.equal(copy.getForm().getCheckBox("Approved").isChecked(), true);
  const annots = copy.getPage(0).node.Annots();
  const notes = Array.from({ length: annots.size() }, (_, i) =>
    annots.lookup(i, PDFDict),
  ).filter((a) => a.get(PDFName.of("Subtype")).toString() === "/Text");
  assert.equal(notes.length, 1);
  assert.equal(
    notes[0].lookup(PDFName.of("Contents"), PDFHexString).decodeText(),
    "Review café — guest ✓",
  );
  await page.getByRole("button", { name: "Close PDF comments" }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: screenshots + "/pdf-mobile.png",
    fullPage: true,
  });
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    "PDF workspace overflows mobile viewport",
  );
  await page.getByRole("button", { name: "More PDF actions" }).click();
  await page.getByRole("button", { name: "Close PDF", exact: true }).click();
  await page.getByRole("heading", { name: /Your documents/ }).waitFor();
  await page.getByLabel("Choose a PDF file").setInputFiles({
    name: "Broken.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("bad data"),
  });
  await page
    .getByRole("alert")
    .filter({ hasText: "Choose a readable PDF file" })
    .waitFor();
  console.log(
    "PASS: browser-only PDF 2-page navigation/bookmarks/search, forms, markups, undo/redo, original and portable marked exports, mobile layout and invalid-file feedback.",
  );
}
