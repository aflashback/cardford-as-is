import { matchWinner } from '../../../game/index.ts';
import { competitionFor, opponentsOf } from '../../../game/kernel/competition.ts';
import type { Card, Four, Seat } from '../../../game/kernel/types.ts';
import { assertObservation, type SeatObservation } from '../../../observations/index.ts';
import type { PlayoutModel } from '../../../strategy/plan/types.ts';
import {
  SAMPLER_VERSION,
  SampleUnavailableError,
  createWorldSampler,
  type WorldSampler,
} from '../../../strategy/sampler.ts';
import {
  HEARTS_KERNEL_VERSION,
  PHASE_DONE,
  actionIdOfMove,
  applyMove,
  cardIndex,
  cloneWorld,
  rankOf,
  scoreWorld,
  suitOf,
  worldFromState,
  type HeartsWorld,
} from './kernel.ts';
import { HEARTS_PLAYOUT_POLICY_VERSION, playoutMove } from './policy.ts';

export const HEARTS_OBJECTIVE_VERSION = 'hearts-objective-1.0.0';
export const HEARTS_PLAYOUT_MODEL_ID = 'hearts-playout-model';
/** Recorded wherever the pass is asked of the plan layer. */
export const SEALED_STEP_LIMITATION = 'sealed simultaneous step is not supported by the plan contract';

/** Named heuristic constants. The production scorer itself is never altered. */
export type HeartsObjective = {
  /** Added or subtracted only when the scored hand ends the match. */
  matchBonus: number;
};
export const DEFAULT_HEARTS_OBJECTIVE: HeartsObjective = { matchBonus: 100 };

export type HeartsModelOptions = { objective?: Partial<HeartsObjective> };

export type HeartsPlayoutModel = PlayoutModel<HeartsWorld, number> & {
  readonly focal: Seat;
  readonly diagnostics: { samplerUnavailable: number };
};

const SEATS: Seat[] = [0, 1, 2, 3];

/** The seat's own view as a playout world: its cards and public state, every other hand empty. */
export function observationWorld(
  observation: SeatObservation,
  onBoundary?: (world: HeartsWorld, completed: number) => void,
): HeartsWorld {
  if (observation.mode !== 'hearts') throw new Error('A Hearts observation is required.');
  if (observation.phase === 'pass') throw new Error(`The pass has no playout world: ${SEALED_STEP_LIMITATION}.`);
  return worldFromState(
    {
      mode: observation.mode,
      phase: observation.phase,
      hands: SEATS.map((seat) => (seat === observation.seat ? [...observation.hand] : [])) as Four<Card[]>,
      scores: observation.scores as Four<number>,
      history: observation.history,
      trick: observation.trick,
      turn: observation.turn,
      ...(observation.handResult ? { handResult: observation.handResult } : {}),
    },
    onBoundary,
  );
}

/**
 * Builds the continuation model for one Hearts play decision from the seat observation
 * only. Concealed cards come from the shared sampler, which keeps cards this seat passed
 * in the hand that received them until they are played. The authoritative deal is never
 * an input.
 */
export function createHeartsPlayoutModel(
  observation: SeatObservation,
  options: HeartsModelOptions = {},
): HeartsPlayoutModel {
  assertObservation(observation);
  if (observation.mode !== 'hearts') throw new Error('A Hearts observation is required.');
  if (observation.phase === 'pass') throw new Error(`The pass has no playout model: ${SEALED_STEP_LIMITATION}.`);
  if (observation.phase !== 'play' || observation.turn !== observation.seat)
    throw new Error('A playout model needs the acting seat at a play decision.');
  const focal = observation.seat;
  const objective = { ...DEFAULT_HEARTS_OBJECTIVE, ...options.objective };
  const opposing = opponentsOf(competitionFor(observation.mode), focal);
  const others = SEATS.filter((seat) => seat !== focal);
  const base = observationWorld(observation);
  const diagnostics = { samplerUnavailable: 0 };
  let sampler: WorldSampler | null | undefined;

  function draw(seed: number): Four<Card[]> | null {
    try {
      if (sampler === undefined) sampler = createWorldSampler(observation);
      return sampler ? sampler.draw(seed >>> 0) : null;
    } catch (error) {
      if (!(error instanceof SampleUnavailableError)) throw error;
      if (sampler === undefined) sampler = null;
      return null;
    }
  }

  function value(world: HeartsWorld): { utility: number; events: Record<string, number> } {
    const scored = scoreWorld(world);
    const own = scored.points[focal];
    const reference = opposing.reduce<number>((sum, seat) => sum + scored.points[seat], 0) / opposing.length;
    const winner = matchWinner(observation.mode, scored.score);
    const won = winner === focal;
    const lost = winner !== undefined && !won;
    const moonBy = world.points.indexOf(26);
    return {
      // Lowest score wins, so the utility is reversed: higher is better for the focal seat.
      utility: reference - own + (won ? objective.matchBonus : lost ? -objective.matchBonus : 0),
      events: {
        tookNoPoints: world.points[focal] === 0 ? 1 : 0,
        tookQueen: world.queenTaker === focal ? 1 : 0,
        tookEveryPoint: moonBy === focal ? 1 : 0,
        anotherTookEveryPoint: moonBy >= 0 && moonBy !== focal ? 1 : 0,
        matchWon: won ? 1 : 0,
        matchLost: lost ? 1 : 0,
      },
    };
  }

  return {
    id: HEARTS_PLAYOUT_MODEL_ID,
    version: `${HEARTS_KERNEL_VERSION}+${HEARTS_OBJECTIVE_VERSION}`,
    allocationModel: `uniform-feasible (${SAMPLER_VERSION})`,
    continuationPolicy: HEARTS_PLAYOUT_POLICY_VERSION,
    focal,
    diagnostics,
    sample(seed) {
      const hands = draw(seed);
      if (!hands) {
        diagnostics.samplerUnavailable++;
        return null;
      }
      const world = cloneWorld(base);
      for (const seat of others) {
        for (let suit = 0; suit < 4; suit++) world.hands[seat * 4 + suit] = 0;
        for (const card of hands[seat]) {
          const index = cardIndex(card);
          world.hands[seat * 4 + suitOf(index)] |= 1 << rankOf(index);
        }
      }
      return { world, weight: 1 };
    },
    clone: cloneWorld,
    actor: (world) => (world.phase === PHASE_DONE ? null : (world.turn as Seat)),
    apply: applyMove,
    defaultMove: playoutMove,
    moveId: actionIdOfMove,
    utility: (world) => value(world).utility,
    events: (world) => value(world).events,
  };
}
