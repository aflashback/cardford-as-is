// One owner-authorized replacement, plus an independently audited context epoch.
// Historical rejected claims and every ordinary attempt cap remain visible.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { closeSync, existsSync, fsyncSync, openSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { preserveBuild, resolveBuild, sourceDigest } from '../coach-lab-builds.mjs';
import { Collector, repository, sourceHashes } from './runner.mjs';
import { appendEvent, getBlob, jsonBytes, putBlob, safePath, sha, withRunLock, writeImmutable } from './journal.mjs';
import { assertDerivationQuiescent } from './derived-export.mjs';
import { readCampaignAmendment, verifyBehaviorCompatibility } from './campaign-continuation.mjs';
import { readLatestCampaignRecovery } from './campaign-recovery.mjs';
import { readLatestContextRecovery } from './context-recovery.mjs';
import { readLatestRationaleRecovery } from './forced-rationale-recovery.mjs';
import { readLatestGameReviewRecovery } from './game-review-recovery.mjs';
import { readLatestPlayerContextRecovery } from './player-context-recovery.mjs';
import { readLatestReviewTimeoutRecovery, verifyTimeoutTransport } from './review-timeout-recovery.mjs';
import { readLatestPlayerTimeoutRecovery } from './player-timeout-recovery.mjs';
import { readLatestReviewDeadlineRecovery, verifyReviewDeadlineRecoveryHistory } from './review-deadline-recovery.mjs';
import { readWireLog, describeAppServerContext, inspectAppServerEvidence } from './app-server-bridge.mjs';
import { dispatchMemoryIsolatedHostJob, verifyMemoryIsolationInvocation } from './memory-isolated-transport.mjs';
import { validateDecisionProposal, proofMatches } from './review.mjs';
import { validateHostReviewEnvelope } from './review-envelope.mjs';
import { validateReferenceReviewEnvelope } from './reference-envelope.mjs';
import { verifyReviewProof } from './proof-adapter.mjs';
import { verifyHostReceipt, verifyResponseBytes } from './bridge.mjs';
import { inspectHostInvocation } from './bridge.mjs';
import { verifyPriorPlayer, verifyPriorHost } from './review-worker.mjs';
import { memoryAuthorization, recordReviewMemoryProvenance, verifyReviewMemoryProvenance, exportReviewMemoryProvenance } from './review-memory-provenance.mjs';

export const reviewMemoryExceptionVersion = 'trix-review-memory-exception-1.0.0';
const targetReview = 'decision-2a88878127fbd09bcff0b11f', targetDecision = 'basic-solo-3:36:0';
const baselinePath = 'reports/review-context-v3-preservation-baseline-20261012.json', censusPath = 'reports/historical-memory-context-census-20261012.json';
const one = (rows, predicate, label) => { const found = rows.filter(predicate); assert.equal(found.length, 1, `Missing or ambiguous ${label}`); return found[0]; };
const keys = (value, fields) => assert.deepEqual(Object.keys(value).sort(), [...fields].sort());
const read = (root, path) => JSON.parse(readFileSync(safePath(root, path)));
const bind = row => ({ sequence: row.sequence, hash: row.hash });
const ref = (root, path) => { const normalized = relative(resolve(root), resolve(root, path)).replaceAll('\\', '/'); return { path: normalized, sha256: sha(readFileSync(safePath(root, normalized))) }; };
const checkedBytes = (root, reference) => { keys(reference, ['path','sha256']); const bytes=readFileSync(safePath(root,reference.path)); assert.equal(sha(bytes),reference.sha256,`Changed audit artifact: ${reference.path}`); return bytes; };
const checkedRef = (root, reference) => JSON.parse(checkedBytes(root,reference));
const priorCache=new WeakMap();
export function resolveOriginalReviewMemoryBuild(collector){return resolveBuild(collector.root,collector.manifest.sourceHashes,{sourceDigest:collector.manifest.build.sourceDigest,binaryDigest:collector.manifest.build.binaryDigest});}

function priorLayers(collector) {
  const cached=priorCache.get(collector);if(cached){for(const value of Object.values(cached).filter(value=>value?.recoveryHash)){assert.equal(sha(jsonBytes(read(collector.root,value.recoveryPath))),value.recoveryHash);assert.equal(one(collector.state().rows,row=>row.sequence===value.authorization.sequence,'historical authorization').hash,value.authorization.hash);}return cached;}
  const { amendment } = readCampaignAmendment(collector), startupRecovery = readLatestCampaignRecovery(collector), contextRecovery = readLatestContextRecovery(collector), rationaleRecovery = readLatestRationaleRecovery(collector), gameRecovery = readLatestGameReviewRecovery(collector), playerRecovery = readLatestPlayerContextRecovery(collector), reviewTimeoutRecovery = readLatestReviewTimeoutRecovery(collector), playerTimeoutRecovery = readLatestPlayerTimeoutRecovery(collector), deadlineRecovery = readLatestReviewDeadlineRecovery(collector);
  assert.ok(startupRecovery && contextRecovery && rationaleRecovery && gameRecovery && playerRecovery && reviewTimeoutRecovery && playerTimeoutRecovery && deadlineRecovery);
  const prior={ amendment, startupRecovery, contextRecovery, rationaleRecovery, gameRecovery, playerRecovery, reviewTimeoutRecovery, playerTimeoutRecovery, deadlineRecovery,
    previousAudit: getBlob(collector.root, contextRecovery.recovery.auditRef), playerAudit: getBlob(collector.root, playerRecovery.recovery.auditRef) };priorCache.set(collector,prior);return prior;
}

