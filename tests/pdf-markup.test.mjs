import test from "node:test";
import assert from "node:assert/strict";
import { PDFDocument, PDFName, PDFDict, PDFHexString } from "pdf-lib";
import { pdfBox, markedPdfCopy } from "../lib/pdf-markup.ts";
test("PDF markups preserve original pages and forms, with portable Unicode sticky notes", async () => {
  const doc = await PDFDocument.create();
  doc.addPage([400, 500]);
  doc.addPage([400, 500]).drawText("Second page remains");
  const form = doc.getForm();
  form.createTextField("Name").setText("Guest reader");
  const checkbox = form.createCheckBox("Approved");
  checkbox.addToPage(doc.getPage(0), { x: 10, y: 10, width: 15, height: 15 });
  checkbox.check();
  const original = Uint8Array.from(await doc.save()),
    before = Buffer.from(original);
  const copy = await markedPdfCopy(original, [
    {
      id: "h",
      page: 1,
      type: "highlight",
      box: [20, 30, 140, 50],
      color: "#ffdf32",
    },
    {
      id: "i",
      page: 2,
      type: "ink",
      points: [
        [20, 30],
        [40, 60],
        [80, 40],
      ],
      color: "#185abd",
    },
    {
      id: "n",
      page: 1,
      type: "note",
      point: [70, 100],
      text: "Review this — café ✓",
      color: "#ffd75e",
    },
  ]);
  assert.deepEqual(Buffer.from(original), before);
  const reopened = await PDFDocument.load(copy);
  assert.equal(reopened.getPageCount(), 2);
  assert.equal(
    reopened.getForm().getTextField("Name").getText(),
    "Guest reader",
  );
  assert.equal(reopened.getForm().getCheckBox("Approved").isChecked(), true);
  const notes = reopened.getPage(0).node.Annots();
  assert.equal(notes.size(), 2);
  const note = notes.lookup(1, PDFDict);
  assert.equal(note.get(PDFName.of("Subtype")).toString(), "/Text");
  assert.equal(
    note.lookup(PDFName.of("Contents"), PDFHexString).decodeText(),
    "Review this — café ✓",
  );
  assert(reopened.getPage(0).node.Contents());
  assert(reopened.getPage(1).node.Contents());
  assert.equal(
    (await PDFDocument.load(original)).getPage(0).node.Annots().size(),
    1,
  );
});
test("PDF area highlights normalize drag direction and reject unreadable exports", async () => {
  assert.deepEqual(pdfBox([100, 20], [10, 80]), [10, 20, 100, 80]);
  await assert.rejects(markedPdfCopy(new Uint8Array([1, 2, 3]), []));
});
