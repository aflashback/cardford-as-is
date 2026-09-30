// Offline evidence integrity; deliberately reports incomplete planned episodes.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
const url = p => new URL(p, import.meta.url);
const read = p => JSON.parse(readFileSync(url(p), 'utf8'));
const hash = x => createHash('sha256').update(typeof x === 'string' ? x : JSON.stringify(x)).digest('hex');
const config = read('deals.json');
const episodes = [];
for (const fixture of config.episodes) {
  const path = `records/${fixture.id}.json`;
  if (!existsSync(url(path))) { episodes.push({episodeId:fixture.id,status:'not-run',decisions:0}); continue; }
  const record = read(path);
  assert.equal(record.dealHash, hash(fixture));
  assert.equal(record.jevCalls, 0);
  for (const [index,d] of record.decisions.entries()) {
    assert.equal(d.seq,index+1);
    assert.equal(hash(d.rawResponse),d.responseHash);
    assert.equal(hash(d.packet),d.packetHash);
    assert.equal(hash(d.deliveryText),d.deliveryHash);
    const match = /^(BID: (?:[0-9]|1[0-3])|PLAY: [CDHS](?:[2-9JQKA]|10))\r?\n\r?\n([^\r\n]+)$/.exec(d.rawResponse.trim());
    assert.ok(match);
    assert.equal(match[2],d.justification);
    const words=d.justification.trim().split(/\s+/).length;
    assert.ok(words>=15 && words<=100);
    assert.equal(match[1],d.action.kind==='bid'?`BID: ${d.action.bid}`:`PLAY: ${d.action.card}`);
    assert.equal(d.seat,d.packet.seat); assert.equal(d.seat,d.action.seat);
    assert.equal(d.name,d.packet.name);
    assert.ok(d.agent.endsWith('_'+d.name.toLowerCase()));
    assert.equal(d.forced,d.packet.legalActions.length===1);
  }
  const complete=['hand-end','match-end'].includes(record.result.phase);
  const summary={episodeId:fixture.id,status:complete?'passed':'incomplete',decisions:record.decisions.length,rejected:record.rejections.length,forced:record.decisions.filter(d=>d.forced).length,bids:record.result.bids,tricks:record.result.tricks,scores:record.result.scores,bags:record.result.bags};
  if (complete) {
    const audit=read(`records/${fixture.id}.audit.json`);
    assert.equal(record.decisions.length,56); assert.equal(audit.complete,true);
    assert.equal(audit.boundaryChecks,56); assert.equal(audit.uniquePlayed,52); assert.equal(audit.tricks,13);
    assert.deepEqual(audit.result,record.result);
    // With no higher trumps anywhere, each of Maya's five top trumps wins its trick.
    for (const card of ['S10','SJ','SQ','SK','SA']) {
      const trick=record.result.history.find(t=>t.plays.some(p=>p.card===card));
      assert.equal(trick.winner,0);
    }
    summary.differencesFromD0=audit.comparisons.filter(d=>d.agent!==d.d0).length;
    summary.differencesFromD1=audit.comparisons.filter(d=>d.agent!==d.d1).length;
  }
  episodes.push(summary);
}
const openingComparisons=['solo','partners'].map(mode=>{
  const openings=config.episodes.filter(e=>e.id.startsWith(mode+'-') && existsSync(url(`records/${e.id}.json`))).map(e=>({episodeId:e.id,decision:read(`records/${e.id}.json`).decisions[0]})).filter(e=>e.decision);
  for(const e of openings) assert.equal(e.decision.packetHash,openings[0].decision.packetHash);
  return {mode,identicalOpeningPackets:true,bids:openings.map(e=>({episodeId:e.episodeId,bid:e.decision.action.bid})),interpretation:'Any first-bid difference within this mode is response variability, not hidden-distribution knowledge.'};
});
const report={status:episodes.every(e=>e.status==='passed')?'passed':'incomplete',episodes,openingComparisons,completed:episodes.filter(e=>e.status==='passed').length,planned:config.episodes.length,decisions:episodes.reduce((n,e)=>n+e.decisions,0),jevCalls:0,scope:'Saved record integrity and engine replay reports. Manual message transport and model internals are not independently audited. Policy disagreement is not correctness.'};
writeFileSync(url('records/integrity.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
