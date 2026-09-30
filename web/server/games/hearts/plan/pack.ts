import { competitionFor } from '../../../game/kernel/competition.ts';
import { actionId } from '../../../game/rules.ts';
import type { SeatObservation } from '../../../observations/index.ts';
import { chooseBaselineAction } from '../../../strategy/baseline.ts';
import type { Candidate, PlanningPack } from '../../../strategy/plan/contract.ts';
import type { GamePlan } from '../../../strategy/plan/types.ts';
import {
  FULL_SUIT,
  QUEEN_OF_SPADES,
  applyMove,
  cardIndex,
  moveFromAction,
  pointsOf,
  rankOf,
  suitOf,
  wouldWin,
  type HeartsWorld,
} from './kernel.ts';
import {
  SEALED_STEP_LIMITATION,
  createHeartsPlayoutModel,
  observationWorld,
  type HeartsModelOptions,
} from './model.ts';
import { HEARTS_PLANNER_VERSION, deriveHeartsPlan } from './planner.ts';
import {
  F_RUNNER,
  INTENT_DERIVED,
  STANCE_FIELDS,
  STANCE_RUN,
  STANCE_STOP,
  deriveStance,
  intentOfStance,
  stanceCode,
} from './stance.ts';

export const HEARTS_PLANNING_PACK_ID = 'hearts-planning-pack';
/** A first move carrying a fixed intent is `move + INTENT_SHIFT * intent`; cards stay below it. */
const INTENT_SHIFT = 64;

/**
 * Canonical decision key. Presentation text, event logs and policy version are excluded,
 * so every profile is evaluated on the same worlds. The seat's pass memory is part of
 * the key because the decision may legitimately depend on it.
 */
export function heartsObservationKey(observation: SeatObservation): string {
  return JSON.stringify([
    'hearts', observation.seat, observation.handNumber, observation.phase,
    [...observation.hand].sort(), observation.scores,
    observation.history.map((trick) => trick.plays.map((play) => [play.seat, play.card])),
    observation.trick.map((play) => [play.seat, play.card]),
    [observation.pass.to, [...observation.pass.outgoing].sort(), observation.pass.from, [...observation.pass.incoming].sort()],
  ]);
}

/**
 * Cards of one suit with no card between them that is held elsewhere or lies in the trick
 * in progress are interchangeable. The queen of spades carries its own points and is
 * never merged with a neighbour.
 */
export function equivalentCards(world: HeartsWorld, seat: number, cards: readonly string[]): string[][] {
  const groups: string[][] = [];
  for (let suit = 0; suit < 4; suit++) {
    let onTable = 0;
    for (let index = 0; index < world.trickLen; index++)
      if (suitOf(world.trickCard[index]) === suit) onTable |= 1 << rankOf(world.trickCard[index]);
    const mine = world.hands[seat * 4 + suit];
    const between = (~(world.played[suit] | mine) & FULL_SUIT) | onTable;
    let group: string[] = [];
    for (let rank = 0; rank < 13; rank++) {
      if (between & (1 << rank)) {
        if (group.length > 1) groups.push(group);
        group = [];
        continue;
      }
      if (!(mine & (1 << rank)) || suit * 13 + rank === QUEEN_OF_SPADES) continue;
      const found = cards.find((card) => cardIndex(card) === suit * 13 + rank);
      if (found) group.push(found);
    }
    if (group.length > 1) groups.push(group);
  }
  return groups;
}

/**
 * GP-05 / GP-06: the Hearts planning pack. It covers play decisions only. The pass is a
 * sealed simultaneous step, which the plan contract does not support, so it fails closed.
 */
