// Narrow offline proof for a discovered case, using Jason's packet only.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
const record=JSON.parse(readFileSync(new URL('records/solo-spread.json',import.meta.url),'utf8'));
function facts(p) {
  const tricks=[...p.completedTricks.map(t=>t.plays),p.currentTrick];
  const played=tricks.flat();
  const known=new Set([...played.map(x=>x.card),...p.hand]);
  const voids=new Set();
  for(const t of tricks) {
    const maya=t.find(x=>x.seat===0);
    if(maya && maya.card[0]!==t[0].card[0]) voids.add(t[0].card[0]);
  }
  const ranks=['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
  const allSpadesAccounted=ranks.every(r=>known.has('S'+r));
  const mayaRemaining=13-played.filter(x=>x.seat===0).length;
  const heartsOutsidePacket=ranks.filter(r=>!known.has('H'+r)).length;
  const onlyHearts=voids.has('C') && voids.has('D') && allSpadesAccounted && mayaRemaining>0;
  const ownsAllRemainingHearts=onlyHearts && heartsOutsidePacket===mayaRemaining;
  return {voidClubs:voids.has('C'),voidDiamonds:voids.has('D'),allSpadesAccounted,mayaRemaining,heartsOutsidePacket,onlyHearts,ownsAllRemainingHearts};
}
const at31=record.decisions.find(d=>d.seq===31);
const at23=record.decisions.find(d=>d.seq===23);
assert.equal(at31.packet.seat,2); assert.equal(at23.packet.seat,2);
const proven=facts(at31.packet);
assert.equal(proven.ownsAllRemainingHearts,true);
assert.deepEqual(at31.packet.currentTrick,[{seat:0,card:'SA'},{seat:1,card:'S8'}]);
assert.deepEqual(at31.packet.legalActions,['play:S9']);
// Maya's ace wins the current trick; Jason must spend the only unplayed outside trump.
// She then leads all remaining hearts, while every other player lacks hearts and spades.
const earlier=facts(at23.packet);
assert.equal(earlier.ownsAllRemainingHearts,false);
const result={status:'passed',sourceEpisode:'solo-spread',sourceDecision:31,input:'Jason own hand plus public history only',proof:proven,earlierDecision:23,earlierProof:earlier,conclusion:'After Jason follows with S9, Maya leads and wins all six remaining tricks. Jason cannot later win with either queen.',scope:'Specific fact-check, not a general solver or a runtime policy change.'};
writeFileSync(new URL('records/public-proof.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