export function validateReviewMemoryExceptionInputs(collector, owner, audit) {
  keys(owner, ['schemaVersion','runId','recordedAt','source','threadId','questionItemId','question','answer','reviewId','decisionId','promptHash','preservedClaims','maxAdditionalCalls','maxTotalTargetClaims','ordinaryAttemptCap','maxInvocationWallMs','preserveOriginalAttempts','onReplacementFailure','previousBoundary','requiredPreparation','reviewedProposal','implementationPlan']);
  assert.equal(owner.schemaVersion, 'trix-review-memory-owner-authorization-1.0.0'); assert.equal(owner.source, 'direct-human-reply-in-current-chat'); assert.equal(owner.answer, 'Allow one replacement review (Recommended)');
  assert.ok(owner.question.includes('exactly one replacement review') && owner.question.includes('third call')); assert.ok(owner.questionItemId && owner.threadId);
  assert.equal(owner.runId, collector.manifest.runId); assert.equal(owner.reviewId, targetReview); assert.equal(owner.decisionId, targetDecision);
  for (const [key, value] of Object.entries({ maxAdditionalCalls:1, maxTotalTargetClaims:3, ordinaryAttemptCap:2, maxInvocationWallMs:300000, preserveOriginalAttempts:true, onReplacementFailure:'pause-with-no-fourth-call' })) assert.equal(owner[key], value);
  checkedBytes(collector.root, owner.reviewedProposal); checkedBytes(collector.root, owner.implementationPlan);
  keys(audit, ['schemaVersion','runId','previousBoundary','previousContextDigest','newInventory','probeReportRef','independentAuditRef','candidateSourceRef','assessment']);
  assert.equal(audit.schemaVersion, 'trix-review-memory-isolation-audit-1.0.0'); assert.equal(audit.runId, owner.runId); assert.deepEqual(audit.previousBoundary, owner.previousBoundary);
  const probe = checkedRef(collector.root, audit.probeReportRef), independent = checkedRef(collector.root, audit.independentAuditRef); checkedRef(collector.root, audit.candidateSourceRef);
  assert.equal(probe.status, 'synthetic-only-passed'); assert.equal(probe.campaignAdmission, false); assert.equal(independent.status, 'passed-synthetic-isolation-audit'); assert.equal(independent.campaignAdmission, false);
  keys(audit.assessment, ['memoryInstructionsAbsent','mirroredMemoryAbsent','campaignMarkersAbsent','sourceAndFlagsReviewed','summary','limitations']);
  for (const name of ['memoryInstructionsAbsent','mirroredMemoryAbsent','campaignMarkersAbsent','sourceAndFlagsReviewed']) assert.equal(audit.assessment[name], true);
  assert.ok(audit.assessment.summary && Array.isArray(audit.assessment.limitations));
  const inventory = audit.newInventory; assert.equal(inventory.schemaVersion, 'trix-host-base-context-admission-1.0.0'); assert.equal(inventory.approvedDigests.length, 1); assert.match(inventory.approvedDigests[0], /^[a-f0-9]{64}$/); assert.notEqual(inventory.approvedDigests[0], audit.previousContextDigest);
  assert.equal(probe.context.digest,inventory.approvedDigests[0]);assert.equal(probe.context.memoryInstructionPresent,false);assert.ok(Object.values(probe.context.memoryMarkers).every(count=>count===0));
  assert.equal(independent.memoryIsolation.actualContextDigest,inventory.approvedDigests[0]);assert.equal(independent.memoryIsolation.memoryInstructionPresent,false);assert.ok(Object.values(independent.memoryIsolation.markerCounts).every(count=>count===0));assert.equal(independent.candidateIsolationObserved,true);
  assert.equal(probe.sourceManifest.sha256,audit.candidateSourceRef.sha256);assert.equal(independent.source.metadata.sha256,audit.candidateSourceRef.sha256);assert.equal(independent.probe.process.executableHash,inventory.audit.executableHash);
  assert.equal(inventory.audit.memoryIsolation, true); assert.equal(inventory.audit.model, 'gpt-6-luna'); assert.equal(inventory.audit.effort, 'max'); assert.equal(inventory.audit.cwd, 'C:/Windows/Temp'); assert.equal(sha(readFileSync(inventory.audit.hostExecutable)), inventory.audit.executableHash);
  const job = read(collector.root, `outbox/${owner.reviewId}.json`); assert.equal(job.subjectId, owner.decisionId); assert.equal(job.promptHash, owner.promptHash); assert.equal(getBlob(collector.root, job.packetRef).legalOptions.length, 2, 'This narrow replacement is not a forced-policy exception');
  return job;
}
const validateInputs=validateReviewMemoryExceptionInputs;
function runtimeDelegation(prior){const parent=prior.playerTimeoutRecovery;return{recoveryHash:parent.recoveryHash,sourceFile:'scripts/trix-scenario-collection/player-timeout-recovery.mjs',sourceHash:parent.recovery.sourceHashes['scripts/trix-scenario-collection/player-timeout-recovery.mjs'],processingBuild:parent.recovery.processingBuild};}

export function assertReviewMemoryExceptionState(collector, latest, state = collector.state()) {
  const record = latest.recovery, rows = state.rows;
  assert.equal(one(rows, row => row.sequence === latest.authorization.sequence, 'exception authorization').hash, latest.authorization.hash);
  assert.ok(!rows.some(row => row.sequence > latest.authorization.sequence && row.kind === 'resume'), 'Legacy resume cannot reset the exception');
  const counts = new Map();
  for (const row of rows.filter(row => row.kind === 'review-dispatch-claimed')) { const count = (counts.get(row.data.reviewId) ?? 0) + 1; counts.set(row.data.reviewId, count); assert.ok(count <= (row.data.reviewId === record.reviewId ? 3 : 2), 'Review attempt cap exceeded'); }
  const claims = rows.filter(row => row.kind === 'review-dispatch-claimed' && row.data.reviewId === record.reviewId); assert.ok(claims.length >= 2 && claims.length <= 3);
  for (let index = 0; index < 2; index++) { assert.deepEqual(bind(claims[index]), record.claimBindings[index]); const settlement = one(rows, row => row.kind === 'review-attempt-settled' && row.data.jobId === claims[index].data.job.jobId, 'retained rejected attempt'); assert.deepEqual(bind(settlement), record.settlementBindings[index]); assert.equal(settlement.data.status, 'rejected'); }
  const job = read(collector.root, `outbox/${record.reviewId}.json`); assert.equal(sha(jsonBytes(job)), record.reviewJobHash);
  if (claims.length === 3) { const replacement = claims[2]; assert.ok(replacement.sequence > latest.authorization.sequence); assert.deepEqual(replacement.data.memoryExceptionAuthorization, memoryAuthorization(latest)); assert.equal(replacement.data.job.promptHash, job.promptHash); assert.deepEqual(replacement.data.job.promptRef, job.promptRef); assert.equal(Date.parse(replacement.data.job.deadlineAt) - Date.parse(replacement.data.job.claimedAt), 300000); assert.ok(!claims.slice(0,2).some(old => old.data.job.jobId === replacement.data.job.jobId || old.data.job.dispatchToken === replacement.data.job.dispatchToken)); }
  return { claims, job, paused: rows.some(row => row.sequence > latest.authorization.sequence && (row.kind === 'pause' || row.kind === 'attempt-settled' && row.data.fatal)) };
}

