import { competitionFor } from '../../../game/kernel/competition.ts';
import { actionId } from '../../../game/rules.ts';
import type { SeatObservation } from '../../../observations/index.ts';
import type { Candidate, PlanningPack } from '../../../strategy/plan/contract.ts';
import type { GamePlan } from '../../../strategy/plan/types.ts';
import type { DecisionAnalysis, DecisionFacts } from '../../../strategy/types.ts';
import {
  FULL_SUIT,
  applyMove,
  cardIndex,
  moveFromAction,
  rankOf,
  suitOf,
  type SpadesWorld,
} from '../playout/kernel.ts';
import { createSpadesPlayoutModel, type SpadesModelOptions } from '../playout/model.ts';
import { SPADES_PLANNER_VERSION, deriveSpadesPlan, observationWorld } from './planner.ts';
import {
  INTENT_DERIVED,
  STANCE_BOTH_NILS,
  STANCE_COVER_NIL,
  STANCE_LIMIT,
  STANCE_OWN_NIL,
  STANCE_SET,
  intentOfStance,
  stanceCode,
} from './stance.ts';

export const SPADES_PLANNING_PACK_ID = 'spades-planning-pack';
/** A first move carrying a fixed intent is `move + INTENT_SHIFT * intent`; cards and bids stay below it. */
const INTENT_SHIFT = 128;

/**
 * SG-03: canonical decision key. Presentation text, event logs, mode and policy version
 * are excluded, so Solo/Partners twins and every profile are evaluated on the same worlds.
 */
export function spadesObservationKey(observation: SeatObservation): string {
  return JSON.stringify([
    'spades', observation.seat, observation.dealer, observation.handNumber, observation.phase,
    [...observation.hand].sort(), observation.bids, observation.scores, observation.bags,
    observation.history.map((trick) => trick.plays.map((play) => [play.seat, play.card])),
    observation.trick.map((play) => [play.seat, play.card]),
  ]);
}

/** Cards of one suit with no unplayed rank between them held elsewhere are interchangeable. */
export function equivalentCards(world: SpadesWorld, seat: number, cards: readonly string[]): string[][] {
  const groups: string[][] = [];
  for (let suit = 0; suit < 4; suit++) {
    const mine = world.hands[seat * 4 + suit];
    const elsewhere = ~(world.played[suit] | mine) & FULL_SUIT;
    let group: string[] = [];
    for (let rank = 0; rank < 13; rank++) {
      if (elsewhere & (1 << rank)) {
        if (group.length > 1) groups.push(group);
        group = [];
        continue;
      }
      if (!(mine & (1 << rank))) continue;
      const found = cards.find((card) => suitOf(cardIndex(card)) === suit && rankOf(cardIndex(card)) === rank);
      if (found) group.push(found);
    }
    if (group.length > 1) groups.push(group);
  }
  return groups;
}

/**
 * GP-05: the Spades planning pack for one decision. The tactical analysis supplies the
 * complete legal set in tactical order; the pack adds stances, equivalence and playouts.
 */
export function createSpadesPlanningPack(
  tactical: DecisionAnalysis,
  facts: DecisionFacts,
  model: SpadesModelOptions,
): PlanningPack<SeatObservation, number, SpadesWorld> {
  let cachedPlan: { key: string; plan: GamePlan } | null = null;
  const planOf = (observation: SeatObservation) => {
    const key = spadesObservationKey(observation);
    if (cachedPlan?.key !== key) cachedPlan = { key, plan: deriveSpadesPlan(observation) };
    return cachedPlan.plan;
  };
  const outcome = (id: string) => facts.cardOutcomes.find((entry) => entry.actionId === id);
  return {
    id: SPADES_PLANNING_PACK_ID,
    version: SPADES_PLANNER_VERSION,
    modes: ['spades-solo', 'spades-partners'],
    competition: competitionFor,
    observationKey: spadesObservationKey,
    candidates(observation) {
      const legal = new Set(observation.legalActions.map(actionId));
      const selected = actionId(tactical.action);
      const ordered = [
        ...tactical.candidates.filter((entry) => actionId(entry.action) === selected),
        ...tactical.candidates.filter((entry) => actionId(entry.action) !== selected),
      ];
      const result: Candidate<number>[] = ordered.map((entry) => {
        if (entry.action.kind === 'pass') throw new Error('Spades has no pass.');
        return { id: actionId(entry.action), move: moveFromAction(entry.action) };
      });
      if (result.length !== legal.size || result.some((entry) => !legal.has(entry.id)))
        throw new Error('The tactical analysis does not cover the complete legal set.');
      return result;
    },
    equivalent(observation, candidates) {
      if (observation.phase !== 'play') return [];
      const names = new Map(candidates.map((entry) => [entry.id.slice('play:'.length), entry.id]));
      return equivalentCards(observationWorld(observation), observation.seat, [...names.keys()]).map((group) =>
        group.map((card) => names.get(card)!),
      );
    },
    plan: planOf,
    stances(observation, plan) {
      const code = stanceCode(plan.stance.id);
      if (code === STANCE_LIMIT) return [plan.stance.id, 'spades.deny-tricks'];
      if (code === STANCE_SET) return [plan.stance.id, 'spades.limit-bags'];
      return [plan.stance.id];
    },
    playout(observation) {
      const base = createSpadesPlayoutModel(observation, model);
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
      const intent = stanceId === cachedPlan.plan.stance.id ? INTENT_DERIVED : intentOfStance(stanceCode(stanceId));
      return move + INTENT_SHIFT * intent;
    },
    supports(observation, stanceId, candidate) {
      // Exact and deliberately narrow: only a certain contradiction of the stance fails.
      if (observation.phase !== 'play' || !observation.trick.length) return true;
      const chosen = outcome(candidate.id);
      if (!chosen) return true;
      const others = facts.cardOutcomes.filter((entry) => entry.actionId !== candidate.id);
      const code = stanceCode(stanceId);
      const certainlyMine = chosen.guaranteedWinner === observation.seat;
      if (code === STANCE_OWN_NIL || code === STANCE_BOTH_NILS)
        return !(certainlyMine && others.some((entry) => entry.currentWinner !== observation.seat));
      if (code === STANCE_COVER_NIL) {
        const covering = facts.cardOutcomes.some((entry) => entry.coversPartnerNil);
        return !covering || chosen.coversPartnerNil;
      }
      const last = facts.actorsAfter.length === 0;
      if (intentOfStance(code) === 2 || code === STANCE_LIMIT)
        return !(last && certainlyMine && others.some((entry) => entry.currentWinner !== observation.seat));
      // Taking stances: fourth seat, an opponent is winning, a winner was available, and this card loses.
      const opponentAhead = chosen.currentWinner !== observation.seat && chosen.currentWinner !== facts.partner;
      return !(last && opponentAhead && others.some((entry) => entry.currentWinner === observation.seat));
    },
    resultingStance(observation, candidate) {
      if (observation.phase !== 'bid') return planOf(observation).stance.id;
      const partner = facts.partner;
      const partnerNil = partner !== null && observation.bids[partner] === 0;
      if (candidate.id === 'bid:0') return partnerNil ? 'spades.protect-both-nils' : 'spades.protect-own-nil';
      return partnerNil ? 'spades.protect-teammate-nil' : 'spades.make-contract';
    },
  };
}

