import { json } from '../../game/kernel/codec.ts';
import type {
  InitialChanceRequest,
  Module,
  Operation,
  RegistrationAdapters,
  Transition,
} from '../../game/kernel/module.ts';
import type { RegistrationDescriptor } from '../../game/kernel/registry.ts';
import { assertSeat, SEATS } from '../../game/kernel/seats.ts';
import type { Seat } from '../../game/kernel/types.ts';
import type { HeartsAnalysis, HeartsCandidate, HeartsSessionView } from '../../../shared/contracts.ts';
import { analyzeDecision } from '../../strategy/index.ts';
import type { DecisionAnalysis } from '../../strategy/types.ts';
import { heartsChanceCodec, heartsConfigurationCodec, heartsEventCodec, heartsStateCodec } from './codec.ts';
import {
  applyHeartsAction,
  collectHeartsTrick,
  createHeartsGame,
  heartsActionId,
  heartsTrickWinner,
  nextHeartsHand,
} from './engine.ts';
import {
  heartsObservationActions,
  heartsObservationCodec,
  heartsUnitId,
  observeHearts,
  publicHeartsObservation,
  toV1HeartsObservation,
  type HeartsActorObservation,
} from './observation.ts';
import type { HeartsAction, HeartsChance, HeartsConfig, HeartsEvent, HeartsState } from './state.ts';

export type HeartsFacts = {
  legalCount: number;
  ledSuit: string | null;
  currentWinner: Seat | null;
  tricksRemaining: number;
  ownTricks: number;
  ownScore: number;
};
const header = { publicSchemaVersion: '2.0.0', gameId: 'hearts', variantId: 'solo' } as const;
export const HEARTS_DEFAULT_POLICY = 'hearts-baseline-1.0.0';
const windowId = (state: HeartsState) => `${state.id}:hand:${state.handNumber}:pass`;
const collectId = (state: HeartsState) =>
  `${state.id}:hand:${state.handNumber}:collect:${state.history.length}`;
const dealId = (state: HeartsState) => `${state.id}:hand:${state.handNumber + 1}:deal`;
const admissionBoundary = (
  input: Pick<HeartsActorObservation, 'history' | 'trick' | 'passDirection' | 'pass'>,
) =>
  !input.history.length && !input.trick.length && (input.passDirection === 'hold' || input.pass.to === null);
function transition(state: HeartsState, next: HeartsState): Transition<HeartsState, HeartsEvent> {
  return { state: next, events: next.events.slice(state.events.length) };
}
function publicCandidate(action: HeartsAction): HeartsCandidate {
  return action.kind === 'play'
    ? { kind: 'play', card: action.card }
    : { kind: 'pass', cards: [...action.cards] };
}

export const heartsModule: Module<
  HeartsState,
  HeartsActorObservation,
  HeartsAction,
  HeartsEvent,
  HeartsChance,
  HeartsCandidate,
  HeartsSessionView,
  HeartsFacts,
  HeartsConfig
