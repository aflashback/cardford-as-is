// Owner-authorized continuation; original experiments and their evidence stay frozen.
import assert from 'node:assert/strict';
import { closeSync, existsSync, fsyncSync, openSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { preserveBuild, resolveBuild, sourceDigest } from '../coach-lab-builds.mjs';
import { Collector, repository, sourceHashes } from './runner.mjs';
import { appendEvent, getBlob, jsonBytes, readJournal, safePath, sha, withRunLock, writeImmutable } from './journal.mjs';
import { assertDerivationQuiescent, verifyNativeCompatibility } from './derived-export.mjs';
import { verifyPriorHost, verifyPriorPlayer } from './review-worker.mjs';

export const amendmentPath = 'private/campaign-continuation.json';
export const campaignInventoryPath = 'private/campaign-host-base-context-admission.json';
const executionPolicy = Object.freeze({ maxActiveSegmentWallMs: null, selectionDeferred: true });
const ownerDecision = 'Remove the 90 minute limit window; continue and finish all necessary rounds and data collection for all planned scenarios and games. Selection is deferred. Keep detailed reviews after each game.';
const protectedModules = new Set(['contracts.mjs', 'review.mjs', 'proof-adapter.mjs', 'bridge.mjs', 'host-journal.mjs', 'app-server-bridge.mjs', 'external-reader.mjs', 'journal.mjs']);
const protectedSource = name => name.startsWith('contracts/trix-scenario-collection/') || name.startsWith('web/shared/') || name.startsWith('node_modules/') || name.startsWith('planning/implementation/coach-lab/trix-scenario-collection/prompts/') || name.startsWith('scripts/trix-scenario-collection/') && protectedModules.has(name.split('/').at(-1));

export function verifyBehaviorCompatibility(originalHashes, processingHashes) {
  verifyNativeCompatibility(originalHashes, processingHashes);
  const before = Object.keys(originalHashes).filter(protectedSource).sort();
  const after = Object.keys(processingHashes).filter(protectedSource).sort();
  assert.ok(before.includes('scripts/trix-scenario-collection/contracts.mjs'), 'Original actor-processing source is missing');
  assert.deepEqual(after, before, 'Actor/review contract dependency graph changed');
  for (const name of before) assert.equal(processingHashes[name], originalHashes[name], `Original actor/review behavior changed: ${name}`);
}

function inventoryFor(collector, path) {
  const inventory = JSON.parse(readFileSync(path, 'utf8'));
  assert.equal(inventory.schemaVersion, 'trix-host-base-context-admission-1.0.0');
  assert.ok(Array.isArray(inventory.approvedDigests), 'Context inventory requires an approved digest array');
  assert.equal(inventory.approvedDigests.length, 1, 'Exactly one admitted context digest required'); assert.match(inventory.approvedDigests[0], /^[a-f0-9]{64}$/);
  return inventory;
}

export function validateAmendment(collector, amendment, rows = collector.state().rows) {
  assert.deepEqual(Object.keys(amendment).sort(), ['schemaVersion','runId','createdAt','ownerDecision','originalManifestHash','originalSourceDigest','nativeBinaryDigest','previousBoundary','executionPolicy','reviewTiming','completionRequests','preservedWorkCaps','processingBuild','sourceHashes','originalContextInventoryHash','currentContextInventoryHash'].sort());
  assert.equal(amendment.schemaVersion, 'trix-campaign-continuation-1.0.0');
  assert.equal(amendment.runId, collector.manifest.runId);
  assert.equal(amendment.ownerDecision, ownerDecision);
  assert.ok(Number.isFinite(Date.parse(amendment.createdAt)));
  assert.equal(amendment.originalManifestHash, sha(jsonBytes(collector.manifest)));
  assert.equal(amendment.originalSourceDigest, collector.manifest.build.sourceDigest);
  assert.equal(amendment.nativeBinaryDigest, collector.manifest.build.binaryDigest);
  assert.deepEqual(amendment.executionPolicy, executionPolicy);
  assert.equal(amendment.reviewTiming, 'after-each-game');
  assert.deepEqual(amendment.completionRequests, collector.manifest.plan.phases.map(p => ({ variant: p.variant, requests: p.requests, completed: p.maxCompletedRequests, perContract: p.maxRequestsPerContract })));
  const { maxActiveSegmentWallMs, ...preserved } = collector.manifest.plan.workCaps;
  assert.deepEqual(amendment.preservedWorkCaps, preserved);
  assert.equal(amendment.processingBuild.sourceDigest, sourceDigest(amendment.sourceHashes));
  assert.equal(amendment.processingBuild.binaryDigest, amendment.nativeBinaryDigest);
  assert.deepEqual(Object.keys(amendment.processingBuild).sort(), ['binaryDigest','sourceDigest']);
  assert.match(amendment.originalContextInventoryHash, /^[a-f0-9]{64}$/);
  assert.match(amendment.currentContextInventoryHash, /^[a-f0-9]{64}$/);
  const originalInventory=inventoryFor(collector,safePath(collector.root,'host-base-context-admission.json'));
  const currentInventory=inventoryFor(collector,safePath(collector.root,campaignInventoryPath));
  assert.equal(sha(jsonBytes(originalInventory)),amendment.originalContextInventoryHash,'Original context inventory changed');
  assert.equal(sha(jsonBytes(currentInventory)),amendment.currentContextInventoryHash,'Continuation context inventory changed');
  assert.deepEqual(Object.keys(amendment.previousBoundary).sort(), ['hash','sequence']);
  const boundary = rows.find(r => r.sequence === amendment.previousBoundary.sequence);
  assert.ok(boundary && boundary.hash === amendment.previousBoundary.hash, 'Original journal boundary changed');
  verifyBehaviorCompatibility(collector.manifest.sourceHashes, amendment.sourceHashes);
  return amendment;
}

export function readCampaignAmendment(collector) {
  const amendment = validateAmendment(collector, JSON.parse(readFileSync(safePath(collector.root, amendmentPath), 'utf8')));
  const hash = sha(jsonBytes(amendment));
  const authorizations = collector.state().rows.filter(r => r.kind === 'campaign-continuation-authorized');
  assert.equal(authorizations.length, 1, 'Missing or ambiguous continuation authorization');
  assert.equal(authorizations[0].data.amendmentHash, hash);
  assert.equal(authorizations[0].data.amendmentPath, amendmentPath);
  assert.equal(authorizations[0].sequence, amendment.previousBoundary.sequence + 1, 'Authorization must follow the frozen boundary');
  return { amendment, authorization: authorizations[0] };
}

export function verifySettledHistory(collector, inventory, { originalInventory, originalThroughSequence, verifyPlayer = verifyPriorPlayer, verifyReviewer = verifyPriorHost } = {}) {
  const state = collector.state(), rows = state.rows;
  if(originalInventory!==undefined){
    assert.ok(originalInventory!==null&&typeof originalInventory==='object','Original context inventory required');
    assert.ok(Number.isSafeInteger(originalThroughSequence)&&originalThroughSequence>=1&&rows.some(row=>row.sequence===originalThroughSequence),'Original context boundary required');
  }else assert.equal(originalThroughSequence,undefined,'Original context inventory required for boundary');
  const inventoryAt=claim=>originalInventory!==undefined&&claim.sequence<=originalThroughSequence?originalInventory:inventory;
  assert.ok(!state.claimed && !state.intent && !state.pending, 'Outstanding player work requires trusted reconciliation');
  assert.ok(!rows.some(r => r.kind === 'attempt-settled' && r.data.fatal), 'Fatal player stop requires trusted reconciliation');
  for (const claim of rows.filter(r => r.kind === 'dispatch-claimed')) {
    const settled = rows.filter(r => r.sequence > claim.sequence && ['move-committed','attempt-settled'].includes(r.kind) && r.data.jobId === claim.data.jobId);
    assert.equal(settled.length, 1, 'Unsettled or ambiguous player dispatch');
    verifyPlayer(collector, claim, inventoryAt(claim));
  }
  for (const claim of rows.filter(r => r.kind === 'review-dispatch-claimed')) {
    const settled = rows.filter(r => r.kind === 'review-attempt-settled' && r.data.jobId === claim.data.job.jobId);
    assert.equal(settled.length, 1, 'Unsettled or ambiguous review dispatch');
    assert.ok(settled[0].sequence > claim.sequence && ['accepted','rejected'].includes(settled[0].data.status));
    const stopped = JSON.parse(readFileSync(safePath(collector.root, `private/invocations/${claim.data.job.jobId}/private/app-server/stopped.json`), 'utf8'));
    assert.equal(stopped.stoppedVerified, true, 'Prior reviewer host is not stopped');
    verifyReviewer(collector, claim, inventoryAt(claim));
  }
  return { playerInvocations: rows.filter(r => r.kind === 'dispatch-claimed').length, reviewerInvocations: rows.filter(r => r.kind === 'review-dispatch-claimed').length };
}

export function prepareCampaignContinuation(collector, { contextAdmission }) {
  assert.equal(collector.manifest.mode, 'live');
  return withRunLock(collector.root, () => {
    const state = collector.state(); assertDerivationQuiescent(collector.root, state);
    const inventory = inventoryFor(collector, contextAdmission);
    const originalInventory = inventoryFor(collector, safePath(collector.root, 'host-base-context-admission.json'));
    if (existsSync(safePath(collector.root, amendmentPath))) {
      // Recover only a metadata write whose immediately following authorization
      // was interrupted. Never move its boundary or create a second amendment.
      const saved = validateAmendment(collector, JSON.parse(readFileSync(safePath(collector.root, amendmentPath), 'utf8')));
      assert.equal(sha(jsonBytes(inventory)),saved.currentContextInventoryHash,'Continuation must use its frozen context inventory');
      if (!state.rows.some(r => r.kind === 'campaign-continuation-authorized')) {
        assert.equal(state.rows.at(-1).hash, saved.previousBoundary.hash);
        verifySettledHistory(collector, inventory, { originalInventory, originalThroughSequence: saved.previousBoundary.sequence });
        appendEvent(collector.root, 'campaign-continuation-authorized', { amendmentPath, amendmentHash: sha(jsonBytes(saved)) });
      }
      return { ...readCampaignAmendment(collector), alreadyPrepared: true };
    }
    assert.ok(state.paused, 'Pause the original collector before authorizing continuation');
    assert.ok(!state.episode, 'Initial policy amendment requires a completed-request boundary');
    // All claims before this first amendment retain their original admission.
    verifySettledHistory(collector, originalInventory);
    const hashes = sourceHashes(); verifyBehaviorCompatibility(collector.manifest.sourceHashes, hashes);
    const original = resolveBuild(collector.root, collector.manifest.sourceHashes, { sourceDigest: collector.manifest.build.sourceDigest, binaryDigest: collector.manifest.build.binaryDigest });
    const pins = { sourceDigest: sourceDigest(hashes), binaryDigest: collector.manifest.build.binaryDigest };
    preserveBuild(collector.root, repository, hashes, pins, original.binaryPath);
    writeImmutable(safePath(collector.root, campaignInventoryPath), jsonBytes(inventory));
    const { maxActiveSegmentWallMs, ...preservedWorkCaps } = collector.manifest.plan.workCaps;
    const amendment = {
      schemaVersion: 'trix-campaign-continuation-1.0.0', runId: collector.manifest.runId,
      createdAt: new Date().toISOString(), ownerDecision,
      originalManifestHash: sha(jsonBytes(collector.manifest)), originalSourceDigest: collector.manifest.build.sourceDigest,
      nativeBinaryDigest: collector.manifest.build.binaryDigest,
      previousBoundary: { sequence: state.rows.at(-1).sequence, hash: state.rows.at(-1).hash },
      executionPolicy, reviewTiming: 'after-each-game',
      completionRequests: collector.manifest.plan.phases.map(p => ({ variant: p.variant, requests: p.requests, completed: p.maxCompletedRequests, perContract: p.maxRequestsPerContract })),
      preservedWorkCaps, processingBuild: pins, sourceHashes: hashes,
      originalContextInventoryHash: sha(jsonBytes(originalInventory)), currentContextInventoryHash: sha(jsonBytes(inventory)),
    };
    validateAmendment(collector, amendment, state.rows);
    writeImmutable(safePath(collector.root, amendmentPath), jsonBytes(amendment));
    appendEvent(collector.root, 'campaign-continuation-authorized', { amendmentPath, amendmentHash: sha(jsonBytes(amendment)) });
    return { ...readCampaignAmendment(collector), alreadyPrepared: false };
  });
}

export function continuationFacade(collector, amendment, authorization) {
  validateAmendment(collector, amendment);
  assert.equal(authorization.kind, 'campaign-continuation-authorized');
  assert.equal(authorization.sequence, amendment.previousBoundary.sequence + 1);
  assert.equal(authorization.data.amendmentHash, sha(jsonBytes(amendment)));
  assert.equal(authorization.data.amendmentPath, amendmentPath);
  const facade = Object.create(collector), underlying = collector.state.bind(collector);
  Object.defineProperty(facade, 'executionPolicy', { value: Object.freeze({ ...amendment.executionPolicy }), writable: false, configurable: false });
  facade.resume = () => { throw Error('Use the frozen campaign continuation; do not resume the archived collector'); };
  facade.state = () => {
    const state = underlying();
    assert.equal(state.rows.find(r => r.sequence === authorization.sequence)?.hash, authorization.hash, 'Continuation authorization changed');
    assert.ok(!state.rows.some(r => r.sequence > authorization.sequence && r.kind === 'resume'), 'Archived baseline was resumed outside the continuation');
    const laterPause = state.rows.some(r => r.sequence > authorization.sequence && (r.kind === 'pause' || r.kind === 'attempt-settled' && r.data.fatal));
    return { ...state, paused: laterPause };
  };
  return facade;
}

function ownDriver(root, amendmentHash) {
  const path = safePath(root, 'private/driver.lock');
  if (existsSync(path)) {
    const prior = JSON.parse(readFileSync(path, 'utf8')); assert.ok(Number.isInteger(prior.pid) && prior.pid > 0);
    let alive = true; try { process.kill(prior.pid, 0); } catch (error) { if (error.code === 'ESRCH') alive = false; }
    assert.equal(alive, false, 'A campaign worker is already active'); unlinkSync(path);
  }
  const fd = openSync(path, 'wx');
  writeFileSync(fd, jsonBytes({ pid: process.pid, startedAt: new Date().toISOString(), worker: 'full-campaign', amendmentHash })); fsyncSync(fd);
  return () => { closeSync(fd); unlinkSync(path); };
}

// Called from this module's archived copy. Root CLI resolves that copy first.
export async function runAuthorizedCampaign(root, { contextAdmission, cwd, executable, checkOnly = false, progress = value => process.stdout.write(JSON.stringify(value) + '\n') } = {}) {
  assert.equal(typeof checkOnly, 'boolean');
  const collector = new Collector(root);
  const { amendment, authorization } = readCampaignAmendment(collector);
  const frozen = resolveBuild(root, amendment.sourceHashes, amendment.processingBuild);
  assert.equal(resolve(repository), resolve(frozen.sourceRoot), 'Campaign must execute its authorized frozen processor');
  const release = ownDriver(root, sha(jsonBytes(amendment)));
  try {
    const inventory = inventoryFor(collector, contextAdmission??safePath(collector.root,campaignInventoryPath));
    assert.equal(sha(jsonBytes(inventory)), amendment.currentContextInventoryHash,'Continuation must use its frozen context inventory');
    const originalInventory = inventoryFor(collector, safePath(collector.root,'host-base-context-admission.json'));
    assert.equal(sha(jsonBytes(originalInventory)), amendment.originalContextInventoryHash,'Original context inventory changed');
    const originalThroughSequence = amendment.previousBoundary.sequence;
    const facade = continuationFacade(collector, amendment, authorization);
    if (facade.state().paused) return { stop: 'paused-after-authorization', status: collector.status() };
    const history = verifySettledHistory(collector, inventory, { originalInventory, originalThroughSequence });
    const processingAudit = { originalSourceDigest: amendment.originalSourceDigest, reviewSourceDigest: amendment.processingBuild.sourceDigest, nativeBinaryDigest: amendment.nativeBinaryDigest };
    const { runFullCampaign } = await import('./campaign-driver.mjs');
    if (checkOnly) return { stop: 'campaign-admission-passed', runId: collector.manifest.runId, history, processingAudit, executionPolicy: facade.executionPolicy, reviewTiming: amendment.reviewTiming, targetRequests: amendment.completionRequests.reduce((n,p) => n+p.completed,0), modelCalls: 0 };
    withRunLock(root, () => appendEvent(root, 'campaign-worker-started', { amendmentHash: sha(jsonBytes(amendment)), processingAudit, history, wallLimit: null, selectionDeferred: true }));
    progress({ event: 'campaign-started', runId: collector.manifest.runId, completedRequests: collector.state().outcomes.length, targetRequests: amendment.completionRequests.reduce((n,p) => n+p.completed,0), wallLimit: null, selectionDeferred: true });
    const result = await runFullCampaign(facade, { inventory, originalInventory, originalThroughSequence, ...(cwd ? { cwd } : {}), ...(executable ? { executable } : {}), processingAudit, progress });
    withRunLock(root, () => appendEvent(root, 'campaign-worker-stopped', { amendmentHash: sha(jsonBytes(amendment)), stop: result.stop }));
    return result;
  } finally { release(); }
}

export async function dispatchAuthorizedCampaign(originalCollector, options) {
  const { amendment } = readCampaignAmendment(originalCollector);
  const frozen = resolveBuild(originalCollector.root, amendment.sourceHashes, amendment.processingBuild);
  const processor = await import(pathToFileURL(resolve(frozen.sourceRoot, 'scripts/trix-scenario-collection/campaign-continuation.mjs')).href);
  return processor.runAuthorizedCampaign(originalCollector.root, options);
}
