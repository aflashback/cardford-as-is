import type {
  SpadesActorPacket,
  SpadesAnalysis,
  SpadesCandidate,
  SpadesSessionView,
} from '../../../shared/contracts.ts';
import { assertContract } from '../../../shared/validation.ts';
import { validateDeal } from '../../game/cards.ts';
import { array, canonical, freeze, integer, json, object, string } from '../../game/kernel/codec.ts';
import type {
  AccessUnit,
  Codec,
  InitialChanceRequest,
  Module,
  Node,
  RegistrationAdapters,
} from '../../game/kernel/module.ts';
import type { RegistrationDescriptor } from '../../game/kernel/registry.ts';
import { assertSeat, SEATS, type Seat } from '../../game/kernel/seats.ts';
import type { Card } from '../../game/kernel/types.ts';
import { analyzeDecision } from '../../strategy/index.ts';
import type { DecisionAnalysis, DecisionFacts } from '../../strategy/types.ts';
import { buildFacts } from './reasoning/knowledge.ts';
import { SPADES_POLICY_VERSION } from './reasoning/manifest.ts';
import { applySpadesAction, collectSpadesTrick, createSpadesGame, nextSpadesHand } from './engine.ts';
import {
  originalSpadesObservation,
  observeSpades,
  spadesObservationCodec,
  type SpadesObservation,
} from './observation.ts';
import { spadesActionId, spadesActionsFor } from './rules.ts';
import {
  SPADES_RULE_PROFILES,
  spadesEventCodec,
  spadesStateCodec,
  type SpadesAction,
  type SpadesEvent,
  type SpadesState,
  type SpadesVariant,
} from './state.ts';

export type SpadesConfiguration = { id: string; dealer: Seat };
export type SpadesChance = { kind: 'request-deal'; roundNumber: number } | { kind: 'deal'; deck: Card[] };
export const spadesConfigurationCodec: Codec<SpadesConfiguration> = {
  parse(raw) {
    object(raw, ['id', 'dealer']);
    string(raw.id);
    assertSeat(raw.dealer);
    return { id: raw.id, dealer: raw.dealer };
  },
  encode(value) {
    return json(this.parse(value));
  },
};
export const spadesChanceCodec: Codec<SpadesChance> = {
  parse(raw) {
    if (raw === null || typeof raw !== 'object') throw new TypeError('Invalid Spades chance material.');
    object(raw, Object.keys(raw));
    if (raw.kind === 'request-deal') {
      object(raw, ['kind', 'roundNumber']);
      integer(raw.roundNumber, 1);
      return { kind: 'request-deal', roundNumber: raw.roundNumber };
    }
    object(raw, ['kind', 'deck']);
    if (raw.kind !== 'deal') throw new TypeError('Invalid Spades chance kind.');
    array(raw.deck);
    const deck = raw.deck.map((card) => {
      assertContract('Card', card);
      return card;
    });
    validateDeal(deck);
    return { kind: 'deal', deck };
  },
  encode(value) {
    return json(this.parse(value));
  },
};
function checkVariant(variant: SpadesVariant): void {
  if (variant !== 'solo' && variant !== 'partners') throw new TypeError('Unsupported Spades variant.');
}
const modeFor = (variant: SpadesVariant) => (variant === 'solo' ? 'spades-solo' : 'spades-partners');
function assertVariantState(state: SpadesState, variant: SpadesVariant): void {
  spadesStateCodec.encode(state);
  if (state.mode !== modeFor(variant)) throw new TypeError('Spades state variant mismatch.');
}
function assertVariantInput(input: SpadesObservation, variant: SpadesVariant): void {
  spadesObservationCodec.encode(input);
  if (input.variantId !== variant) throw new TypeError('Spades observation variant mismatch.');
}
export function spadesAccessUnit(
  input: Pick<SpadesObservation, 'variantId' | 'phase' | 'table'>,
): AccessUnit | null {
  if (input.phase === 'deal' || input.phase === 'match-end') return null;
  return {
    id: `spades:${input.variantId}:hand:${input.table.roundNumber}`,
    kind: 'hand',
    atAdmissionBoundary: input.phase === 'bid' && input.table.bids.every((bid) => bid === null),
  };
}
function nodeFor(state: SpadesState): Node<SpadesChance> {
  if (state.awaitingDeal)
    return {
      kind: 'chance',
      phase: 'deal',
      requestId: `deal:${state.handNumber + 1}`,
      request: { kind: 'request-deal', roundNumber: state.handNumber + 1 },
    };
  if (state.phase === 'trick-end')
    return {
      kind: 'automatic',
      phase: state.phase,
      transitionId: `collect:${state.handNumber}:${state.history.length}`,
    };
  if (state.phase === 'hand-end') return { kind: 'round-complete', phase: state.phase };
  if (state.phase === 'match-end') return { kind: 'session-complete', phase: state.phase };
  if (state.turn === null) throw new TypeError('Spades actor is missing.');
  return { kind: 'actor', phase: state.phase, seat: state.turn };
}
function candidatesFor(input: SpadesObservation) {
  if (input.phase === 'deal') return [];
  return spadesActionsFor(
    {
      phase: input.phase,
      turn: input.table.turn,
      hand: input.table.hand,
      trick: input.table.trick,
      spadesBroken: input.table.spadesBroken,
    },
    input.seat,
  ).map((action) => ({ id: spadesActionId(action), action, public: publicAction(action) }));
}
function publicAction(action: SpadesAction): SpadesCandidate {
  return action.kind === 'bid' ? { kind: 'bid', bid: action.bid } : { kind: 'play', card: action.card };
}
type SpadesModule = Module<
  SpadesState,
  SpadesObservation,
  SpadesAction,
  SpadesEvent,
  SpadesChance,
  SpadesCandidate,
  SpadesObservation,
  DecisionFacts,
  SpadesConfiguration
