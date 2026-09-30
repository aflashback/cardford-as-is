import { matchWinner } from '../../../game/index.ts';
import { competitionFor, competitorOf, teammatesOf } from '../../../game/kernel/competition.ts';
import type { Card, Four, Seat } from '../../../game/kernel/types.ts';
import { assertObservation, type SeatObservation } from '../../../observations/index.ts';
import { createRandom } from '../../../strategy/plan/random.ts';
import type { PlanHorizon, PlayoutModel } from '../../../strategy/plan/types.ts';
import {
  createWorldSampler,
  SAMPLER_VERSION,
  SampleUnavailableError,
  type WorldSampler,
} from '../../../strategy/sampler.ts';
import {
  PHASE_DONE,
  SPADES_KERNEL_VERSION,
  actionIdOfMove,
  applyMove,
  cardIndex,
  cloneWorld,
  copyWorld,
  rankOf,
  scoreWorld,
  suitOf,
  worldFromState,
  type SpadesWorld,
} from './kernel.ts';
import { SPADES_PLAYOUT_POLICY_VERSION, estimateTricks, playoutMove } from './policy.ts';

export const SPADES_OBJECTIVE_VERSION = 'spades-objective-1.0.0';
export const BID_CONSISTENCY_VERSION = 'bid-consistency-1.0.0';

/** SG-03: named heuristic constants. The production scorer itself is never altered. */
export type SpadesObjective = {
  /** Points charged per carried bag, reflecting the later ten-bag penalty. */
  bagLiability: number;
  /** Added or subtracted only when the scored hand ends the match. */
  matchBonus: number;
  /** How several opposing competitors are combined in individual competition. */
  opposingReference: 'mean' | 'max';
};
export const DEFAULT_SPADES_OBJECTIVE: SpadesObjective = {
  bagLiability: 10,
  matchBonus: 500,
  opposingReference: 'mean',
};

const OBJECTIVE_REFERENCES: readonly SpadesObjective['opposingReference'][] = ['mean', 'max'];
const DEFAULT_BID_SPREAD = 1.5;
const DEFAULT_REJECTION_TRIES = 48;

/** Defaults plus the overrides that are present. An explicit `undefined` keeps the default. */
export function effectiveSpadesObjective(overrides: Partial<SpadesObjective> = {}): SpadesObjective {
  const objective: SpadesObjective = {
    bagLiability: overrides.bagLiability ?? DEFAULT_SPADES_OBJECTIVE.bagLiability,
    matchBonus: overrides.matchBonus ?? DEFAULT_SPADES_OBJECTIVE.matchBonus,
    opposingReference: overrides.opposingReference ?? DEFAULT_SPADES_OBJECTIVE.opposingReference,
  };
  if (
    !Number.isFinite(objective.bagLiability) ||
    !Number.isFinite(objective.matchBonus) ||
    !OBJECTIVE_REFERENCES.includes(objective.opposingReference)
  )
    throw new Error('Invalid Spades objective constants.');
  return objective;
}

/**
 * SG-03: the identity of the objective that ranked the candidates. The named version stands for
 * the default constants only; any other constants are written into the identity, so two
 * different objectives never share one.
 */
export function spadesObjectiveId(overrides: Partial<SpadesObjective> = {}): string {
  const objective = effectiveSpadesObjective(overrides);
  const standard =
    objective.bagLiability === DEFAULT_SPADES_OBJECTIVE.bagLiability &&
    objective.matchBonus === DEFAULT_SPADES_OBJECTIVE.matchBonus &&
    objective.opposingReference === DEFAULT_SPADES_OBJECTIVE.opposingReference;
  return standard
    ? SPADES_OBJECTIVE_VERSION
    : `${SPADES_OBJECTIVE_VERSION}[bagLiability=${objective.bagLiability};matchBonus=${objective.matchBonus};opposingReference=${objective.opposingReference}]`;
}