function validateRecord(collector, record, deep = false) {
  keys(record,['schemaVersion','runId','reviewId','decisionId','reviewJobHash','ownerAuthorizationRef','contextAuditRef','baselineRef','historicalCensusRef','previousBoundary','claimBindings','settlementBindings','contaminatedProof','firstPartialProof','previousDeadlineRecoveryHash','runtimeDelegation','forcedPolicyDelegation','gameReviewDelegation','originalManifestHash','originalSourceDigest','nativeBinaryDigest','inventory','inventoryHash','newContextDigest','processingBuild','sourceHashes','processingAudit','ordinaryAttemptCap','maxAdditionalCalls','maxTotalTargetClaims','maxInvocationWallMs']);
  assert.equal(record.schemaVersion, reviewMemoryExceptionVersion); assert.equal(record.runId, collector.manifest.runId); assert.equal(record.reviewId, targetReview); assert.equal(record.decisionId, targetDecision);
  assert.equal(record.originalManifestHash, sha(jsonBytes(collector.manifest))); assert.equal(record.originalSourceDigest, collector.manifest.build.sourceDigest); assert.equal(record.nativeBinaryDigest, collector.manifest.build.binaryDigest);
  const owner = checkedRef(collector.root, record.ownerAuthorizationRef), audit = checkedRef(collector.root, record.contextAuditRef); validateInputs(collector, owner, audit);
  for(const name of ['ordinaryAttemptCap','maxAdditionalCalls','maxTotalTargetClaims','maxInvocationWallMs'])assert.equal(record[name],owner[name]);
  assert.deepEqual(record.claimBindings.map(row=>row.sequence),owner.preservedClaims);
  assert.deepEqual(record.previousBoundary, owner.previousBoundary); assert.deepEqual(record.inventory, audit.newInventory); assert.equal(record.inventoryHash, sha(jsonBytes(record.inventory))); assert.equal(record.newContextDigest, record.inventory.approvedDigests[0]);
  assert.deepEqual(record.processingAudit, { originalSourceDigest: record.originalSourceDigest, reviewSourceDigest: record.processingBuild.sourceDigest, nativeBinaryDigest: record.nativeBinaryDigest });
  assert.equal(record.processingBuild.sourceDigest, sourceDigest(record.sourceHashes)); assert.equal(record.processingBuild.binaryDigest, record.nativeBinaryDigest);
  verifyBehaviorCompatibility(collector.manifest.sourceHashes, record.sourceHashes);
  const boundary = one(collector.state().rows, row => row.sequence === record.previousBoundary.sequence, 'preserved stopped boundary'); assert.equal(boundary.hash, record.previousBoundary.hash); assert.equal(boundary.kind, 'campaign-worker-stopped');
  const baseline = checkedRef(collector.root, record.baselineRef); assert.equal(baseline.schemaVersion,'trix-review-context-v3-preservation-baseline-1.0.0');assert.deepEqual(baseline.journalBoundary, record.previousBoundary); checkedRef(collector.root, record.historicalCensusRef);
  const prior=priorLayers(collector);assert.equal(record.previousDeadlineRecoveryHash,prior.deadlineRecovery.recoveryHash);assert.deepEqual(record.firstPartialProof,prior.deadlineRecovery.recovery.proof);assert.deepEqual(record.runtimeDelegation,runtimeDelegation(prior));assert.deepEqual(record.forcedPolicyDelegation,prior.playerTimeoutRecovery.recovery.forcedPolicyDelegation);assert.deepEqual(record.gameReviewDelegation,prior.playerTimeoutRecovery.recovery.gameReviewDelegation);
  for(const[file,hash]of Object.entries(prior.deadlineRecovery.recovery.sourceHashes))if(!['scripts/trix-scenario-collection.mjs','planning/implementation/coach-lab/trix-scenario-collection/README.md'].includes(file))assert.equal(record.sourceHashes[file],hash,`Predecessor source changed: ${file}`);
  if (deep) { resolveBuild(collector.root, record.sourceHashes, record.processingBuild); for (const [path, hash] of Object.entries(baseline.files)) assert.equal(sha(readFileSync(safePath(collector.root, path))), hash, `Preserved bytes changed: ${path}`); }
  return { owner, audit, baseline };
}

function verifyPriorMemoryHistory(collector,prior,baseline){
  const rows=collector.state().rows,prefix=historicalAuditView(collector,prior.deadlineRecovery.recovery.previousBoundary),claim=one(rows,row=>row.sequence===prior.deadlineRecovery.recovery.claimBinding.sequence,'old partial reviewer claim');
  const verified=verifyReviewDeadlineRecoveryHistory(prefix,{prior,deadlineClaim:claim,expectedProof:prior.deadlineRecovery.recovery.proof});
  const suffix=rows.filter(row=>row.sequence>prior.deadlineRecovery.recovery.previousBoundary.sequence&&row.sequence<=baseline.journalBoundary.sequence);
  assert.deepEqual(suffix.map(row=>row.kind),['review-deadline-recovery-authorized','campaign-worker-started','review-dispatch-claimed','review-attempt-settled','pause','campaign-worker-stopped']);
  assert.equal(suffix[0].hash,prior.deadlineRecovery.authorization.hash);assert.equal(suffix[1].data.reviewDeadlineRecoveryHash,prior.deadlineRecovery.recoveryHash);
  assert.equal(suffix[2].data.reviewId,claim.data.reviewId);assert.deepEqual(suffix[2].data.job.promptRef,claim.data.job.promptRef);assert.equal(suffix[2].data.job.promptHash,claim.data.job.promptHash);
  assert.equal(suffix[3].data.jobId,suffix[2].data.job.jobId);assert.equal(suffix[3].data.status,'rejected');assert.equal(suffix[3].data.reason,'Actual post-turn context differs from approved context');assert.equal(suffix[4].data.reason,'campaign-driver-failed');assert.equal(suffix[5].data.stop,'campaign-driver-failed');
  for(const[path,hash]of Object.entries(baseline.files))assert.equal(sha(readFileSync(safePath(collector.root,path))),hash,`Preserved bytes changed: ${path}`);
  assert.deepEqual(rows.filter(row=>row.sequence<=baseline.journalBoundary.sequence&&row.kind==='review-imported').map(row=>row.data),baseline.acceptedReviews);
  assert.deepEqual(rows.filter(row=>row.sequence<=baseline.journalBoundary.sequence&&row.kind==='move-committed').map(row=>({...bind(row),data:row.data})),baseline.committedMoves);
  return verified;
}

