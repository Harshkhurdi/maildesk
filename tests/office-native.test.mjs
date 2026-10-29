import test from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import ExcelJS from "exceljs";
import {
  createNativeFile,
  createCsvWorkbook,
  validateNativeFile,
} from "../lib/office-native.ts";
import {
  OFFICE_MAX_BYTES,
  inspectNativeFile,
  readLimited,
} from "../lib/office-security.ts";
test("new Word, Excel and PowerPoint files are native valid OOXML archives", async () => {
  for (const [kind, ext, root] of [
    ["document", "docx", "word/document.xml"],
    ["sheet", "xlsx", "xl/workbook.xml"],
    ["slides", "pptx", "ppt/presentation.xml"],
  ]) {
    const bytes = await createNativeFile(kind, "Native fixture");
    assert.match(await validateNativeFile(bytes, ext), /^[0-9a-f]{64}$/);
    const zip = await JSZip.loadAsync(bytes);
    assert(zip.file(root));
    assert(zip.file("[Content_Types].xml"));
  }
});
test("converting a legacy Word file preserves its table, heading, and emphasis", async () => {
  const bytes = await createNativeFile("document", "Legacy", {
    html: "<h1>Heading</h1><p><strong>Bold</strong> and <em>italic</em></p><table><tr><td>Item</td><td>Amount</td></tr><tr><td>Test</td><td>42</td></tr></table>",
  });
  const xml = await (
    await JSZip.loadAsync(bytes)
  )
    .file("word/document.xml")
    .async("string");
  assert.match(xml, /w:tbl/);
  assert.match(xml, /Heading1/);
  assert.match(xml, /w:b/);
  assert.match(xml, /w:i/);
  assert.match(xml, /Amount/);
  assert.match(xml, />42</);
});
test("legacy workbook conversion keeps formulas, absolute references and numeric values", async () => {
  const bytes = await createNativeFile("sheet", "Budget", {
    cells: { A1: "10", A2: "20", B1: "=SUM(A1:A2)", B2: "=$A$1*2", C1: "Text" },
  });
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(bytes);
  const sheet = book.getWorksheet(1);
  assert.equal(sheet.getCell("B1").formula, "SUM(A1:A2)");
  assert.equal(sheet.getCell("B2").formula, "$A$1*2");
  assert.equal(sheet.getCell("A2").value, 20);
  assert.equal(sheet.getCell("C1").value, "Text");
});
test("legacy slides retain their order, backgrounds and speaker notes", async () => {
  const bytes = await createNativeFile("slides", "Deck", {
    slides: [
      {
        title: "First",
        body: "Content",
        notes: "Private notes",
        color: "#123456",
      },
      { title: "Second", body: "More", notes: "", color: "#445566" },
    ],
  });
  const zip = await JSZip.loadAsync(bytes);
  assert.match(
    await zip.file("ppt/slides/slide1.xml").async("string"),
    /First/,
  );
  assert.match(
    await zip.file("ppt/slides/slide2.xml").async("string"),
    /Second/,
  );
  assert.match(
    await zip.file("ppt/notesSlides/notesSlide1.xml").async("string"),
    /Private notes/,
  );
  assert.match(
    await zip.file("ppt/slides/slide1.xml").async("string"),
    /123456/,
  );
});
test("Office validation rejects wrong formats, oversized files, macros and invalid XML", async () => {
  const bytes = await createNativeFile("document", "Safe");
  await assert.rejects(validateNativeFile(bytes, "xlsx"), /extension/);
  await assert.rejects(
    validateNativeFile(new Uint8Array(OFFICE_MAX_BYTES + 1), "docx"),
    /3 MB/,
  );
  const zip = await JSZip.loadAsync(bytes);
  zip.file("word/vbaProject.bin", "macro");
  await assert.rejects(
    validateNativeFile(await zip.generateAsync({ type: "nodebuffer" }), "docx"),
    /Macros/,
  );
  zip.remove("word/vbaProject.bin");
  zip.file("word/document.xml", '<!DOCTYPE x [<!ENTITY y "z">]><x/>');
  await assert.rejects(
    validateNativeFile(await zip.generateAsync({ type: "nodebuffer" }), "docx"),
    /XML/,
  );
});
test("server inspection checks native directories without expanding content", async () => {
  const bytes = await createNativeFile("document", "Safe");
  assert.match(inspectNativeFile(bytes, "docx"), /^[a-f0-9]{64}$/);
  assert.throws(() => inspectNativeFile(bytes, "xlsx"), /extension/);
  const zip = await JSZip.loadAsync(bytes);
  zip.file("word/vbaProject.bin", "macro");
  const macro = await zip.generateAsync({ type: "uint8array" });
  assert.throws(() => inspectNativeFile(macro, "docx"), /macro-free/);
});
test("streaming limits reject both declared and undeclared oversized downloads", async () => {
  await assert.rejects(
    readLimited(
      new Response("ok", { headers: { "content-length": "100" } }),
      10,
    ),
    /limit/,
  );
  await assert.rejects(readLimited(new Response("x".repeat(100)), 10), /limit/);
  assert.equal(
    (await readLimited(new Response("native"), 10)).toString(),
    "native",
  );
});
test("native workbook validation supports large multi-sheet files without flattening formulas or formatting", async () => {
  const book = new ExcelJS.Workbook(),
    data = book.addWorksheet("Data"),
    summary = book.addWorksheet("Summary");
  for (let row = 1; row <= 10_000; row++)
    data.addRow([
      row,
      "Project " + row,
      row * 10,
      row % 7,
      "Region " + (row % 5),
      row * 3,
    ]);
  summary.getCell("A1").value = {
    formula: "SUM(Data!C1:C10000)",
    result: 500050000,
  };
  summary.getCell("B1").value = "Summary";
  summary.getCell("B1").font = { bold: true };
  data.views = [{ state: "frozen", ySplit: 1 }];
  const bytes = Buffer.from(await book.xlsx.writeBuffer());
  assert(bytes.length < OFFICE_MAX_BYTES);
  assert.match(await validateNativeFile(bytes, "xlsx"), /^[a-f0-9]{64}$/);
  const restored = new ExcelJS.Workbook();
  await restored.xlsx.load(bytes);
  assert.equal(restored.worksheets.length, 2);
  assert.equal(restored.getWorksheet("Data").getCell("C10000").value, 100000);
  assert.equal(
    restored.getWorksheet("Summary").getCell("A1").formula,
    "SUM(Data!C1:C10000)",
  );
  assert.equal(restored.getWorksheet("Summary").getCell("B1").font.bold, true);
});

test("CSV imports preserve quotes/newlines and keep formula-like fields as inert text", async () => {
  const bytes = await createCsvWorkbook(
    '"Item, one",Value\n"two\nlines","=SUM(A1:A2)"',
  );
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(bytes);
  assert.equal(book.getWorksheet(1).getCell("A1").value, "Item, one");
  assert.equal(book.getWorksheet(1).getCell("A2").value, "two\nlines");
  assert.equal(book.getWorksheet(1).getCell("B2").value, "=SUM(A1:A2)");
  assert.equal(book.getWorksheet(1).getCell("B2").formula, undefined);
});