> &
  InitialChanceRequest<SpadesConfiguration, SpadesChance>;
export function spadesModuleFor(variant: SpadesVariant): SpadesModule {
  checkVariant(variant);
  const mode = modeFor(variant);
  return freeze({
    pin: {
      gameId: 'spades',
      variantId: variant,
      moduleVersion: '2.0.0',
      ruleProfileId: SPADES_RULE_PROFILES[mode],
      stateSchemaVersion: '2.0.0',
      observationSchemaVersion: '2.0.0',
      publicSchemaVersion: '2.0.0',
      eventSchemaVersion: '2.0.0',
    },
    stateCodec: {
      parse(raw) {
        const state = spadesStateCodec.parse(raw);
        assertVariantState(state, variant);
        return state;
      },
      encode(state) {
        assertVariantState(state, variant);
        return spadesStateCodec.encode(state);
      },
    },
    observationCodec: {
      parse(raw) {
        const input = spadesObservationCodec.parse(raw);
        assertVariantInput(input, variant);
        return input;
      },
      encode(input) {
        assertVariantInput(input, variant);
        return spadesObservationCodec.encode(input);
      },
    },
    configurationCodec: spadesConfigurationCodec,
    initialChanceRequest(config) {
      spadesConfigurationCodec.parse(config);
      return { kind: 'request-deal', roundNumber: 1 };
    },
    create(config, material) {
      const checked = spadesConfigurationCodec.parse(config),
        chance = spadesChanceCodec.parse(material);
      if (chance.kind !== 'deal') throw new TypeError('Creation requires a complete Spades deal.');
      const state = createSpadesGame({ ...checked, mode }, chance.deck);
      return { state, events: state.events };
    },
    node(state) {
      assertVariantState(state, variant);
      return nodeFor(state);
    },
    observe(state, actor) {
      assertVariantState(state, variant);
      return observeSpades(state, actor);
    },
    candidates(input) {
      assertVariantInput(input, variant);
      return candidatesFor(input);
    },
    reduce(state, operation) {
      assertVariantState(state, variant);
      const node = nodeFor(state);
      let next: SpadesState;
      switch (operation.kind) {
        case 'actor':
          if (
            node.kind !== 'actor' ||
            operation.seat !== node.seat ||
            operation.action.seat !== operation.seat
          )
            throw new Error('Not the current Spades actor.');
          next = applySpadesAction(state, operation.action);
          break;
        case 'automatic':
          if (node.kind !== 'automatic' || operation.transitionId !== node.transitionId)
            throw new Error('Wrong Spades collection.');
          next = collectSpadesTrick(state);
          break;
        case 'continue-round':
          if (node.kind !== 'round-complete') throw new Error('Not a Spades round boundary.');
          next = { ...structuredClone(state), awaitingDeal: true };
          break;
        case 'chance': {
          if (node.kind !== 'chance' || operation.requestId !== node.requestId)
            throw new Error('Wrong Spades deal request.');
          const chance = spadesChanceCodec.parse(operation.material);
          if (chance.kind !== 'deal') throw new TypeError('Spades chance requires a complete deal.');
          next = nextSpadesHand(state, chance.deck);
          break;
        }
        case 'sealed':
          throw new Error('Spades has no sealed choice window.');
      }
      return { state: next, events: next.events.slice(state.events.length) };
    },
    projectEvent(event, viewer) {
      assertSeat(viewer);
      spadesEventCodec.encode(event);
      const value = {
        publicSchemaVersion: '2.0.0',
        gameId: 'spades',
        variantId: variant,
        eventSchemaVersion: '2.0.0',
        id: String(event.id),
        type: event.type,
        message: event.message,
        seat: event.seat ?? null,
        card: event.card ?? null,
        bid: event.bid ?? null,
      };
      assertContract('SpadesActorEvent', value);
      return json(value);
    },
    facts(input) {
      assertVariantInput(input, variant);
      return buildFacts(originalSpadesObservation(input));
    },
    table(input) {
      assertVariantInput(input, variant);
      return structuredClone(input);
    },
    accessUnit(state) {
      assertVariantState(state, variant);
      return spadesAccessUnit(observeSpades(state, 0));
    },
  });
}
/** Kept separately for exact V1 choice/reason/fact parity and original-analysis attribution. */
export function analyzeV1Spades(input: SpadesObservation, policyId: string): DecisionAnalysis {
  string(policyId);
  return analyzeDecision(originalSpadesObservation(input), policyId);
}
function publicAnalysis(input: SpadesObservation, original: DecisionAnalysis): SpadesAnalysis {
  if (original.action.kind === 'pass') throw new TypeError('Spades policy returned a pass.');
  const selectedCandidateId = spadesActionId(original.action);
  const selected = original.candidates.find(
    (candidate) =>
      candidate.action.kind !== 'pass' && spadesActionId(candidate.action) === selectedCandidateId,
  );
  if (!selected || !candidatesFor(input).some((candidate) => candidate.id === selectedCandidateId))
    throw new TypeError('Spades policy selected an unavailable candidate.');
  const reasons = original.reasons.filter(
    (reason) =>
      selected.reasonIds.includes(reason.id) &&
      (!reason.actionIds || reason.actionIds.includes(selectedCandidateId)),
  );
  const result: SpadesAnalysis = {
    publicSchemaVersion: '2.0.0',
    gameId: 'spades',
    variantId: input.variantId,
    origin: original.provenance,
    selectedCandidateId,
    objective: {
      id: input.variantId === 'solo' ? 'spades-individual-score' : 'spades-partnership-score',
      version: '1.0.0',
      metric: 'score',
      direction: 'higher',
    },
    horizon: { id: 'current-hand', version: '1.0.0', scope: 'round' },
    facts: reasons.map((reason) => ({
      id: reason.id,
      kind: reason.kind === 'fact' ? 'exact' : 'inferred',
      summary: reason.text,
      evidence: [original.policyVersion, ...(reason.claims ?? []).map((claim) => claim.predicate)],
      candidateId: reason.actionIds ? selectedCandidateId : null,
    })),
    estimates: [],
    scenarios: original.scenarioIds.map((id) => ({
      id,
      version: original.policyVersion,
      applicability: 'applies',
      evidence: [original.policyVersion],
      exceptions: [],
    })),
    assumptions: [...original.limitations],
  };
  assertContract('SpadesAnalysis', result);
  return result;
}
export function spadesAdaptersFor(
  variant: SpadesVariant,
): RegistrationAdapters<
  SpadesState,
  SpadesObservation,
  SpadesEvent,
  SpadesChance,
  SpadesCandidate,
  SpadesObservation,
  DecisionFacts
