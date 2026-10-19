// Retrospective research bundles preserve every accepted move; no selection.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { validatePlayerPacket, resolveResponse } from './contracts.mjs';
import { validateArtifact } from './external-reader.mjs';
import { getBlob, jsonBytes, readJournal, safePath, sha, withRunLock, writeImmutable } from './journal.mjs';
import { validateForcedRationaleExport } from './forced-rationale-policy.mjs';
import { validateGameClassificationExport } from './game-review-classification.mjs';

function acceptedReview(collector, state, stage, subjectId) {
  const rows=state.reviews.filter(row=>row.stage===stage&&row.subjectId===subjectId);
  assert.equal(rows.length,1,`Exactly one accepted ${stage} review required for ${subjectId}`);
  const row=rows[0],review=getBlob(collector.root,row.reviewRef),original=getBlob(collector.root,row.originalRef),receipt=getBlob(collector.root,row.reviewerReceiptRef);
  assert.equal(receipt.contextMode,'independent-review','Accepted review receipt must be independent');
  assert.equal(receipt.responseHash,sha(jsonBytes(original)),'Accepted review original response binding mismatch');
  return {row,review,original,receipt};
}

function validateProcessingAudit(audit,source) {
  assert.ok(audit&&typeof audit==='object','Published processing audit required');
  assert.deepEqual(Object.keys(audit).sort(),['nativeBinaryDigest','originalSourceDigest','reviewSourceDigest']);
  for(const digest of Object.values(audit))assert.match(digest,/^[a-f0-9]{64}$/);
  assert.equal(audit.originalSourceDigest,source.originalSourceDigest,'Published original source provenance changed');
  assert.equal(audit.nativeBinaryDigest,source.nativeBinaryDigest,'Published native binary provenance changed');
}

