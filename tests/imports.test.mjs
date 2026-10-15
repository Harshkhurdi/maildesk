import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import {readXlsx} from '../lib/xlsx-import.ts';
import {readCodeBackup} from '../lib/code-backup.ts';
async function workbook(cell,value) {const book=new ExcelJS.Workbook();book.addWorksheet('Test').getCell(cell).value=value;return book.xlsx.writeBuffer();}
test('XLSX leading blank rows remain dense and preserve original cell locations',async()=>{
  const table=await readXlsx(await workbook('B5','kept'));assert.equal(table.length,5);assert.deepEqual(table[0],[]);assert.equal(table[4][1],'kept');assert.equal(Math.max(12,...table.map(row=>row.length)),12);
});
test('XLSX formulas survive import',async()=>{
  const table=await readXlsx(await workbook('A1',{formula:'SUM(B1:B2)',result:30}));assert.equal(table[0][0],'=SUM(B1:B2)');
});
test('XLSX row and column overflow are rejected instead of silently truncating',async()=>{
  for(const cell of ['A501','AA1'])await assert.rejects(readXlsx(await workbook(cell,'must-not-disappear')),/Nothing has been imported/);
});
test('project backup shape is recognized independently of a downloaded file name',()=>{
  assert.deepEqual(readCodeBackup(JSON.stringify({title:'Renamed backup',files:[{name:'index.html',content:'<h1>kept</h1>'}]})),{title:'Renamed backup',files:[{name:'index.html',content:'<h1>kept</h1>'}]});
});
test('malformed, duplicate, oversized, and unsafe backup entries are rejected',()=>{
  const fixtures=[null,{}, {title:'',files:[{name:'a.js',content:''}]}, {title:'test',files:[null]}, {title:'test',files:[{name:'../file',content:''}]}, {title:'test',files:[{name:'a.js',content:''},{name:'a.js',content:''}]}, {title:'test',files:[{name:'a.js',content:'x'.repeat(850001)}]}];for(const fixture of fixtures)assert.equal(readCodeBackup(JSON.stringify(fixture)),null);assert.equal(readCodeBackup('{broken'),null);
});
test('valid saved project backups larger than a single source file limit remain recoverable',()=>{
  const backup={title:'Large saved backup',files:[{name:'first.txt',content:'a'.repeat(440000)},{name:'second.txt',content:'b'.repeat(440000)}]};
  const serialized=JSON.stringify(backup,null,2);assert(serialized.length>850000);assert(serialized.length<1500000);assert.deepEqual(readCodeBackup(serialized),backup);
});
