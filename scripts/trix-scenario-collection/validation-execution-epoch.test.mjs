import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve,dirname,basename} from 'node:path';
import {jsonBytes,sha,safePath,putBlob} from './journal.mjs';
import {validationExecutionClaimJob,validationExecutionGameClaims,verifyValidationExecutionRawMapping,verifyValidationExecutionInspection,verifyValidationExecutionEpochReuse} from './validation-execution-epoch.mjs';
const h=value=>sha(String(value)),clone=v=>JSON.parse(JSON.stringify(v));
function put(root,path,bytes){const full=safePath(root,path);mkdirSync(dirname(full),{recursive:true});writeFileSync(full,bytes);}
function fixture(t,variant='complex-partners'){
  const root=mkdtempSync(resolve(tmpdir(),'trix-validation-epoch-'));t.after(()=>{assert.equal(dirname(root),resolve(tmpdir()));assert.ok(basename(root).startsWith('trix-validation-epoch-'));rmSync(root,{recursive:true,force:true});});
  const episodeId=variant+'-fixture',request=variant.startsWith('complex')?'complex':'king',manifest={runId:'synthetic-epoch',mode:'fixture'};put(root,'manifest.json',jsonBytes(manifest));
  const c={root,manifest},rows=[],state={rows},decisions=[];const add=(kind,data)=>{const row={sequence:1966+rows.length,hash:h(JSON.stringify({kind,data,index:rows.length})),kind,data};rows.push(row);return row;};
  const job=(jobId,other={})=>({jobId,dispatchToken:'token-'+jobId,claimedAt:'2030-01-01T00:00:00.000Z',deadlineAt:'2030-01-01T00:05:00.000Z',...other});
  const player=job('future-player');add('job-prepared',{jobId:player.jobId,episodeId});const playerClaim=add('dispatch-claimed',player);
  const accepted=[];
  for(let i=0;i<54;i++){
    const decisionId=episodeId+':'+i+':0',review={decisionId,accepted:true},reviewRef=putBlob(root,review),originalRef=putBlob(root,{decisionId,original:true}),reviewerReceiptRef=putBlob(root,{decisionId,receipt:true});
    const commit={jobId:i===0?player.jobId:'historical-'+i,decisionId,episodeId,variant,request,phase:i<2?'declaration':'playing',selectedCandidateId:'play:C'+i,savedRef:putBlob(root,{saved:i})};accepted.push(commit);add('move-committed',commit);add('review-imported',{stage:'decision',subjectId:decisionId,reviewRef,originalRef,reviewerReceiptRef});
    decisions.push({decisionId,nativeChoice:commit.selectedCandidateId,acceptedDecisionReview:review,sourceRefs:{savedRef:commit.savedRef,decisionReviewRef:reviewRef,reviewOriginalRef:originalRef,reviewerReceiptRef}});
  }
  const promptRef=putBlob(root,'prompt'),reviewJob={id:'decision-fixture',stage:'decision',subjectId:accepted[0].decisionId,commitRef:putBlob(root,accepted[0]),promptHash:promptRef.sha256,promptRef};put(root,'outbox/'+reviewJob.id+'.json',jsonBytes(reviewJob));
  const reviewClaim=add('review-dispatch-claimed',{reviewId:reviewJob.id,stage:'decision',job:job('future-review',{promptHash:promptRef.sha256,promptRef})});add('review-attempt-settled',{jobId:'future-review',status:'rejected'});
  const gameJob={id:'game-fixture',stage:'game',episodeId,subjectId:episodeId,promptHash:promptRef.sha256,promptRef};put(root,'outbox/'+gameJob.id+'.json',jsonBytes(gameJob));const gameClaim=add('review-dispatch-claimed',{reviewId:gameJob.id,stage:'game',job:job('future-game-review',{promptHash:promptRef.sha256,promptRef})});
  const native={status:'completed',acceptedPlays:52,completedTricks:13,nativeTerminalPhase:'round-complete',scoreTotals:[1,2,3,4],componentTotals:{fixture:true},ledger:[],withheldBonuses:[],tricks:[]},outcomeRef=putBlob(root,native);add('episode-completed',{episodeId,outcomeRef});
  const acceptedGameReview={episodeId,complete:true},gameReviewRef=putBlob(root,acceptedGameReview),gameOriginalRef=putBlob(root,{episodeId,original:true}),gameReceiptRef=putBlob(root,{episodeId,receipt:true});add('review-imported',{stage:'game',subjectId:episodeId,reviewRef:gameReviewRef,originalRef:gameOriginalRef,reviewerReceiptRef:gameReceiptRef});
  const game={episodeId,variant,request,nativeOutcome:native,acceptedGameReview,sourceRefs:{outcomeRef,gameReviewRef,reviewOriginalRef:gameOriginalRef,reviewerReceiptRef:gameReceiptRef}},directory='raw-games/'+episodeId;
  const f={root,c,rows,state,episodeId,request,variant,decisions,game,accepted,playerClaim,reviewClaim,gameClaim,reviewJob,add};
  f.publish=()=>{const data={'decisions.jsonl':Buffer.concat(decisions.map(jsonBytes)),'game.json':jsonBytes(game)},source={schemaVersion:'trix-raw-game-export-1.0.0',runId:manifest.runId,episodeId,variant,request,originalManifestHash:sha(jsonBytes(manifest)),decisionCount:decisions.length,files:Object.fromEntries(Object.entries(data).map(([name,bytes])=>[name,sha(bytes)]))};for(const [name,bytes]of Object.entries(data))put(root,directory+'/'+name,bytes);put(root,directory+'/source-manifest.json',jsonBytes(source));f.rawResult={directory,source};return f.rawResult;};f.publish();return f;
}
test('physical player and reviewer claims retain exact transport jobs and absolute deadlines',t=>{
  const f=fixture(t),player=validationExecutionClaimJob(f.state,'future-player'),review=validationExecutionClaimJob(f.state,'future-review');assert.equal(player.job.episodeId,f.episodeId);assert.deepEqual(review.job,f.reviewClaim.data.job);assert.equal(Date.parse(player.job.deadlineAt)-Date.parse(player.job.claimedAt),300000);
});
test('unclaimed, ambiguous, altered-token and reset-deadline jobs fail',t=>{
  const f=fixture(t);assert.throws(()=>validationExecutionClaimJob(f.state,'unclaimed'),/invocation claim/);const copy=clone(f.reviewClaim);f.rows.push(copy);assert.throws(()=>validationExecutionClaimJob(f.state,'future-review'),/ambiguous/);f.rows.pop();f.reviewClaim.data.job.dispatchToken='';assert.throws(()=>validationExecutionClaimJob(f.state,'future-review'));
  f.reviewClaim.data.job.dispatchToken='restored';f.reviewClaim.data.job.deadlineAt='2030-01-01T00:10:00.000Z';assert.throws(()=>validationExecutionClaimJob(f.state,'future-review'),/deadline changed/);
});
test('game mapping includes player, decision reviewer and game reviewer including rejected attempts',t=>{
  const f=fixture(t),claims=validationExecutionGameClaims(f.c,f.episodeId,f.state,1965);assert.deepEqual(claims,[f.playerClaim,f.reviewClaim,f.gameClaim]);assert.deepEqual(validationExecutionGameClaims(f.c,'unrelated-game',f.state,1965),[]);assert.deepEqual(validationExecutionGameClaims(f.c,f.episodeId,f.state,f.gameClaim.sequence),[]);
});
test('a reviewer cannot point its full-game mapping at an invented physical commit',t=>{
  const f=fixture(t),changed={...f.accepted[0],episodeId:'another-game'};put(f.root,'outbox/'+f.reviewJob.id+'.json',jsonBytes({...f.reviewJob,commitRef:putBlob(f.root,changed)}));assert.throws(()=>validationExecutionGameClaims(f.c,f.episodeId,f.state,1965),/reviewed physical commit/);
});
test('stage and prompt mismatches fail before a review acquires a game mapping',t=>{
  const f=fixture(t);put(f.root,'outbox/'+f.reviewJob.id+'.json',jsonBytes({...f.reviewJob,promptHash:h('other')}));assert.throws(()=>validationExecutionGameClaims(f.c,f.episodeId,f.state,1965));
});
for(const variant of ['basic-solo','basic-partners','complex-solo','complex-partners'])test('raw '+variant+' accepts complete 52-play native binding plus declaration commits',t=>{
  const f=fixture(t,variant),ref=verifyValidationExecutionRawMapping(f.c,f.episodeId,f.state,f.rawResult);assert.equal(ref.path,f.rawResult.directory+'/source-manifest.json');assert.equal(f.decisions.length,54);
});
test('rewriting raw decision bytes and manifest together cannot change accepted review or native choice',t=>{
  const f=fixture(t);f.decisions[0].acceptedDecisionReview={forged:true};f.publish();assert.throws(()=>verifyValidationExecutionRawMapping(f.c,f.episodeId,f.state,f.rawResult));
  f.decisions[0].acceptedDecisionReview={decisionId:f.accepted[0].decisionId,accepted:true};f.decisions[0].nativeChoice='forged-action';f.publish();assert.throws(()=>verifyValidationExecutionRawMapping(f.c,f.episodeId,f.state,f.rawResult));
});
test('rewriting native totals and game review cannot diverge from original hash-bound blobs',t=>{
  const f=fixture(t);f.game.nativeOutcome.scoreTotals=[99,99,99,99];f.publish();assert.throws(()=>verifyValidationExecutionRawMapping(f.c,f.episodeId,f.state,f.rawResult));
});
test('missing native play, duplicate accepted review and wrong raw manifest reject',t=>{
  const f=fixture(t);f.accepted[2].phase='declaration';assert.throws(()=>verifyValidationExecutionRawMapping(f.c,f.episodeId,f.state,f.rawResult));
  f.accepted[2].phase='playing';f.rows.push(clone(f.rows.find(r=>r.kind==='review-imported')));assert.throws(()=>verifyValidationExecutionRawMapping(f.c,f.episodeId,f.state,f.rawResult),/ambiguous accepted decision review/);
});
test('original throwing-verifier success is distinct from an unavailable returned evidence object',()=>{
  verifyValidationExecutionInspection(()=>undefined,{},{});verifyValidationExecutionInspection(()=>({available:true}),{},{});
  for(const result of [false,null,{available:false},{}])assert.throws(()=>verifyValidationExecutionInspection(()=>result,{},{}),/Original invocation evidence unavailable/);
  assert.throws(()=>verifyValidationExecutionInspection(()=>{throw Error('original proof failed');},{},{}),/original proof failed/);assert.throws(()=>verifyValidationExecutionInspection(async()=>({available:true}),{},{}),/synchronous/);
});
test('existing sidecar remains byte-stable after an unrelated append and rejects altered historical prefix',()=>{
  const first={sequence:1,hash:h('first')},next={sequence:2,hash:h('next')},prefix=jsonBytes(first),physical=Buffer.concat([prefix,jsonBytes(next)]),base={schemaVersion:'fixture',bindings:[{claim:{sequence:1,hash:first.hash}}]},saved={...base,physicalObservedBoundary:first,physicalJournalHash:sha(prefix)};
  verifyValidationExecutionEpochReuse(saved,{base,state:{rows:[first,next]},physical});assert.throws(()=>verifyValidationExecutionEpochReuse(saved,{base,state:{rows:[first,next]},physical:Buffer.concat([Buffer.from(' '+prefix),jsonBytes(next)])}),/prefix changed/);
  assert.throws(()=>verifyValidationExecutionEpochReuse(saved,{base:{...base,bindings:[]},state:{rows:[first,next]},physical}),/Immutable execution epoch changed/);
});
