import test from 'node:test';
import assert from 'node:assert/strict';
import {parseJsonObject} from '../lib/request-json.ts';
test('accepts an object for subsequent field validation',()=>assert.deepEqual(parseJsonObject('{"id":"qa"}'),{id:'qa'}));
test('rejects null, arrays, scalar values, and malformed JSON before handlers access fields',()=>{
  for(const input of ['null','[]','"text"','12','false','{']) assert.throws(()=>parseJsonObject(input),SyntaxError);
});
