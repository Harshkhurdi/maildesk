import {
  Document,
  Packer,
  Paragraph,
  HeadingLevel,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import ExcelJS from "exceljs";
import PptxGenJS from "pptxgenjs";
import { DOMParser } from "@xmldom/xmldom";
import { readOfficeArchive } from "./office-archive.ts";
import {
  OFFICE_TYPES,
  type OfficeExtension,
  OFFICE_MAX_BYTES,
} from "./office-format.ts";
import type { FileContent, FileKind } from "./types";

export async function validateNativeFile(
  data: Uint8Array,
  extension: OfficeExtension,
) {
  if (data.byteLength > OFFICE_MAX_BYTES)
    throw Error("Office files must be smaller than 3 MB.");
  const zip = await readOfficeArchive(data, {
    maxBytes: OFFICE_MAX_BYTES,
    maxEntries: 4096,
    maxEntryBytes: 32_000_000,
    maxXmlBytes: 16_000_000,
    maxTotalBytes: 64_000_000,
  });
  const root = {
    docx: "word/document.xml",
    xlsx: "xl/workbook.xml",
    pptx: "ppt/presentation.xml",
  }[extension];
  if (!zip.file("[Content_Types].xml") || !zip.file(root))
    throw Error("The file contents do not match its Office extension.");
  if (Object.keys(zip.files).some((name) => /vbaProject|activeX\//i.test(name)))
    throw Error(
      "Macros and ActiveX controls are not supported. Save a macro-free Office copy.",
    );
  // Validate the root XML too; never make a corrupt archive an active document.
  const xml = await zip.file(root)!.async("string");
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw Error("Unsupported Office XML.");
  const doc = new DOMParser({
    onError: () => {
      throw Error("Invalid Office XML.");
    },
  }).parseFromString(xml, "application/xml");
  if (!doc.documentElement) throw Error("Invalid Office XML.");
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", Uint8Array.from(data)),
    ),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
}
export async function createNativeFile(
  kind: FileKind,
  title: string,
  content?: FileContent,
) {
  let data: Uint8Array;
  if (kind === "document") {
    const html =
      content?.html || `<h1>${title.replace(/[<>&]/g, "")}</h1><p></p>`;
    const dom = new DOMParser({ onError: () => {} }).parseFromString(
      `<body>${html.replace(/<br\s*>/gi, "<br/>").replace(/&nbsp;/g, "&#160;")}</body>`,
      "text/html",
    );
    function textRuns(
      node: Node,
      style: {
        bold?: boolean;
        italics?: boolean;
        underline?: Record<string, never>;
      } = {},
    ): TextRun[] {
      if (node.nodeType === 3)
        return [new TextRun({ text: node.textContent ?? "", ...style })];
      const tag = node.nodeName.toLowerCase();
      if (tag === "br") return [new TextRun({ break: 1 })];
      const next = {
        ...style,
        bold: style.bold || ["b", "strong"].includes(tag),
        italics: style.italics || ["i", "em"].includes(tag),
        underline: style.underline || (tag === "u" ? {} : undefined),
      };
      return Array.from(node.childNodes).flatMap((n) =>
        textRuns(n as unknown as Node, next),
      );
    }
    const children: (Paragraph | Table)[] = [];
    function blocks(node: Node) {
      for (const child of Array.from(node.childNodes)) {
        const el = child as unknown as Element,
          tag = el.nodeName.toLowerCase();
        if (tag === "table") {
          const rows = Array.from(el.getElementsByTagName("tr")).map(
            (row) =>
              new TableRow({
                children: Array.from(row.childNodes)
                  .filter((c) => /^(td|th)$/i.test(c.nodeName))
                  .map(
                    (cell) =>
                      new TableCell({
                        children: [
                          new Paragraph({
                            children: textRuns(cell as unknown as Node),
                          }),
                        ],
                      }),
                  ),
              }),
          );
          if (rows.length)
            children.push(
              new Table({
                rows,
                width: { size: 100, type: WidthType.PERCENTAGE },
              }),
            );
        } else if (/^(h[1-3]|p|li|blockquote)$/.test(tag)) {
          const heading = {
            h1: HeadingLevel.HEADING_1,
            h2: HeadingLevel.HEADING_2,
            h3: HeadingLevel.HEADING_3,
          }[tag];
          children.push(
            new Paragraph({
              heading,
              bullet: tag === "li" ? { level: 0 } : undefined,
              children: textRuns(el),
            }),
          );
        } else if (child.nodeType === 3 && child.textContent?.trim())
          children.push(new Paragraph({ text: child.textContent }));
        else blocks(child as unknown as Node);
      }
    }
    blocks(dom as unknown as Node);
    data = new Uint8Array(
      await (
        await Packer.toBlob(
          new Document({
            styles: {
              default: {
                document: {
                  run: { font: "Calibri", size: 22, color: "242424" },
                  paragraph: { spacing: { after: 160, line: 276 } },
                },
                heading1: {
                  run: {
                    font: "Calibri",
                    size: 40,
                    bold: true,
                    color: "185ABD",
                  },
                  paragraph: { spacing: { before: 240, after: 180 } },
                },
                heading2: {
                  run: {
                    font: "Calibri",
                    size: 28,
                    bold: true,
                    color: "185ABD",
                  },
                  paragraph: { spacing: { before: 220, after: 100 } },
                },
                heading3: {
                  run: {
                    font: "Calibri",
                    size: 24,
                    bold: true,
                    color: "424242",
                  },
                },
              },
            },
            sections: [
              { children: children.length ? children : [new Paragraph("")] },
            ],
          }),
        )
      ).arrayBuffer(),
    );
  } else if (kind === "sheet") {
    const book = new ExcelJS.Workbook(),
      sheet = book.addWorksheet("Sheet 1");
    sheet.properties.defaultColWidth = 18;
    sheet.properties.defaultRowHeight = 20;
    for (const [key, value] of Object.entries(content?.cells ?? {}))
      sheet.getCell(key).value = value.startsWith("=")
        ? { formula: value.slice(1) }
        : value.trim() !== "" && Number.isFinite(Number(value))
          ? Number(value)
          : value;
    book.calcProperties.fullCalcOnLoad = true;
    data = new Uint8Array(await book.xlsx.writeBuffer());
  } else {
    const deck = new PptxGenJS();
    deck.layout = "LAYOUT_WIDE";
    deck.title = title;
    for (const item of content?.slides ?? [
      { title, body: "", notes: "", color: "#1d5145" },
    ]) {
      const slide = deck.addSlide();
      slide.background = { color: item.color.slice(1) };
      slide.addText(item.title, {
        x: 0.7,
        y: 1,
        w: 12,
        h: 1.7,
        fontSize: 36,
        bold: true,
        color: "FFFFFF",
        fit: "shrink",
      });
      slide.addText(item.body, {
        x: 0.7,
        y: 3,
        w: 12,
        h: 3.6,
        fontSize: 22,
        color: "FFFFFF",
        fit: "shrink",
      });
      slide.addNotes(item.notes);
    }
    data = new Uint8Array(
      (await deck.write({ outputType: "arraybuffer" })) as ArrayBuffer,
    );
  }
  await validateNativeFile(data, OFFICE_TYPES[kind]);
  return data;
}

export async function createCsvWorkbook(text: string) {
  const { parseCsv } = await import("./csv.ts");
  const rows = parseCsv(text.replace(/^\uFEFF/, ""));
  if (
    rows.length > 5000 ||
    rows.some((row) => row.length > 100) ||
    rows.reduce((n, r) => n + r.length, 0) > 250_000
  )
    throw Error(
      "CSV imports support at most 5,000 rows, 100 columns and 250,000 cells.",
    );
  const book = new ExcelJS.Workbook(),
    sheet = book.addWorksheet("Imported data");
  // CSV is data: values starting with '=' are kept as text, never executed as formulas.
  rows.forEach((row) => sheet.addRow(row));
  const bytes = new Uint8Array(await book.xlsx.writeBuffer());
  await validateNativeFile(bytes, "xlsx");
  return bytes;
}