export function exportRawGame(collector,episodeId,{processingAudit,reusePublishedAudit=false}={}) {
  assert.ok(typeof episodeId==='string'&&/^[a-z0-9][a-z0-9-]{0,127}$/.test(episodeId),'Unsafe episode identifier');
  assert.equal(typeof reusePublishedAudit,'boolean');
  return withRunLock(collector.root,()=>{
    const manifestBytes=readFileSync(safePath(collector.root,'manifest.json'));
    assert.deepEqual(JSON.parse(manifestBytes.toString('utf8')),collector.manifest,'Original manifest changed');
    const s=collector.state(),outcomes=s.outcomes.filter(row=>row.episodeId===episodeId);
    assert.equal(outcomes.length,1,'Exactly one completed native game required');
    const outcome=outcomes[0],originalOutcome=getBlob(collector.root,outcome.outcomeRef);
    assert.equal(originalOutcome.status,'completed');assert.equal(originalOutcome.acceptedPlays,52,'Native game requires 52 accepted plays');
    assert.equal(originalOutcome.completedTricks,13);assert.equal(originalOutcome.nativeTerminalPhase,'round-complete');
    // Copy only the public terminal outcome, never an authoritative frame.
    const nativeOutcome=Object.fromEntries(['status','completedTricks','acceptedPlays','nativeTerminalPhase','scoreTotals','componentTotals','ledger','withheldBonuses','tricks'].map(key=>[key,originalOutcome[key]]));
    const commits=s.commits.filter(row=>row.episodeId===episodeId);
    assert.equal(commits.filter(row=>row.phase==='playing').length,52,'Every native play requires its accepted commit');
    assert.equal(new Set(commits.map(row=>row.decisionId)).size,commits.length,'Duplicate accepted decision');
    const decisions=commits.map(commit=>{
      const saved=getBlob(collector.root,commit.savedRef),packet=validatePlayerPacket(getBlob(collector.root,saved.job.packetRef));
      assert.equal(saved.admission?.admitted,true,'Raw game requires admitted original players');
      assert.equal(packet.nativeRevision,commit.revision);assert.equal(packet.actor,commit.actor);
      assert.equal(commit.decisionId,`${episodeId}:${commit.revision}:${commit.actor}`);
      assert.equal(packet.variant,commit.variant);assert.equal(packet.request,commit.request);
      const phase=collector.manifest.plan.phases.find(row=>row.variant===packet.variant);assert.ok(phase&&phase.requests.includes(packet.request));
      for(const [key,value]of Object.entries(collector.manifest.plan.pins))assert.equal(packet.pin[key],value,`Original native pin ${key} mismatch`);
      assert.equal(packet.pin.ruleProfileId,phase.ruleProfileId);assert.deepEqual(packet.pin,saved.job.pin);
      const raw=getBlob(collector.root,saved.rawRef,false),response=JSON.parse(raw.toString('utf8'));
      assert.equal(sha(raw),commit.responseHash);assert.deepEqual(response,saved.response,'Original player response changed');
      assert.equal(saved.candidateId,commit.selectedCandidateId);
      assert.equal(resolveResponse(getBlob(collector.root,saved.job.nativePacketRef),response),commit.selectedCandidateId);
      const playerReceipt=getBlob(collector.root,saved.receiptRef);assert.equal(playerReceipt.responseHash,commit.responseHash);
      assert.equal(saved.receiptRef.sha256,commit.receiptHash);
      assert.equal(commit.forced,packet.legalOptions.length===1);
      const {row,review,original,receipt}=acceptedReview(collector,s,'decision',commit.decisionId);
      const {acceptedProofReceiptRef,...proposal}=review;validateArtifact('decision-review',proposal);
      if(acceptedProofReceiptRef)getBlob(collector.root,acceptedProofReceiptRef);
      assert.equal(review.decisionId,commit.decisionId);assert.equal(review.packetHash,saved.job.packetRef.sha256);
      if(commit.forced&&review.rationaleStatus!=='forced')validateForcedRationaleExport(collector,s,row,packet,commit,review,original,receipt);
      else assert.equal(review.rationaleStatus==='forced',commit.forced);
      return {decisionId:commit.decisionId,revision:commit.revision,actor:commit.actor,actorLabel:packet.actorLabel,phase:commit.phase,pin:packet.pin,forced:commit.forced,nativeChoice:commit.selectedCandidateId,actorPacket:packet,originalResponse:response,acceptedDecisionReview:review,sourceRefs:{rawRef:saved.rawRef,playerReceiptRef:saved.receiptRef,savedRef:commit.savedRef,packetRef:saved.job.packetRef,decisionReviewRef:row.reviewRef,reviewOriginalRef:row.originalRef,reviewerReceiptRef:row.reviewerReceiptRef,...(row.rationalePolicyRef?{rationalePolicyRef:row.rationalePolicyRef}:{})}};
    });
    const {row:gameRow,review:gameReview,original:gameOriginal,receipt:gameReceipt}=acceptedReview(collector,s,'game',episodeId);
    if(gameRow.gameReviewClassificationRef)validateGameClassificationExport(collector,gameRow,gameReview,gameOriginal,gameReceipt);
    const {frozenDecisionReviewDigest,...gameProposal}=gameReview;
    if(!gameRow.gameReviewClassificationRef)assert.deepEqual(gameProposal,gameOriginal,'Unclassified game review changed original fields');
    assert.equal(frozenDecisionReviewDigest,sha(jsonBytes(decisions.map(row=>row.acceptedDecisionReview))),'Frozen decision reviews changed');
    assert.equal(gameProposal.episodeId,episodeId);assert.equal(gameProposal.complete,true);
    const variant=outcome.variant??commits[0].variant,request=outcome.request??commits[0].request;
    assert.ok(commits.every(row=>row.variant===variant&&row.request===request),'Raw game request identity mismatch');
    validateArtifact('game-findings',{schemaVersion:'trix-public-game-finding-1.0.0',episodeId,variant,request,nativeTotals:{scoreTotals:nativeOutcome.scoreTotals,componentTotals:nativeOutcome.componentTotals},publicTricks:nativeOutcome.tricks,nativeLedger:nativeOutcome.ledger,withheldBonuses:nativeOutcome.withheldBonuses,gameReview:gameProposal,frozenDecisionReviewDigest,provenance:'offline-llm-player',promotionEligible:false,runtimeActivated:false});
    assert.deepEqual(gameProposal.nativeTotals,{scoreTotals:nativeOutcome.scoreTotals,componentTotals:nativeOutcome.componentTotals});
    const plays=nativeOutcome.tricks.flatMap(trick=>trick.plays);assert.equal(plays.length,52);assert.equal(new Set(plays.map(play=>play.card)).size,52,'Native public terminal cards incomplete');
    const game={episodeId,variant,request,nativeOutcome,acceptedGameReview:gameReview,...(gameRow.gameReviewClassificationRef?{originalGameReview:gameOriginal,unverifiedExplanationFlags:getBlob(collector.root,gameRow.gameReviewClassificationRef).removedReferences}:{}),sourceRefs:{outcomeRef:outcome.outcomeRef,gameReviewRef:gameRow.reviewRef,reviewOriginalRef:gameRow.originalRef,reviewerReceiptRef:gameRow.reviewerReceiptRef,...(gameRow.gameReviewClassificationRef?{gameReviewClassificationRef:gameRow.gameReviewClassificationRef}:{})}};
    const files={'decisions.jsonl':Buffer.from(decisions.map(row=>JSON.stringify(row)+'\n').join('')),'game.json':jsonBytes(game)};
    const source={schemaVersion:'trix-raw-game-export-1.0.0',runId:collector.manifest.runId,corpusId:collector.manifest.corpusId,episodeId,variant,request,mode:collector.manifest.mode,decisionCount:decisions.length,originalManifestHash:sha(manifestBytes),planHash:collector.manifest.planHash,originalSourceDigest:collector.manifest.build?.sourceDigest??null,nativeBinaryDigest:collector.manifest.build?.binaryDigest??null,pin:decisions[0].pin,versions:collector.manifest.plan.versions,files:Object.fromEntries(Object.entries(files).map(([name,bytes])=>[name,sha(bytes)])),...(processingAudit===undefined?{}:{processingAudit}),artifactRole:'research-review-artifact',inputUse:'never-player-or-reviewer-input',rawAttempts:'All raw attempts remain in the private journal; sourceRefs bind accepted originals and review receipts.',provenance:'offline-llm-player',selectionDeferred:true,selectedCaseCount:null,promotionEligible:false,runtimeActivated:false};
    const directory=`raw-games/${episodeId}`;
    const marker=safePath(collector.root,`${directory}/source-manifest.json`);
    if(reusePublishedAudit&&existsSync(marker)){
      const published=JSON.parse(readFileSync(marker,'utf8'));
      validateProcessingAudit(published.processingAudit,source);
      if(processingAudit!==undefined)validateProcessingAudit(processingAudit,source);
      assert.ok(readJournal(collector.root).some(row=>row.kind==='campaign-worker-started'&&JSON.stringify(row.data.processingAudit)===JSON.stringify(published.processingAudit)),'Published processing audit is not recognized in the hash journal');
      // Revalidate every accepted original and reconstruct every byte above.
      // Reusing an earlier audited processor never changes its published work.
      source.processingAudit=published.processingAudit;
    }
    // The final manifest publishes the complete immutable bundle. A changed
    // review, response or audit cannot overwrite an existing game publication.
    for(const [name,bytes]of Object.entries(files))writeImmutable(safePath(collector.root,`${directory}/${name}`),bytes);
    writeImmutable(marker,jsonBytes(source));
    return {directory,decisions:decisions.length,source};
  });
}