/** GP-03: every named 0/1 outcome the model reports, with what it means and what it rests on. */
export type SpadesPlayoutEvent = {
  id: string;
  /** Authored definition of the outcome, judged when the scored hand is complete. */
  event: string;
  horizon: PlanHorizon;
  /** Estimates of the event are conditioned on the acting seat's observation only. */
  information: 'seat-observation';
  /** A condition names the commitment in force; an outcome names how the hand ended. */
  role: 'condition' | 'outcome';
  /** The condition event that must be 1 for this outcome to be meaningful, or null. */
  appliesWhen: string | null;
};
const declared = (
  id: string,
  role: SpadesPlayoutEvent['role'],
  appliesWhen: string | null,
  event: string,
): SpadesPlayoutEvent => ({ id, event, horizon: 'round', information: 'seat-observation', role, appliesWhen });
export const SPADES_PLAYOUT_EVENTS: readonly SpadesPlayoutEvent[] = [
  declared('positiveContract', 'condition', null, 'This competitor holds a positive contract in this hand.'),
  declared('contractMade', 'outcome', 'positiveContract', 'The positive contract is made by the end of this hand.'),
  declared('ownNil', 'condition', null, 'This seat bid Nil in this hand.'),
  declared('ownNilKept', 'outcome', 'ownNil', 'This seat takes no trick in this hand.'),
  declared('teammateNil', 'condition', null, 'A teammate of this seat bid Nil in this hand.'),
  declared('teammateNilKept', 'outcome', 'teammateNil', 'The Nil teammate takes no trick in this hand.'),
  declared('bagPenalty', 'outcome', null, 'The ten-bag penalty is charged at the end of this hand.'),
  declared('opposingContractSet', 'outcome', null, 'At least one opposing positive contract fails in this hand.'),
  declared('matchWon', 'outcome', null, 'This hand ends the match in favour of this competitor.'),
  declared('matchLost', 'outcome', null, 'This hand ends the match in favour of another competitor.'),
];

export type SpadesModelOptions = {
  weighting?: 'uniform' | 'bid-consistency';
  objective?: Partial<SpadesObjective>;
  /** Spread of the declared bid likelihood, in tricks. */
  bidSpread?: number;
  rejectionTries?: number;
};

export type SpadesPlayoutModel = PlayoutModel<SpadesWorld, number> & {
  readonly focal: Seat;
  readonly diagnostics: { rejectionFallbacks: number; weightingFallback: boolean };
};

const SEATS: Seat[] = [0, 1, 2, 3];

export function mateOf(mode: string): number[] {
  const competition = competitionFor(mode);
  return SEATS.map((seat) => teammatesOf(competition, seat)[0] ?? -1);
}

/**
 * Builds the continuation model for one Spades decision from the seat observation only.
 * Concealed cards come from sampling; the authoritative deal is never an input.
 */
