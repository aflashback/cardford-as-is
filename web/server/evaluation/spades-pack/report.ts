import type { PilotManifest, PilotPair, PilotStream } from './pilot.ts';

type Stream = Pick<PilotStream, 'completed' | 'censored' | 'focalWon' | 'hands' | 'finalMargin' | 'totalOwn' |
  'metrics' | 'actionHash' | 'decisions' | 'evaluatedDecisions' | 'evaluatedUnforcedDecisions'>;
export type ReportPair = Pick<PilotPair, 'id' | 'seed' | 'mode' | 'environmentId' | 'evaluatedSeat'> & {
  reference: Stream; candidate: Stream;
};
const mean = (values: number[]) => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
const standardDeviation = (values: number[]) => {
  const average = mean(values);
  return average === null || values.length < 2 ? null :
    Math.sqrt(values.reduce((sum, value) => sum + (value - average) ** 2, 0) / (values.length - 1));
};
const winBounds = (stream: Stream): [number, number] => stream.completed && stream.focalWon !== null ?
  [Number(stream.focalWon), Number(stream.focalWon)] : [0, 1];

/** Descriptive only. No promotion rule, sample-size recommendation or human verdict is applied. */
export function buildPilotReport(manifest: PilotManifest, rows: readonly ReportPair[]) {
  if (new Set(rows.map(row => row.id)).size !== rows.length) throw new Error('Duplicate pilot pairs.');
  const cellsPerFamily = manifest.rotations.length * manifest.environments.length;
  const modes = manifest.modes.map(mode => {
    const pairs = rows.filter(row => row.mode === mode);
    const plannedPairs = manifest.seeds.count * cellsPerFamily;
    if (pairs.length > plannedPairs) throw new Error('Pilot exceeds planned cells.');
    let lower = -(plannedPairs - pairs.length), upper = plannedPairs - pairs.length;
    for (const row of pairs) {
      const reference = winBounds(row.reference), candidate = winBounds(row.candidate);
      lower += candidate[0] - reference[1]; upper += candidate[1] - reference[0];
    }
    const families = Array.from({ length: manifest.seeds.count }, (_, index) => manifest.seeds.from + index).map(seed => {
      const family = pairs.filter(row => row.seed === seed);
      return { seed, observedPairs: family.length, plannedPairs: cellsPerFamily,
        completeAllocation: family.length === cellsPerFamily,
        pairedFinalMarginDifference: mean(family.map(row => row.candidate.finalMargin - row.reference.finalMargin)),
        trajectoryChanged: family.some(row => row.candidate.actionHash !== row.reference.actionHash) };
    });
    const fullFamilies = families.filter(family => family.completeAllocation);
    const familyDifferences = fullFamilies.map(family => family.pairedFinalMarginDifference).filter((value): value is number => value !== null);
    const arms = (['reference', 'candidate'] as const).map(arm => {
      const streams = pairs.map(pair => pair[arm]);
      const metrics: Record<string, number> = {};
      for (const stream of streams) for (const [id, count] of Object.entries(stream.metrics)) metrics[id] = (metrics[id] ?? 0) + count;
      return { arm, observedStreams: streams.length, terminalMatches: streams.filter(stream => stream.completed).length,
        handCappedMatches: streams.filter(stream => stream.censored).length,
        terminalWins: streams.filter(stream => stream.focalWon === true).length,
        hands: streams.reduce((sum, stream) => sum + stream.hands, 0),
        decisions: streams.reduce((sum, stream) => sum + stream.decisions, 0),
        evaluatedDecisions: streams.reduce((sum, stream) => sum + stream.evaluatedDecisions, 0),
        evaluatedUnforcedDecisions: streams.reduce((sum, stream) => sum + stream.evaluatedUnforcedDecisions, 0),
        meanOwnOrTeamPoints: mean(streams.map(stream => stream.totalOwn)), metrics };
    });
    return { mode, plannedPairs, observedPairs: pairs.length, pendingPairs: plannedPairs - pairs.length,
      completeAllocationFamilies: fullFamilies.length, plannedFamilies: manifest.seeds.count,
      pairsWithTrajectoryChange: pairs.filter(pair => pair.reference.actionHash !== pair.candidate.actionHash).length,
      familiesWithTrajectoryChange: families.filter(family => family.trajectoryChanged).length,
      pairedBoundedFinalMarginMean: mean(familyDifferences),
      observedFamilyStandardDeviation: standardDeviation(familyDifferences),
      plannedCellEventualWinDifferenceBounds: { lower: lower / plannedPairs, upper: upper / plannedPairs,
        interpretation: 'Logical bounds for these planned cells, including unknown capped/unstarted results; not a confidence interval or general win probability.' },
      arms, families };
  });
  return { schemaVersion: 'spades-pilot-report-1.0.0', purpose: 'development-pilot', modes,
    promotion: false, humanActionQuality: 'pending-independent-review', humanLearning: 'not-run',
    cueFactuality: 'not-run-in-this-pilot', decisionLatency: 'not-measured',
    samplePlanning: { status: 'not-established', reason: 'Eight development families and pending labels do not establish a confirmation sample size. Define the estimand, practical effect and harm bounds; expand the pilot if needed before preregistration.' },
    limitations: [
      'One changed seat with two fixed environments; this does not establish whole-team deployment quality.',
      'All styles are related code policies; no human or independent strong-opponent benchmark.',
      'Terminal and hand-cap scores have different horizons; point summaries are descriptive.',
      'Related cells are clustered by initial family; hands, rotations and modes are not independent samples.',
      'Successful recorded legal play does not independently establish action quality or teaching benefit.',
    ] };
}

export function pilotReportMarkdown(report: ReturnType<typeof buildPilotReport>): string {
  const lines = ['# Paired Spades development pilot', '', '**Descriptive results; no strategy promotion or human learning finding.**', '',
    '| Mode | Observed / planned pairs | Fully allocated families | Changed trajectories | Bounded final-margin difference |',
    '|---|---:|---:|---:|---:|'];
  for (const mode of report.modes) lines.push(`| ${mode.mode} | ${mode.observedPairs}/${mode.plannedPairs} | ${mode.completeAllocationFamilies}/${mode.plannedFamilies} | ${mode.pairsWithTrajectoryChange} | ${mode.pairedBoundedFinalMarginMean?.toFixed(2) ?? 'not available'} |`);
  lines.push('', 'Numbers compare the existing candidate against the frozen baseline. Points are at terminal or capped horizons; they cannot independently establish strength. The machine report retains arm counts, contract/Nil/bag metrics, family summaries and bounds for unknown results.', '',
    'Human acceptable-action labels remain pending. Cue checks and per-decision latency were not run in this pilot. No confirmation sample size is claimed; no Jev or OpenRouter requests occurred.', '', '## Limits', '');
  for (const limitation of report.limitations) lines.push(`- ${limitation}`);
  return `${lines.join('\n')}\n`;
}
