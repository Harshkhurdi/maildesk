import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import {checkOfficeArchive} from '../lib/office-archive.ts';
test('archive validation rejects expansion bombs and path traversal before decompression',async()=>{
  const zip=new JSZip();zip.file('word/document.xml','a'.repeat(2_000_001));const bomb=await zip.generateAsync({type:'uint8array',compression:'DEFLATE'});assert.throws(()=>checkOfficeArchive(bomb),/safe import limit/);
  const traversal=new JSZip();traversal.file('../word/document.xml','x');
  const bytes=await traversal.generateAsync({type:'uint8array'});assert.throws(()=>checkOfficeArchive(bytes),/damaged/);
});
test('false ZIP size metadata cannot bypass streamed expansion limits',async()=>{
  const {readOfficeArchive}=await import('../lib/office-archive.ts');
  const zip=new JSZip();zip.file('word/document.xml','a'.repeat(2_000_001));const bytes=await zip.generateAsync({type:'uint8array',compression:'DEFLATE'}),view=new DataView(bytes.buffer);
  for(let p=0;p<bytes.length-46;p++)if(view.getUint32(p,true)===0x02014b50)view.setUint32(p+24,10,true);
  checkOfficeArchive(bytes);await assert.rejects(readOfficeArchive(bytes),/safe import limit/);
});
