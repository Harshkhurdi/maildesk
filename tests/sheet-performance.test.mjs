import test from 'node:test';
import assert from 'node:assert/strict';
import {cellValue,createSheetCalculator} from '../lib/sheet.ts';

test('shared dependencies are calculated once instead of branching exponentially',()=>{
  let reads=0;
  const values={A1:'1'};
  for(let i=2;i<=35;i++)values[`A${i}`]=`=A${i-1}+A${i-1}`;
  const cells=new Proxy(values,{get(target,key){reads++;return target[key];}});
  assert.equal(cellValue('A35',cells),2**34);
  assert.equal(reads,35);
});

test('an explicit snapshot calculator shares results across different output cells',()=>{
  let reads=0;
  const cells=new Proxy({A1:'5',A2:'=A1+1',A3:'=A2+A1'},{get(target,key){reads++;return target[key];}});
  const calculate=createSheetCalculator(cells);
  assert.equal(calculate('A2'),6);
  assert.equal(calculate('A3'),11);
  assert.equal(reads,3);
});

test('independent cellValue calls observe a mutated input map',()=>{
  const cells={A1:'1',A2:'=A1+A1'};
  assert.equal(cellValue('A2',cells),2);
  cells.A1='9';
  assert.equal(cellValue('A2',cells),18);
});

test('aggregate direct references ignore blanks and text consistently with ranges',()=>{
  const cells={A2:'text',A3:'10',A4:'20'};
  for(const [formula,expected] of [
    ['COUNT(A1)',0],['COUNT(A2)',0],['COUNT(A1:A2)',0],
    ['SUM(A1,A2,A3,A4)',30],['SUM(A1:A4)',30],
    ['AVERAGE(A1,A2,A3,A4)',15],['AVERAGE(A1:A4)',15],
    ['MIN(A1,A2,A3,A4)',10],['MAX(A1,A2,A3,A4)',20],
    ['SUM(A2)',0],['AVERAGE(A1)','#DIV/0!'],
    ['MIN(A1:A2)',0],['MAX(A1:A2)',0],['MIN()',0],['MAX()',0],
    ['COUNT(A1+0)',1],['SUM(A2+0)','#VALUE!'],
  ])assert.equal(cellValue('B1',{...cells,B1:'='+formula}),expected,formula);
});

test('absolute and mixed references work for arithmetic and aggregate ranges',()=>{
  const cells={A1:'3',A2:'7'};
  for(const formula of ['=$A$1+A$2','=SUM($A1:A$2)','=SUM($A$1,$A$2)','=AVERAGE(A$1:$A2)*2']) {
    assert.equal(cellValue('B1',{...cells,B1:formula}),10,formula);
  }
  assert.equal(cellValue('B1',{B1:'=A0'}),'#REF!');
});

test('cycles and referenced calculation errors propagate through cached aggregates',()=>{
  assert.equal(cellValue('A1',{A1:'=SUM(A2,A2)',A2:'=A1'}),'#CYCLE!');
  assert.equal(cellValue('A1',{A1:'=COUNT(A2)',A2:'=1/0'}),'#DIV/0!');
});

test('depth limits stay distinct from cycles and do not poison shallower lookups',()=>{
  const cells={A1:'1'};
  for(let i=2;i<=83;i++)cells[`A${i}`]=`=A${i-1}+1`;
  const calculate=createSheetCalculator(cells);
  assert.equal(calculate('A83'),'#LIMIT!');
  assert.equal(calculate('A3'),3);
  assert.equal(calculate('A83'),83);
  const cycle=createSheetCalculator({A1:'=A2',A2:'=A1'});
  assert.equal(cycle('A1'),'#CYCLE!');
  assert.equal(cycle('A2'),'#CYCLE!');
});

test('bounded operation budget prevents repeated large ranges freezing the editor',()=>{
  const calculate=createSheetCalculator({A1:'=SUM('+Array(11).fill('B1:B5000').join(',')+')',C1:'=2+3'});
  assert.equal(calculate('A1'),'#LIMIT!');
  assert.equal(calculate('C1'),5);
});

test('a full supported range remains valid within the operation budget',()=>{
  assert.equal(cellValue('A1',{A1:'=SUM(B1:B5000)',B1:'2',B5000:'3'}),5);
});
