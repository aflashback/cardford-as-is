import { actionId, apply, collectTrick, createGame, fullDeck, legalActions, type Card, type PrivateGame, type Seat } from '../../../game/index.ts';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { observe } from '../../../observations/index.ts';
import { analyzeDecision, POLICY_VERSION } from '../../../strategy/index.ts';
import type { ScenarioDefinition, SpadesMode } from './catalog.ts';
import { SPADES_SCENARIOS } from './catalog.ts';

export type IndependentLabel =
  | { status: 'unlabelled' }
  | {
      status: 'independently-labelled';
      reviewer: string;
      reviewedAt: string;
      acceptedActionIds: string[];
      rationale: string;
      evidenceRef: string;
    };

export type ReasoningCase = {
  id: string;
  caseGroupId: string;
  requirementId: 'GR-04' | 'GR-05' | 'GR-06' | 'GR-08';
  scenarioId: string;
  mode: SpadesMode;
  phase: 'bid' | 'play';
  fixture:
    | 'opening' | 'after-one-trick' | 'late-hand' | 'turn-order' | 'void-play'
    | 'safe-nil' | 'forced-nil' | 'failed-nil' | 'contract-made-nil'
    | 'partner-no-cover' | 'partner-failed-nil' | 'partner-void'
    | 'partner-spade-void' | 'partner-current';
  /** Null means a scripted, legal replay rather than a seeded shuffle. */
  seed: number | null;
  bids: [number, number, number, number];
  minimumLegalActions: number;
  expectedReasonId: string;
  cueId: string;
  /** A fact/rubric expectation, not a claim that the selected move is best. */
  rubric: string;
  counterexampleIds: string[];
  independentLabel: IndependentLabel;
};

