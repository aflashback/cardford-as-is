import assert from 'node:assert/strict';
import test from 'node:test';
import {createLifecycle,reduceLifecycle,canResumeLifecycle,pauseReasonText,remainingRetention} from '../src/table/sessionLifecycle.ts';

test('recovering connectivity clears the blocker but preserves the interruption and Resume latch',()=>{
  let state=createLifecycle('game-a');
  state=reduceLifecycle(state,{type:'interrupt',reason:'connection_lost'});
  const ticket=state.epoch;
  state=reduceLifecycle(state,{type:'blockersChanged',blockers:[]});
  assert.equal(state.requiresResume,true);
  assert.equal(state.reason,'connection_lost');
  assert.equal(canResumeLifecycle(state,ticket),true);
  assert.match(pauseReasonText(state.reason,'live'),/Connection restored/);
});

test('away during Resume retires the response even after the blocker clears',()=>{
  let state=createLifecycle('game-a');
  const epoch=state.epoch;
  state=reduceLifecycle(state,{type:'resumeStarted',epoch});
  state=reduceLifecycle(state,{type:'interrupt',reason:'away'});
  state=reduceLifecycle(state,{type:'blockersChanged',blockers:[]});
  state=reduceLifecycle(state,{type:'resumeConfirmed',epoch,gameId:'game-a'});
  assert.equal(state.requiresResume,true);
  assert.equal(canResumeLifecycle(state,epoch),false);
});

test('overlapping temporary surfaces release only after the last hold closes and never clear interruption',()=>{
  let state=createLifecycle('game-a');
  state=reduceLifecycle(state,{type:'resumeConfirmed',epoch:state.epoch,gameId:'game-a'});
  state=reduceLifecycle(state,{type:'holdAdded',cause:'why'});
  state=reduceLifecycle(state,{type:'holdAdded',cause:'settings'});
  state=reduceLifecycle(state,{type:'holdRemoved',cause:'settings'});
  assert.deepEqual(state.holds,['why']);
  state=reduceLifecycle(state,{type:'interrupt',reason:'away'});
  state=reduceLifecycle(state,{type:'holdRemoved',cause:'why'});
  assert.equal(state.requiresResume,true);
  assert.equal(state.reason,'away');
});

test('server views cannot auto-resume, regress generations or resurrect expired games',()=>{
  let state=createLifecycle('game-a');
  state=reduceLifecycle(state,{type:'serverView',gameId:'game-a',generation:4,phase:'paused',reason:'idle'});
  state=reduceLifecycle(state,{type:'serverView',gameId:'game-a',generation:3,phase:'running',reason:null});
  assert.equal(state.generation,4);
  assert.equal(state.requiresResume,true);
  state=reduceLifecycle(state,{type:'serverView',gameId:'game-a',generation:5,phase:'expired',reason:null});
  state=reduceLifecycle(state,{type:'resumeConfirmed',epoch:state.epoch,gameId:'game-a'});
  assert.equal(state.expired,true);
  assert.equal(state.requiresResume,true);
  state=reduceLifecycle(state,{type:'gameReplaced',gameId:'game-b'});
  state=reduceLifecycle(state,{type:'serverView',gameId:'game-a',generation:99,phase:'running',reason:null});
  assert.equal(state.gameId,'game-b');
  assert.equal(state.requiresResume,true);
});

test('reason priority explains connectivity over away and layout while active blockers prevent Resume',()=>{
  let state=createLifecycle('game-a');
  state=reduceLifecycle(state,{type:'interrupt',reason:'away'});
  state=reduceLifecycle(state,{type:'interrupt',reason:'layout_unavailable'});
  state=reduceLifecycle(state,{type:'interrupt',reason:'connection_lost'});
  state=reduceLifecycle(state,{type:'blockersChanged',blockers:['layout_unavailable']});
  assert.equal(state.reason,'connection_lost');
  assert.equal(canResumeLifecycle(state,state.epoch),false);
});

test('retention display advances from server time and elapsed monotonic time without inventing a deadline',()=>{
  assert.equal(remainingRetention(null,null,50),null);
  assert.equal(remainingRetention('2026-10-15T12:05:00Z','2026-10-15T12:00:00Z',30_000),270);
  assert.equal(remainingRetention('2026-10-15T12:05:00Z','2026-10-15T12:00:00Z',999_999),0);
});

test('an active offline blocker overrides a stale live or HTTP transport status in pause copy',()=>{
  for(const status of ['live','http'])assert.equal(pauseReasonText('connection_lost',status,false),'Connection lost — play is paused on this device');
  assert.equal(pauseReasonText('connection_lost','live',true),'Connection restored — Resume when ready');
  assert.equal(pauseReasonText('connection_lost','recovering',true),'Connection lost — play is paused on this device');
});