export function createHeartsPlanningPack(
  model: HeartsModelOptions = {},
): PlanningPack<SeatObservation, number, HeartsWorld> {
  let cachedPlan: { key: string; plan: GamePlan } | null = null;
  const planOf = (observation: SeatObservation) => {
    const key = heartsObservationKey(observation);
    if (cachedPlan?.key !== key) cachedPlan = { key, plan: deriveHeartsPlan(observation) };
    return cachedPlan.plan;
  };
  const playOnly = (observation: SeatObservation) => {
    if (observation.mode !== 'hearts') throw new Error('A Hearts observation is required.');
    if (observation.phase !== 'play') throw new Error(`No playouts for this step: ${SEALED_STEP_LIMITATION}.`);
  };
  return {
    id: HEARTS_PLANNING_PACK_ID,
    version: HEARTS_PLANNER_VERSION,
    modes: ['hearts'],
    competition: competitionFor,
    observationKey: heartsObservationKey,
    candidates(observation) {
      playOnly(observation);
      // The retained baseline names the tactical preference; it ranks no other card.
      const preferred = actionId(chooseBaselineAction(observation));
      const ordered = [
        ...observation.legalActions.filter((action) => actionId(action) === preferred),
        ...observation.legalActions.filter((action) => actionId(action) !== preferred),
      ];
      return ordered.map((action): Candidate<number> => {
        if (action.kind !== 'play') throw new Error('A Hearts play decision holds card plays only.');
        return { id: actionId(action), move: moveFromAction(action) };
      });
    },
    equivalent(observation, candidates) {
      playOnly(observation);
      const names = new Map(candidates.map((entry) => [entry.id.slice('play:'.length), entry.id]));
      return equivalentCards(observationWorld(observation), observation.seat, [...names.keys()]).map((group) =>
        group.map((card) => names.get(card)!),
      );
    },
    plan: planOf,
    stances(observation, plan) {
      if (plan.decisionKind !== 'play') return [plan.stance.id];
      const code = stanceCode(plan.stance.id);
      if (code === STANCE_RUN || code === STANCE_STOP) return [plan.stance.id, 'hearts.avoid-points'];
      const facts = new Int16Array(STANCE_FIELDS);
      deriveStance(observationWorld(observation), observation.seat, facts);
      // This seat holds every point so far, yet too few certain winners to make the run its plan.
      return facts[F_RUNNER] === observation.seat ? [plan.stance.id, 'hearts.run-every-point'] : [plan.stance.id];
    },
    playout(observation) {
      playOnly(observation);
      const base = createHeartsPlayoutModel(observation, model);
      return {
        ...base,
        sample(seed) {
          const sampled = base.sample(seed);
          if (sampled) sampled.world.focal = observation.seat;
          return sampled;
        },
        apply(world, move) {
          if (move >= INTENT_SHIFT) {
            world.focalIntent = Math.floor(move / INTENT_SHIFT);
            applyMove(world, move % INTENT_SHIFT);
          } else applyMove(world, move);
        },
      };
    },
    withStance(move, stanceId) {
      if (!cachedPlan) throw new Error('A plan is required before stances are applied.');
      const intent =
        stanceId === cachedPlan.plan.stance.id ? INTENT_DERIVED : intentOfStance(stanceCode(stanceId));
      return move + INTENT_SHIFT * intent;
    },
    supports(observation, stanceId, candidate) {
      // Exact and deliberately narrow: only a certain contradiction of the stance fails.
      if (observation.phase !== 'play' || observation.trick.length !== 3) return true;
      const world = observationWorld(observation);
      const card = candidate.move % INTENT_SHIFT;
      const points = observation.trick.reduce((sum, play) => sum + pointsOf(cardIndex(play.card)), 0);
      const wins = wouldWin(world, card);
      const others = observation.legalActions.flatMap((action) =>
        action.kind === 'play' && cardIndex(action.card) !== card ? [cardIndex(action.card)] : [],
      );
      const code = stanceCode(stanceId);
      if (code === STANCE_RUN)
        return !(!wins && points + pointsOf(card) > 0 && others.some((other) => wouldWin(world, other)));
      if (code === STANCE_STOP) {
        const facts = new Int16Array(STANCE_FIELDS);
        deriveStance(world, observation.seat, facts);
        const runnerWins = !wins && world.trickSeat[world.winPos] === facts[F_RUNNER];
        return !(runnerWins && pointsOf(card) > 0 && others.some((other) => pointsOf(other) === 0));
      }
      // Avoiding stances: last to play, this card takes points, and another card would not take the trick.
      return !(wins && points + pointsOf(card) > 0 && others.some((other) => !wouldWin(world, other)));
    },
  };
}
