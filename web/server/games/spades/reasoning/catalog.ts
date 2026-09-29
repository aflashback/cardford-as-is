import type { Mode } from '../../../game/kernel/types.ts';

export type SpadesMode = Extract<Mode, 'spades-solo' | 'spades-partners'>;
export type ScenarioStatus =
  | 'cataloged'
  | 'partial'
  | 'implemented-unreviewed'
  | 'tactic-tested'
  | 'independently-reviewed';
export type ScenarioDefinition = {
  id: string;
  title: string;
  modes: SpadesMode[];
  phases: ('bid' | 'play')[];
  evidence: 'exact' | 'heuristic' | 'mixed';
  status: ScenarioStatus;
  caseIds: string[];
  cueIds: string[];
};

const both: SpadesMode[] = ['spades-solo', 'spades-partners'];
const team: SpadesMode[] = ['spades-partners'];
const partial = new Set(['S12', 'S13', 'S14', 'P04', 'P08', 'P11']);
const reviewLinks: Record<string, { caseId: string; cueId: string }> = {
  S01: { caseId: 's01-legal-001', cueId: 's01-legal-cue' },
  S02: { caseId: 's02-void-001', cueId: 's02-void-cue' },
  S03: { caseId: 's03-ownership-001', cueId: 's03-ownership-cue' },
  S04: { caseId: 's04-turn-order-001', cueId: 's04-turn-order-cue' },
  S05: { caseId: 's05-safe-nil-001', cueId: 's05-safe-nil-cue' },
  S06: { caseId: 's06-forced-nil-001', cueId: 's06-forced-nil-cue' },
  S07: { caseId: 's07-failed-nil-001', cueId: 's07-failed-nil-cue' },
  S08: { caseId: 's08-contract-001', cueId: 's08-contract-cue' },
  S09: { caseId: 's09-bag-001', cueId: 's09-bag-cue' },
  S10: { caseId: 's10-lead-001', cueId: 's10-lead-cue' },
  S11: { caseId: 's11-ruff-001', cueId: 's11-ruff-cue' },
  S12: { caseId: 's12-opposing-nil-001', cueId: 's12-opponent-nil-cue' },
  S13: { caseId: 's13-contextual-bid-001', cueId: 's13-bid-cue' },
  S14: { caseId: 's14-late-hand-001', cueId: 's14-late-score-cue' },
  P04: { caseId: 'p04-double-nil-001', cueId: 'p04-double-nil-cue' },
  P01: { caseId: 'p01-partner-current-001', cueId: 'p01-partner-current-cue' },
  P02: { caseId: 'p02-partner-nil-cover-001', cueId: 'p02-partner-nil-cover-cue' },
  P03: { caseId: 'p03-partner-no-cover-001', cueId: 'p03-partner-no-cover-cue' },
  P05: { caseId: 'p05-partner-failed-nil-001', cueId: 'p05-partner-failed-nil-cue' },
  P06: { caseId: 'p06-partner-void-001', cueId: 'p06-partner-void-cue' },
  P07: { caseId: 'p07-partner-spade-void-001', cueId: 'p07-partner-spade-void-cue' },
  P08: { caseId: 'p08-public-play-001', cueId: 'p08-public-hints-cue' },
  P09: { caseId: 'p09-partner-security-001', cueId: 'p09-partner-security-cue' },
  P10: { caseId: 'p10-team-contract-001', cueId: 'p10-team-contract-cue' },
  P11: { caseId: 'p11-entry-001', cueId: 'p11-entry-cue' },
  P12: { caseId: 'p12-mode-objective-001', cueId: 'p12-mode-objective-cue' },
};
const row = (
  id: string,
  title: string,
  modes: SpadesMode[],
  evidence: ScenarioDefinition['evidence'],
  phases: ScenarioDefinition['phases'] = ['play'],
): ScenarioDefinition => ({
  id,
  title,
  modes: [...modes],
  phases,
  evidence,
  status: partial.has(id) ? 'partial' : 'implemented-unreviewed',
  caseIds: reviewLinks[id] ? [reviewLinks[id].caseId] : [],
  cueIds: reviewLinks[id] ? [reviewLinks[id].cueId] : [],
});

/** A taxonomy and review ledger; entries do not assert a tactic is correct. */
export const SPADES_SCENARIOS: ScenarioDefinition[] = [
  row('S01', 'Legal and forced actions', both, 'exact', ['bid', 'play']),
  row('S02', 'Off-suit play and voids', both, 'exact'),
  row('S03', 'Higher unseen cards and possible owners', both, 'exact'),
  row('S04', 'Trick position and later actors', both, 'exact'),
  row('S05', 'Live Nil underplay', both, 'mixed'),
  row('S06', 'Live Nil with no current underplay', both, 'mixed'),
  row('S07', 'Failed Nil', both, 'exact'),
  row('S08', 'Positive contract need', both, 'mixed'),
  row('S09', 'Contract made and bag boundary', both, 'mixed'),
  row('S10', 'Lead control and short suits', both, 'heuristic'),
  row('S11', 'Void, discard and ruff', both, 'mixed'),
  row('S12', 'Opposing Nil and contract pressure', both, 'heuristic'),
  row('S13', 'Bid and Nil choice', both, 'heuristic', ['bid']),
  row('S14', 'Late hand and match score', both, 'mixed'),
  row('P01', 'Partner currently winning', team, 'mixed'),
  row('P02', 'Cover live Nil partner', team, 'mixed'),
  row('P03', 'No legal cover of Nil partner', team, 'exact'),
  row('P04', 'Both partners bid Nil', team, 'heuristic', ['bid', 'play']),
  row('P05', 'Partner Nil already failed', team, 'exact'),
  row('P06', 'Partner void and possible ruff', team, 'mixed'),
  row('P07', 'Partner proved void in Spades', team, 'exact'),
  row('P08', 'Partner lead and discard hints', team, 'heuristic'),
  row('P09', 'Partner winner threatened', team, 'mixed'),
  row('P10', 'Team contract and bags', team, 'mixed'),
  row('P11', 'Lead transfers and entries', team, 'heuristic'),
  row('P12', 'Solo versus partner objective', team, 'mixed'),
];

export function validateScenarioCatalog(rows: readonly ScenarioDefinition[]): void {
  const seen = new Set<string>();
  for (const entry of rows) {
    if (seen.has(entry.id)) throw new Error(`Duplicate scenario: ${entry.id}`);
    seen.add(entry.id);
    if (!/^(S(0[1-9]|1[0-4])|P(0[1-9]|1[0-2]))$/.test(entry.id))
      throw new Error(`Unsupported scenario ID: ${entry.id}`);
    if (!entry.title || !entry.modes.length || !entry.phases.length)
      throw new Error(`Incomplete scenario: ${entry.id}`);
    if (entry.id.startsWith('P') && entry.modes.some((mode) => mode !== 'spades-partners'))
      throw new Error(`A partner scenario requires the partnership mode: ${entry.id}`);
    if (
      (entry.status === 'tactic-tested' || entry.status === 'independently-reviewed') &&
      (!entry.caseIds.length || !entry.cueIds.length)
    )
      throw new Error(`A tested scenario needs a case and cue: ${entry.id}`);
    if (new Set(entry.caseIds).size !== entry.caseIds.length || new Set(entry.cueIds).size !== entry.cueIds.length)
      throw new Error(`Duplicate scenario reference: ${entry.id}`);
  }
}

validateScenarioCatalog(SPADES_SCENARIOS);
