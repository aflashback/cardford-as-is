// Offline fixture integrity. Does not launch a browser or test rendered geometry.
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import assert from 'node:assert/strict';
const source=readFileSync(new URL('./coach-replay-data.ts',import.meta.url),'utf8');
const code=stripTypeScriptTypes(source);
const {replayLessons,selectionLessons}=await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
const rank=card=>({J:11,Q:12,K:13,A:14}[card.slice(1)]||Number(card.slice(1)));
const winner=(plays,game)=>{
 const suit=game==='spades'&&plays.some(p=>p.card[0]==='S')?'S':plays[0].card[0];
 return plays.filter(p=>p.card[0]===suit).reduce((a,b)=>rank(a.card)>rank(b.card)?a:b).seat;
};
let frames=0;
for(const [group,lessons] of Object.entries({play:replayLessons,selection:selectionLessons})){
 for(const [game,list] of Object.entries(lessons)){
  assert.equal(new Set(list.map(f=>f.round)).size,2,`${game}/${group}: two rounds`);
  for(const frame of list){
   frames++;
   const visible=[...frame.hand,...frame.plays.map(p=>p.card)];
   assert(visible.every(c=>/^[CDHS](10|[2-9JQKA])$/.test(c)),`${game}: valid card IDs`);
   assert.equal(new Set(visible).size,visible.length,`${game}: no duplicate visible cards`);
   assert((frame.selected||[]).every(c=>frame.hand.includes(c)),`${game}: selected cards in hand`);
   assert((frame.focusCards||[]).every(c=>visible.includes(c)),`${game}: focus cards visible`);
   assert((frame.doubled||[]).every(c=>frame.hand.includes(c)),`${game}: announcements retain hand cards`);
   assert.equal(new Set(frame.plays.map(p=>p.seat)).size,frame.plays.length,`${game}: unique public seats`);
   assert.equal(frame.remaining[0],frame.hand.length,`${game}: own remaining count`);
   assert(frame.caption.split(/\s+/).length<=18,`${game}: short captions`);
   if(frame.plays.length){
    assert.equal(frame.winner,winner(frame.plays,game),`${game}: winning public card on top`);
    const order=game==='trix'?[3,2,1,0]:[1,2,3,0];
    assert.deepEqual(frame.plays.map(p=>p.seat),order.slice(0,frame.plays.length),`${game}: turn order`);
    const lead=frame.plays[0].card[0];
    if(frame.selected?.length&&frame.hand.some(c=>c[0]===lead))assert(frame.selected.every(c=>c[0]===lead),`${game}: follows suit`);
   }
   if(frame.phase==='pass')assert.equal(frame.hand.length,13,'Passing keeps thirteen until exchange');
   if(frame.phase==='double')assert((frame.selected||[]).every(c=>frame.moment.startsWith('Queens')?c.slice(1)==='Q':c==='HK'),'Request-specific doubling eligibility');
  }
 }
}
const pass=selectionLessons.hearts;
assert.deepEqual(pass[1].selected,['HQ','HK','SA']);
assert.deepEqual(pass[2].hand.filter(c=>!pass[0].hand.includes(c)),['C10','D10','S10']);
assert(pass[1].selected.every(c=>!pass[2].hand.includes(c)));
console.log(`PASS: ${frames} authored replay frames; five lessons; two rounds each; public winners, turn order, selection and pass exchange.`);
