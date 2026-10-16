import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import ExcelJS from 'exceljs';
import {Document,Packer,Paragraph,TextRun} from 'docx';
import PptxGenJS from 'pptxgenjs';
import {DOMParser} from '@xmldom/xmldom';
import {readOfficeFile} from '../lib/office-import.ts';
import {checkOfficeArchive} from '../lib/office-archive.ts';
globalThis.DOMParser=DOMParser;
const file=(name,bytes)=>new File([bytes],name);
const docBytes=()=>Packer.toBuffer(new Document({sections:[{children:[new Paragraph({children:[new TextRun('Hello '),new TextRun({text:'world',bold:true}),new TextRun(' with spaces')]}),new Paragraph('Second paragraph')]}]}));
test('DOCX keeps spaces across formatting runs, paragraph breaks, and source file unchanged',async()=>{
  const bytes=await docBytes(),original=Buffer.from(bytes),result=await readOfficeFile(file('Spacing.DOCX',bytes),'document');
  assert.equal(result.title,'Spacing');assert.match(result.content.html,/Hello <strong>world<\/strong> with spaces/);assert.match(result.content.html,/<\/p><p>Second paragraph/);assert.deepEqual(bytes,original);assert(result.warnings.length);
});
test('PPTX preserves declared slide order, title/body run spaces, notes and colors',async()=>{
  const deck=new PptxGenJS();deck.layout='LAYOUT_WIDE';
  for(const title of ['First slide','Second slide']){const slide=deck.addSlide();slide.background={color:'23344E'};slide.addText(title,{x:1,y:1,w:5,h:1,fontSize:34});slide.addText([{text:'Hello '},{text:'world',options:{bold:true}},{text:' with spaces'}],{x:1,y:3,w:5,h:1,fontSize:20});slide.addNotes('Private speaker notes');}
  const bytes=await deck.write({outputType:'nodebuffer'}),result=await readOfficeFile(file('Slides.pptx',bytes),'slides');
  assert.deepEqual(result.content.slides.map(s=>s.title),['First slide','Second slide']);assert.equal(result.content.slides[0].body,'Hello world with spaces');assert.match(result.content.slides[0].notes,/Private speaker notes/);assert.equal(result.content.slides[0].color.toLowerCase(),'#23344e');
});
test('XLSX opens first worksheet, formulas and dense positions without shifting leading blanks',async()=>{
  const book=new ExcelJS.Workbook(),sheet=book.addWorksheet('First');sheet.getCell('B5').value='Hello world';sheet.getCell('A1').value={formula:'SUM(A2:A3)',result:30};sheet.getCell('A2').value=10;sheet.getCell('A3').value=20;book.addWorksheet('Other').getCell('A1').value='not first';
  const result=await readOfficeFile(file('Numbers.xlsx',await book.xlsx.writeBuffer()),'sheet');assert.equal(result.content.cells.B5,'Hello world');assert.equal(result.content.cells.A1,'=SUM(A2:A3)');assert.equal(result.content.cells.A3,'20');assert.match(result.warnings[0],/first worksheet/);
});
test('CSV quotes and plain text spacing remain intact',async()=>{
  const csv=await readOfficeFile(file('Table.csv','"Hello, world",30\n"two words",40'),'sheet');assert.equal(csv.content.cells.A1,'Hello, world');assert.equal(csv.content.cells.A2,'two words');
  const text=await readOfficeFile(file('Notes.txt','Hello  world\n\nA < B & C'),'document');assert.equal(text.content.html,'<p>Hello  world</p><p><br></p><p>A &lt; B &amp; C</p>');
});
test('legacy, wrong-format, damaged, oversized and overflowing files fail before opening',async()=>{
  await assert.rejects(readOfficeFile(file('old.doc','fixture'),'document'),/older Office/);
  await assert.rejects(readOfficeFile(file('slides.pptx','broken'),'slides'),/damaged/);
  await assert.rejects(readOfficeFile(file('file.csv','a'.repeat(1_000_001)),'sheet'),/smaller/);
  await assert.rejects(readOfficeFile(file('file.csv',Array(501).fill('a').join('\n')),'sheet'),/500 rows/);
  await assert.rejects(readOfficeFile(file('file.docx','not zip'),'sheet'),/Choose/);
});
test('archive validation rejects expansion bombs and path traversal before decompression',async()=>{
  const zip=new JSZip();zip.file('word/document.xml','a'.repeat(2_000_001));const bomb=await zip.generateAsync({type:'uint8array',compression:'DEFLATE'});assert.throws(()=>checkOfficeArchive(bomb),/safe import limit/);
  const traversal=new JSZip();traversal.file('../word/document.xml','x');
  const bytes=await traversal.generateAsync({type:'uint8array'});assert.throws(()=>checkOfficeArchive(bytes),/damaged/);
});
test('XML entities and external slide references never access outside files',async()=>{
  const zip=new JSZip();zip.file('word/document.xml','<!DOCTYPE x [<!ENTITY test SYSTEM "file:///secret">]><w:document xmlns:w="urn:w"><w:body><w:p>&test;</w:p></w:body></w:document>');await assert.rejects(readOfficeFile(file('External.docx',await zip.generateAsync({type:'uint8array'})),'document'),/unsupported XML/);
});
test('false ZIP size metadata cannot bypass streamed expansion limits',async()=>{
  const {readOfficeArchive}=await import('../lib/office-archive.ts');
  const zip=new JSZip();zip.file('word/document.xml','a'.repeat(2_000_001));const bytes=await zip.generateAsync({type:'uint8array',compression:'DEFLATE'}),view=new DataView(bytes.buffer);
  for(let p=0;p<bytes.length-46;p++)if(view.getUint32(p,true)===0x02014b50)view.setUint32(p+24,10,true);
  checkOfficeArchive(bytes);await assert.rejects(readOfficeArchive(bytes),/safe import limit/);
});
