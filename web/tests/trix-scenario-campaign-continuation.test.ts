import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { amendmentPath, campaignInventoryPath, continuationFacade, prepareCampaignContinuation, readCampaignAmendment, validateAmendment, verifyBehaviorCompatibility, verifySettledHistory } from '../../scripts/trix-scenario-collection/campaign-continuation.mjs';
import { appendEvent, jsonBytes, readJournal, sha } from '../../scripts/trix-scenario-collection/journal.mjs';
import { sourceDigest } from '../../scripts/coach-lab-builds.mjs';

function fixture(t) {
  const scratch=resolve('.local/evaluation/trix-scenarios/bridge-capability');mkdirSync(scratch,{recursive:true});
  const root=mkdtempSync(join(scratch,'campaign-amendment-test-'));
  t.after(()=>{assert.ok(resolve(root).startsWith(scratch+sep));rmSync(root,{recursive:true,force:true});});
  const hashes={'go.mod':'a'.repeat(64),'go.sum':'b'.repeat(64),'server/example.go':'c'.repeat(64),'scripts/trix-scenario-collection/contracts.mjs':'d'.repeat(64),'contracts/trix-scenario-collection/packet.schema.json':'e'.repeat(64),'node_modules/ajv/index.js':'f'.repeat(64),'planning/implementation/coach-lab/trix-scenario-collection/prompts/player.md':'1'.repeat(64)};
  hashes['web/shared/validators.mjs']='7'.repeat(64);hashes['web/shared/contracts.schema.json']='8'.repeat(64);hashes['web/shared/games/trix.schema.json']='9'.repeat(64);
  const manifest={runId:'amendment-fixture',mode:'live',build:{sourceDigest:sourceDigest(hashes),binaryDigest:'2'.repeat(64)},sourceHashes:hashes,plan:{workCaps:{maxActiveSegmentWallMs:5400000,maxInvocationWallMs:300000,maxPlayerAttemptsPerDecision:2,maxAttemptedEpisodes:180,maxPlayerAttemptsCampaign:17920,batchRequests:4},phases:[{variant:'basic-solo',requests:['diamonds','king','queens','lutoosh'],maxCompletedRequests:32,maxRequestsPerContract:8},{variant:'complex-solo',requests:['complex'],maxCompletedRequests:32,maxRequestsPerContract:32},{variant:'basic-partners',requests:['diamonds','king','queens','lutoosh'],maxCompletedRequests:32,maxRequestsPerContract:8},{variant:'complex-partners',requests:['complex'],maxCompletedRequests:64,maxRequestsPerContract:64}]}};
  writeFileSync(join(root,'manifest.json'),jsonBytes(manifest));
  appendEvent(root,'initialized',{manifestHash:sha(jsonBytes(manifest))});
  const boundary=appendEvent(root,'pause',{reason:'operator-request'});
  const originalInventory={schemaVersion:'trix-host-base-context-admission-1.0.0',approvedDigests:['4'.repeat(64)]};
  const currentInventory={schemaVersion:'trix-host-base-context-admission-1.0.0',approvedDigests:['5'.repeat(64)]};
  writeFileSync(join(root,'host-base-context-admission.json'),jsonBytes(originalInventory));
  writeFileSync(join(root,campaignInventoryPath),jsonBytes(currentInventory));
  const collector={root,manifest,state(){const rows=readJournal(root);return {rows,paused:true,claimed:null,intent:null,pending:null,commits:[],reviews:[],outcomes:[]};}};
  const processingHashes={...hashes,'scripts/trix-scenario-collection/campaign-continuation.mjs':'3'.repeat(64)};
  const {maxActiveSegmentWallMs,...preservedWorkCaps}=manifest.plan.workCaps;
  const amendment={schemaVersion:'trix-campaign-continuation-1.0.0',runId:manifest.runId,createdAt:'2026-10-11T20:00:00.000Z',ownerDecision:'Remove the 90 minute limit window; continue and finish all necessary rounds and data collection for all planned scenarios and games. Selection is deferred. Keep detailed reviews after each game.',originalManifestHash:sha(jsonBytes(manifest)),originalSourceDigest:manifest.build.sourceDigest,nativeBinaryDigest:manifest.build.binaryDigest,previousBoundary:{sequence:boundary.sequence,hash:boundary.hash},executionPolicy:{maxActiveSegmentWallMs:null,selectionDeferred:true},reviewTiming:'after-each-game',completionRequests:manifest.plan.phases.map(p=>({variant:p.variant,requests:p.requests,completed:p.maxCompletedRequests,perContract:p.maxRequestsPerContract})),preservedWorkCaps,processingBuild:{sourceDigest:sourceDigest(processingHashes),binaryDigest:manifest.build.binaryDigest},sourceHashes:processingHashes,originalContextInventoryHash:sha(jsonBytes(originalInventory)),currentContextInventoryHash:sha(jsonBytes(currentInventory))};
  const authorize=()=>{writeFileSync(join(root,amendmentPath),jsonBytes(amendment));return appendEvent(root,'campaign-continuation-authorized',{amendmentPath,amendmentHash:sha(jsonBytes(amendment))});};
  return {root,collector,amendment,authorize,boundary,originalInventory,currentInventory};
}

