export type PdfPoint = [number, number];
export type PdfMarkup = { id: string; page: number; color: string } & (
  | { type: "highlight"; box: [number, number, number, number] }
  | { type: "ink"; points: PdfPoint[] }
  | { type: "note"; point: PdfPoint; text: string }
);
export function pdfBox(
  a: PdfPoint,
  b: PdfPoint,
): [number, number, number, number] {
  return [
    Math.min(a[0], b[0]),
    Math.min(a[1], b[1]),
    Math.max(a[0], b[0]),
    Math.max(a[1], b[1]),
  ];
}
export async function markedPdfCopy(bytes: Uint8Array, markups: PdfMarkup[]) {
  const { PDFDocument, PDFHexString, rgb } = await import("pdf-lib");
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  for (const markup of markups) {
    const page = doc.getPage(markup.page - 1);
    const hex = markup.color.replace("#", "");
    const values = [0, 2, 4].map(
      (at) => parseInt(hex.slice(at, at + 2), 16) / 255,
    );
    const color = rgb(values[0], values[1], values[2]);
    if (markup.type === "highlight") {
      const [x1, y1, x2, y2] = markup.box;
      page.drawRectangle({
        x: x1,
        y: y1,
        width: x2 - x1,
        height: y2 - y1,
        color,
        opacity: 0.3,
      });
    } else if (markup.type === "ink") {
      for (let i = 1; i < markup.points.length; i++)
        page.drawLine({
          start: { x: markup.points[i - 1][0], y: markup.points[i - 1][1] },
          end: { x: markup.points[i][0], y: markup.points[i][1] },
          thickness: 1.8,
          color,
          opacity: 0.95,
        });
    } else {
      const [x, y] = markup.point;
      const ref = doc.context.register(
        doc.context.obj({
          Type: "Annot",
          Subtype: "Text",
          Rect: [x, y - 18, x + 18, y],
          Contents: PDFHexString.fromText(markup.text),
          T: PDFHexString.fromText("MailDesk"),
          Name: "Comment",
          C: [1, 0.8, 0.1],
          Open: false,
          F: 4,
        }),
      );
      page.node.addAnnot(ref);
    }
  }
  return Uint8Array.from(await doc.save());
}