> {
  checkVariant(variant);
  return {
    chanceCodec: spadesChanceCodec,
    eventCodec: spadesEventCodec,
    packet(input, candidates) {
      assertVariantInput(input, variant);
      const value: SpadesActorPacket = {
        publicSchemaVersion: '2.0.0',
        gameId: 'spades',
        variantId: variant,
        seat: input.seat,
        phase: input.phase,
        observation: structuredClone(input.table),
        candidates: candidates.map((candidate) => ({
          id: candidate.id,
          public: structuredClone(candidate.public),
        })),
      };
      assertContract('SpadesActorPacket', value);
      if (
        canonical(value.candidates) !==
        canonical(candidatesFor(input).map(({ id, public: value }) => ({ id, public: value })))
      )
        throw new TypeError('Spades packet candidate set mismatch.');
      return value;
    },
    view(input) {
      assertVariantInput(input, variant);
      const value: SpadesSessionView = {
        publicSchemaVersion: '2.0.0',
        gameId: 'spades',
        variantId: variant,
        seat: input.seat,
        phase: input.phase,
        table: structuredClone(input.table),
        accessUnit: spadesAccessUnit(input),
      };
      assertContract('SpadesSessionView', value);
      return value;
    },
    async analyze(input, facts, policyId) {
      assertVariantInput(input, variant);
      if (canonical(facts) !== canonical(buildFacts(originalSpadesObservation(input))))
        throw new TypeError('Spades facts mismatch.');
      const analysis = publicAnalysis(input, analyzeV1Spades(input, policyId));
      return { candidateId: analysis.selectedCandidateId, analysis };
    },
    document(state) {
      assertVariantState(state, variant);
      return spadesStateCodec.encode(state);
    },
  };
}
export function spadesDescriptorFor(variant: SpadesVariant): RegistrationDescriptor {
  checkVariant(variant);
  return freeze({
    gameId: 'spades',
    moduleVersion: '2.0.0',
    variants: [
      {
        id: variant,
        ruleProfileId: SPADES_RULE_PROFILES[modeFor(variant)],
        competition:
          variant === 'solo'
            ? {
                mode: 'individual',
                competitors: SEATS.map((seat) => ({ id: `seat-${seat}`, seats: [seat] })),
              }
            : {
                mode: 'partnership',
                competitors: [
                  { id: 'NS', seats: [0, 2] },
                  { id: 'EW', seats: [1, 3] },
                ],
              },
        tableTypes: ['practice'],
        defaultPolicy: { id: SPADES_POLICY_VERSION, version: '2.1.0' },
      },
    ],
    schemas: {
      state: 'spades-state-2.0.0',
      observation: 'spades-observation-2.0.0',
      public: 'spades-public-2.0.0',
      event: 'spades-event-2.0.0',
    },
    requiredEngineCapabilities: ['actor', 'automatic', 'chance', 'round-boundary'],
    requiredUICapabilities: ['spades-table'],
    supportedHorizonIds: ['current-hand'],
  });
}
