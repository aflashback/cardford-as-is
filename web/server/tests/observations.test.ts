import assert from 'node:assert/strict';
import test from 'node:test';
import {createGame,fullDeck,apply,legalActions,actionId,type PrivateGame,type Seat,type Four,type Card} from '../game/index.ts';
import {observe,assertObservation,getMemory,type SeatObservation} from '../observations/index.ts';
import {chooseAction} from '../strategy/index.ts';
import {explain} from '../coaching/templates.ts';
function changeHidden(state:PrivateGame,seat:Seat):PrivateGame{const next=structuredClone(state);const others=([0,1,2,3] as Seat[]).filter(s=>s!==seat);const pool=others.flatMap(s=>state.hands[s]).reverse();let offset=0;for(const s of others){next.hands[s]=pool.slice(offset,offset+state.hands[s].length);offset+=state.hands[s].length;}return next;}
test('KNOW: complete equal-knowledge deals hide all opposing hands in bidding and pass',()=>{
 for(const mode of ['hearts','spades-solo','spades-partners'] as const)for(const seat of [0,1,2,3] as Seat[]){const state=createGame({id:'secret-id',mode,dealer:3},fullDeck());const alternate=changeHidden(state,seat);assert.equal(new Set(alternate.hands.flat()).size,52);assert.notDeepEqual(state.hands,alternate.hands);assert.deepEqual(observe(state,seat),observe(alternate,seat));assert.deepEqual(explain(observe(state,seat)),explain(observe(alternate,seat)));}
});
test('KNOW: moving hidden C2 holder before passing never leaks turn, leader, seed or identity',()=>{
 const state=createGame({id:'private-canary-id',mode:'hearts',dealer:3},fullDeck());const alternate=changeHidden(state,1);assert.notEqual(state.hands.findIndex(h=>h.includes('C2')),alternate.hands.findIndex(h=>h.includes('C2')));const obs=observe(state,1);assert.deepEqual(obs,observe(alternate,1));assert.equal(obs.turn,null);const encoded=JSON.stringify(obs);for(const key of ['private-canary-id','"hands"','"seed"','"passes"'])assert.equal(encoded.includes(key),false,key);
});
test('KNOW: explicit allowlist excludes injected private canaries and isolates mutations',()=>{
 const state=createGame({id:'secret',mode:'spades-solo',dealer:3},fullDeck());Object.assign(state,{secret:'CANARY'});Object.assign(state.events[0],{secret:'CANARY'});const obs=observe(state,0);assert.equal(JSON.stringify(obs).includes('CANARY'),false);obs.hand.pop();obs.events[0].message='mutated';assert.equal(state.hands[0].length,13);assert.notEqual(state.events[0].message,'mutated');
});
test('KNOW: strategy boundary rejects aggregate/unknown sensitive fields instead of stripping',()=>{
 const state=createGame({id:'secret',mode:'hearts',dealer:3},fullDeck());const obs=observe(state,0);assert.throws(()=>chooseAction(state as unknown as SeatObservation));assert.throws(()=>chooseAction({...obs,hands:state.hands} as SeatObservation));const nested=structuredClone(obs);Object.assign(nested.pass,{others:state.passes});assert.throws(()=>assertObservation(nested));
});
test('KNOW: pass observations expose only own outgoing/incoming knowledge and expire played holdings',()=>{
 const before=createGame({id:'pass',mode:'hearts',dealer:3},fullDeck());const passes=before.hands.map(h=>h.slice(0,3)) as Four<Card[]>;let state=apply(before,{kind:'pass-bundle',passes});
 for(const seat of [0,1,2,3] as Seat[]){const obs=observe(state,seat);assert.deepEqual(obs.pass.outgoing,passes[seat]);assert.deepEqual(obs.pass.incoming,passes[(seat+3)%4]);assert.deepEqual(obs.knownHoldings,passes[seat].map(card=>({seat:(seat+1)%4,card})));}
 const holder=state.turn!;const card='C2';const sender=((holder+3)%4) as Seat;assert.ok(observe(state,sender).knownHoldings.some(k=>k.card===card));state=apply(state,{kind:'play',seat:holder,card});assert.equal(observe(state,sender).knownHoldings.some(k=>k.card===card),false);
});
test('KNOW: public memory counts completed visible trick once and only follow failures prove voids',()=>{
 const trick=[{seat:0 as Seat,card:'C2'},{seat:1 as Seat,card:'C3'},{seat:2 as Seat,card:'D2'},{seat:3 as Seat,card:'CA'}];const memory=getMemory({history:[{winner:3,plays:trick}],trick});assert.deepEqual(memory,[{suit:'C',played:3,remaining:10,voidSeats:[2]},{suit:'D',played:1,remaining:12,voidSeats:[]},{suit:'H',played:0,remaining:13,voidSeats:[]},{suit:'S',played:0,remaining:13,voidSeats:[]}]);
});
test('KNOW: pass candidate reference set includes all 286 complete canonical triples',()=>{
 const state=createGame({id:'pass',mode:'hearts',dealer:3},fullDeck());for(const seat of [0,1,2,3] as Seat[]){const actions=legalActions(state,seat);assert.equal(actions.length,286);assert.equal(new Set(actions.map(actionId)).size,286);for(const action of actions){assert.equal(action.kind,'pass');if(action.kind==='pass'){assert.equal(action.cards.length,3);assert.ok(action.cards.every(c=>state.hands[seat].includes(c)));assert.equal(actionId({...action,cards:[...action.cards].reverse()}),actionId(action));}}}
});

test('KNOW: complete played information sets preserve observations, legal actions and policy',()=>{
 let state=createGame({id:'played',mode:'spades-partners',dealer:3},fullDeck());
 for(const seat of [0,1,2,3] as Seat[])state=apply(state,{kind:'bid',seat,bid:3});
 for(let n=0;n<3;n++){const action=chooseAction(observe(state,state.turn!));assert.equal(action.kind,'play');if(action.kind==='play')state=apply(state,action);}
 const actor=state.turn!;const alternate=structuredClone(state);const hidden=([0,1,2,3] as Seat[]).filter(s=>s!==actor);
 // Exchange same-suit unknown cards, preserving public void constraints and every hand size.
 const a=hidden[0],b=hidden[1];const ia=alternate.hands[a].findIndex(c=>c.startsWith('D'));const ib=alternate.hands[b].findIndex(c=>c.startsWith('D'));
 [alternate.hands[a][ia],alternate.hands[b][ib]]=[alternate.hands[b][ib],alternate.hands[a][ia]];
 assert.equal(new Set([...alternate.hands.flat(),...alternate.trick.map(p=>p.card)]).size,52);assert.notDeepEqual(state.hands,alternate.hands);
 assert.deepEqual(observe(state,actor),observe(alternate,actor));assert.deepEqual(chooseAction(observe(state,actor)),chooseAction(observe(alternate,actor)));assert.deepEqual(explain(observe(state,actor)),explain(observe(alternate,actor)));
});
