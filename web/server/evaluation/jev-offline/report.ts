import { fileURLToPath } from 'node:url';
import {
  POSITION_GENERATOR,
  SYNTHETIC_PROVENANCE,
  SYNTHETIC_RESPONSES,
  checkResponse,
  createSyntheticFixtureArm,
  syntheticPositions,
  type FixtureCheck,
  type SyntheticPosition,
} from './fixtures.ts';
import {
  CANDIDATE_ENCODING,
  EXPERIMENT_ID_PLACEHOLDER,
  OFFLINE_HARNESS_VERSION,
  PROMPT_VERSIONS,
  canonicalCandidateIds,
  type SpadesMode,
} from './payloads.ts';
import {
  LIVE_RUN_BLOCKED,
  NO_MODEL_OBSERVED,
  createD0Arm,
  createD1Arm,
  denominators,
  isForced,
  type Arm,
  type ArmId,
  type SelectorKind,
  type SelectorOutcome,
} from './selectors.ts';

/**
 * SG-06: comparison run and report for the offline harness. The two model arms have no
 * result in this milestone, so their outcome rows read `blocked` and the writer refuses
 * every margin, accuracy or agreement figure placed under their labels.
 */
export const BLOCKED_ROW = `blocked: ${LIVE_RUN_BLOCKED}`;

const ARM_ORDER: readonly ArmId[] = ['D0', 'D1', 'J0', 'J1'];
const MODES: readonly { mode: SpadesMode; title: string }[] = [
  { mode: 'spades-solo', title: 'Spades Solo' },
  { mode: 'spades-partners', title: 'Spades Partners' },
];
const isModelArm = (id: ArmId): boolean => id === 'J0' || id === 'J1';

export type ComparisonRow = {
  positionId: string;
  mode: SpadesMode;
  phase: 'bid' | 'play';
  forced: boolean;
  outcomes: { arm: ArmId; outcome: SelectorOutcome }[];
};

export type ComparisonRun = {
  harnessVersion: typeof OFFLINE_HARNESS_VERSION;
  experimentId: typeof EXPERIMENT_ID_PLACEHOLDER;
  arms: { id: ArmId; kind: SelectorKind; policyOrModel: string }[];
  rows: ComparisonRow[];
  responseChecks: FixtureCheck[];
};

export type Figure = {
  arm: ArmId;
  mode: SpadesMode;
  kind: 'margin' | 'accuracy' | 'agreement';
  value: number;
  unit: string;
  /** Where the figure was produced, for example a gate report path. */
  source: string;
};

function assertOutcome(arm: Arm, outcome: SelectorOutcome, candidateIds: readonly string[]): void {
  if (outcome.status === 'blocked') {
    if (arm.kind !== 'blocked') throw new Error('Only a blocked arm may report a blocked outcome.');
    return;
  }
  if (outcome.status === 'unavailable') {
    if (arm.kind === 'blocked') throw new Error('A blocked arm selects nothing and fails nothing.');
    return;
  }
  if (!candidateIds.includes(outcome.actionId))
    throw new Error('An arm selected an action outside the legal set.');
  if (outcome.provenance === 'forced') return;
  const expected =
    arm.kind === 'local-policy' ? 'code' : arm.kind === 'synthetic-fixture' ? SYNTHETIC_PROVENANCE : null;
  if (outcome.provenance !== expected)
    throw new Error('An arm reported a provenance its selector cannot have.');
}

