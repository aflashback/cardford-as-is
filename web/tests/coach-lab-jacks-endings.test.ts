import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

async function subject() {
  const module = await import('../../scripts/coach-lab-jacks-endings.mjs').catch(() => null);
  assert.ok(module, 'Jacks ending operator is not implemented');
  return module;
}

test('ending operator preserves existing evidence and confines new runs to a private child directory', async () => {
  const { prepareEndingOutput } = await subject();
  const base = mkdtempSync(join(tmpdir(), 'jacks-ending-operator-'));
  try {
    const out = prepareEndingOutput(join(base, 'one-run'), base);
    writeFileSync(join(out, 'receipt.json'), 'retained evidence');
    assert.throws(() => prepareEndingOutput(out, base), /exist|overwrite/i);
    assert.equal(readFileSync(join(out, 'receipt.json'), 'utf8'), 'retained evidence');
    assert.throws(() => prepareEndingOutput(base, base), /child/i);
    assert.throws(() => prepareEndingOutput(join(base, '..', 'escape'), base), /child/i);
  } finally {
    assert.equal(dirname(resolve(base)), resolve(tmpdir()));
    assert.ok(basename(base).startsWith('jacks-ending-operator-'));
    rmSync(base, { recursive: true, force: true });
  }
});

test('ending run cannot pass on a failed worker, changed source, or incomplete allocation comparison', async () => {
  const { assessEndingRun } = await subject();
  const complete = { schemaVersion: 'trix-jacks-ending-study-1.0.0', status: 'completed', cases: [{ id: 'case-one', evaluation: { status: 'completed', enumerationComplete: true } }] };
  const input = { build: { status: 'passed' }, invocation: { status: 'passed' }, sourceUnchanged: true, study: complete };
  assert.equal(assessEndingRun(input), 'passed');
  assert.equal(assessEndingRun({ ...input, sourceUnchanged: false }), 'pending-unverified');
  assert.equal(assessEndingRun({ ...input, invocation: { status: 'failed' } }), 'pending-unverified');
  assert.equal(assessEndingRun({ ...input, study: { ...complete, cases: [{ id: 'case-one', evaluation: { status: 'incomplete' } }] } }), 'pending-unverified');
  assert.equal(assessEndingRun({ ...input, study: { ...complete, cases: [] } }), 'pending-unverified');
  assert.equal(assessEndingRun({ ...input, study: null }), 'pending-unverified');
  assert.equal(assessEndingRun({ ...input, study: { ...complete, cases: [{ id: 'case-one', evaluation: { status: 'completed', enumerationComplete: false } }] } }), 'pending-unverified');
});

function comparisonCase() {
  const root = (candidateId: string, finishOrder: number[], seatPoints: number[]) => ({ candidateId, finishOrder, seatPoints, ownPoints: seatPoints[0], partnerPoints: seatPoints[2], teamPoints: seatPoints[0] + seatPoints[2], objectivePoints: seatPoints[0] + seatPoints[2], unforcedFutureDecisions: 0 });
  return { id: 'sacrifice', variant: 'complex-partners', actorObservation: { seat: 0 }, referenceCandidateId: 'layout:CK', evaluation: {
    status: 'completed', enumerationComplete: true, objective: 'combined-team-request-points', candidateIds: ['layout:C4', 'layout:CK'], configuration: { profiles: [{ id: 'history' }] },
    rows: [
      { ordinal: 0, profiles: [{ profileId: 'history', roots: [root('layout:C4', [2, 0, 3, 1], [150, 50, 200, 100]), root('layout:CK', [0, 3, 2, 1], [200, 50, 100, 150])] }] },
      { ordinal: 1, profiles: [{ profileId: 'history', roots: [root('layout:C4', [0, 2, 3, 1], [200, 50, 150, 100]), root('layout:CK', [2, 0, 3, 1], [150, 50, 200, 100])] }] }
    ]
  } };
}

test('ending report pairs objective points within the same allocation instead of confusing team margin or individual speed', async () => {
  const { summarizeEndingCase } = await subject();
  const result = summarizeEndingCase(comparisonCase());
  const opening = result.comparisons.find(row => row.candidateId === 'layout:C4');
  assert.ok(opening);
  assert.equal(opening.meanObjectivePoints, 350);
  assert.equal(opening.meanOwnPoints, 175);
  assert.equal(opening.meanPartnerPoints, 175);
  assert.deepEqual([opening.minimumDeltaPoints, opening.maximumDeltaPoints, opening.meanDeltaPoints], [0, 50, 25]);
  assert.deepEqual([opening.worse, opening.equal, opening.better], [0, 1, 1]);
  assert.equal(opening.allFutureForced, true);
  const conditional = comparisonCase();
  conditional.evaluation.rows[1].profiles[0].roots[0].unforcedFutureDecisions = 1;
  assert.equal(summarizeEndingCase(conditional).comparisons[0].allFutureForced, false);
});

test('ending report withholds partial-prefix averages and rejects incomplete pairing or contradictory native awards', async () => {
  const { summarizeEndingCase } = await subject();
  const partial = comparisonCase(); partial.evaluation.status = 'incomplete'; partial.evaluation.enumerationComplete = false;
  assert.deepEqual(summarizeEndingCase(partial).comparisons, []);
  const missing = comparisonCase(); missing.evaluation.rows[1].profiles[0].roots.pop();
  assert.throws(() => summarizeEndingCase(missing), /root|candidate|paired/i);
  const wrong = comparisonCase(); wrong.evaluation.rows[0].profiles[0].roots[0].seatPoints[0] = 200;
  assert.throws(() => summarizeEndingCase(wrong), /award|score|point/i);
});

test('Solo report uses own points and never borrows partnership scores', async () => {
  const { summarizeEndingCase } = await subject();
  const source = comparisonCase();
  const solo = { ...source, variant: 'complex-solo', evaluation: { ...source.evaluation, objective: 'own-request-points', rows: source.evaluation.rows.map(row => ({ ...row, profiles: row.profiles.map(profile => ({ ...profile, roots: profile.roots.map(({ partnerPoints: _partner, teamPoints: _team, ...r }) => ({ ...r, objectivePoints: r.ownPoints })) })) })) } };
  const opening = summarizeEndingCase(solo).comparisons[0];
  assert.equal(opening.meanPartnerPoints, null);
  assert.equal(opening.meanObjectivePoints, 175);
  assert.deepEqual([opening.minimumDeltaPoints, opening.maximumDeltaPoints, opening.meanDeltaPoints], [-50, 50, 0]);
  assert.deepEqual([opening.worse, opening.equal, opening.better], [1, 0, 1]);
});
