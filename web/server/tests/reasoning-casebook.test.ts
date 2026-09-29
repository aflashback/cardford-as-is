import assert from 'node:assert/strict';
import test from 'node:test';
import { actionId } from '../game/index.ts';
import { SPADES_SCENARIOS } from '../games/spades/reasoning/catalog.ts';
import {
  SPADES_CASEBOOK,
  buildCasebookReport,
  checkCaseRubric,
  inspectCase,
  validateCasebook,
  type ReasoningCase,
} from '../games/spades/reasoning/casebook.ts';

test('GR-08: every Spades family has a reachable case and explicit label status', () => {
  assert.deepEqual(
    SPADES_CASEBOOK.map((entry) => entry.scenarioId).sort(),
    SPADES_SCENARIOS.map((entry) => entry.id).sort(),
  );
  for (const entry of SPADES_CASEBOOK) {
    const result = inspectCase(entry);
    assert.equal(result.observation.mode, entry.mode);
    assert.equal(result.observation.phase, entry.phase);
    assert.ok(result.observation.legalActions.length >= entry.minimumLegalActions, entry.id);
    assert.ok(result.analysis.scenarioIds.includes(entry.scenarioId), entry.id);
    assert.ok(result.analysis.reasons.some((reason) => reason.id === entry.expectedReasonId), entry.id);
    assert.equal(checkCaseRubric(entry), true, entry.id);
    assert.ok(
      result.observation.legalActions.some(
        (candidate) => actionId(candidate) === actionId(result.analysis.action),
      ),
      entry.id,
    );
    assert.equal(entry.independentLabel.status, 'unlabelled');
  }
});

test('GR-08: links reject dangling cases, tactics, cues and unsourced expert labels', () => {
  assert.doesNotThrow(() => validateCasebook(SPADES_CASEBOOK, SPADES_SCENARIOS));
  const base = SPADES_CASEBOOK[0];
  assert.throws(() => validateCasebook([base, base], SPADES_SCENARIOS), /Duplicate case/);
  assert.throws(
    () => validateCasebook([{ ...base, scenarioId: 'P99' }], SPADES_SCENARIOS),
    /Unknown scenario/,
  );
  assert.throws(
    () => validateCasebook([{ ...base, expectedReasonId: 'P08.public-hints' }], SPADES_SCENARIOS),
    /Tactic prefix/,
  );
  const labelled: ReasoningCase = {
    ...base,
    independentLabel: {
      status: 'independently-labelled',
      reviewer: '',
      reviewedAt: '2026-09-29',
      acceptedActionIds: ['play:H2'],
      rationale: '',
      evidenceRef: '',
    },
  };
  assert.throws(() => validateCasebook([labelled], SPADES_SCENARIOS), /Independent label/);
  assert.throws(
    () =>
      validateCasebook([base], [
        { ...SPADES_SCENARIOS.find((scenario) => scenario.id === base.scenarioId)!, caseIds: ['missing-case'], cueIds: [] },
      ]),
    /Dangling case/,
  );
  assert.throws(
    () => validateCasebook([base], [
      { ...SPADES_SCENARIOS.find((scenario) => scenario.id === base.scenarioId)!, caseIds: [base.id], cueIds: ['missing-cue'] },
    ]),
    /Dangling cue/,
  );
});

test('GR-08: link report keeps recognition, label review and strength separate', () => {
  const report = buildCasebookReport();
  assert.equal(report.schemaVersion, '1.0.0');
  assert.equal(report.policyVersion, inspectCase(SPADES_CASEBOOK[0]).analysis.policyVersion);
  assert.equal(report.scenarios.length, 26);
  assert.equal(report.cases.length, 26);
  assert.ok(report.cases.every((entry) => entry.recognition === 'matched'));
  assert.ok(report.cases.every((entry) => entry.rubricStatus === 'passed'));
  assert.ok(report.cases.every((entry) => entry.independentLabel === 'unlabelled'));
  assert.ok(report.cases.every((entry) => entry.strength === 'not-assessed'));
  assert.ok(report.scenarios.every((entry) => entry.linkStatus === 'linked-to-casebook'));
  assert.ok(report.scenarios.every((entry) => entry.cueRegistration === 'not-verified'));
});
