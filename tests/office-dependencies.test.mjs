import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import PptxGenJS from 'pptxgenjs';
import JSZip from 'jszip';

test('Excel export keeps conditional-format identifiers and formula results after dependency updates', async () => {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet('Sheet 1');
  sheet.getCell('A1').value = 10;
  sheet.getCell('A2').value = 20;
  sheet.getCell('B1').value = {formula: 'SUM(A1:A2)', result: 30};
  sheet.addConditionalFormatting({
    ref: 'A1:A2',
    rules: [{type: 'iconSet', iconSet: '3Stars', cfvo: [
      {type: 'percent', value: 0},
      {type: 'percent', value: 33},
      {type: 'percent', value: 67},
    ]}],
  });
  const bytes = await book.xlsx.writeBuffer();
  const archive = await JSZip.loadAsync(bytes);
  const xml = await archive.file('xl/worksheets/sheet1.xml').async('string');
  assert.match(xml, /x14:cfRule/);
  assert.match(xml, /\{[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}\}/);
  const restored = new ExcelJS.Workbook();
  await restored.xlsx.load(bytes);
  assert.equal(restored.getWorksheet(1).getCell('A2').value, 20);
  assert.equal(restored.getWorksheet(1).getCell('B1').formula, 'SUM(A1:A2)');
  assert.equal(restored.getWorksheet(1).getCell('B1').result, 30);
});

test('PowerPoint export retains text, notes and embedded images after dependency updates', async () => {
  const deck = new PptxGenJS();
  const slide = deck.addSlide();
  slide.addText('Dependency compatibility', {x: 1, y: 1, w: 6, h: 1});
  slide.addNotes('Preserve these speaker notes.');
  slide.addImage({
    data: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j1ioAAAAASUVORK5CYII=',
    x: 1, y: 3, w: 1, h: 1,
  });
  const archive = await JSZip.loadAsync(await deck.write({outputType: 'nodebuffer'}));
  assert.match(await archive.file('ppt/slides/slide1.xml').async('string'), /Dependency compatibility/);
  assert.match(await archive.file('ppt/notesSlides/notesSlide1.xml').async('string'), /Preserve these speaker notes/);
  const images = Object.values(archive.files).filter(file => /^ppt\/media\/.*\.png$/.test(file.name));
  assert.equal(images.length, 1);
  assert((await images[0].async('uint8array')).length > 0);
});