> &
  InitialChanceRequest<HeartsConfig, HeartsChance> = {
  pin: {
    gameId: 'hearts',
    variantId: 'solo',
    moduleVersion: '2.0.0',
    ruleProfileId: 'hearts-training-1.0.0',
    stateSchemaVersion: '2.0.0',
    observationSchemaVersion: '2.0.0',
    publicSchemaVersion: '2.0.0',
    eventSchemaVersion: '2.0.0',
  },
  stateCodec: heartsStateCodec,
  observationCodec: heartsObservationCodec,
  configurationCodec: heartsConfigurationCodec,
  initialChanceRequest(config) {
    heartsConfigurationCodec.parse(json(config));
    return { kind: 'request-deal', roundNumber: 1 };
  },
  create(config, material) {
    if (material.kind !== 'deal') throw new Error('Creation requires an explicit private deal.');
    const state = createHeartsGame(config, material.deck);
    return { state, events: state.events };
  },
  node(state) {
    switch (state.phase) {
      case 'pass':
        return { kind: 'sealed', phase: 'pass', windowId: windowId(state), actors: [0, 1, 2, 3] };
      case 'play':
        if (state.turn === null) throw new Error('Missing Hearts actor.');
        return { kind: 'actor', phase: 'play', seat: state.turn };
      case 'trick-end':
        return { kind: 'automatic', phase: 'trick-end', transitionId: collectId(state) };
      case 'hand-end':
        return { kind: 'round-complete', phase: 'hand-end' };
      case 'match-end':
        return { kind: 'session-complete', phase: 'match-end' };
      case 'awaiting-deal':
        return {
          kind: 'chance',
          phase: 'awaiting-deal',
          requestId: dealId(state),
          request: { kind: 'request-deal', roundNumber: state.handNumber + 1 },
        };
    }
  },
  observe: observeHearts,
  candidates(input) {
    return heartsObservationActions(input).map((action) => ({
      id: heartsActionId(action),
      action,
      public: publicCandidate(action),
    }));
  },
  reduce(state, operation: Operation<HeartsAction, HeartsChance>) {
    const current = this.node(state);
    switch (operation.kind) {
      case 'actor':
        if (
          current.kind !== 'actor' ||
          current.seat !== operation.seat ||
          operation.action.seat !== operation.seat ||
          operation.action.kind !== 'play'
        )
          throw new Error('Wrong Hearts actor operation.');
        return transition(state, applyHeartsAction(state, operation.action));
      case 'sealed': {
        if (
          current.kind !== 'sealed' ||
          current.windowId !== operation.windowId ||
          operation.actions.length !== 4 ||
          new Set(operation.actions.map((entry) => entry.seat)).size !== 4
        )
          throw new Error('Wrong Hearts sealed window.');
        const cardsFor = (seat: Seat) => {
          const entry = operation.actions.find((action) => action.seat === seat);
          if (!entry || entry.action.seat !== seat || entry.action.kind !== 'pass')
            throw new Error('Incomplete Hearts pass bundle.');
          assertSeat(entry.seat);
          return [...entry.action.cards];
        };
        // Validate all four choices against the unchanged state before any exchange occurs.
        const passes: [string[], string[], string[], string[]] = [
          cardsFor(0),
          cardsFor(1),
          cardsFor(2),
          cardsFor(3),
        ];
        for (const seat of SEATS)
          if (
            !this.candidates(this.observe(state, seat)).some(
              (candidate) => candidate.id === heartsActionId({ kind: 'pass', seat, cards: passes[seat] }),
            )
          )
            throw new Error('Illegal Hearts sealed action.');
        return transition(state, applyHeartsAction(state, { kind: 'pass-bundle', passes }));
      }
      case 'automatic':
        if (current.kind !== 'automatic' || current.transitionId !== operation.transitionId)
          throw new Error('Wrong Hearts collection.');
        return transition(state, collectHeartsTrick(state));
      case 'continue-round':
        if (current.kind !== 'round-complete') throw new Error('Wrong Hearts round boundary.');
        return { state: { ...structuredClone(state), phase: 'awaiting-deal' }, events: [] };
      case 'chance':
        if (
          current.kind !== 'chance' ||
          current.requestId !== operation.requestId ||
          operation.material.kind !== 'deal'
        )
          throw new Error('Wrong Hearts deal request.');
        return transition(state, nextHeartsHand(state, operation.material.deck));
    }
  },
  projectEvent(event, viewer) {
    assertSeat(viewer);
    return json({
      ...header,
      eventSchemaVersion: '2.0.0',
      id: String(event.id),
      type: event.type,
      message: event.message,
      seat: event.seat ?? null,
      card: event.card ?? null,
      bid: null,
    });
  },
  facts(input) {
    return {
      legalCount: heartsObservationActions(input).length,
      ledSuit: input.trick.length ? input.trick[0].card[0] : null,
      currentWinner: input.trick.length ? heartsTrickWinner(input.trick) : null,
      tricksRemaining: 13 - input.history.length,
      ownTricks: input.tricks[input.seat],
      ownScore: input.scores[input.seat],
    };
  },
  table(input) {
    return {
      ...header,
      seat: input.seat,
      phase: input.phase,
      table: publicHeartsObservation(input),
      accessUnit: { id: input.unitId, kind: 'hand', atAdmissionBoundary: admissionBoundary(input) },
    };
  },
  accessUnit(state) {
    return {
      id: heartsUnitId(state.id, state.handNumber),
      kind: 'hand',
      atAdmissionBoundary: admissionBoundary({
        history: state.history,
        trick: state.trick,
        passDirection: state.passDirection,
        pass: state.passes[0],
      }),
    };
  },
};