export function readLatestReviewMemoryException(collector, { deep = false } = {}) {
  const events = collector.state().rows.filter(row => row.kind === 'review-memory-exception-authorized'); if (!events.length) return null; assert.equal(events.length, 1, 'A further exception requires new reviewed implementation');
  const authorization = events[0], recoveryHash = authorization.data.exceptionHash, recoveryPath = `private/review-memory-exception/${recoveryHash}.json`;
  assert.equal(authorization.data.exceptionPath, recoveryPath); const recovery = read(collector.root, recoveryPath); assert.equal(sha(jsonBytes(recovery)), recoveryHash); validateRecord(collector, recovery, deep);
  assert.equal(authorization.sequence, recovery.previousBoundary.sequence + 1); const latest = { recovery, recoveryHash, recoveryPath, authorization }; assertReviewMemoryExceptionState(collector, latest); return latest;
}

// A bounded audit view reuses old verifiers only over their authenticated prefix.
// It is never a runtime facade; all actual runtime state retains every row.
function historicalAuditView(collector, boundary) {
  const state = collector.state(), rows = state.rows.filter(row => row.sequence <= boundary.sequence); assert.equal(rows.at(-1).hash, boundary.hash);
  const view = Object.create(collector); view.state = () => ({ ...state, rows, episode:null, pending:null, claimed:null, intent:null, response:null,
    commits: rows.filter(row => row.kind === 'move-committed').map(row => row.data), reviews: rows.filter(row => row.kind === 'review-imported').map(row => row.data), outcomes: rows.filter(row => row.kind === 'episode-completed').map(row => row.data) });view.inspector=inspectHostInvocation; return view;
}

function verifyContaminatedReview(collector, claim, baseline, prior) {
  const directory = `private/invocations/${claim.data.job.jobId}`, job = claim.data.job;
  for (const name of ['response.txt','receipt.json']) assert.equal(existsSync(safePath(collector.root, `${directory}/${name}`)), false, 'Contaminated final cannot become an admitted response');
  const files = Object.entries(baseline.files).filter(([path]) => path.startsWith(directory + '/')); assert.ok(files.length >= 10); for (const [path, hash] of files) assert.equal(sha(readFileSync(safePath(collector.root, path))), hash);
  const invocation = read(collector.root, `${directory}/private/app-server/invocation.json`), stopped = read(collector.root, `${directory}/private/app-server/stopped.json`);
  assert.equal(invocation.jobId, job.jobId); assert.equal(invocation.contextExportError, 'Actual post-turn context differs from approved context'); assert.equal(invocation.admitted, false); assert.equal(invocation.archived, true); assert.equal(invocation.syntheticOnly, false); assert.equal(invocation.toolCallCount, 0);
  assert.equal(stopped.stoppedVerified, true); assert.equal(stopped.error, null); assert.deepEqual(stopped.exit, { code:0, signal:null });
  const root = safePath(collector.root, directory), wire = readWireLog(root), prompt = getBlob(collector.root, job.promptRef, false), host = readFileSync(safePath(root, 'private/app-server/host-session.jsonl'));
  assert.deepEqual(read(root,'host-base-context-admission.json'),prior.playerAudit.newInventory);verifyTimeoutTransport(collector,job,claim.sequence,prior.reviewTimeoutRecovery);
  const inspected=inspectAppServerEvidence(root,job);assert.equal(inspected.available,false);assert.equal(inspected.reason,'Actual host context inventory not approved','Completed host must fail only the original context admission gate');
  assert.equal(stopped.wireDigest, wire.at(-1).hash); assert.equal(stopped.wireFrames, wire.length); assert.equal(sha(prompt), job.promptHash);
  const finals = wire.filter(row => row.direction === 'inbound' && row.frame.method === 'item/completed' && row.frame.params.item.type === 'agentMessage'); assert.equal(finals.length, 1); const bytes = Buffer.from(finals[0].frame.params.item.text); assert.equal(sha(bytes), invocation.responseHash);
  const context = describeAppServerContext(host, prompt); assert.equal(context.digest, invocation.actualBaseContextDigest); assert.notEqual(context.digest, invocation.baseContextDigest);
  assert.ok(context.parts.some(part => part.source === 'developer:memories.instructions' && part.text.includes('basic-solo-1:28:2')));
  return { schemaVersion:'trix-rejected-memory-review-1.0.0', claimHash:claim.hash, jobId:job.jobId, acceptedResponse:false, completedFinalObserved:true, responseHash:sha(bytes), contextDigest:context.digest, files:Object.fromEntries(files) };
}

