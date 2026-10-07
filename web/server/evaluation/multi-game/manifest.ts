import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { buildLabelIndex,type LabelSnapshot } from './research.ts';

export type EvaluationVariant='hearts-solo'|'spades-solo'|'spades-partners';
export type EvaluationManifest={
  schemaVersion:'multi-game-evaluation-1.0.0';id:string;purpose:'development'|'confirmation';variant:EvaluationVariant;
  ruleProfile:{id:string;hash:string};candidate:{id:string;hash:string};reference:{id:string;hash:string};sourceHashes:Record<string,string>;
  objective:string;horizon:'complete-hand'|'complete-match';
  corpus:{version:string;hash:string;labelIds:string[]}|null;
  families:{id:string;split:'discovery'|'confirmation';seed:string;sealed:boolean}[];
  rotations:number[];seatAssignments:{candidate:number[];reference:number[]};environments:string[];
  primaryEstimand:string;usefulGain:number|null;maximumHarm:number|null;powerRationale:string|null;
  multiplicityAdjustment:string|null;sampleSize:number|null;stoppingRule:string;
  missingRunHandling:string;maxWallMs:number;maxDecisionMs:number;maxDecisions:number;
  promotionAuthority:string|null;
};
const text=(value:unknown)=>typeof value==='string'&&value.trim().length>0;
const hash=(value:unknown)=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
function freeze<T>(value:T):Readonly<T>{if(value!==null&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}
/** Study decisions have no defaults. Freezing never supplies labels or establishes independence. */
export function freezeManifest(candidate:EvaluationManifest,labelIndex:readonly LabelSnapshot[]=buildLabelIndex()) {
  const keys=['schemaVersion','id','purpose','variant','ruleProfile','candidate','reference','sourceHashes','objective','horizon','corpus','families','rotations','seatAssignments','environments','primaryEstimand','usefulGain','maximumHarm','powerRationale','multiplicityAdjustment','sampleSize','stoppingRule','missingRunHandling','maxWallMs','maxDecisionMs','maxDecisions','promotionAuthority'];
  assert.ok(candidate&&typeof candidate==='object','Missing manifest');
  for(const key of keys)assert.ok(Object.hasOwn(candidate,key),`Missing study decision ${key}`);
  assert.equal(Object.keys(candidate).length,keys.length,'Unknown manifest field');
  assert.equal(candidate.schemaVersion,'multi-game-evaluation-1.0.0');
  assert.ok(['development','confirmation'].includes(candidate.purpose));
  assert.ok(['hearts-solo','spades-solo','spades-partners'].includes(candidate.variant),'Unsupported variant/rule branch');
  for(const pin of [candidate.ruleProfile,candidate.candidate,candidate.reference])assert.ok(pin&&text(pin.id)&&hash(pin.hash),'Missing exact rule/policy hash');
  assert.ok(candidate.sourceHashes&&Object.keys(candidate.sourceHashes).length>0&&Object.values(candidate.sourceHashes).every(hash),'Missing source hash graph');
  for(const value of [candidate.id,candidate.objective,candidate.primaryEstimand,candidate.stoppingRule,candidate.missingRunHandling])assert.ok(text(value),'Missing declared objective/horizon/stopping decision');
  assert.ok(['complete-hand','complete-match'].includes(candidate.horizon),'Invalid horizon');
  assert.ok(Array.isArray(candidate.families)&&candidate.families.length>0,'Missing family split/seeds');
  assert.equal(new Set(candidate.families.map(family=>family.id)).size,candidate.families.length,'Repeated origin family');
  for(const family of candidate.families)assert.ok(text(family.id)&&text(family.seed)&&typeof family.sealed==='boolean'&&['discovery','confirmation'].includes(family.split),'Invalid family assignment');
  assert.ok(candidate.rotations.length>0&&new Set(candidate.rotations).size===candidate.rotations.length&&candidate.rotations.every(seat=>Number.isInteger(seat)&&seat>=0&&seat<4),'Invalid rotations');
  for(const seats of [candidate.seatAssignments.candidate,candidate.seatAssignments.reference])assert.ok(seats.length>0&&new Set(seats).size===seats.length&&seats.every(seat=>Number.isInteger(seat)&&seat>=0&&seat<4),'Missing candidate/reference seat assignment');
  assert.ok(candidate.environments.length>0&&candidate.environments.every(text),'Missing teammate/opponent environments');
  for(const limit of [candidate.maxWallMs,candidate.maxDecisionMs,candidate.maxDecisions])assert.ok(Number.isSafeInteger(limit)&&limit>0,'Missing finite compute/latency limits');
  assert.ok(candidate.maxWallMs<=30*60*1000,'Exceeds owner test invocation ceiling');
  if(candidate.purpose==='confirmation') {
    assert.ok(candidate.horizon==='complete-match','Confirmation strength requires complete-match horizon');
    assert.ok(candidate.families.every(family=>family.split==='confirmation'&&family.sealed),'Confirmation requires sealed held-out families');
    assert.ok(typeof candidate.usefulGain==='number'&&Number.isFinite(candidate.usefulGain)&&candidate.usefulGain>0,'Missing practically useful gain');
    assert.ok(typeof candidate.maximumHarm==='number'&&Number.isFinite(candidate.maximumHarm)&&candidate.maximumHarm>=0,'Missing tolerated harm');
    assert.ok(Number.isSafeInteger(candidate.sampleSize)&&(candidate.sampleSize??0)>0,'Missing fixed sample size');
    for(const decision of [candidate.powerRationale,candidate.multiplicityAdjustment,candidate.promotionAuthority])assert.ok(text(decision),'Missing power/multiplicity/promotion authority');
    assert.ok(candidate.corpus&&text(candidate.corpus.version)&&hash(candidate.corpus.hash)&&candidate.corpus.labelIds.length>0,'Missing independently reviewed label corpus');
    const labels=candidate.corpus.labelIds.map(id=>labelIndex.find(label=>label.id===id));
    assert.ok(labels.every(label=>label&&label.status==='acceptable-set'&&label.confirmationEligible),'Independent label eligibility is absent; pending/unknown/contested entries cannot confirm');
    // Existing 32 submissions are pending and explicitly non-confirming. A future
    // independently accepted corpus needs a versioned adapter, never overwriting it.
    const corpusHash=createHash('sha256').update(JSON.stringify(labels)).digest('hex');
    assert.equal(candidate.corpus.hash,corpusHash,'Pinned label corpus changed');
  } else {
    assert.ok(candidate.families.every(family=>family.split==='discovery'&&!family.sealed),'Development cannot consume sealed confirmation seeds');
  }
  const manifest=freeze(structuredClone(candidate));
  return {manifest,hash:createHash('sha256').update(JSON.stringify(manifest)).digest('hex'),confirmationEligible:candidate.purpose==='confirmation'};
}