/** Original analysis survives as-is for historical parity and saved-policy attribution. */
export function analyzeHeartsCompatibility(
  input: HeartsActorObservation,
  policyId: string = HEARTS_DEFAULT_POLICY,
): DecisionAnalysis {
  const checked = heartsObservationCodec.parse(json(input));
  return analyzeDecision(toV1HeartsObservation(checked), policyId);
}
export function registeredHeartsAnalysis(original: DecisionAnalysis, facts: HeartsFacts): HeartsAnalysis {
  return {
    ...header,
    origin: original.provenance,
    selectedCandidateId:
      original.action.kind === 'bid'
        ? (() => {
            throw new Error('Hearts policy returned a bid.');
          })()
        : heartsActionId(original.action),
    objective: { id: 'hearts-low-penalty', version: '1.0.0', metric: 'penalty-points', direction: 'lower' },
    horizon: { id: 'hand', version: '1.0.0', scope: 'round' },
    facts: [
      {
        id: 'hearts.legal-count',
        kind: 'exact',
        summary: `${facts.legalCount} legal actions.`,
        evidence: [`legal-count:${facts.legalCount}`],
        candidateId: null,
      },
      {
        id: 'hearts.own-score',
        kind: 'exact',
        summary: `${facts.ownScore} cumulative penalty points.`,
        evidence: [`own-score:${facts.ownScore}`],
        candidateId: null,
      },
    ],
    estimates: [],
    scenarios: original.scenarioIds.map((id) => ({
      id,
      version: original.policyVersion,
      applicability: 'applies',
      evidence: ['Original pinned Hearts policy analysis.'],
      exceptions: [],
    })),
    assumptions: [...original.limitations],
  };
}
export const heartsAdapters: RegistrationAdapters<
  HeartsState,
  HeartsActorObservation,
  HeartsEvent,
  HeartsChance,
  HeartsCandidate,
  HeartsSessionView,
  HeartsFacts
> = {
  chanceCodec: heartsChanceCodec,
  eventCodec: heartsEventCodec,
  packet(input, candidates) {
    return {
      ...header,
      seat: input.seat,
      phase: input.phase,
      observation: publicHeartsObservation(input),
      candidates: candidates.map((candidate) => ({
        id: candidate.id,
        public: structuredClone(candidate.public),
      })),
    };
  },
  view: (view) => view,
  async analyze(input, facts, policyId) {
    const original = analyzeHeartsCompatibility(input, policyId);
    const analysis = registeredHeartsAnalysis(original, facts);
    if (!heartsModule.candidates(input).some((candidate) => candidate.id === analysis.selectedCandidateId))
      throw new Error('Hearts policy selected an unavailable candidate.');
    return { candidateId: analysis.selectedCandidateId, analysis };
  },
  document: heartsStateCodec.encode.bind(heartsStateCodec),
};
export const heartsDescriptor: RegistrationDescriptor = {
  gameId: 'hearts',
  moduleVersion: '2.0.0',
  variants: [
    {
      id: 'solo',
      ruleProfileId: 'hearts-training-1.0.0',
      competition: {
        mode: 'individual',
        competitors: [
          { id: 'south', seats: [0] },
          { id: 'west', seats: [1] },
          { id: 'north', seats: [2] },
          { id: 'east', seats: [3] },
        ],
      },
      tableTypes: ['practice'],
      defaultPolicy: { id: HEARTS_DEFAULT_POLICY, version: '1.0.0' },
    },
  ],
  schemas: {
    state: 'hearts-state-v2',
    observation: 'hearts-observation-v2',
    public: 'hearts-public-v2',
    event: 'hearts-event-v2',
  },
  requiredEngineCapabilities: ['actor', 'sealed', 'automatic', 'chance', 'round-boundary'],
  requiredUICapabilities: ['hearts-table'],
  supportedHorizonIds: ['hand', 'match'],
};
