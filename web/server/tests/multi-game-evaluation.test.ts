import assert from 'node:assert/strict';
import test from 'node:test';
import { freezeManifest,type EvaluationManifest } from '../evaluation/multi-game/manifest.ts';
import { buildLabelIndex } from '../evaluation/multi-game/research.ts';
const hash='a'.repeat(64);
const development=():EvaluationManifest=>({schemaVersion:'multi-game-evaluation-1.0.0',id:'fixture-development',purpose:'development',variant:'spades-partners',
  ruleProfile:{id:'spades-training-1.0.0',hash},candidate:{id:'spades-partner-resource-5.0.0',hash},reference:{id:'spades-tactics-2.1.0',hash},sourceHashes:{fixture:hash},
  objective:'Development activation and public-info correctness only',horizon:'complete-hand',corpus:null,
  families:[{id:'fresh-fixture',split:'discovery',seed:'fixture-seed',sealed:false}],rotations:[0],seatAssignments:{candidate:[0],reference:[0]},environments:['other seats fixed tactics2.1'],
  primaryEstimand:'Changed legal actions and guarded activation',usefulGain:null,maximumHarm:null,powerRationale:null,multiplicityAdjustment:null,sampleSize:null,
  stoppingRule:'Exactly one fixture; no automatic extension',missingRunHandling:'Censor incomplete hands; retain every decision',maxWallMs:1000,maxDecisionMs:100,maxDecisions:56,promotionAuthority:null});
test('M11 development freezes an immutable non-promoting manifest without inventing study decisions',()=>{
  const value=development(),result=freezeManifest(value);assert.equal(result.confirmationEligible,false);
  value.families[0].seed='changed';assert.equal(result.manifest.families[0].seed,'fixture-seed');assert.ok(Object.isFrozen(result.manifest.families[0]));
});
test('M11 every missing decision fails; unsupported rule branches, held-out development seeds and overrun limits fail',()=>{
  for(const key of Object.keys(development())) {const value=development();delete (value as unknown as Record<string,unknown>)[key];assert.throws(()=>freezeManifest(value),/Missing study decision/);}
  const unknown=development();unknown.variant='tarneeb-partners' as EvaluationManifest['variant'];assert.throws(()=>freezeManifest(unknown),/Unsupported/);
  const heldOut=development();heldOut.families[0].sealed=true;assert.throws(()=>freezeManifest(heldOut),/sealed/);
  const overrun=development();overrun.maxWallMs=30*60*1000+1;assert.throws(()=>freezeManifest(overrun),/ceiling/);
});
test('M11 incomplete study decisions and current pending labels cannot create confirming eligibility',()=>{
  const value=development();value.purpose='confirmation';assert.throws(()=>freezeManifest(value),/complete-match/);
  value.horizon='complete-match';value.families[0].split='confirmation';value.families[0].sealed=true;
  assert.throws(()=>freezeManifest(value),/gain/);value.usefulGain=1;
  assert.throws(()=>freezeManifest(value),/harm/);value.maximumHarm=1;
  assert.throws(()=>freezeManifest(value),/sample/);value.sampleSize=8;
  assert.throws(()=>freezeManifest(value),/power/);value.powerRationale='fixture placeholder';value.multiplicityAdjustment='one primary comparison';value.promotionAuthority='fixture placeholder';
  assert.throws(()=>freezeManifest(value),/corpus/);value.corpus={version:'fixture',hash,labelIds:[buildLabelIndex()[0].id]};
  assert.throws(()=>freezeManifest(value),/Independent label eligibility/);
});