export function verifyReviewMemoryExceptionHistory(collector, { latest, prior = priorLayers(collector) } = {}) {
  const record = latest.recovery, { baseline } = validateRecord(collector, record, true), rows = collector.state().rows;
  assert.equal(record.previousDeadlineRecoveryHash,prior.deadlineRecovery.recoveryHash);assert.deepEqual(record.firstPartialProof,prior.deadlineRecovery.recovery.proof);assert.deepEqual(record.runtimeDelegation,runtimeDelegation(prior));assert.deepEqual(record.forcedPolicyDelegation,prior.playerTimeoutRecovery.recovery.forcedPolicyDelegation);assert.deepEqual(record.gameReviewDelegation,prior.playerTimeoutRecovery.recovery.gameReviewDelegation);
  const historical = verifyPriorMemoryHistory(collector,prior,baseline);
  const second = one(rows, row => row.sequence === record.claimBindings[1].sequence, 'contaminated second claim'); assert.equal(second.hash, record.claimBindings[1].hash); const contaminated = verifyContaminatedReview(collector, second, baseline,prior); assert.deepEqual(contaminated, record.contaminatedProof);
  const inventoryFor = claim => claim.sequence > latest.authorization.sequence ? record.inventory : historical.inventoryFor(claim);
  assertReviewMemoryExceptionState(collector, latest);
  const attempts=new Map();for(const prepared of rows.filter(row=>row.kind==='job-prepared')){const ordinal=(attempts.get(prepared.data.decisionId)??0)+1;assert.ok(ordinal<=2);assert.equal(prepared.data.attempt,ordinal);attempts.set(prepared.data.decisionId,ordinal);}
  assert.ok(rows.filter(row=>row.kind==='dispatch-claimed').length<=collector.manifest.plan.workCaps.maxPlayerAttemptsCampaign);
  const state=collector.state();assert.ok(!state.pending&&!state.claimed&&!state.intent&&!state.response,'Outstanding player work requires separate reconciliation');
  for (const claim of rows.filter(row => ['dispatch-claimed','review-dispatch-claimed'].includes(row.kind) && row.sequence > latest.authorization.sequence)) {
    const jobId = claim.data.job?.jobId ?? claim.data.jobId, settlements = rows.filter(row => ['move-committed','attempt-settled','review-attempt-settled'].includes(row.kind) && row.data.jobId === jobId);
    const replacement=claim.kind==='review-dispatch-claimed'&&claim.data.reviewId===record.reviewId;
    assert.ok(settlements.length===1||replacement&&settlements.length===0,'Unsettled or ambiguous new epoch invocation');
    if(settlements.length){const settlement=settlements[0];assert.ok(settlement.sequence>claim.sequence);if(claim.kind==='review-dispatch-claimed'){assert.equal(settlement.kind,'review-attempt-settled');assert.ok(['accepted','rejected'].includes(settlement.data.status));}else{assert.ok(['move-committed','attempt-settled'].includes(settlement.kind));assert.ok(!settlement.data.fatal,'Unrelated fatal player stop');}}
    const evidence = verifyMemoryIsolationInvocation(collector, claim, record.inventory, { processingAudit:record.processingAudit, authorization:memoryAuthorization(latest) }); assert.equal(evidence.available, true, evidence.reason);
    if(claim.kind==='dispatch-claimed')verifyPriorPlayer(collector,claim,record.inventory);else verifyPriorHost(collector,claim,record.inventory);
  }
  for (const row of collector.state().reviews)verifyReviewMemoryProvenance(collector,row,{latest,allowTargetProvenanceRecovery:true});
  return { ...historical, inventory:record.inventory, inventoryFor, contaminatedProof:contaminated, prior, history:{ playerInvocations:rows.filter(row => row.kind === 'dispatch-claimed').length, reviewerInvocations:rows.filter(row => row.kind === 'review-dispatch-claimed').length } };
}

function preparationCandidate(collector, { ownerAuthorizationPath, auditPath } = {}) {
    assert.equal(collector.manifest.mode,'live');
    resolveOriginalReviewMemoryBuild(collector);
    const state = collector.state(); assertDerivationQuiescent(collector.root, state); assert.ok(state.paused && !state.episode && !state.pending && !state.claimed && !state.intent && !state.response);
    const ownerAuthorizationRef = ref(collector.root, ownerAuthorizationPath), contextAuditRef = ref(collector.root, auditPath), owner = checkedRef(collector.root, ownerAuthorizationRef), audit = checkedRef(collector.root, contextAuditRef), job = validateInputs(collector, owner, audit);
    assert.deepEqual(bind(state.rows.at(-1)), owner.previousBoundary); const claims = state.rows.filter(row => row.kind === 'review-dispatch-claimed' && row.data.reviewId === owner.reviewId); assert.equal(claims.length, 2); assert.deepEqual(claims.map(row => row.sequence), owner.preservedClaims);
    const settlements = claims.map(claim => one(state.rows, row => row.kind === 'review-attempt-settled' && row.data.jobId === claim.data.job.jobId, 'rejected original attempt')); for (const row of settlements) assert.equal(row.data.status, 'rejected');
    const prior = priorLayers(collector); assert.equal(audit.previousContextDigest, prior.playerAudit.newInventory.approvedDigests[0]); const baselineRef = ref(collector.root, baselinePath), baseline = checkedRef(collector.root, baselineRef);const verified=verifyPriorMemoryHistory(collector,prior,baseline);
    const hashes = sourceHashes(), processingBuild = { sourceDigest:sourceDigest(hashes), binaryDigest:collector.manifest.build.binaryDigest };
    const recovery = { schemaVersion:reviewMemoryExceptionVersion, runId:collector.manifest.runId, reviewId:owner.reviewId, decisionId:owner.decisionId, reviewJobHash:sha(jsonBytes(job)), ownerAuthorizationRef, contextAuditRef, baselineRef, historicalCensusRef:ref(collector.root,censusPath),
      previousBoundary:owner.previousBoundary, claimBindings:claims.map(bind), settlementBindings:settlements.map(bind), contaminatedProof:verifyContaminatedReview(collector, claims[1], baseline,prior), firstPartialProof:prior.deadlineRecovery.recovery.proof, previousDeadlineRecoveryHash:prior.deadlineRecovery.recoveryHash,runtimeDelegation:runtimeDelegation(prior),forcedPolicyDelegation:prior.playerTimeoutRecovery.recovery.forcedPolicyDelegation,gameReviewDelegation:prior.playerTimeoutRecovery.recovery.gameReviewDelegation,
      originalManifestHash:sha(jsonBytes(collector.manifest)), originalSourceDigest:collector.manifest.build.sourceDigest, nativeBinaryDigest:collector.manifest.build.binaryDigest, inventory:audit.newInventory, inventoryHash:sha(jsonBytes(audit.newInventory)), newContextDigest:audit.newInventory.approvedDigests[0], processingBuild, sourceHashes:hashes,
      processingAudit:{originalSourceDigest:collector.manifest.build.sourceDigest,reviewSourceDigest:processingBuild.sourceDigest,nativeBinaryDigest:collector.manifest.build.binaryDigest}, ordinaryAttemptCap:2,maxAdditionalCalls:1,maxTotalTargetClaims:3,maxInvocationWallMs:300000 };
    validateRecord(collector,recovery);return{recovery,verified,prior};
}
export async function preflightReviewMemoryException(collector,options={}){
  const candidate=preparationCandidate(collector,options),recoveryHash=sha(jsonBytes(candidate.recovery)),latest={recovery:candidate.recovery,recoveryHash,recoveryPath:`private/review-memory-exception/${recoveryHash}.json`,authorization:{sequence:candidate.recovery.previousBoundary.sequence+1,hash:null}};
  await buildReviewMemoryExceptionApis(collector,{...candidate.verified,prior:candidate.prior},latest);
  return{recovery:candidate.recovery,history:candidate.verified.history,newContextDigest:candidate.recovery.newContextDigest,modelCalls:0,journalMutation:false};
}
export function prepareReviewMemoryException(collector, options = {}) {
  return withRunLock(collector.root, () => {
    const existing = readLatestReviewMemoryException(collector); if (existing) return { ...existing, pins:existing.recovery.processingBuild, alreadyPrepared:true };
    const{recovery}=preparationCandidate(collector,options),hashes=recovery.sourceHashes,processingBuild=recovery.processingBuild;
    const original = resolveOriginalReviewMemoryBuild(collector); preserveBuild(collector.root,repository,hashes,processingBuild,original.binaryPath);
    const recoveryHash = sha(jsonBytes(recovery)), recoveryPath = `private/review-memory-exception/${recoveryHash}.json`; writeImmutable(safePath(collector.root,recoveryPath),jsonBytes(recovery)); appendEvent(collector.root,'review-memory-exception-authorized',{exceptionHash:recoveryHash,exceptionPath:recoveryPath});
    return { ...readLatestReviewMemoryException(collector), pins:processingBuild, alreadyPrepared:false };
  });
}

