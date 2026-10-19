// TSC-02/03: evidence must come from a host adapter, never from the player.
import assert from 'node:assert/strict';
import { sha } from './journal.mjs';
import { inspectHostInvocation as inspectJournal } from './host-journal.mjs';
import { existsSync } from 'node:fs';
import { safePath } from './journal.mjs';
import { inspectAppServerEvidence } from './app-server-bridge.mjs';

const exactKeys = (value, keys) => assert.deepEqual(Object.keys(value).sort(), [...keys].sort(), 'Unexpected host evidence fields');

export function verifyHostReceipt(job, receipt, trustedHostEvents, baseContextManifest) {
  const errors = [];
  try {
    exactKeys(receipt, ['schemaVersion', 'jobId', 'dispatchToken', 'promptHash', 'responseHash', 'hostAgentId', 'requestedModel', 'requestedEffort', 'reportedModelId', 'startedAt', 'finishedAt', 'dispatchStatus', 'usage']);
    assert.equal(receipt.schemaVersion, 'trix-host-receipt-1.0.0');
    for (const key of ['jobId', 'dispatchToken', 'promptHash']) assert.equal(receipt[key], job[key], `Receipt ${key} mismatch`);
    assert.equal(receipt.requestedModel, 'gpt-6-luna'); assert.equal(receipt.requestedEffort, 'max');
    assert.equal(receipt.dispatchStatus, 'completed');
    assert.ok(typeof receipt.hostAgentId === 'string' && receipt.hostAgentId.length > 0);
    assert.ok(Date.parse(receipt.startedAt) <= Date.parse(receipt.finishedAt), 'Invalid receipt times');
    assert.ok(Date.parse(receipt.finishedAt) <= Date.parse(job.deadlineAt), 'Response past deadline');
    assert.ok(trustedHostEvents?.verifiedByAdapter === true, 'Trusted host adapter inspection is unavailable');
    assert.equal(trustedHostEvents.agentId, receipt.hostAgentId);
    assert.equal(trustedHostEvents.jobId, job.jobId);
    assert.equal(trustedHostEvents.promptHash, job.promptHash);
    assert.equal(trustedHostEvents.responseHash, receipt.responseHash);
    assert.equal(trustedHostEvents.model, 'gpt-6-luna'); assert.equal(trustedHostEvents.effort, 'max');
    assert.equal(trustedHostEvents.forkTurns, 'none');
    assert.equal(trustedHostEvents.activityComplete, true);
    assert.equal(trustedHostEvents.toolCallCount, 0, 'Player used tools');
    assert.equal(trustedHostEvents.inheritedConversation, false);
    assert.equal(baseContextManifest?.inspected, true, 'Base context not inspected');
    assert.equal(baseContextManifest.episodeSpecificFacts, false);
    assert.equal(baseContextManifest.otherSeatEvidence, false);
    assert.equal(baseContextManifest.hiddenFixtureMemory, false);
    assert.match(baseContextManifest.digest, /^[a-f0-9]{64}$/);
    if (receipt.reportedModelId !== null) assert.equal(receipt.reportedModelId, trustedHostEvents.reportedModelId);
  } catch (error) { errors.push(error.message); }
  return { admitted: errors.length === 0, requestedModel: 'gpt-6-luna', requestedEffort: 'max', resolvedModelId: receipt?.reportedModelId ?? null, limitations: receipt?.reportedModelId ? [] : ['Host did not expose a resolved backend model revision.'], errors };
}

// Importing JSON containing verifiedByAdapter=true is NEVER an adapter.
// Only a local host-specific inspector can mint the evidence passed above.
export function inspectHostInvocation(job, receipt, root) {
  if (!job || !receipt || !root) return { available: false, reason: 'Host journal inspector installed; a completed capability probe and audited base-context inventory are required before live admission.' };
  if (/^[a-f0-9-]{36}$/.test(job.jobId)) {
    const invocationRoot=safePath(root,`private/invocations/${job.jobId}`);
    if(existsSync(safePath(invocationRoot,'private/app-server/wire.jsonl')))return inspectAppServerEvidence(invocationRoot,job);
  }
  return inspectJournal(job, receipt, root);
}

export function verifyResponseBytes(receipt, bytes) {
  assert.equal(receipt.responseHash, sha(bytes), 'Response bytes do not match host receipt');
}
