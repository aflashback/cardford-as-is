// One saved player response may be reinspected after an exact catalog removal.
// This verifier never dispatches, resumes, commits or rewrites original evidence.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describeAppServerContext, inspectAppServerEvidence } from './app-server-bridge.mjs';
import { receiptFromEvidence } from './live-driver.mjs';
import { contextEvidenceFiles, contextFailureReason } from './context-evidence.mjs';
import { projectPlayerPacket, validatePlayerPacket, resolveResponse } from './contracts.mjs';
import { getBlob, jsonBytes, safePath, sha, writeImmutable } from './journal.mjs';

export const removedGoogleWorkspaceEntrySha256 = '19d4bc1c0317a3f4cd305092528e64d6fab3dedb9323c4405878b50473a67f91';
export const playerContextEvidenceFiles = contextEvidenceFiles;
const sources = ['session_meta.base_instructions', 'developer:generic.developer_instructions', 'developer:memories.instructions', 'developer:host_skills.instructions', 'developer:permissions.instructions', 'developer:collaboration_mode.instructions', 'developer:multi_agent.role_instructions', 'developer:multi_agent.mode_instructions', 'user:environments.environment_context', 'world_state', 'turn_context.configuration'];
const one = (rows, predicate, label) => { const matches = rows.filter(predicate); assert.equal(matches.length, 1, `Missing or ambiguous ${label}`); return matches[0]; };
const keys = (value, names) => assert.deepEqual(Object.keys(value).sort(), [...names].sort());

function removeCatalogEntry(before, after) {
  assert.equal(typeof before, 'string'); assert.equal(typeof after, 'string');
  const entries = before.split('\n').filter(line => line.startsWith('- google-workspace:'));
  assert.equal(entries.length, 1, 'Exactly one original Google Workspace catalog entry required');
  const entry = entries[0]; assert.equal(sha(Buffer.from(entry)), removedGoogleWorkspaceEntrySha256, 'Unreviewed catalog entry');
  assert.equal(before.split(entry + '\n').length, 2, 'Ambiguous catalog entry removal');
  assert.equal(before.replace(entry + '\n', ''), after, 'Only the exact catalog line may be removed');
  assert.ok(!after.split('\n').some(line => line.startsWith('- google-workspace:')), 'Google Workspace catalog entry remains');
}

export function verifyGoogleWorkspaceCatalogRemoval(before, after) {
  assert.deepEqual(before.parts.map(part => part.source), sources); assert.deepEqual(after.parts.map(part => part.source), sources);
  for (let index = 0; index < sources.length; index++) if (![3, 9].includes(index)) assert.deepEqual(after.parts[index], before.parts[index], `Unexpected context change: ${sources[index]}`);
  removeCatalogEntry(before.parts[3].text, after.parts[3].text);
  const oldWorld = JSON.parse(before.parts[9].text), newWorld = JSON.parse(after.parts[9].text);
  assert.ok(oldWorld.host_skills && newWorld.host_skills); removeCatalogEntry(oldWorld.host_skills.body, newWorld.host_skills.body);
  const projected = { ...oldWorld, host_skills: { ...oldWorld.host_skills, body: newWorld.host_skills.body } };
  assert.deepEqual(projected, newWorld, 'World state changed beyond the skills catalog body');
  assert.notEqual(before.digest, after.digest);
  return [3, 9].map(index => ({ index, source: sources[index], beforeSha256: sha(Buffer.from(before.parts[index].text)), afterSha256: sha(Buffer.from(after.parts[index].text)) }));
}