/** Maintainer prompts. No case has received an independent action label. */
export const SPADES_CASEBOOK: readonly ReasoningCase[] = [
  {
    id: 's12-opposing-nil-001', caseGroupId: 's12-opposing-nil', requirementId: 'GR-04',
    scenarioId: 'S12', mode: 'spades-solo', phase: 'play', fixture: 'opening', seed: 93011,
    minimumLegalActions: 2,
    bids: [2, 0, 2, 2], expectedReasonId: 'S12.opponent-nil', cueId: 's12-opponent-nil-cue',
    rubric: 'An opposing live Nil changes score consequences, but a scenario match does not identify the best card.',
    counterexampleIds: [], independentLabel: { status: 'unlabelled' },
  },
  {
    id: 's13-contextual-bid-001', caseGroupId: 's13-public-bids', requirementId: 'GR-04',
    scenarioId: 'S13', mode: 'spades-partners', phase: 'bid', fixture: 'opening', seed: 93012,
    minimumLegalActions: 2,
    bids: [2, 0, 2, 2], expectedReasonId: 'S13.structure', cueId: 's13-bid-cue',
    rubric: 'Earlier public bids are visible but do not prove concealed-card ownership; bid strength is unreviewed.',
    counterexampleIds: [], independentLabel: { status: 'unlabelled' },
  },
  {
    id: 's14-late-hand-001', caseGroupId: 's14-late-hand', requirementId: 'GR-04',
    scenarioId: 'S14', mode: 'spades-solo', phase: 'play', fixture: 'late-hand', seed: 93013,
    minimumLegalActions: 2,
    bids: [2, 2, 2, 2], expectedReasonId: 'S14.late-score', cueId: 's14-late-score-cue',
    rubric: 'Late-hand recognition must not be presented as a solved remaining-hand or match outcome.',
    counterexampleIds: [], independentLabel: { status: 'unlabelled' },
  },
  {
    id: 'p04-double-nil-001', caseGroupId: 'p04-double-nil', requirementId: 'GR-04',
    scenarioId: 'P04', mode: 'spades-partners', phase: 'play', fixture: 'opening', seed: 93014,
    minimumLegalActions: 2,
    bids: [0, 2, 0, 2], expectedReasonId: 'P04.double-nil', cueId: 'p04-double-nil-cue',
    rubric: 'Both live Nil commitments may conflict; no unconditional sacrifice rule is established.',
    counterexampleIds: [], independentLabel: { status: 'unlabelled' },
  },
  {
    id: 'p08-public-play-001', caseGroupId: 'p08-public-play', requirementId: 'GR-05',
    scenarioId: 'P08', mode: 'spades-partners', phase: 'play', fixture: 'after-one-trick', seed: 93015,
    minimumLegalActions: 2,
    bids: [2, 2, 2, 2], expectedReasonId: 'P08.public-hints', cueId: 'p08-public-hints-cue',
    rubric: 'Partner public play may suggest a preference but cannot prove a private card or convention.',
    counterexampleIds: [], independentLabel: { status: 'unlabelled' },
  },
  {
    id: 'p11-entry-001', caseGroupId: 'p11-entry', requirementId: 'GR-06',
    scenarioId: 'P11', mode: 'spades-partners', phase: 'play', fixture: 'opening', seed: 93016,
    minimumLegalActions: 2,
    bids: [2, 2, 2, 2], expectedReasonId: 'P11.entries', cueId: 'p11-entry-cue',
    rubric: 'An entry concern needs continuation evidence before preferring a card.',
    counterexampleIds: [], independentLabel: { status: 'unlabelled' },
  },
  ...[
    ['S01', 'legal', 'spades-solo', 'opening', 'S01.legal-set', 'The legal action count comes from the reducer, not strategy.'],
    ['S02', 'void', 'spades-solo', 'void-play', 'S02.void', 'Failing to follow the led suit proves only that suit is void.'],
    ['S03', 'ownership', 'spades-solo', 'opening', 'S03.ownership', 'An unseen high card has possible owners, not a known owner.'],
    ['S04', 'turn-order', 'spades-solo', 'turn-order', 'S04.turn-order', 'A current trick winner may change while later actors remain.'],
    ['S05', 'safe-nil', 'spades-solo', 'safe-nil', 'S05.live-nil', 'A lower legal card keeps this live Nil out of the current trick.'],
    ['S06', 'forced-nil', 'spades-solo', 'forced-nil', 'S06.no-underplay', 'Every available card currently wins; the fourth-seat outcome is exact.'],
    ['S07', 'failed-nil', 'spades-solo', 'failed-nil', 'S07.failed-nil', 'A Nil already broken cannot earn its success award.'],
    ['S08', 'contract', 'spades-solo', 'opening', 'S08.contract', 'A positive bid still needs credited tricks.'],
    ['S09', 'bag', 'spades-partners', 'contract-made-nil', 'S09.contract-met', 'An extra credited trick can add a bag after the contract is met.'],
    ['S10', 'lead', 'spades-solo', 'opening', 'S10.lead-choice', 'A lead heuristic does not guarantee the trick.'],
    ['S11', 'ruff', 'spades-solo', 'void-play', 'S11.trump-choice', 'Being void permits off-suit play; trump is optional.'],
    ['P01', 'partner-current', 'spades-partners', 'partner-current', 'P01.partner-current', 'A positive-bidding partner is provisionally winning this trick.'],
    ['P02', 'partner-nil-cover', 'spades-partners', 'contract-made-nil', 'P02.live-nil-cover', 'Covering the Nil partner removes that player from the current lead.'],
    ['P03', 'partner-no-cover', 'spades-partners', 'partner-no-cover', 'P03.no-cover', 'No legal card overtakes the Nil partner in this position.'],
    ['P05', 'partner-failed-nil', 'spades-partners', 'partner-failed-nil', 'P05.failed-partner', 'The partner Nil has already failed; their tricks do not credit the positive contract.'],
    ['P06', 'partner-void', 'spades-partners', 'partner-void', 'P06.partner-void', 'A public side-suit void permits a possible ruff but does not prove trump ownership.'],
    ['P07', 'partner-spade-void', 'spades-partners', 'partner-spade-void', 'P07.no-partner-trump', 'A public spade void excludes a future partner ruff.'],
    ['P09', 'partner-security', 'spades-partners', 'partner-current', 'P09.partner-security', 'Partner is ahead now; later opponents can threaten that winner.'],
    ['P10', 'team-contract', 'spades-partners', 'opening', 'P10.team-contract', 'Only positive bidders contribute partnership contract credit.'],
    ['P12', 'mode-objective', 'spades-partners', 'opening', 'P12.mode-objective', 'Partnership and individual competition have different objectives.'],
  ].map(([scenarioId, slug, mode, fixture, expectedReasonId, rubric], index): ReasoningCase => ({
    id: `${scenarioId.toLowerCase()}-${slug}-001`,
    caseGroupId: `${scenarioId.toLowerCase()}-${slug}`,
    requirementId: scenarioId === 'P06' || scenarioId === 'P07' ? 'GR-05' : 'GR-08',
    scenarioId: scenarioId!,
    mode: mode as SpadesMode,
    phase: 'play',
    fixture: fixture as ReasoningCase['fixture'],
    seed: ['opening', 'after-one-trick', 'late-hand', 'turn-order'].includes(fixture!)
      ? 93101 + index : null,
    bids: scenarioId === 'S05' || scenarioId === 'S06' || scenarioId === 'S07'
      ? [0, 2, 2, 2]
      : scenarioId === 'P03' ? [2, 2, 0, 2]
        : scenarioId === 'P05' ? [2, 2, 0, 2]
          : scenarioId === 'P02' || scenarioId === 'S09' ? [1, 3, 0, 3]
            : [2, 2, 2, 2],
    minimumLegalActions: 2,
    expectedReasonId: expectedReasonId!,
    cueId: `${scenarioId.toLowerCase()}-${slug}-cue`,
    rubric: rubric!,
    counterexampleIds: [],
    independentLabel: { status: 'unlabelled' },
  })),
] as const;

