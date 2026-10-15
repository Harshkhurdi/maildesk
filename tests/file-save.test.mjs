import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeSavedFile} from '../lib/file-save.ts';
const original={id:'draft:qa',title:'Original',taskId:null,mailId:null,kind:'document',content:'{}',revision:0,createdAt:'old',updatedAt:'old'};
const saved={...original,id:'saved-qa',revision:1,updatedAt:'new'};
test('save completion adopts persistent identity while preserving newer title and link edits',()=>{
  const current={...original,title:'Typed during save',taskId:'new-task',mailId:'new-email'};
  const merged=mergeSavedFile(current,original.id,saved);assert.equal(merged.id,'saved-qa');assert.equal(merged.revision,1);assert.equal(merged.title,'Typed during save');assert.equal(merged.taskId,'new-task');assert.equal(merged.mailId,'new-email');
});
test('a response from a previous editor cannot replace a different or closed draft',()=>{
  const other={...original,id:'other'};assert.equal(mergeSavedFile(other,original.id,saved),other);assert.equal(mergeSavedFile(null,original.id,saved),null);
});