/** Every arm sees the same observation and the same complete legal set in canonical order. */
export function runOfflineComparison(
  positions: readonly SyntheticPosition[],
  arms: readonly Arm[],
): ComparisonRun {
  if (new Set(arms.map((arm) => arm.id)).size !== arms.length)
    throw new Error('Arm labels must be distinct.');
  for (const arm of arms)
    if (isModelArm(arm.id) ? arm.kind === 'local-policy' : arm.kind !== 'local-policy')
      throw new Error(`Arm ${arm.id} has a selector of the wrong kind.`);
  const ordered = ARM_ORDER.flatMap((id) => arms.filter((arm) => arm.id === id));
  const rows = positions.map((position): ComparisonRow => {
    const candidateIds = canonicalCandidateIds(position.observation);
    const outcomes = ordered.map((arm) => {
      const outcome = arm.select(position.observation, [...candidateIds]);
      assertOutcome(arm, outcome, candidateIds);
      if (isForced(outcome) !== (candidateIds.length === 1))
        throw new Error('Forced status must follow the legal set alone.');
      return { arm: arm.id, outcome };
    });
    return {
      positionId: position.id,
      mode: position.mode,
      phase: position.phase,
      forced: candidateIds.length === 1,
      outcomes,
    };
  });
  const strategic = positions.find((position) => position.observation.legalActions.length > 1);
  return {
    harnessVersion: OFFLINE_HARNESS_VERSION,
    experimentId: EXPERIMENT_ID_PLACEHOLDER,
    arms: ordered.map((arm) => ({ id: arm.id, kind: arm.kind, policyOrModel: arm.policyOrModel })),
    rows,
    responseChecks: strategic
      ? SYNTHETIC_RESPONSES.map((response) =>
          checkResponse(response, canonicalCandidateIds(strategic.observation)),
        )
      : [],
  };
}

const cell = (text: string): string => text.replaceAll('|', '/').replaceAll('\n', ' ');

function refuseModelFigures(run: ComparisonRun, figures: readonly Figure[]): void {
  for (const figure of figures) {
    const arm = run.arms.find((entry) => entry.id === figure.arm);
    if (!arm) throw new Error(`Refused: arm ${figure.arm} is not part of this run.`);
    if (!Number.isFinite(figure.value)) throw new Error('Refused: a figure must be a finite number.');
    if (arm.kind !== 'local-policy')
      throw new Error(
        `Refused: no ${figure.kind} figure is printed under ${figure.arm} while its selector is ${
          arm.kind === 'synthetic-fixture' ? 'a synthetic fixture' : 'blocked'
        }.`,
      );
  }
}

/** Last check on the finished text: no line under a model arm label carries a result word or a percentage. */
export function assertNoModelFigures(text: string): void {
  for (const line of text.split('\n'))
    if (/\bJ[01]\b/.test(line) && /(margin|accura|agree|win rate|strength|\d\s*%)/i.test(line))
      throw new Error('Refused: a model arm line carries a result figure.');
}