export function verifyPlayerContextEvidence(collector, claim, audit) {
  keys(audit, ['schemaVersion', 'jobId', 'preparedHash', 'claimHash', 'settlementHash', 'previousContextJobId', 'previousInventoryHash', 'newInventory', 'previousDigest', 'actualDigest', 'changes', 'removedCatalogEntrySha256', 'evidenceHashes', 'assessment']);
  assert.equal(audit.schemaVersion, 'trix-player-context-evidence-amendment-1.0.0'); assert.equal(audit.removedCatalogEntrySha256, removedGoogleWorkspaceEntrySha256);
  const state = collector.state(), rows = state.rows;
  assert.equal(claim.kind, 'dispatch-claimed'); assert.deepEqual(one(rows, row => row.sequence === claim.sequence, 'player claim'), claim);
  assert.equal(claim.data.jobId, audit.jobId); assert.equal(claim.hash, audit.claimHash);
  assert.equal(rows.filter(row => row.kind === 'dispatch-claimed' && row.data.jobId === audit.jobId).length, 1);
  const prepared = one(rows, row => row.kind === 'job-prepared' && row.data.jobId === audit.jobId, 'original player preparation');
  assert.equal(prepared.hash, audit.preparedHash); assert.ok(prepared.sequence < claim.sequence);
  const settlement = one(rows, row => row.kind === 'attempt-settled' && row.data.jobId === audit.jobId, 'fatal context rejection');
  assert.equal(settlement.hash, audit.settlementHash); assert.ok(settlement.sequence > claim.sequence); assert.equal(settlement.data.fatal, true); assert.equal(settlement.data.reason, contextFailureReason); assert.equal(settlement.data.dispatchToken, claim.data.dispatchToken);
  const job = { ...prepared.data, ...claim.data };
  assert.equal(job.schemaVersion, 'trix-player-job-1.0.0'); assert.equal(job.runId, collector.manifest.runId);
  assert.equal(job.attempt, 1, 'This context amendment may recover only the first consumed player attempt');
  assert.equal(job.requestedModel, 'gpt-6-luna'); assert.equal(job.requestedEffort, 'max');
  assert.equal(rows.filter(row => row.kind === 'job-prepared' && row.data.episodeId === job.episodeId && row.data.revision === job.revision).length, 1, 'A replacement attempt prevents saved-first recovery');
  const duration = Date.parse(job.deadlineAt) - Date.parse(job.claimedAt); assert.ok(Number.isFinite(duration) && duration > 0 && duration <= 300000);
  const activeEpisode = one(rows, row => row.kind === 'episode-started' && row.data.episode.episodeId === job.episodeId, 'original episode');
  assert.ok(activeEpisode.sequence < prepared.sequence);
  assert.ok(!rows.some(row => row.sequence > claim.sequence && row.kind === 'episode-abandoned' && row.data.episodeId === job.episodeId), 'Original request was abandoned');
  const beforeRow = rows.filter(row => row.sequence < prepared.sequence && (row.kind === 'episode-started' && row.data.episode.episodeId === job.episodeId || row.kind === 'move-committed' && row.data.episodeId === job.episodeId)).at(-1);
  assert.ok(beforeRow, 'Original native frame is missing'); const beforeFrameRef = beforeRow.data.frameRef, before = getBlob(collector.root, beforeFrameRef);
  assert.equal(before.revision, job.revision); assert.equal(before.nativeActorPacket.seat, job.actor); assert.equal(before.node.phase, job.phase); assert.deepEqual(before.pin, job.pin);
  assert.deepEqual(getBlob(collector.root, job.nativePacketRef), before.nativeActorPacket);
  const packet = validatePlayerPacket(getBlob(collector.root, job.packetRef));
  assert.deepEqual(projectPlayerPacket(before.nativeActorPacket, before.pin, before.revision, job.jobId, before.rules), packet, 'Original actor-safe packet changed');
  assert.equal(packet.actor, job.actor); assert.equal(packet.nativeRevision, job.revision); assert.deepEqual(packet.pin, job.pin); assert.equal(packet.sharedRulesHash, job.sharedRulesHash);
  const responseSchema = `contracts/trix-scenario-collection/${job.phase === 'declare-doubles' ? 'declaration-response' : 'play-response'}.schema.json`;
  assert.equal(job.responseSchemaHash, collector.manifest.sourceHashes[responseSchema]); assert.equal(sha(readFileSync(resolve(collector.sourceRoot, responseSchema))), job.responseSchemaHash);
  const root = safePath(collector.root, `private/invocations/${job.jobId}`), read = path => JSON.parse(readFileSync(safePath(root, path)));
  for (const path of ['response.txt', 'receipt.json']) assert.equal(existsSync(safePath(root, path)), false, 'Original output exists; use ordinary reconciliation');
  keys(audit.evidenceHashes, [...playerContextEvidenceFiles, job.promptRef.path]);
  for (const [path, hash] of Object.entries(audit.evidenceHashes)) { assert.match(hash, /^[a-f0-9]{64}$/); assert.equal(sha(readFileSync(safePath(root, path))), hash, `Changed original evidence: ${path}`); }
  assert.deepEqual(read('job.json'), job); assert.deepEqual(read('private/app-server/job.json'), job);
  assert.deepEqual(JSON.parse(readFileSync(safePath(collector.root, `outbox/${job.jobId}.json`))), prepared.data); assert.deepEqual(JSON.parse(readFileSync(safePath(collector.root, `outbox/${job.jobId}.claim.json`))), claim.data);
  const prompt = getBlob(collector.root, job.promptRef, false); assert.equal(sha(prompt), job.promptHash); assert.ok(prompt.equals(getBlob(root, job.promptRef, false)));
  const oldInventory = read('host-base-context-admission.json'), inventory = audit.newInventory; assert.equal(sha(jsonBytes(oldInventory)), audit.previousInventoryHash);
  for (const [inv, digest] of [[oldInventory, audit.previousDigest], [inventory, audit.actualDigest]]) { assert.equal(inv.schemaVersion, 'trix-host-base-context-admission-1.0.0'); assert.deepEqual(inv.approvedDigests, [digest]); assert.match(digest, /^[a-f0-9]{64}$/); }
  assert.equal(inventory.audit.hostExecutable, oldInventory.audit.hostExecutable); assert.equal(inventory.audit.evidence, `private/invocations/${job.jobId}/private/app-server/host-session.jsonl`);
  assert.equal(inventory.audit.hostJournalSha256, audit.evidenceHashes['private/app-server/host-session.jsonl']); assert.equal(inventory.audit.contextAuditSha256, audit.evidenceHashes['private/app-server/context-audit.json']);
  assert.equal(inventory.audit.previousDigest, audit.previousDigest); assert.equal(inventory.audit.classification, audit.assessment.summary); assert.equal(inventory.audit.cwd, 'C:/Windows/Temp'); assert.equal(inventory.audit.model, 'gpt-6-luna'); assert.equal(inventory.audit.effort, 'max');
  const prior = one(rows, row => ['dispatch-claimed', 'review-dispatch-claimed'].includes(row.kind) && (row.data.job?.jobId ?? row.data.jobId) === audit.previousContextJobId, 'previous context claim'); assert.ok(prior.sequence < claim.sequence);
  const previousRoot = safePath(collector.root, `private/invocations/${audit.previousContextJobId}`);
  assert.deepEqual(JSON.parse(readFileSync(safePath(previousRoot, 'host-base-context-admission.json'))), oldInventory);
  const previousJob = JSON.parse(readFileSync(safePath(previousRoot, 'job.json'))), previousPrompt = getBlob(previousRoot, previousJob.promptRef, false); assert.equal(previousJob.jobId, audit.previousContextJobId); assert.equal(sha(previousPrompt), previousJob.promptHash);
  if (prior.data.job) assert.deepEqual(previousJob, prior.data.job);
  const beforeContext = describeAppServerContext(readFileSync(safePath(previousRoot, 'private/app-server/host-session.jsonl')), previousPrompt), afterContext = describeAppServerContext(readFileSync(safePath(root, 'private/app-server/host-session.jsonl')), prompt);
  assert.equal(beforeContext.digest, audit.previousDigest); assert.equal(afterContext.digest, audit.actualDigest); assert.deepEqual(read('private/app-server/context-audit.json'), afterContext); assert.deepEqual(verifyGoogleWorkspaceCatalogRemoval(beforeContext, afterContext), audit.changes);
  keys(audit.assessment, ['changedContextReviewed', 'episodeSpecificFacts', 'otherSeatEvidence', 'hiddenFixtureMemory', 'summary', 'limitations']); assert.equal(audit.assessment.changedContextReviewed, true);
  for (const field of ['episodeSpecificFacts', 'otherSeatEvidence', 'hiddenFixtureMemory']) assert.equal(audit.assessment[field], false);
  assert.ok(typeof audit.assessment.summary === 'string' && audit.assessment.summary.length > 0); assert.ok(Array.isArray(audit.assessment.limitations) && audit.assessment.limitations.every(value => typeof value === 'string' && value.length > 0));
  const process = read('private/app-server/process.json'), previousProcess = JSON.parse(readFileSync(safePath(previousRoot, 'private/app-server/process.json'))), invocation = read('private/app-server/invocation.json'), stopped = read('private/app-server/stopped.json');
  assert.deepEqual(process.args, previousProcess.args); assert.equal(process.executableHash, previousProcess.executableHash); assert.equal(resolve(process.executable), resolve(inventory.audit.hostExecutable)); assert.equal(process.executableHash, sha(readFileSync(process.executable)));
  assert.equal(process.adapterSourceHash, collector.manifest.sourceHashes['scripts/trix-scenario-collection/app-server-bridge.mjs']); assert.equal(process.journalSourceHash, collector.manifest.sourceHashes['scripts/trix-scenario-collection/journal.mjs']); assert.equal(process.cwd.replaceAll('\\', '/').toLowerCase(), 'c:/windows/temp');
  assert.equal(stopped.stoppedVerified, true); assert.equal(stopped.error, null); assert.deepEqual(stopped.exit, { code: 0, signal: null });
  assert.equal(invocation.schemaVersion, 'trix-app-server-invocation-1.0.0'); assert.equal(invocation.jobId, job.jobId); assert.equal(invocation.model, 'gpt-6-luna'); assert.equal(invocation.effort, 'max'); assert.equal(invocation.promptHash, job.promptHash);
  assert.equal(invocation.baseContextDigest, audit.previousDigest); assert.equal(invocation.actualBaseContextDigest, audit.actualDigest); assert.equal(invocation.contextExportError, contextFailureReason);
  assert.equal(invocation.admitted, false); assert.equal(invocation.syntheticOnly, false); assert.equal(invocation.stoppedVerified, true); assert.equal(invocation.archived, true); assert.equal(invocation.toolCallCount, 0); assert.deepEqual(invocation.unclassifiedNotificationMethods, []);
  assert.deepEqual(invocation.hostJournalRef, { path: 'private/app-server/host-session.jsonl', sha256: audit.evidenceHashes['private/app-server/host-session.jsonl'] });
  const auditHash = sha(jsonBytes(audit)), viewPath = `private/player-context-replay/${job.jobId}/${auditHash}`, viewRoot = safePath(collector.root, viewPath);
  for (const path of [...playerContextEvidenceFiles, job.promptRef.path]) if (path !== 'host-base-context-admission.json') writeImmutable(safePath(viewRoot, path), readFileSync(safePath(root, path)));
  writeImmutable(safePath(viewRoot, 'host-base-context-admission.json'), jsonBytes(inventory));
  const evidence = inspectAppServerEvidence(viewRoot, job); assert.equal(evidence.available, true, evidence.reason); assert.equal(evidence.baseContext.digest, audit.actualDigest); assert.equal(evidence.events.agentId, invocation.threadId); assert.equal(evidence.events.responseHash, invocation.responseHash);
  const receipt = receiptFromEvidence(job, evidence), bytes = evidence.responseBytes, response = JSON.parse(bytes.toString('utf8')), candidateId = resolveResponse(getBlob(collector.root, job.nativePacketRef), response);
  writeImmutable(safePath(viewRoot, 'response.txt'), bytes); writeImmutable(safePath(viewRoot, 'receipt.json'), jsonBytes(receipt));
  const proof = { schemaVersion: 'trix-player-context-response-proof-1.0.0', jobId: job.jobId, preparedSequence: prepared.sequence, preparedHash: prepared.hash, claimSequence: claim.sequence, claimHash: claim.hash,
    settlementSequence: settlement.sequence, settlementHash: settlement.hash, auditHash, previousDigest: audit.previousDigest, actualDigest: audit.actualDigest, responseHash: sha(bytes), threadId: receipt.hostAgentId, promptHash: job.promptHash,
    packetRef: job.packetRef, nativePacketRef: job.nativePacketRef, beforeFrameRef, responseSchemaHash: job.responseSchemaHash, candidateId, evidenceHashes: audit.evidenceHashes, viewPath };
  return { proof, evidence, receipt, bytes, job, prepared, claim, settlement, response, candidateId, viewRoot };
}