function deckFor(seed: number): Card[] {
  const deck = fullDeck();
  let value = seed >>> 0;
  for (let i = deck.length - 1; i > 0; i--) {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    const j = value % (i + 1);
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function reservedDeal(
  reserved: [Card[], Card[], Card[], Card[]],
  mode: SpadesMode,
  dealer: Seat = 3,
): PrivateGame {
  const hands = structuredClone(reserved);
  const allocated = new Set(hands.flat());
  if (allocated.size !== hands.flat().length || hands.some((hand) => hand.length > 13))
    throw new Error('Invalid casebook reserved cards.');
  for (const card of fullDeck().filter((card) => !allocated.has(card))) {
    const seat = hands.findIndex((hand) => hand.length < 13);
    if (seat < 0) throw new Error('Casebook deal has no open seat.');
    hands[seat].push(card);
  }
  const deck: Card[] = [];
  for (let n = 0; n < 13; n++)
    for (let offset = 1; offset <= 4; offset++) deck.push(hands[(dealer + offset) % 4][n]);
  return createGame({ id: 'casebook-reserved', mode, dealer }, deck);
}

function bidCase(initial: PrivateGame, bids: readonly number[]): PrivateGame {
  let state = initial;
  for (let n = 0; n < 4; n++) {
    const actor = state.turn;
    if (actor === null) throw new Error('Casebook bid has no actor.');
    state = apply(state, { kind: 'bid', seat: actor, bid: bids[actor] });
  }
  return state;
}

function playCase(initial: PrivateGame, cards: readonly Card[]): PrivateGame {
  let state = initial;
  for (const card of cards) {
    if (state.phase === 'trick-end') state = collectTrick(state);
    const actor = state.turn;
    if (actor === null) throw new Error('Casebook play has no actor.');
    if (!legalActions(state, actor).some((action) => action.kind === 'play' && action.card === card))
      throw new Error(`Illegal casebook play: ${card}`);
    state = apply(state, { kind: 'play', seat: actor, card });
  }
  return state;
}

function specialCase(entry: ReasoningCase): PrivateGame | null {
  const { mode, bids, fixture } = entry;
  const suits = (order: readonly string[]) =>
    order.map((suit) => fullDeck().filter((card) => card.startsWith(suit))) as [Card[], Card[], Card[]];
  if (fixture === 'void-play')
    return playCase(bidCase(reservedDeal([...suits(['C', 'D', 'H']), fullDeck().filter((card) => card.startsWith('S'))], mode), bids), ['CA']);
  if (fixture === 'safe-nil' || fixture === 'forced-nil' || fixture === 'failed-nil') {
    const hand: Card[] = fixture === 'safe-nil' ? ['H2', 'HA'] : ['HK', 'HA'];
    let state = playCase(
      bidCase(reservedDeal([hand, ['H3'], ['H4'], [fixture === 'safe-nil' ? 'HK' : 'H2']], mode, 0), bids),
      ['H3', 'H4', fixture === 'safe-nil' ? 'HK' : 'H2'],
    );
    if (fixture === 'failed-nil') {
      state = apply(state, { kind: 'play', seat: 0, card: 'HK' });
      state = collectTrick(state);
    }
    return state;
  }
  if (fixture === 'contract-made-nil')
    return playCase(
      bidCase(reservedDeal([
        ['CA', 'C2', 'H2', 'HA'], ['C3', 'CK', 'H3'], ['C4', 'C5', 'HK'], ['C6', 'C7', 'H4'],
      ], mode), bids),
      ['CA', 'C3', 'C4', 'C6', 'C2', 'CK', 'C5', 'C7', 'H3', 'HK', 'H4'],
    );
  if (fixture === 'partner-no-cover')
    return playCase(
      bidCase(reservedDeal([['H2', 'HQ'], ['H3'], ['HK'], ['H4']], mode, 0), bids),
      ['H3', 'HK', 'H4'],
    );
  if (fixture === 'partner-failed-nil') {
    const state = playCase(
      bidCase(reservedDeal([['H2', 'HA'], ['H4', 'H6'], ['HK', 'H3'], ['H5', 'H7']], mode, 1), bids),
      ['HK', 'H5', 'H2', 'H4', 'H3', 'H7', 'HA', 'H6'],
    );
    return state.phase === 'trick-end' ? collectTrick(state) : state;
  }
  if (fixture === 'partner-void') {
    const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
    const state = playCase(bidCase(reservedDeal([
      ranks.map((rank) => `C${rank}`),
      ranks.map((rank) => `H${rank}`),
      [...ranks.slice(0, 6).map((rank) => `D${rank}`), ...ranks.slice(0, 7).map((rank) => `S${rank}`)],
      [...ranks.slice(6).map((rank) => `D${rank}`), ...ranks.slice(7).map((rank) => `S${rank}`)],
    ], mode), bids), ['CA', 'H2', 'D2', 'D8']);
    return collectTrick(state);
  }
  if (fixture === 'partner-spade-void') {
    const state = playCase(bidCase(reservedDeal([
      fullDeck().filter((card) => card.startsWith('S')),
      fullDeck().filter((card) => card.startsWith('C')),
      fullDeck().filter((card) => card.startsWith('D')),
      fullDeck().filter((card) => card.startsWith('H')),
    ], mode), bids), ['S2', 'C2', 'D2', 'H2']);
    return collectTrick(state);
  }
  if (fixture === 'partner-current')
    return playCase(
      bidCase(reservedDeal([['H2', 'HA'], ['HK'], ['HQ'], ['H3']], mode, 1), bids),
      ['HQ', 'H3'],
    );
  return null;
}

export function reachCase(entry: ReasoningCase): PrivateGame {
  const special = specialCase(entry);
  if (special) return special;
  if (entry.seed === null) throw new Error(`Seeded case has no seed: ${entry.id}`);
  let state = createGame(
    { id: `casebook-${entry.id}`, mode: entry.mode, dealer: 3 as Seat },
    deckFor(entry.seed),
  );
  if (entry.phase === 'bid') {
    const first = legalActions(state, state.turn!);
    const selected = first.find((action) => action.kind === 'bid' && action.bid === entry.bids[state.turn!]);
    if (!selected || selected.kind !== 'bid') throw new Error(`No first bid for case: ${entry.id}`);
    state = apply(state, selected);
    return state;
  }
  for (let n = 0; n < 4; n++) {
    const actor = state.turn!;
    state = apply(state, { kind: 'bid', seat: actor, bid: entry.bids[actor] });
  }
  if (entry.fixture === 'turn-order') {
    const action = legalActions(state, state.turn!)[0];
    if (action.kind !== 'play') throw new Error(`No legal opening card: ${entry.id}`);
    return apply(state, action);
  }
  const tricks = entry.fixture === 'opening' ? 0 : entry.fixture === 'after-one-trick' ? 1 : 10;
  for (let trick = 0; trick < tricks; trick++) {
    for (let play = 0; play < 4; play++) {
      const action = legalActions(state, state.turn!)[0];
      if (action.kind !== 'play') throw new Error(`Unexpected case phase: ${entry.id}`);
      state = apply(state, action);
    }
    state = collectTrick(state);
  }
  return state;
}

export function inspectCase(entry: ReasoningCase) {
  const state = reachCase(entry);
  if (state.turn === null) throw new Error(`Case has no active actor: ${entry.id}`);
  const observation = observe(state, state.turn);
  const analysis = analyzeDecision(observation);
  return { observation, analysis };
}

/** These check the case premise and claim type, never the strategic quality of a move. */
export function checkCaseRubric(entry: ReasoningCase): boolean {
  const { observation, analysis } = inspectCase(entry);
  const reason = analysis.reasons.find((candidate) => candidate.id === entry.expectedReasonId);
  if (!reason) return false;
  const facts = analysis.facts;
  const partner = facts.partner;
  switch (entry.scenarioId) {
    case 'S01':
      return reason.kind === 'fact' && facts.legalCount === observation.legalActions.length;
    case 'S02':
    case 'S11':
      return reason.kind === 'fact' && facts.ledSuit !== null && facts.suitLengths[facts.ledSuit] === 0;
    case 'S03':
      return reason.kind === 'fact' && facts.possibleOwners.some((entry) => entry.seats.length > 1);
    case 'S04':
      return reason.kind === 'fact' && facts.actorsAfter.length > 0;
    case 'S05':
      return reason.kind === 'fact' && facts.ownNil === 'live' &&
        facts.cardOutcomes.some((outcome) => outcome.currentWinner !== observation.seat);
    case 'S06':
      return reason.kind === 'fact' && facts.ownNil === 'live' &&
        facts.cardOutcomes.every((outcome) => outcome.guaranteedWinner === observation.seat);
    case 'S07':
      return reason.kind === 'fact' && facts.ownNil === 'failed';
    case 'S08':
      return reason.kind === 'fact' && (facts.contractNeeded ?? 0) > 0;
    case 'S09':
      return reason.kind === 'fact' && facts.contractNeeded === 0;
    case 'S10':
      return reason.kind === 'heuristic' && observation.trick.length === 0;
    case 'S12':
      return reason.kind === 'fact' && observation.bids[1] === 0 && observation.tricks[1] === 0;
    case 'S13':
      return reason.kind === 'heuristic' && observation.phase === 'bid' &&
        observation.bids.some((bid) => bid !== null) && analysis.facts.ownBid === null;
    case 'S14':
      return reason.kind === 'heuristic' && observation.history.length >= 10 &&
        /does not solve/i.test(reason.text);
    case 'P04':
      return reason.kind === 'heuristic' && analysis.facts.ownNil === 'live' &&
        analysis.facts.partnerNil === 'live' && /no universal/i.test(reason.text);
    case 'P08': {
      return reason.kind === 'heuristic' && partner !== null &&
        observation.history.some((trick) => trick.plays.some((play) => play.seat === partner)) &&
        /no signaling convention/i.test(reason.text);
    }
    case 'P11':
      return reason.kind === 'heuristic' && observation.trick.length === 0 &&
        analysis.facts.partner !== null && /entry/i.test(reason.text);
    case 'P01':
      return reason.kind === 'fact' && partner !== null && facts.currentWinner === partner &&
        (observation.bids[partner] ?? 0) > 0;
    case 'P02':
      return reason.kind === 'fact' && partner !== null && facts.partnerNil === 'live' &&
        facts.currentWinner === partner && facts.cardOutcomes.some((outcome) => outcome.coversPartnerNil);
    case 'P03':
      return reason.kind === 'fact' && partner !== null && facts.partnerNil === 'live' &&
        facts.currentWinner === partner && facts.cardOutcomes.every((outcome) => !outcome.coversPartnerNil);
    case 'P05':
      return reason.kind === 'fact' && facts.partnerNil === 'failed';
    case 'P06':
      return reason.kind === 'heuristic' && partner !== null &&
        Object.values(facts.voids).some((seats) => seats.includes(partner)) &&
        facts.possibleOwners.some((entry) => entry.card.startsWith('S') && entry.seats.includes(partner));
    case 'P07':
      return reason.kind === 'fact' && partner !== null && facts.voids.S.includes(partner);
    case 'P09':
      return partner !== null && facts.currentWinner === partner && facts.actorsAfter.length > 0;
    case 'P10':
      return reason.kind === 'fact' && partner !== null && facts.contractBid !== null;
    case 'P12':
      return reason.kind === 'fact' && partner !== null && observation.mode === 'spades-partners';
    default:
      return false;
  }
}

export function validateCasebook(
  cases: readonly ReasoningCase[],
  scenarios: readonly ScenarioDefinition[],
): void {
  const byScenario = new Map(scenarios.map((scenario) => [scenario.id, scenario]));
  const caseIds = new Set<string>();
  const cueIds = new Set(cases.map((entry) => entry.cueId));
  for (const entry of cases) {
    if (caseIds.has(entry.id)) throw new Error(`Duplicate case: ${entry.id}`);
    caseIds.add(entry.id);
    const scenario = byScenario.get(entry.scenarioId);
    if (!scenario) throw new Error(`Unknown scenario: ${entry.scenarioId}`);
    if (!scenario.modes.includes(entry.mode) || !scenario.phases.includes(entry.phase))
      throw new Error(`Case variant/phase conflicts with scenario: ${entry.id}`);
    if (!entry.expectedReasonId.startsWith(`${entry.scenarioId}.`))
      throw new Error(`Tactic prefix conflicts with scenario: ${entry.id}`);
    if (!entry.id || !entry.caseGroupId || !entry.rubric || !entry.cueId)
      throw new Error(`Incomplete case: ${entry.id}`);
    if (entry.minimumLegalActions < 1 || !Number.isInteger(entry.minimumLegalActions))
      throw new Error(`Invalid minimum legal actions: ${entry.id}`);
    if (entry.independentLabel.status === 'independently-labelled') {
      const label = entry.independentLabel;
      if (!label.reviewer || !label.reviewedAt || !label.acceptedActionIds.length || !label.rationale || !label.evidenceRef)
        throw new Error(`Independent label needs a reviewer, accepted actions, rationale and evidence: ${entry.id}`);
      const legalIds = new Set(inspectCase(entry).observation.legalActions.map(actionId));
      if (label.acceptedActionIds.some((id) => !legalIds.has(id)))
        throw new Error(`Independent label names an illegal action: ${entry.id}`);
    }
    for (const counterexample of entry.counterexampleIds)
      if (!cases.some((candidate) => candidate.id === counterexample))
        throw new Error(`Dangling counterexample: ${entry.id} -> ${counterexample}`);
  }
  for (const scenario of scenarios) {
    for (const caseId of scenario.caseIds)
      if (!caseIds.has(caseId) || cases.find((entry) => entry.id === caseId)?.scenarioId !== scenario.id)
        throw new Error(`Dangling case: ${scenario.id} -> ${caseId}`);
    for (const cueId of scenario.cueIds)
      if (!cueIds.has(cueId) || !cases.some((entry) => entry.scenarioId === scenario.id && entry.cueId === cueId))
        throw new Error(`Dangling cue: ${scenario.id} -> ${cueId}`);
  }
}

export function buildCasebookReport(
  cases: readonly ReasoningCase[] = SPADES_CASEBOOK,
  scenarios: readonly ScenarioDefinition[] = SPADES_SCENARIOS,
) {
  validateCasebook(cases, scenarios);
  const caseRows = cases.map((entry) => {
    const { observation, analysis } = inspectCase(entry);
    const recognition =
      observation.phase === entry.phase &&
      observation.mode === entry.mode &&
      observation.legalActions.length >= 2 &&
      analysis.scenarioIds.includes(entry.scenarioId) &&
      analysis.reasons.some((reason) => reason.id === entry.expectedReasonId) &&
      checkCaseRubric(entry)
        ? 'matched' as const
        : 'failed' as const;
    return {
      id: entry.id,
      caseGroupId: entry.caseGroupId,
      requirementId: entry.requirementId,
      scenarioId: entry.scenarioId,
      mode: entry.mode,
      phase: entry.phase,
      fixture: entry.fixture,
      seed: entry.seed,
      tacticId: entry.expectedReasonId,
      cueId: entry.cueId,
      selectedActionId: actionId(analysis.action),
      legalActionCount: observation.legalActions.length,
      recognition,
      rubricStatus: checkCaseRubric(entry) ? 'passed' as const : 'failed' as const,
      independentLabel: entry.independentLabel.status,
      strength: 'not-assessed' as const,
      rubric: entry.rubric,
      counterexampleIds: entry.counterexampleIds,
    };
  });
  return {
    schemaVersion: '1.0.0' as const,
    casebookVersion: 'spades-casebook-1.0.0',
    policyVersion: POLICY_VERSION,
    scenarios: scenarios.map((scenario) => ({
      id: scenario.id,
      status: scenario.status,
      caseIds: scenario.caseIds,
      cueIds: scenario.cueIds,
      casebookCaseIds: cases.filter((entry) => entry.scenarioId === scenario.id).map((entry) => entry.id),
      linkStatus: !scenario.caseIds.length ? 'missing-case-link' as const
        : !scenario.cueIds.length ? 'missing-cue-link' as const : 'linked-to-casebook' as const,
      cueRegistration: 'not-verified' as const,
      recognition: caseRows.some((entry) => entry.scenarioId === scenario.id && entry.recognition === 'matched')
        ? 'matched' as const : 'not-tested' as const,
      independentLabel: cases.some((entry) => entry.scenarioId === scenario.id && entry.independentLabel.status === 'independently-labelled')
        ? 'has-label' as const : 'unlabelled' as const,
      strength: 'not-assessed' as const,
    })),
    cases: caseRows,
    limitations: [
      'Case recognition and rubric references do not establish strategic strength.',
      'Independent accepted-action labels have not been supplied for these cases.',
      'Missing catalog case/cue links are explicit maintainer work, not silently inferred.',
      'Casebook cue IDs are maintainer anchors; no authored-content cue registry has been validated.',
    ],
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = buildCasebookReport();
  const content = JSON.stringify(report, null, 2) + '\n';
  if (process.argv[2]) writeFileSync(process.argv[2], content);
  else process.stdout.write(content);
}
