import test from 'node:test';
import assert from 'node:assert/strict';
import {conversationPollDelay} from '../lib/conversation-poll.ts';
test('failed conversation polls slow down, remain bounded and recover to responsive polling',()=>{
  assert.deepEqual([0,1,2,3,4,5,100].map(conversationPollDelay),[1100,2200,4400,8800,15000,15000,15000]);
  assert(conversationPollDelay(100)<45000,'retry must fit inside the call heartbeat expiry');
  let failures=0;const requests=[false,false,false,true,true,false],delays=[];
  for(const success of requests){failures=success?0:failures+1;delays.push(conversationPollDelay(failures));}
  assert.deepEqual(delays,[2200,4400,8800,1100,1100,2200]);
});