test('amendment preserves original manifest and journal prefix while only facade becomes active',t=>{
  const f=fixture(t),original=readFileSync(join(f.root,'manifest.json')),prefix=readJournal(f.root),authorization=f.authorize();
  const read=readCampaignAmendment(f.collector);assert.deepEqual(read.amendment,f.amendment);
  const active=continuationFacade(f.collector,f.amendment,authorization);
  assert.equal(f.collector.state().paused,true);assert.equal(active.state().paused,false);
  assert.deepEqual(active.executionPolicy,{maxActiveSegmentWallMs:null,selectionDeferred:true});
  assert.equal(Object.isFrozen(active.executionPolicy),true);
  assert.throws(()=>{active.executionPolicy={maxActiveSegmentWallMs:1,selectionDeferred:false};});
  assert.deepEqual(readJournal(f.root).slice(0,prefix.length),prefix);assert.ok(original.equals(readFileSync(join(f.root,'manifest.json'))));
});

test('later operator pause remains effective across repeated facade construction',t=>{
  const f=fixture(t),authorization=f.authorize(),active=continuationFacade(f.collector,f.amendment,authorization);
  appendEvent(f.root,'pause',{reason:'operator-request'});
  assert.equal(active.state().paused,true);assert.equal(continuationFacade(f.collector,f.amendment,authorization).state().paused,true);
  assert.throws(()=>active.resume(),/frozen campaign/);
});

test('later legacy resume cannot silently reset continuation baseline',t=>{
  const f=fixture(t),active=continuationFacade(f.collector,f.amendment,f.authorize());appendEvent(f.root,'resume',{});
  assert.throws(()=>active.state(),/outside the continuation/);
});

for(const [name,mutate] of [
  ['manifest hash',a=>a.originalManifestHash='5'.repeat(64)],
  ['native digest',a=>a.nativeBinaryDigest='5'.repeat(64)],
  ['original source',a=>a.originalSourceDigest='5'.repeat(64)],
  ['journal boundary',a=>a.previousBoundary.hash='5'.repeat(64)],
  ['wall override',a=>a.executionPolicy.maxActiveSegmentWallMs=999999999],
  ['selection override',a=>a.executionPolicy.selectionDeferred=false],
  ['review deferral',a=>a.reviewTiming='after-campaign'],
  ['expanded call budget',a=>a.preservedWorkCaps.maxInvocationWallMs=600000],
  ['expanded attempt budget',a=>a.preservedWorkCaps.maxPlayerAttemptsPerDecision=3],
  ['reduced request coverage',a=>a.completionRequests[0].completed=1],
  ['unknown property',a=>a.extra=true],
  ['unbound processor',a=>a.processingBuild.sourceDigest='5'.repeat(64)],
  ['original context inventory hash',a=>a.originalContextInventoryHash='6'.repeat(64)],
  ['current context inventory hash',a=>a.currentContextInventoryHash='6'.repeat(64)],
] as const)test(`amendment rejects ${name} before activation`,t=>{const f=fixture(t),a=structuredClone(f.amendment);mutate(a);assert.throws(()=>validateAmendment(f.collector,a));assert.equal(readJournal(f.root).length,2);});

