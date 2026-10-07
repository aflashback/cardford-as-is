// Seconds-long checks of success, deadline termination and descendant shutdown.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { runBoundedNative } from './bounded-native-run.mjs';

if (process.argv[2] === '--child') {
  const descendant = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { windowsHide: true, stdio: 'ignore' });
  console.log(JSON.stringify({ descendantPID: descendant.pid }));
  setInterval(() => {}, 1000);
} else {
  const startedAt = new Date().toISOString(), started = performance.now();
  const success = await runBoundedNative(process.execPath, ['-e', 'console.log("completed")'], { milliseconds: 3000 });
  assert.equal(success.status, 'passed');
  assert.match(success.output, /completed/);
  const expired = await runBoundedNative(process.execPath, [fileURLToPath(import.meta.url), '--child'], { milliseconds: 1200 });
  assert.equal(expired.timedOut, true);
  assert.equal(expired.status, 'pending-unverified');
  assert.equal(expired.shutdownError, null);
  assert.ok(expired.elapsedMs < 1200, 'process-tree shutdown exceeded its total ceiling');
  const receipt = expired.output.split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line))[0];
  assert.ok(Number.isInteger(receipt.descendantPID));
  let descendantClosed = false;
  try { process.kill(receipt.descendantPID, 0); } catch (error) { if (error.code === 'ESRCH') descendantClosed = true; else throw error; }
  assert.ok(descendantClosed, 'deadline left a descendant running');
  await assert.rejects(runBoundedNative(process.execPath, [], { milliseconds: 1800001 }), /1800 seconds/);
  await assert.rejects(runBoundedNative(process.execPath, [], { milliseconds: 0 }), /positive/);
  const report = { startedAt, completedAt: new Date().toISOString(), elapsedMs: performance.now() - started,
    checks: ['successful short child', '1.2-second deadline stops owned child tree', 'descendant PID no longer running', 'over-ceiling/zero deadlines rejected'],
    success, expired, descendantClosed, databaseWork: false, fullSuites: false, status: 'passed' };
  if (process.argv[2]) writeFileSync(process.argv[2], JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ status: report.status, elapsedMs: report.elapsedMs, descendantClosed, databaseWork: false }));
}
