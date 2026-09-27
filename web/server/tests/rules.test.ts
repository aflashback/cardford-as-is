import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {scoreCompetitor} from '../game/spades/score.ts';
import {scoreHearts} from '../game/hearts/score.ts';
import {createGame,legalActions,apply,collectTrick,nextHand,fullDeck,matchWinner,trickWinner,type PrivateGame,type Mode,type Seat,type Card,type Four} from '../game/index.ts';
import {observe} from '../observations/index.ts';
import {chooseAction} from '../strategy/index.ts';
const modes:Mode[]=['hearts','spades-solo','spades-partners'];
const position=(mode:Mode='hearts'):PrivateGame=>({...createGame({id:'rules',mode,dealer:3},fullDeck()),phase:'play',turn:0,hands:[[],[],[],[]],bids:[3,3,3,3]});
const legal=(game:PrivateGame)=>legalActions(game,0).flatMap(a=>a.kind==='play'?[a.card]:[]);
function shuffled(seed:number):Card[]{const deck=fullDeck();let n=seed;for(let i=51;i>0;i--){n=(Math.imul(n,1664525)+1013904223)>>>0;const j=n%(i+1);[deck[i],deck[j]]=[deck[j],deck[i]];}return deck;}
function finish(initial:PrivateGame):PrivateGame{
 let state=initial;
 for(let step=0;step<80&&!['hand-end','match-end'].includes(state.phase);step++){
  const previous=structuredClone(state);
  if(state.phase==='pass'){const passes=[0,1,2,3].map(s=>{const a=chooseAction(observe(state,s as Seat));assert.equal(a.kind,'pass');return a.kind==='pass'?a.cards:[];}) as Four<Card[]>;state=apply(state,{kind:'pass-bundle',passes});}
  else if(state.phase==='trick-end')state=collectTrick(state);
  else {assert.notEqual(state.turn,null);const a=chooseAction(observe(state,state.turn!));assert.notEqual(a.kind,'pass');if(a.kind!=='pass')state=apply(state,a);}
  assert.deepEqual(initial.id,state.id);assert.notStrictEqual(previous,state);
  // Completed tricks are visible in both history and table: account for that display once.
  const cards=[...state.hands.flat(),...state.history.flatMap(t=>t.plays.map(p=>p.card)),...(state.phase==='trick-end'?[]:state.trick.map(p=>p.card))];
  assert.equal(cards.length,52);assert.equal(new Set(cards).size,52);
 }
 assert.ok(['hand-end','match-end'].includes(state.phase));return state;
}
test('RULE: all 12 original scoring goldens and exact failed Nil regression',()=>{
 const fixtures=JSON.parse(readFileSync(new URL('../../../examples/scoring-golden.json',import.meta.url),'utf8')) as {cases:{id:string;bids:number[];tricks:number[];oldBags:number;oldScore:number;expected:{delta:number;newBags:number;newScore:number}}[]};
 for(const c of fixtures.cases){const r=scoreCompetitor(c);assert.deepEqual(r,{delta:c.expected.delta,bags:c.expected.newBags},c.id);assert.equal(c.oldScore+r.delta,c.expected.newScore,c.id);}
 assert.deepEqual(scoreCompetitor({bids:[4,0],tricks:[3,1],oldBags:9}),{delta:-240,bags:0});
 assert.deepEqual(scoreCompetitor({bids:[0],tricks:[2],oldBags:9}),{delta:-200,bags:1});
 assert.deepEqual(scoreCompetitor({bids:[4],tricks:[5],oldBags:0}),{delta:41,bags:1});
});
test('RULE: 52-card deal is injected and invalid duplicates/modes/seats fail',()=>{
 for(const mode of modes){const config={id:'opaque-independent-id',mode,dealer:3 as Seat};const s=createGame(config,fullDeck());assert.deepEqual(s.hands.map(h=>h.length),[13,13,13,13]);assert.equal(new Set(s.hands.flat()).size,52);assert.deepEqual(createGame(config,fullDeck()),s);assert.equal('seed' in s,false);}
 assert.throws(()=>createGame({id:'x',mode:'unknown' as Mode,dealer:3},fullDeck()));assert.throws(()=>createGame({id:'x',mode:'hearts',dealer:4 as Seat},fullDeck()));assert.throws(()=>createGame({id:'x',mode:'hearts',dealer:3},Array(52).fill('C2')));
});
test('RULE: Hearts first trick forces clubs, follows suit, excludes avoidable points',()=>{
 const s=position();s.hands[0]=['C2','CA','H2'];assert.deepEqual(legal(s),['C2']);
 s.trick=[{seat:3,card:'C2'}];s.hands[0]=['SQ','H2','D3'];assert.deepEqual(legal(s),['D3']);
 s.hands[0]=['SQ','H2'];assert.deepEqual(legal(s),['H2','SQ']);s.trick=[{seat:3,card:'S2'}];s.hands[0]=['SQ','H2','C3'];assert.deepEqual(legal(s),['SQ']);
});
test('RULE: suit restrictions and queen does not break Hearts; Spades permits first-trick trump',()=>{
 for(const mode of modes){const s=position(mode);s.history=[{winner:1,plays:[]}];const suit=mode==='hearts'?'H':'S';s.hands[0]=[`${suit}2`,'D3'];assert.deepEqual(legal(s),['D3']);s.hands[0]=[`${suit}2`,`${suit}A`];assert.equal(legal(s).length,2);}
 const h=position();h.history=[{winner:1,plays:[]}];h.hands[0]=['SQ'];assert.equal(apply(h,{kind:'play',seat:0,card:'SQ'}).heartsBroken,false);
 const s=position('spades-solo');s.trick=[{seat:3,card:'CA'}];s.hands[0]=['SA','D2'];assert.deepEqual(legal(s),['D2','SA']);assert.equal(apply(s,{kind:'play',seat:0,card:'SA'}).spadesBroken,true);
});
test('RULE: illegal action/seat/phase leaves state immutable',()=>{
 const s=position('spades-solo');s.hands[0]=['C2','SA'];s.trick=[{seat:3,card:'C3'}];const copy=structuredClone(s);
 for(const a of [{kind:'play',seat:0,card:'SA'},{kind:'play',seat:1,card:'C2'},{kind:'bid',seat:0,bid:3}] as const)assert.throws(()=>apply(s,a));assert.throws(()=>collectTrick(s));assert.throws(()=>nextHand(s,fullDeck()));assert.deepEqual(s,copy);apply(s,{kind:'play',seat:0,card:'C2'});assert.deepEqual(s,copy);
});
test('RULE: fourth play resolves once while collection changes only display phase',()=>{
 let s=position('spades-solo');s.turn=3;s.hands[3]=['C3'];s.trick=[{seat:0,card:'C2'},{seat:1,card:'CA'},{seat:2,card:'CK'}];s=apply(s,{kind:'play',seat:3,card:'C3'});
 assert.equal(s.phase,'trick-end');assert.equal(s.history.length,1);assert.deepEqual(s.tricks,[0,1,0,0]);assert.equal(s.trick.length,4);const collected=collectTrick(s);assert.deepEqual(collected.tricks,s.tricks);assert.deepEqual(collected.history,s.history);assert.equal(collected.turn,1);assert.equal(collected.phase,'play');assert.throws(()=>collectTrick(collected));
});
test('RULE: Hearts point/moon arithmetic and all-mode tied terminal cases',()=>{
 const penalty=fullDeck().filter(c=>c.startsWith('H')||c==='SQ').map(card=>({seat:0 as Seat,card}));assert.deepEqual(scoreHearts([{winner:1,plays:penalty}]),[26,0,26,26]);assert.deepEqual(scoreHearts([{winner:1,plays:penalty.slice(0,13)},{winner:2,plays:penalty.slice(13)}]),[0,13,13,0]);
 assert.equal(matchWinner('hearts',[100,20,20,80]),undefined);assert.equal(matchWinner('hearts',[100,20,30,80]),1);assert.equal(matchWinner('spades-solo',[500,500,0,0]),undefined);assert.equal(matchWinner('spades-solo',[500,490,0,0]),0);assert.equal(matchWinner('spades-partners',[500,500,500,500]),undefined);assert.equal(matchWinner('spades-partners',[500,480,500,480]),0);
});
test('RULE: bids 0–13 ordered and rejected fractions',()=>{
 let s=createGame({id:'bids',mode:'spades-solo',dealer:3},fullDeck());assert.equal(legalActions(s,0).length,14);for(const bid of [-1,14,1.2,NaN])assert.throws(()=>apply(s,{kind:'bid',seat:0,bid}));for(const bid of [0,13,13,4])s=apply(s,{kind:'bid',seat:s.turn!,bid});assert.equal(s.phase,'play');assert.equal(s.turn,0);
});
test('RULE: pass direction, all-seat memory, atomic exchange and invalid-pass immutability',()=>{
 for(const [direction,offset] of [['left',1],['right',3],['across',2]] as const){const s=createGame({id:'pass',mode:'hearts',dealer:3},fullDeck());s.passDirection=direction;const passes=s.hands.map(h=>h.slice(0,3)) as Four<Card[]>;const before=structuredClone(s);const after=apply(s,{kind:'pass-bundle',passes});assert.deepEqual(s,before);for(const seat of [0,1,2,3] as Seat[]){assert.ok(passes[seat].every(c=>after.hands[(seat+offset)%4].includes(c)));assert.deepEqual(after.passes[seat].outgoing,passes[seat]);assert.deepEqual(after.passes[seat].incoming,passes[(seat+4-offset)%4]);}assert.equal(new Set(after.hands.flat()).size,52);assert.ok(after.hands[after.turn!].includes('C2'));passes[1]=['C2','C2','C2'];assert.throws(()=>apply(s,{kind:'pass-bundle',passes}));assert.deepEqual(s,before);}
});
test('RULE: 90 fixed-seed complete hands conserve cards, terminate, and score exactly once',()=>{
 for(const mode of modes)for(let seed=1;seed<=30;seed++){try{const s=finish(createGame({id:`${mode}-${seed}`,mode,dealer:seed%4 as Seat},shuffled(seed)));assert.equal(s.history.length,13);assert.equal(s.tricks.reduce((a,b)=>a+b,0),13);assert.equal(s.events.filter(e=>e.type==='hand-scored').length,1);assert.deepEqual(s.hands,[[],[],[],[]]);}catch(error){throw new Error(`Failure seed=${seed}, mode=${mode}`,{cause:error});}}
});
test('RULE: dealer/pass cycle rotates without resetting totals',()=>{
 let s=createGame({id:'cycle',mode:'hearts',dealer:3},shuffled(15));for(const direction of ['right','across','hold','left']){s=finish(s);s.phase='hand-end';const previous=s;s=nextHand(s,shuffled(s.handNumber+20));assert.equal(s.passDirection,direction);assert.equal(s.dealer,(previous.dealer+1)%4);assert.deepEqual(s.scores,previous.scores);assert.equal(s.phase,direction==='hold'?'play':'pass');}
});
test('RULE: Hearts led suit beats off-suit; Spades highest trump wins',()=>{const plays=[{seat:0 as Seat,card:'H10'},{seat:1 as Seat,card:'HA'},{seat:2 as Seat,card:'S2'},{seat:3 as Seat,card:'SA'}];assert.equal(trickWinner(plays,'hearts'),1);assert.equal(trickWinner(plays,'spades-solo'),3);});