test('metadata file alone does not authorize continuation, and later tampering invalidates authorization',t=>{
  const f=fixture(t);writeFileSync(join(f.root,amendmentPath),jsonBytes(f.amendment));assert.throws(()=>readCampaignAmendment(f.collector),/authorization/);
  f.authorize();const modified={...f.amendment,createdAt:'2026-10-12T20:00:00.000Z'};writeFileSync(join(f.root,amendmentPath),jsonBytes(modified));assert.throws(()=>readCampaignAmendment(f.collector));
});

test('processor may add execution code but may not change native or actor-contract dependency bytes',t=>{
  const f=fixture(t),before=f.collector.manifest.sourceHashes;
  assert.doesNotThrow(()=>verifyBehaviorCompatibility(before,f.amendment.sourceHashes));
  for(const key of Object.keys(before)){const after={...f.amendment.sourceHashes,[key]:'6'.repeat(64)};assert.throws(()=>verifyBehaviorCompatibility(before,after));}
  assert.throws(()=>verifyBehaviorCompatibility(before,{...f.amendment.sourceHashes,'contracts/trix-scenario-collection/new.schema.json':'6'.repeat(64)}));
});

test('unsettled player or reviewer dispatch cannot be admitted by stop flags alone',t=>{
  const f=fixture(t);appendEvent(f.root,'dispatch-claimed',{jobId:'player-one'});
  let checks=0;const api={verifyPlayer(){checks++;},verifyReviewer(){checks++;}};
  assert.throws(()=>verifySettledHistory(f.collector,{},api),/Unsettled/);assert.equal(checks,0);
  appendEvent(f.root,'move-committed',{jobId:'player-one'});appendEvent(f.root,'review-dispatch-claimed',{reviewId:'review-one',job:{jobId:'review-one'}});
  assert.throws(()=>verifySettledHistory(f.collector,{},api),/Unsettled/);assert.equal(checks,1);
});

test('settled history still requires inspected host evidence for every prior call',t=>{
  const f=fixture(t);appendEvent(f.root,'dispatch-claimed',{jobId:'player-one'});appendEvent(f.root,'move-committed',{jobId:'player-one'});
  appendEvent(f.root,'review-dispatch-claimed',{reviewId:'review-one',job:{jobId:'review-one'}});appendEvent(f.root,'review-attempt-settled',{jobId:'review-one',status:'accepted'});
  const stop=join(f.root,'private/invocations/review-one/private/app-server');mkdirSync(stop,{recursive:true});writeFileSync(join(stop,'stopped.json'),jsonBytes({stoppedVerified:true}));
  const checked=[];assert.deepEqual(verifySettledHistory(f.collector,{}, {verifyPlayer(){checked.push('player');},verifyReviewer(){checked.push('review');}}),{playerInvocations:1,reviewerInvocations:1});
  assert.deepEqual(checked,['player','review']);
  assert.throws(()=>verifySettledHistory(f.collector,{}, {verifyPlayer(){},verifyReviewer(){throw Error('host bytes cannot be inspected');}}),/cannot be inspected/);
  assert.equal(existsSync(join(f.root,amendmentPath)),false);
});

