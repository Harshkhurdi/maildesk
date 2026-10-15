export async function readXlsx(bytes: ArrayBuffer) {
  const {default: ExcelJS} = await import("exceljs");
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(bytes);
  const sheet = book.worksheets[0];
  if (!sheet) throw new Error("Workbook has no sheets.");
  if (sheet.rowCount > 500 || sheet.columnCount > 26) {
    throw new Error("Use at most 500 rows and 26 columns. Nothing has been imported.");
  }
  const table: string[][] = Array.from({length: sheet.rowCount}, () => []);
  sheet.eachRow((row, i) => {
    row.eachCell((cell, j) => {
      table[i - 1][j - 1] = cell.formula ? "=" + cell.formula : cell.text;
    });
  });
  return table;
}
