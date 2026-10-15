import test from 'node:test';
import assert from 'node:assert/strict';
import {validateFileContent} from '../lib/file-content.ts';
test('the entire visible 500 by 26 grid can be saved',()=>{
  const cells={};for(let r=1;r<=500;r++)for(let c=0;c<26;c++)cells[String.fromCharCode(65+c)+r]='1';
  const result=validateFileContent('sheet',JSON.stringify({cells,rows:500,cols:26}));
  assert.equal(Object.keys(JSON.parse(result).cells).length,13000);
});
test('valid CSV imports over the old 5000 cell ceiling remain saveable',()=>{
  const cells={};for(let r=1;r<=193;r++)for(let c=0;c<26;c++)cells[String.fromCharCode(65+c)+r]='value';
  assert.notEqual(validateFileContent('sheet',JSON.stringify({cells,rows:193,cols:26})),null);
});
test('hidden cells and invalid grid bounds are rejected',()=>{
  for(const value of [{cells:{B1:'hidden'},rows:1,cols:1},{cells:{A2:'hidden'},rows:1,cols:1},{cells:{AA1:'hidden'},rows:500,cols:26},{cells:{A501:'hidden'},rows:500,cols:26},{cells:{},rows:501,cols:26}])assert.equal(validateFileContent('sheet',JSON.stringify(value)),null);
});
test('documents and presentations retain their content limits',()=>{
  assert.notEqual(validateFileContent('document',JSON.stringify({html:'<p>text</p>'})),null);
  assert.equal(validateFileContent('document',JSON.stringify({html:'a'.repeat(500001)})),null);
  assert.equal(validateFileContent('slides',JSON.stringify({slides:[]})),null);
  assert.notEqual(validateFileContent('slides',JSON.stringify({slides:[{title:'Title',body:'Body',notes:'Notes',color:'#1d5145'}]})),null);
  assert.equal(validateFileContent('invalid','{}'),null);assert.equal(validateFileContent('sheet','invalid'),null);
});