test('continuation keeps two immutable single-digest inventories and rejects a changed supplied inventory',t=>{
  const f=fixture(t),originalBytes=readFileSync(join(f.root,'host-base-context-admission.json')),currentBytes=readFileSync(join(f.root,campaignInventoryPath));
  f.authorize();
  const prepared=prepareCampaignContinuation(f.collector,{contextAdmission:join(f.root,campaignInventoryPath)});
  assert.equal(prepared.alreadyPrepared,true);assert.deepEqual(prepared.amendment,f.amendment);
  assert.ok(originalBytes.equals(readFileSync(join(f.root,'host-base-context-admission.json'))));
  assert.ok(currentBytes.equals(readFileSync(join(f.root,campaignInventoryPath))));
  const supplied=join(f.root,'different-inventory.json');writeFileSync(supplied,jsonBytes({...f.currentInventory,approvedDigests:['6'.repeat(64)]}));
  const rows=readJournal(f.root);assert.throws(()=>prepareCampaignContinuation(f.collector,{contextAdmission:supplied}),/Continuation.*inventory/);
  assert.deepEqual(readJournal(f.root),rows);
  writeFileSync(supplied,jsonBytes({...f.currentInventory,approvedDigests:[...f.originalInventory.approvedDigests,...f.currentInventory.approvedDigests]}));
  assert.throws(()=>prepareCampaignContinuation(f.collector,{contextAdmission:supplied}),/one|1/i);
});

test('changing either bound context inventory invalidates continuation before activation',t=>{
  for(const path of ['host-base-context-admission.json',campaignInventoryPath]){
    const f=fixture(t);f.authorize();writeFileSync(join(f.root,path),jsonBytes({...f.currentInventory,approvedDigests:['6'.repeat(64)]}));
    assert.throws(()=>readCampaignAmendment(f.collector),/context inventory/i);
  }
});

test('settled history admits original and later player/reviewer claims only against their own context inventory',t=>{
  const f=fixture(t),claims=[];
  const player=name=>{const row=appendEvent(f.root,'dispatch-claimed',{jobId:name});appendEvent(f.root,'move-committed',{jobId:name});claims.push(row);return row;};
  const reviewer=name=>{const row=appendEvent(f.root,'review-dispatch-claimed',{reviewId:name,job:{jobId:name}});appendEvent(f.root,'review-attempt-settled',{jobId:name,status:'accepted'});const stop=join(f.root,`private/invocations/${name}/private/app-server`);mkdirSync(stop,{recursive:true});writeFileSync(join(stop,'stopped.json'),jsonBytes({stoppedVerified:true}));claims.push(row);return row;};
  player('original-player');const boundary=reviewer('original-reviewer');player('current-player');reviewer('current-reviewer');
  const checked=[],verify=(_collector,claim,inventory)=>{checked.push([claim.sequence,inventory]);const expected=claim.sequence<=boundary.sequence?f.originalInventory:f.currentInventory;assert.deepEqual(inventory,expected,'Claim used the wrong admitted context');};
  assert.deepEqual(verifySettledHistory(f.collector,f.currentInventory,{originalInventory:f.originalInventory,originalThroughSequence:boundary.sequence,verifyPlayer:verify,verifyReviewer:verify}),{playerInvocations:2,reviewerInvocations:2});
  assert.equal(checked.filter(([,inventory])=>inventory===f.originalInventory).length,2);assert.equal(checked.filter(([,inventory])=>inventory===f.currentInventory).length,2);
  assert.throws(()=>verifySettledHistory(f.collector,f.currentInventory,{originalInventory:f.currentInventory,originalThroughSequence:boundary.sequence,verifyPlayer:verify,verifyReviewer:verify}),/wrong admitted context/);
  assert.throws(()=>verifySettledHistory(f.collector,f.currentInventory,{originalInventory:f.originalInventory,verifyPlayer:verify,verifyReviewer:verify}),/boundary/i);
});