export function renderComparisonReport(run: ComparisonRun, figures: readonly Figure[] = []): string {
  refuseModelFigures(run, figures);
  const lines: string[] = [
    '# Offline comparison harness (SG-06)',
    '',
    '- Status: offline harness run. Nothing was sent to any provider.',
    `- Observed model: ${NO_MODEL_OBSERVED}`,
    `- Experiment: ${run.experimentId}`,
    `- Harness ${run.harnessVersion}; candidate encoding ${CANDIDATE_ENCODING}; positions ${POSITION_GENERATOR}`,
    `- Prompt versions: ${PROMPT_VERSIONS.J0} and ${PROMPT_VERSIONS.J1}`,
    '- Solo and Partners are reported separately and never pooled.',
    '- Forced decisions bypass every arm and are excluded from strategic denominators.',
    '- Unavailable and blocked outcomes stay inside strategic denominators.',
    '- No margin, accuracy or agreement figure is printed for a model arm.',
  ];
  for (const { mode, title } of MODES) {
    const rows = run.rows.filter((row) => row.mode === mode);
    if (!rows.length) continue;
    const forced = rows.filter((row) => row.forced).length;
    lines.push(
      '',
      `## ${title}`,
      '',
      `Positions: ${rows.length}. Forced: ${forced}. Strategic decisions: ${rows.length - forced}.`,
      '',
      '| Arm | Selector | Strategic decisions | Selected | Unavailable | Blocked | Outcome |',
      '|---|---|---|---|---|---|---|',
    );
    const outcomeOf = (row: ComparisonRow, id: ArmId) =>
      row.outcomes.find((entry) => entry.arm === id)?.outcome ?? null;
    const checks: string[] = [];
    for (const arm of run.arms) {
      const outcomes = rows.map((row) => outcomeOf(row, arm.id)!);
      const count = denominators(outcomes);
      if (arm.kind !== 'local-policy') {
        lines.push(
          `| ${arm.id} | ${cell(arm.policyOrModel)} | ${count.strategic} | — | — | — | ${BLOCKED_ROW} |`,
        );
        if (arm.kind === 'synthetic-fixture')
          checks.push(
            `- ${arm.id}: payload built and authored response accepted by the validator at ${count.selected} of ${count.strategic} strategic decisions; rejected at ${count.unavailable}.`,
          );
        continue;
      }
      let outcome = 'selected by code';
      if (arm.id === 'D1' && run.arms.some((entry) => entry.id === 'D0')) {
        const pairs = rows
          .filter((row) => !row.forced)
          .map((row) => [outcomeOf(row, 'D0'), outcomeOf(row, 'D1')] as const)
          .filter(
            ([reference, candidate]) => reference?.status === 'selected' && candidate?.status === 'selected',
          );
        const changed = pairs.filter(
          ([reference, candidate]) =>
            reference?.status === 'selected' &&
            candidate?.status === 'selected' &&
            reference.actionId !== candidate.actionId,
        ).length;
        outcome += `; ${changed} of ${pairs.length} decisions differ from D0 (decision-change diagnostic, not a strength result)`;
      }
      lines.push(
        `| ${arm.id} | local policy ${cell(arm.policyOrModel)} | ${count.strategic} | ${count.selected} | ${count.unavailable} | ${count.blocked} | ${outcome} |`,
      );
    }
    if (checks.length)
      lines.push('', 'Harness checks for this mode (synthetic fixture; not model evidence):', ...checks);
    const supplied = figures.filter((figure) => figure.mode === mode);
    if (supplied.length)
      lines.push(
        '',
        'Supplied figures (local arms only):',
        '',
        '| Arm | Figure | Value | Source |',
        '|---|---|---|---|',
        ...supplied.map(
          (figure) =>
            `| ${figure.arm} | ${figure.kind} | ${figure.value} ${cell(figure.unit)} | ${cell(figure.source)} |`,
        ),
      );
  }
  if (run.responseChecks.length)
    lines.push(
      '',
      '## Response validator fixtures',
      '',
      'Authored bodies run through the unchanged production validator. None is a provider response.',
      '',
      '| Fixture | Expected | Validator | Diagnostic category | Field |',
      '|---|---|---|---|---|',
      ...run.responseChecks.map(
        (check) =>
          `| ${check.fixtureId} | ${check.expected} | ${check.validatorClass ?? 'accepted'} | ${check.diagnostic?.category ?? '—'} | ${cell(check.diagnostic?.field ?? '—')} |`,
      ),
    );
  const text = lines.join('\n');
  assertNoModelFigures(text);
  return text;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const option = (name: string, fallback: string) =>
    process.argv
      .slice(2)
      .find((entry) => entry.startsWith(`--${name}=`))
      ?.slice(name.length + 3) ?? fallback;
  const count = Number(option('seeds', '4'));
  if (!Number.isInteger(count) || count < 1 || count > 64) throw new Error('--seeds must be from 1 to 64.');
  const candidate = option('d1', 'spades-plan-3.1.0');
  const seeds = Array.from({ length: count }, (_, index) => index + 1);
  const run = runOfflineComparison(
    MODES.flatMap(({ mode }) => syntheticPositions(mode, seeds)),
    [
      createD0Arm(),
      createD1Arm(candidate),
      createSyntheticFixtureArm('J0'),
      createSyntheticFixtureArm('J1', { derivedFrom: candidate }),
    ],
  );
  process.stdout.write(renderComparisonReport(run) + '\n');
}
