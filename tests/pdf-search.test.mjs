import test from 'node:test';
import assert from 'node:assert/strict';
import {pdfPageText,pdfSearchMatch} from '../lib/pdf-search.ts';

test('phrase searches match across PDF line endings before and after a page is visited',()=>{
  const items=[{str:'Please submit',hasEOL:true},{str:'the form',hasEOL:true},{str:'Please submit the form',hasEOL:false}];
  const renderedPage=pdfPageText(items);
  const unvisitedPage=items.map(item=>item.str+' ').join('');
  assert.match(renderedPage,/submit\nthe/);
  assert.equal(pdfSearchMatch(renderedPage,'submit the form').count,2);
  assert.deepEqual(pdfSearchMatch(renderedPage,'submit the form'),pdfSearchMatch(unvisitedPage,'submit the form'));
});

test('phrase whitespace is normalized in both the query and page text',()=>{
  const match=pdfSearchMatch('A\tclear\u00a0next\nstep. A clear next step.','  CLEAR   next\nstep ');
  assert.equal(match.count,2);
  assert.doesNotMatch(match.snippet,/[\n\t\u00a0]/);
});

test('empty, scanned, and marked-content-only pages have no false matches',()=>{
  assert.equal(pdfSearchMatch(pdfPageText([{type:'beginMarkedContent'},null]),'form'),null);
  assert.equal(pdfSearchMatch('anything',' \n\t '),null);
  assert.equal(pdfSearchMatch('No match here','form'),null);
});

test('reading text keeps its original line breaks while search snippets remain compact',()=>{
  const text=pdfPageText([{str:'First line',hasEOL:true},{str:'Second line',hasEOL:true}]);
  assert.equal(text,'First line\nSecond line\n');
  assert.equal(pdfSearchMatch(text,'first line second line').snippet,'First line Second line');
});