export function reviewMemoryExceptionFacade(collector, latest) {
  const facade = Object.create(collector), underlying = collector.state.bind(collector); Object.defineProperty(facade,'executionPolicy',{value:Object.freeze({maxActiveSegmentWallMs:null,selectionDeferred:true}),writable:false});
  facade.resume = () => { throw Error('The exception cannot resume or reset the legacy collector'); };
  facade.state = () => { const state = underlying(), checked = assertReviewMemoryExceptionState(collector,latest,state); return { ...state, paused:checked.paused }; };
  facade.inspector = (job, receipt) => { const claim = one(facade.state().rows,row => row.kind === 'dispatch-claimed' && row.data.jobId === job.jobId,'isolated player claim'); const evidence=verifyMemoryIsolationInvocation(facade,claim,latest.recovery.inventory,{processingAudit:latest.recovery.processingAudit,authorization:memoryAuthorization(latest)}); assert.equal(evidence.available,true,evidence.reason); return evidence; }; return facade;
}

export function claimReviewMemoryReplacement(collector, latest) {
  return withRunLock(collector.root, () => {
    assert.deepEqual(readLatestReviewMemoryException(collector),latest); const state=collector.state(), checked=assertReviewMemoryExceptionState(collector,latest,state); assert.equal(checked.paused,false,'Later pause prevents replacement'); assert.equal(checked.claims.length,2,'The one replacement is already consumed'); assert.ok(!state.reviews.some(row => row.stage === 'decision' && row.subjectId === latest.recovery.decisionId));
    const claimedAt=new Date().toISOString(), job={jobId:randomUUID(),dispatchToken:randomUUID(),promptHash:checked.job.promptHash,promptRef:checked.job.promptRef,claimedAt,deadlineAt:new Date(Date.parse(claimedAt)+300000).toISOString()};
    appendEvent(collector.root,'review-dispatch-claimed',{reviewId:checked.job.id,stage:checked.job.stage,job,memoryExceptionAuthorization:memoryAuthorization(latest)}); return { job };
  });
}
export function reviewMemoryReplacementProgress(state,latest){
  const claims=state.rows.filter(row=>row.kind==='review-dispatch-claimed'&&row.data.reviewId===latest.recovery.reviewId);assert.ok(claims.length===2||claims.length===3,'Replacement cap exceeded');
  const imports=state.reviews.filter(row=>row.stage==='decision'&&row.subjectId===latest.recovery.decisionId);assert.ok(imports.length<=1,'Duplicate target review');
  if(claims.length===2){assert.equal(imports.length,0,'An original rejected call cannot be accepted');return{stage:'claim',claim:null,row:null};}
  const claim=claims[2],settled=state.rows.filter(row=>row.kind==='review-attempt-settled'&&row.data.jobId===claim.data.job.jobId);assert.ok(settled.length<=1,'Duplicate replacement settlement');
  if(settled.length){assert.ok(settled[0].sequence>claim.sequence);assert.equal(settled[0].data.status,'accepted','Rejected replacement is exhausted; no fourth call');assert.equal(imports.length,1,'Accepted settlement requires an imported review');}
  return{stage:imports.length?(settled.length?'complete':'settle'):'import',claim,row:imports[0]??null};
}
export function reviewMemoryFailureSettlementNeeded(state,latest,claim){return claim.sequence>latest.authorization.sequence&&!state.rows.some(row=>row.kind==='review-attempt-settled'&&row.data.jobId===claim.data.job.jobId)&&!state.reviews.some(row=>row.stage==='decision'&&row.subjectId===latest.recovery.decisionId);}
export function finalizeReviewMemoryReplacement(collector,latest,claim,row,{loadAuthorization=readLatestReviewMemoryException}={}){return withRunLock(collector.root,()=>{assert.deepEqual(loadAuthorization(collector),latest);assert.equal(assertReviewMemoryExceptionState(collector,latest).paused,false);verifyReviewMemoryProvenance(collector,row,{latest});const progress=reviewMemoryReplacementProgress(collector.state(),latest);assert.equal(progress.claim.hash,claim.hash);if(progress.stage==='complete')return;assert.equal(progress.stage,'settle');appendEvent(collector.root,'review-attempt-settled',{jobId:claim.data.job.jobId,status:'accepted'});});}
const finalizeReplacement=finalizeReviewMemoryReplacement;

function assertOutgoing(collector, claim, latest, job) {
  const current=readLatestReviewMemoryException(collector); assert.deepEqual(current,latest); const state=collector.state(), checked=assertReviewMemoryExceptionState(collector,latest,state); assert.equal(checked.paused,false);
  const expected=claim.kind === 'review-dispatch-claimed' ? claim.data.job : {...one(state.rows,row=>row.kind==='job-prepared'&&row.data.jobId===claim.data.jobId,'player preparation').data,...claim.data}; assert.deepEqual(expected,job);
  assert.ok(claim.sequence>latest.authorization.sequence); assert.ok(!state.rows.some(row=>['attempt-settled','review-attempt-settled','move-committed'].includes(row.kind)&&row.data.jobId===job.jobId),'Settled invocation cannot dispatch again');
  if(claim.kind==='review-dispatch-claimed'&&claim.data.reviewId===latest.recovery.reviewId)assert.equal(checked.claims[2].hash,claim.hash);
  else if(claim.kind==='dispatch-claimed')assert.ok(expected.attempt<=2);
}

