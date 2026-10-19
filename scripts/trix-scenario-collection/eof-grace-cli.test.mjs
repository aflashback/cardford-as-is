// Routing-only fixtures: no campaign, native, provider, lease or filesystem writes.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as cli from '../trix-scenario-collection.mjs';

const collector = rows => ({ state: () => ({ rows }) });
const parent = { sequence: 1965, kind: 'validation-execution-amendment-authorized' };
const pause = { sequence: 1993, kind: 'pause' };
const authority = { sequence: 1995, kind: 'eof-grace-recovery-authorized' };

test('EOF recovery routing is available only as an explicit new route', () => {
  assert.equal(typeof cli.selectEofGraceRecoveryRoute, 'function');
});

test('all campaign/check aliases select the new EOF authority before the parent route', () => {
  assert.equal(typeof cli.selectEofGraceRecoveryRoute, 'function');
  const c = collector([parent, pause, authority]);
  for (const command of ['campaign', 'campaign-check', 'campaign-recovery-check', 'campaign-context-check', 'campaign-reference-check', 'campaign-rationale-check', 'campaign-game-review-check', 'campaign-player-context-check', 'campaign-review-timeout-check', 'campaign-player-timeout-check', 'campaign-review-deadline-check', 'campaign-review-memory-check', 'campaign-isolated-host-stop-check', 'campaign-isolated-host-stop-v2-check', 'campaign-player-archive-cancellation-check', 'campaign-review-startup-rpc-check', 'campaign-validation-execution-check', 'campaign-eof-grace-check']) {
    assert.equal(cli.selectEofGraceRecoveryRoute(c, command), true, command);
  }
});

test('dedicated EOF check cannot fall back to the older admitted recovery', () => {
  assert.equal(typeof cli.selectEofGraceRecoveryRoute, 'function');
  assert.throws(() => cli.selectEofGraceRecoveryRoute(collector([parent, pause]), 'campaign-eof-grace-check'), /not yet admitted/);
  assert.equal(cli.selectEofGraceRecoveryRoute(collector([parent, pause]), 'campaign'), false);
});

test('unrelated and preparation commands do not inspect or dispatch campaign history', () => {
  assert.equal(typeof cli.selectEofGraceRecoveryRoute, 'function');
  const c = { state() { throw Error('unexpected history read'); } };
  for (const command of ['pause', 'status', 'admit-eof-grace-recovery', 'admit-validation-execution', 'recover-review-startup-rpc', 'export']) assert.equal(cli.selectEofGraceRecoveryRoute(c, command), false, command);
});

test('similar event names and user approval reports do not substitute for machine admission', () => {
  assert.equal(typeof cli.selectEofGraceRecoveryRoute, 'function');
  for (const kind of ['eof-grace-recovery-approved', 'eof-grace-recovery-candidate', 'eof-grace-recovery-authorization']) assert.equal(cli.selectEofGraceRecoveryRoute(collector([parent, { kind }]), 'campaign'), false, kind);
});
