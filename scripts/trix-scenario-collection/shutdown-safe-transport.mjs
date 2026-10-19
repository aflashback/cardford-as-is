// An additive shutdown guard; the original bridge and inspector stay pinned.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { defaultExecutable, startClient, probeCapability, invoke, inspectAppServerEvidence } from './app-server-bridge.mjs';
import { receiptFromEvidence } from './live-driver.mjs';
import { getBlob, jsonBytes, safePath, sha, writeImmutable } from './journal.mjs';

export const shutdownGuardVersion = 'trix-host-shutdown-guard-1.0.0';
export const shutdownGuardSourceHash = sha(readFileSync(new URL(import.meta.url)));
export const transportPolicyVersion = shutdownGuardVersion;
export const shutdownSafeTransportSourceHash = shutdownGuardSourceHash;

export function startShutdownSafeClient(options) {
  const client = startClient(options);
  let stopping = false, stopped = null;
  const unavailable = () => client.error ?? Error('App-server is stopping');
  return {
    root: client.root, notifications: client.notifications, signals: client.signals,
    request(method, params) { return stopping ? Promise.reject(unavailable()) : client.request(method, params); },
    notify(method, params) { if (stopping) throw unavailable(); return client.notify(method, params); },
    get error() { return client.error; },
    get exited() { return client.exited; },
    get stopping() { return stopping; },
    stop() {
      if (!stopping) {
        // Set this before stdin.end(), including synchronous stream callbacks.
        stopping = true;
        stopped = client.stop();
      }
      return stopped;
    },
  };
}

// Explicitly selected by an authorized processor; it never claims or retries.
// Timing, recording, context checks and receipt derivation mirror the original.
export async function dispatchShutdownSafeHostJob(collector, job, { inventory, cwd = 'C:/Windows/Temp', executable = defaultExecutable }) {
  const root = safePath(collector.root, `private/invocations/${job.jobId}`);
  assert.ok(!existsSync(safePath(root, 'private/app-server/wire.jsonl')), 'Invocation already exists; reconcile it before retrying');
  writeImmutable(safePath(root, 'job.json'), jsonBytes(job));
  writeImmutable(safePath(root, job.promptRef.path), getBlob(collector.root, job.promptRef, false));
  writeImmutable(safePath(root, 'host-base-context-admission.json'), jsonBytes(inventory));
  const remaining = Date.parse(job.deadlineAt) - Date.now(); assert.ok(remaining > 0, 'Dispatch deadline expired');
  writeImmutable(safePath(root, 'private/app-server/shutdown-guard.json'), jsonBytes({ schemaVersion: shutdownGuardVersion, jobId: job.jobId, sourceHash: shutdownGuardSourceHash }));
  const client = startShutdownSafeClient({ root, cwd, executable, timeoutMs: Math.min(30000, remaining) });
  let expired = false;
  const deadlineTimer = setTimeout(() => { expired = true; void client.stop(); }, remaining);
  try {
    const capability = await probeCapability(client, { cwd });
    const timeoutMs = Date.parse(job.deadlineAt) - Date.now(); assert.ok(timeoutMs > 0, 'Dispatch setup exhausted deadline');
    await invoke(client, capability, job, { auditedContextDigest: inventory.approvedDigests[0], timeoutMs });
    assert.equal(expired, false, 'Invocation exceeded its absolute deadline');
    const evidence = inspectAppServerEvidence(root, job); assert.equal(evidence.available, true, evidence.reason);
    const receipt = receiptFromEvidence(job, evidence);
    writeImmutable(safePath(root, 'response.txt'), evidence.responseBytes); writeImmutable(safePath(root, 'receipt.json'), jsonBytes(receipt));
    return { bytes: evidence.responseBytes, receipt };
  } finally {
    const stopped = await client.stop(); clearTimeout(deadlineTimer); assert.equal(stopped.stoppedVerified, true, 'Host process termination is uncertain');
  }
}