// The explicit loader seam permits composed synthetic host tests. Runtime/CLI
// always use the immutable production authorization reader.
export function importReviewMemoryReplacement(collector,latest,claim,bytes,receipt,{loadAuthorization=readLatestReviewMemoryException}={}) {
  return withRunLock(collector.root,()=>{
    assert.deepEqual(loadAuthorization(collector),latest);const checked=assertReviewMemoryExceptionState(collector,latest);assert.equal(checked.paused,false);assert.equal(checked.claims.length,3);assert.deepEqual(claim,checked.claims[2]);reviewMemoryReplacementProgress(collector.state(),latest); const job=read(collector.root,`outbox/${latest.recovery.reviewId}.json`),packet=getBlob(collector.root,job.packetRef),transport=claim.data.job;
    const evidence=verifyMemoryIsolationInvocation(collector,claim,latest.recovery.inventory,{processingAudit:latest.recovery.processingAudit,authorization:memoryAuthorization(latest)});assert.equal(evidence.available,true,evidence.reason);assert.equal(verifyHostReceipt(transport,receipt,evidence.events,evidence.baseContext).admitted,true);verifyResponseBytes(receipt,bytes);assert.ok(evidence.responseBytes.equals(bytes));
    const raw=JSON.parse(bytes.toString('utf8'));let proposal=raw,normalization=null;
    const inspectHost=()=>evidence;
    try{validateDecisionProposal(raw,job,packet);}catch{
      const validateEnvelope=raw.packetHash!==job.packetHash?validateHostReviewEnvelope:validateReferenceReviewEnvelope;
      const fixed=validateEnvelope(collector,job,transport,bytes,receipt,{processingAudit:latest.recovery.processingAudit,inspectHost});proposal=fixed.normalized;normalization=fixed.normalization;
    }
    const state=collector.state(),commit=getBlob(collector.root,job.commitRef);assert.ok(state.commits.some(row=>JSON.stringify(row)===JSON.stringify(commit)));assert.deepEqual(getBlob(collector.root,commit.savedRef).job.packetRef,job.packetRef);
    for(const row of state.commits.filter(row=>row.episodeId===commit.episodeId)){const saved=getBlob(collector.root,row.savedRef),player=getBlob(collector.root,saved.receiptRef);assert.notEqual(receipt.hostAgentId,player.hostAgentId);if(saved.job.parentThreadId)assert.notEqual(receipt.hostAgentId,saved.job.parentThreadId);}
    let certificate;const accepted=validateDecisionProposal(proposal,job,packet,{verifyProof:(m,j,p)=>{if(!job.proofEvidenceRefs.some(ref=>JSON.stringify(ref)===JSON.stringify(m.proofRef)))return{verified:false,reason:'Proof not frozen in review'};const result=verifyReviewProof(collector,m,j,p);if(proofMatches(result,m,j,p))certificate=result;return result;}});if(accepted.missedOpportunity){assert.ok(certificate);accepted.acceptedProofReceiptRef=putBlob(collector.root,certificate);}
    const hostEvidenceRef=putBlob(collector.root,{transportJob:transport,receipt,rawRef:putBlob(collector.root,bytes),admission:verifyHostReceipt(transport,receipt,evidence.events,evidence.baseContext),baseContextDigest:evidence.baseContext.digest,isolation:evidence.isolation}),metadataNormalizationRef=normalization?putBlob(collector.root,normalization):null;
    const wrapper={reviewerId:receipt.hostAgentId,promptHash:job.promptHash,responseHash:sha(jsonBytes(raw)),contextMode:'independent-review',hostEvidenceRef,...(metadataNormalizationRef?{metadataNormalizationRef}:{})};
    const prior=state.reviews.find(row=>row.stage==='decision'&&row.subjectId===job.subjectId);if(prior){assert.deepEqual(getBlob(collector.root,prior.originalRef),raw);assert.deepEqual(getBlob(collector.root,prior.reviewRef),accepted);assert.deepEqual(getBlob(collector.root,prior.reviewerReceiptRef),wrapper);return prior;}
    const row={stage:'decision',subjectId:job.subjectId,reviewRef:putBlob(collector.root,accepted),originalRef:putBlob(collector.root,raw),reviewerReceiptRef:putBlob(collector.root,wrapper),...(metadataNormalizationRef?{metadataNormalizationRef}:{})};if(normalization)appendEvent(collector.root,normalization.kind==='actor-handCounts-container'?'review-reference-normalized':'review-metadata-normalized',{reviewId:job.id,transportJobId:transport.jobId,metadataNormalizationRef,hostEvidenceRef,originalRef:row.originalRef,reviewRef:row.reviewRef});appendEvent(collector.root,'review-imported',row);return row;
  });
}

export async function buildReviewMemoryExceptionApis(collector,verified,latest) {
  const parent=verified.prior.playerTimeoutRecovery,build=resolveBuild(collector.root,parent.recovery.sourceHashes,parent.recovery.processingBuild),module=await import(pathToFileURL(resolve(build.sourceRoot,'scripts/trix-scenario-collection/player-timeout-recovery.mjs')).href),runtime=await module.buildPlayerTimeoutRecoveryApis(collector,verified.prior,verified,parent),api={...runtime.api};
  api.dispatchHostJob=(underlying,job,options)=>dispatchMemoryIsolatedHostJob(underlying,job,{...options,inventory:latest.recovery.inventory,processingAudit:latest.recovery.processingAudit,authorization:memoryAuthorization(latest),verifyClaim:(c,claim)=>assertOutgoing(c,claim,latest,job)});
  const oldVerify=api.verifyPriorHost;api.verifyPriorHost=(c,claim)=>{if(claim.sequence<=latest.authorization.sequence)return oldVerify(c,claim,verified.inventoryFor(claim));const evidence=verifyMemoryIsolationInvocation(c,claim,latest.recovery.inventory,{processingAudit:latest.recovery.processingAudit,authorization:memoryAuthorization(latest)});assert.equal(evidence.available,true,evidence.reason);return evidence;};
  const oldValidate=api.validateSavedContent;api.validateSavedContent=(c,job,transport,...args)=>{const claim=one(c.state().rows,row=>row.kind==='review-dispatch-claimed'&&row.data.job.jobId===transport.jobId,'review content claim');api.verifyPriorHost(c,claim);return oldValidate(c,job,transport,...args);};
  for(const name of ['importHostReview','importNormalizedHostReview']){const original=api[name];api[name]=(...args)=>{const[c,job,transport]=args,claim=one(c.state().rows,row=>row.kind==='review-dispatch-claimed'&&row.data.job.jobId===transport.jobId,'new review claim');assert.ok(job.id!==latest.recovery.reviewId,'Replacement uses its explicit import path');api.verifyPriorHost(c,claim);const row=original(...args);if(claim.sequence>latest.authorization.sequence)recordReviewMemoryProvenance(c,row,claim,latest);return row;};}
  const oldExport=api.exportRawGame;api.exportRawGame=(c,episodeId,options)=>exportReviewMemoryProvenance(c,episodeId,{latest,exportRawGame:oldExport,processingAudit:options.processingAudit});return{...runtime,api};
}

