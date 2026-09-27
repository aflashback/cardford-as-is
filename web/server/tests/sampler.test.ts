import assert from 'node:assert/strict';
import test from 'node:test';
import {createGame,fullDeck,apply,collectTrick,cardSuit,type PrivateGame,type Seat,type Four,type Card} from '../game/index.ts';
import {observe,assertObservation,type SeatObservation} from '../observations/index.ts';
import {chooseAction} from '../strategy/index.ts';
import {sampleWorld,SampleUnavailableError} from '../strategy/sampler.ts';
function lateGame():PrivateGame{
 let state=createGame({id:'sampler',mode:'spades-solo',dealer:3},fullDeck());
 for(let i=0;i<90;i++){if(state.phase==='play'&&!state.trick.length&&state.history.length===12)return state;if(state.phase==='trick-end')state=collectTrick(state);else{const action=chooseAction(observe(state,state.turn!));if(action.kind==='pass')throw new Error('Unexpected pass');state=apply(state,action);}}
 throw new Error('Late fixture did not terminate.');
}
function feasible(state:PrivateGame,obs:SeatObservation){
 assert.deepEqual(state.hands.map(h=>h.length),obs.handSizes);assert.deepEqual(state.hands[obs.seat],obs.hand);const played=new Set([...obs.history.flatMap(t=>t.plays.map(p=>p.card)),...obs.trick.map(p=>p.card)]);const all=[...state.hands.flat(),...played];assert.equal(all.length,52);assert.equal(new Set(all).size,52);
 for(const m of obs.memory)for(const seat of m.voidSeats)assert.equal(state.hands[seat].some(c=>cardSuit(c)===m.suit),false);
 for(const known of obs.knownHoldings)assert.ok(state.hands[known.seat].includes(known.card));
}
test('SAMPLE: seed reproduces uniform feasible world and never mutates observation',()=>{const obs=observe(createGame({id:'sampler',mode:'spades-solo',dealer:3},fullDeck()),0);const before=structuredClone(obs);const a=sampleWorld(obs,12);assert.deepEqual(a,sampleWorld(obs,12));feasible(a,obs);assert.deepEqual(obs,before);assert.notEqual(a.id,'sampler');});
test('SAMPLE: known voids, public plays, own cards and all hand sizes constrain every sample',()=>{const state=lateGame();const obs=observe(state,state.turn!);for(let seed=0;seed<64;seed++)feasible(sampleWorld(obs,seed),obs);});
test('SAMPLE: own outgoing pass ownership survives sampling until public play',()=>{let state=createGame({id:'hearts',mode:'hearts',dealer:3},fullDeck());const passes=state.hands.map(h=>h.slice(0,3)) as Four<Card[]>;state=apply(state,{kind:'pass-bundle',passes});const obs=observe(state,0);assert.equal(obs.knownHoldings.length,3);for(let seed=0;seed<20;seed++)feasible(sampleWorld(obs,seed),obs);});
test('SAMPLE: frequencies agree with exhaustive tiny-state assignments',()=>{
 const state=lateGame(),obs=observe(state,state.turn!);const hidden=([0,1,2,3] as Seat[]).filter(s=>s!==obs.seat);const cards=hidden.flatMap(s=>state.hands[s]);assert.equal(cards.length,3);
 const exact=new Set<string>();for(const a of cards)for(const b of cards)for(const c of cards){if(new Set([a,b,c]).size!==3)continue;const proposal=[a,b,c];if(proposal.some((card,i)=>obs.memory.some(m=>m.suit===cardSuit(card)&&m.voidSeats.includes(hidden[i]))))continue;exact.add(proposal.join(','));}
 assert.ok(exact.size>1,'reference contains real uncertainty');const counts=new Map([...exact].map(key=>[key,0]));const n=6000;
 for(let seed=0;seed<n;seed++){const sample=sampleWorld(obs,seed);const key=hidden.map(s=>sample.hands[s][0]).join(',');assert.ok(exact.has(key));counts.set(key,counts.get(key)!+1);}
 const expected=n/exact.size;for(const [key,count] of counts)assert.ok(Math.abs(count-expected)<expected*0.13,`${key}: ${count}, uniform reference ${expected}; seeds 0..5999`);
});
test('SAMPLE: inconsistent observations and invalid seed fail explicitly',()=>{const obs=observe(lateGame(),0);const bad=structuredClone(obs);bad.handSizes[1]++;assert.throws(()=>sampleWorld(bad,1),SampleUnavailableError);assert.throws(()=>sampleWorld(obs,-1),/uint32/);assert.throws(()=>sampleWorld(obs,NaN),/uint32/);});
test('BOUNDARY: sensitive nested fields and malformed scalar/range/version data are rejected',()=>{
 const obs=observe(createGame({id:'shape',mode:'hearts',dealer:3},fullDeck()),0);
 const mutate:((o:SeatObservation)=>void)[]=[o=>Object.assign(o,{hands:[]}),o=>Object.assign(o.pass,{seed:99}),o=>Object.assign(o.events[0],{privatePasses:[]}),o=>Object.assign(o.memory[0],{otherHand:[]}),o=>Object.assign(o.legalActions[0],{privateState:{}}),o=>{o.hand[0]='bad';},o=>{o.handSizes[0]=99;},o=>{o.bids[1]=1.5;},o=>{o.bags[2]=-1;},o=>{o.scores[0]=Infinity;},o=>{o.moduleVersion='9' as '1.0.0';},o=>{o.legalActions.pop();},o=>{o.memory[0].voidSeats=[4 as Seat];},o=>{o.turn=0;}];
 for(const mutation of mutate){const bad=structuredClone(obs);mutation(bad);assert.throws(()=>assertObservation(bad));}
 const played=observe(lateGame(),0);for(const mutate of [(o:SeatObservation)=>Object.assign(o.history[0],{hands:[]}),(o:SeatObservation)=>Object.assign(o.history[0].plays[0],{seed:0}),(o:SeatObservation)=>{o.history[0].winner=9 as Seat;}]){const bad=structuredClone(played);mutate(bad);assert.throws(()=>assertObservation(bad));}
});


test('SAMPLE: public unbroken Spades lead proves the leader has only spades left',()=>{
 const state=createGame({id:'restriction',mode:'spades-solo',dealer:3},fullDeck());
 // A legal reduced information set: first leader held all spades, everyone else an entire side suit.
 state.hands=[fullDeck().filter(c=>c[0]==='S'),fullDeck().filter(c=>c[0]==='C'),fullDeck().filter(c=>c[0]==='D'),fullDeck().filter(c=>c[0]==='H')];state.phase='play';state.turn=0;state.bids=[3,3,3,3];
 const led=apply(state,{kind:'play',seat:0,card:'S2'});const obs=observe(led,1);
 for(let seed=0;seed<20;seed++){const sampled=sampleWorld(obs,seed);assert.ok(sampled.hands[0].every(c=>c[0]==='S'));feasible(sampled,obs);}
 // The leader now needs 13 spades although only 12 unplayed spades remain: infeasible.
 const impossible=structuredClone(obs);impossible.handSizes[0]=13;impossible.handSizes[2]=12;
 assert.throws(()=>sampleWorld(impossible,1),(error:unknown)=>error instanceof SampleUnavailableError&&error.reason==='impossible');
});