export function createSpadesPlayoutModel(
  observation: SeatObservation,
  options: SpadesModelOptions = {},
): SpadesPlayoutModel {
  assertObservation(observation);
  if (observation.mode !== 'spades-solo' && observation.mode !== 'spades-partners')
    throw new Error('A Spades observation is required.');
  if (observation.turn !== observation.seat || !['bid', 'play'].includes(observation.phase))
    throw new Error('A playout model needs the acting seat at a bid or play decision.');
  const focal = observation.seat;
  const mode = observation.mode;
  const mate = mateOf(mode);
  const objective = effectiveSpadesObjective(options.objective);
  const weighting = options.weighting ?? 'bid-consistency';
  const spread = options.bidSpread ?? DEFAULT_BID_SPREAD;
  const tries = options.rejectionTries ?? DEFAULT_REJECTION_TRIES;
  if (weighting !== 'uniform' && weighting !== 'bid-consistency') throw new Error('Unknown world weighting.');
  if (!Number.isFinite(spread) || spread <= 0) throw new Error('The bid spread must be positive.');
  if (!Number.isInteger(tries) || tries < 0) throw new Error('Rejection tries must be a whole number.');
  const competition = competitionFor(mode);
  const ownMembers = [...competitorOf(competition, focal).seats];
  const opposing = competition.competitors.filter((entry) => !entry.seats.includes(focal));

  const emptyHands = SEATS.map((seat) => (seat === focal ? [...observation.hand] : [])) as Four<Card[]>;
  const base = worldFromState(
    {
      mode, phase: observation.phase, hands: emptyHands,
      bids: observation.bids as Four<number | null>, tricks: observation.tricks as Four<number>,
      scores: observation.scores as Four<number>, bags: observation.bags as Four<number>,
      dealer: observation.dealer, history: observation.history, trick: observation.trick,
      turn: observation.turn,
    },
    mate,
  );
  // Cards each seat has already played are public and belong to the hand that seat bid on.
  const playedBy = new Uint16Array(16);
  for (const play of [...observation.history.flatMap((trick) => trick.plays), ...observation.trick]) {
    const index = cardIndex(play.card);
    playedBy[play.seat * 4 + suitOf(index)] |= 1 << rankOf(index);
  }
  const known = new Set<number>(observation.hand.map(cardIndex));
  for (let suit = 0; suit < 4; suit++)
    for (let rank = 0; rank < 13; rank++) if (base.played[suit] & (1 << rank)) known.add(suit * 13 + rank);
  const unknown: number[] = [];
  for (let card = 0; card < 52; card++) if (!known.has(card)) unknown.push(card);
  const others = SEATS.filter((seat) => seat !== focal);
  const sizes = others.map((seat) => observation.handSizes[seat]);
  if (sizes.reduce((sum, size) => sum + size, 0) !== unknown.length)
    throw new Error('Observation card counts are inconsistent.');
  const diagnostics = { rejectionFallbacks: 0, weightingFallback: false };
  const original = new Uint16Array(16);
  // Built on the first tight draw and kept for the decision; null once it is known to be unavailable.
  let exact: WorldSampler | null | undefined;

  function deal(world: SpadesWorld, seed: number): boolean {
    const random = createRandom(seed >>> 0, 2);
    const cards = [...unknown];
    attempt: for (let trial = 0; trial < tries; trial++) {
      for (let i = cards.length - 1; i > 0; i--) {
        const j = random.below(i + 1);
        const held = cards[i];
        cards[i] = cards[j];
        cards[j] = held;
      }
      let offset = 0;
      for (let index = 0; index < others.length; index++) {
        const seat = others[index];
        for (let k = 0; k < sizes[index]; k++)
          if (base.voids[seat] & (1 << suitOf(cards[offset + k]))) continue attempt;
        offset += sizes[index];
      }
      offset = 0;
      for (let index = 0; index < others.length; index++) {
        const seat = others[index];
        for (let suit = 0; suit < 4; suit++) world.hands[seat * 4 + suit] = 0;
        for (let k = 0; k < sizes[index]; k++) {
          const card = cards[offset + k];
          world.hands[seat * 4 + suitOf(card)] |= 1 << rankOf(card);
        }
        offset += sizes[index];
      }
      return true;
    }
    // Tight public constraints: use the exact uniform sampler instead of more rejection.
    diagnostics.rejectionFallbacks++;
    if (exact === null) return false;
    try {
      exact ??= createWorldSampler(observation);
      const hands = exact.draw(seed >>> 0);
      for (const seat of others) {
        for (let suit = 0; suit < 4; suit++) world.hands[seat * 4 + suit] = 0;
        for (const card of hands[seat]) {
          const index = cardIndex(card);
          world.hands[seat * 4 + suitOf(index)] |= 1 << rankOf(index);
        }
      }
      return true;
    } catch (error) {
      if (!(error instanceof SampleUnavailableError)) throw error;
      if (exact === undefined) exact = null;
      return false;
    }
  }

  function bidWeight(world: SpadesWorld): number {
    if (weighting === 'uniform') return 1;
    let weight = 1;
    for (const seat of others) {
      const bid = observation.bids[seat];
      if (bid === null) continue;
      for (let suit = 0; suit < 4; suit++)
        original[seat * 4 + suit] = world.hands[seat * 4 + suit] | playedBy[seat * 4 + suit];
      const distance = (bid - estimateTricks(original, seat)) / spread;
      weight *= Math.exp(-0.5 * distance * distance);
    }
    // A floor keeps every feasible world possible: a bid never proves or excludes a holding.
    return Math.max(weight, 1e-6);
  }

  function value(world: SpadesWorld): { utility: number; events: Record<string, number> } {
    const scored = scoreWorld(world);
    const adjusted = (seat: Seat) =>
      scored.delta[seat] - objective.bagLiability * (scored.bags[seat] - world.bags[seat]);
    const own = adjusted(focal);
    const references = opposing.map((entry) => adjusted(entry.seats[0]));
    const reference =
      objective.opposingReference === 'max'
        ? Math.max(...references)
        : references.reduce((sum, entry) => sum + entry, 0) / references.length;
    const winner = matchWinner(mode, scored.score);
    const won = winner !== undefined && ownMembers.includes(winner);
    const lost = winner !== undefined && !won;
    let contract = 0,
      credit = 0,
      failedNilTricks = 0;
    for (const member of ownMembers)
      if (world.bids[member] > 0) {
        contract += world.bids[member];
        credit += world.tricks[member];
      } else failedNilTricks += world.tricks[member];
    const oldBags = world.bags[focal];
    const bagsAdded = Math.max(0, credit - contract) + failedNilTricks;
    const partner = mate[focal];
    const opposingSet = opposing.some((entry) => {
      let need = 0,
        have = 0;
      for (const member of entry.seats)
        if (world.bids[member] > 0) {
          need += world.bids[member];
          have += world.tricks[member];
        }
      return need > 0 && have < need;
    });
    return {
      utility: own - reference + (won ? objective.matchBonus : lost ? -objective.matchBonus : 0),
      events: {
        positiveContract: contract > 0 ? 1 : 0,
        contractMade: contract > 0 && credit >= contract ? 1 : 0,
        ownNil: world.bids[focal] === 0 ? 1 : 0,
        ownNilKept: world.bids[focal] === 0 && world.tricks[focal] === 0 ? 1 : 0,
        teammateNil: partner >= 0 && world.bids[partner] === 0 ? 1 : 0,
        teammateNilKept: partner >= 0 && world.bids[partner] === 0 && world.tricks[partner] === 0 ? 1 : 0,
        bagPenalty: oldBags + bagsAdded >= 10 ? 1 : 0,
        opposingContractSet: opposingSet ? 1 : 0,
        matchWon: won ? 1 : 0,
        matchLost: lost ? 1 : 0,
      },
    };
  }

  return {
    id: 'spades-playout-model',
    version: `${SPADES_KERNEL_VERSION}+${spadesObjectiveId(objective)}`,
    // Named versions stand for the default constants; other constants are written out.
    allocationModel:
      (weighting === 'uniform'
        ? `uniform-feasible (${SAMPLER_VERSION} fallback)`
        : `uniform-feasible weighted by ${BID_CONSISTENCY_VERSION}${spread === DEFAULT_BID_SPREAD ? '' : `[spread=${spread}]`}`) +
      (tries === DEFAULT_REJECTION_TRIES ? '' : ` [rejectionTries=${tries}]`),
    continuationPolicy: SPADES_PLAYOUT_POLICY_VERSION,
    focal,
    diagnostics,
    sample(seed) {
      const world = cloneWorld(base);
      if (!deal(world, seed)) return null;
      return { world, weight: bidWeight(world) };
    },
    clone: (world) => copyWorld(cloneWorld(base), world),
    actor: (world) => (world.phase === PHASE_DONE ? null : (world.turn as Seat)),
    apply: applyMove,
    defaultMove: playoutMove,
    moveId: actionIdOfMove,
    utility: (world) => value(world).utility,
    events: (world) => value(world).events,
  };
}