function ownDriver(root,hash){const path=safePath(root,'private/driver.lock');if(existsSync(path)){const owner=read(root,'private/driver.lock');assert.ok(Number.isSafeInteger(owner.pid)&&owner.pid>0);assert.equal(owner.worker,'full-campaign');assert.equal(owner.reviewMemoryExceptionHash,hash,'Unknown stale lease requires explicit reconciliation');let alive=true;try{process.kill(owner.pid,0);}catch(error){if(error.code==='ESRCH')alive=false;}assert.equal(alive,false,'A campaign worker is already active');unlinkSync(path);}const fd=openSync(path,'wx');writeFileSync(fd,jsonBytes({pid:process.pid,worker:'full-campaign',reviewMemoryExceptionHash:hash}));fsyncSync(fd);return()=>{closeSync(fd);unlinkSync(path);};}
export async function runReviewMemoryReplacement(root,{checkOnly=false,contextAdmission,cwd,executable,progress=value=>process.stdout.write(JSON.stringify(value)+'\n')}={}) {
  const collector=new Collector(root),latest=readLatestReviewMemoryException(collector,{deep:true});assert.ok(latest);const frozen=resolveBuild(root,latest.recovery.sourceHashes,latest.recovery.processingBuild);assert.equal(resolve(repository),resolve(frozen.sourceRoot),'Run the frozen exception processor');const release=ownDriver(root,latest.recoveryHash);let started=false;
  try{
    assert.equal(typeof checkOnly,'boolean');if(contextAdmission!==undefined)assert.deepEqual(JSON.parse(readFileSync(contextAdmission)),latest.recovery.inventory);if(cwd!==undefined)assert.equal(cwd,latest.recovery.inventory.audit.cwd);if(executable!==undefined)assert.equal(resolve(executable),resolve(latest.recovery.inventory.audit.hostExecutable));
    const facade=reviewMemoryExceptionFacade(collector,latest);if(facade.state().paused)return{stop:'paused-after-review-memory-exception'};const verified=verifyReviewMemoryExceptionHistory(facade,{latest}),runtime=await buildReviewMemoryExceptionApis(facade,verified,latest);
    if(checkOnly)return{stop:'review-memory-exception-admission-passed',recoveryHash:latest.recoveryHash,history:verified.history,newContextDigest:latest.recovery.newContextDigest,modelCalls:0,remainingReplacementCalls:3-assertReviewMemoryExceptionState(facade,latest).claims.length};
    withRunLock(root,()=>{assert.equal(facade.state().paused,false);appendEvent(root,'campaign-worker-started',{reviewMemoryExceptionHash:latest.recoveryHash,processingAudit:latest.recovery.processingAudit,wallLimit:null,selectionDeferred:true});});started=true;
    const recoveryProgress=reviewMemoryReplacementProgress(facade.state(),latest),imported=recoveryProgress.row;let claim=recoveryProgress.claim;
    if(!imported){if(!claim){const claimed=claimReviewMemoryReplacement(facade,latest);claim=one(facade.state().rows,row=>row.kind==='review-dispatch-claimed'&&row.data.job.jobId===claimed.job.jobId,'replacement claim');await runtime.api.dispatchHostJob(facade,claimed.job,{inventory:latest.recovery.inventory,...(executable?{executable}:{}),...(cwd?{cwd}:{})});}
      const settlements=facade.state().rows.filter(row=>row.kind==='review-attempt-settled'&&row.data.jobId===claim.data.job.jobId);assert.equal(settlements.length,0,'Rejected replacement is exhausted');const directory=`private/invocations/${claim.data.job.jobId}`,bytes=readFileSync(safePath(root,`${directory}/response.txt`)),receipt=read(root,`${directory}/receipt.json`),row=importReviewMemoryReplacement(facade,latest,claim,bytes,receipt);recordReviewMemoryProvenance(facade,row,claim,latest);finalizeReplacement(facade,latest,claim,row);
    }else{assert.ok(claim);recordReviewMemoryProvenance(facade,imported,claim,latest);finalizeReplacement(facade,latest,claim,imported);}
    const result=await runtime.runFullCampaign(facade,{inventory:latest.recovery.inventory,originalInventory:verified.originalInventory,originalThroughSequence:verified.prior.amendment.previousBoundary.sequence,reconciledReviewFailures:verified.reconciledReviewFailures,processingAudit:runtime.processingAudit,apis:runtime.api,...(executable?{executable}:{}),progress});withRunLock(root,()=>appendEvent(root,'campaign-worker-stopped',{reviewMemoryExceptionHash:latest.recoveryHash,stop:result.stop}));return result;
  }catch(error){if(started)withRunLock(root,()=>{const state=collector.state(),claim=state.rows.filter(row=>row.kind==='review-dispatch-claimed'&&row.data.reviewId===latest.recovery.reviewId).at(-1);if(reviewMemoryFailureSettlementNeeded(state,latest,claim)&&existsSync(safePath(root,`private/invocations/${claim.data.job.jobId}/private/app-server/stopped.json`))&&read(root,`private/invocations/${claim.data.job.jobId}/private/app-server/stopped.json`).stoppedVerified)appendEvent(root,'review-attempt-settled',{jobId:claim.data.job.jobId,status:'rejected',reason:error.message});if(!state.rows.some(row=>row.sequence>latest.authorization.sequence&&row.kind==='pause'))appendEvent(root,'pause',{reason:'review-memory-exception-failed',detail:error.message});appendEvent(root,'campaign-worker-stopped',{reviewMemoryExceptionHash:latest.recoveryHash,stop:'review-memory-exception-failed',reason:error.message});});throw error;}finally{release();}
}
export async function dispatchReviewMemoryException(collector,options={}){const latest=readLatestReviewMemoryException(collector);assert.ok(latest);const build=resolveBuild(collector.root,latest.recovery.sourceHashes,latest.recovery.processingBuild),module=await import(pathToFileURL(resolve(build.sourceRoot,'scripts/trix-scenario-collection/review-memory-exception.mjs')).href);return module.runReviewMemoryReplacement(collector.root,options);}
