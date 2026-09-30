import { explain } from '../../../coaching/templates.ts';
import type { RoundStart, SeatPolicy, ShadowRow } from '../../../evaluation/gate/contracts.ts';
import {
  actionId,
  apply,
  collectTrick,
  legalActions,
  type GameAction,
  type PrivateGame,
  type Seat,
} from '../../../game/index.ts';
import { observe, type SeatObservation } from '../../../observations/index.ts';
import type { DecisionAnalysis, ReasonClaim } from '../../../strategy/types.ts';
import { equivalentCards } from '../plan/pack.ts';
import { observationWorld } from '../plan/planner.ts';
import { SPADES_PROFILES, eligibleFamilies } from '../plan/profiles.ts';
import { requireSpadesMode } from './metrics.ts';
import type { SpadesSeatPolicy } from './styles.ts';

/**
 * SG-05: the round walker and the shadow comparison built on it.
 *
 * The walker steps the production engine. Every selector receives `observe(state, seat)`
 * for its own seat and nothing else; only this evaluation code holds the full deal.
 */
export const SPADES_SHADOW_VERSION = 'spades-shadow-1.0.0';

type Policy = SeatPolicy<SeatObservation, GameAction>;

export type RoundDecision = {
  index: number;
  seat: Seat;
  /** Authoritative state before the action. Evaluation only; never handed to a selector. */
  state: PrivateGame;
  observation: SeatObservation;
  legal: GameAction[];
  /** The action applied. When the selector's choice was illegal this is the first legal action. */
  applied: GameAction;
  selectedLegally: boolean;
};

export type RoundWalk = {
  end: PrivateGame;
  actions: string[];
  illegalActions: number;
};

/** A hand has 4 bids, 52 plays and 13 trick collections; anything longer is a defect. */
const MAX_TRANSITIONS = 80;

/**
 * Plays one hand from `start` to its scored end in the production engine.
 * An illegal or wrong-seat selection is counted and replaced by the first legal action,
 * so the run can finish and report the count.
 */
export function walkSpadesRound(
  start: PrivateGame,
  policies: readonly Policy[],
  visit?: (decision: RoundDecision) => void,
): RoundWalk {
  requireSpadesMode(start.mode);
  if (policies.length !== 4) throw new Error('One policy per seat is required.');
  if (start.phase !== 'bid' && start.phase !== 'play' && start.phase !== 'trick-end')
    throw new Error('A round start must be inside an unfinished hand.');
  let state = start;
  const actions: string[] = [];
  let illegalActions = 0;
  let transitions = 0;
  while (state.phase !== 'hand-end' && state.phase !== 'match-end') {
    if (++transitions > MAX_TRANSITIONS) throw new Error('The hand did not finish.');
    if (state.phase === 'trick-end') {
      state = collectTrick(state);
      continue;
    }
    const seat = state.turn;
    if (seat === null) throw new Error('The hand has no acting seat.');
    const observation = observe(state, seat);
    const legal = legalActions(state, seat);
    if (!legal.length) throw new Error('The acting seat has no legal action.');
    const selected = policies[seat].choose(observation);
    const found =
      selected.kind !== 'pass' && selected.seat === seat
        ? legal.find((action) => actionId(action) === actionId(selected))
        : undefined;
    if (!found) illegalActions++;
    const applied = found ?? legal[0];
    if (applied.kind === 'pass') throw new Error('Spades has no pass.');
    visit?.({ index: actions.length, seat, state, observation, legal, applied, selectedLegally: found !== undefined });
    actions.push(`${seat}:${actionId(applied)}`);
    state = apply(state, applied);
  }
  return { end: state, actions, illegalActions };
}

export type ClaimCheck = (
  state: PrivateGame,
  seat: Seat,
  claims: ReasonClaim[],
) => { checked: number; falseClaims: ReasonClaim[]; notCheckable: number };

/**
 * COACH-15: the claim checkers belong to their own package. They are loaded by path so
 * this module still loads while that package is absent; without them every claim is
 * counted as not checkable and never as checked.
 */
const CLAIM_CHECKER_MODULE = './claims/check.ts';
async function loadClaimChecker(): Promise<ClaimCheck | null> {
  try {
    const loaded: unknown = await import(CLAIM_CHECKER_MODULE);
    const found = (loaded as { checkSpadesClaims?: unknown }).checkSpadesClaims;
    return typeof found === 'function' ? (found as ClaimCheck) : null;
  } catch (error) {
    const missing =
      (error as { code?: unknown }).code === 'ERR_MODULE_NOT_FOUND' &&
      String((error as { message?: unknown }).message).includes('claims');
    if (missing) return null;
    throw error;
  }
}
const loadedClaimChecker = await loadClaimChecker();
export const claimCheckerAvailable = loadedClaimChecker !== null;

/** Two choices are the same when they are one action or interchangeable cards for this seat. */
export function sameChoice(observation: SeatObservation, first: GameAction, second: GameAction): boolean {
  if (actionId(first) === actionId(second)) return true;
  if (first.kind !== 'play' || second.kind !== 'play') return false;
  const cards = observation.legalActions.flatMap((action) => (action.kind === 'play' ? [action.card] : []));
  return equivalentCards(observationWorld(observation), observation.seat, cards).some(
    (group) => group.includes(first.card) && group.includes(second.card),
  );
}

/** Unforced and inside the candidate profile's families; any other candidate is eligible when unforced. */
export function shadowEligible(candidateId: string, observation: SeatObservation): boolean {
  if (observation.legalActions.length < 2) return false;
  const profile = SPADES_PROFILES.find((entry) => entry.policyVersion === candidateId);
  if (!profile || !profile.families.length) return true;
  return eligibleFamilies(profile, observation).length > 0;
}

const MAX_FALSE_CLAIM_IDS = 25;
const claimId = (claim: ReasonClaim) => `${claim.predicate}:${JSON.stringify(claim.args)}`;

export type ShadowFigures = Pick<ShadowRow, 'eligible' | 'changed' | 'unforced' | 'coach'>;

/**
 * Plays the reference arm. At every decision of an evaluated seat the candidate is asked
 * about the identical observation; its action never enters the trajectory.
 *
 * Coach outcomes partition the unforced evaluated-seat decisions of a candidate that
 * produces an analysis: `several-reasonable` first, then `facts-only`, otherwise a
 * suggestion. Advice without a recorded outcome counts as a suggestion. A candidate
 * without an analysis has no advice, so its coach figures stay 0.
 */
export function createSpadesShadow(checkClaims: ClaimCheck | null) {
  return function shadow(
    start: RoundStart<PrivateGame>,
    policies: readonly Policy[],
    evaluated: readonly Seat[],
    candidate: Policy,
  ): ShadowFigures {
    const figures: ShadowFigures = {
      eligible: 0,
      changed: 0,
      unforced: 0,
      coach: {
        suggestions: 0,
        severalReasonable: 0,
        factsOnly: 0,
        claimsChecked: 0,
        claimsFalse: 0,
        claimsNotCheckable: 0,
        falseClaimIds: [],
      },
    };
    const analyze = (candidate as SpadesSeatPolicy).analyze;
    walkSpadesRound(start.state, policies, (decision) => {
      if (!evaluated.includes(decision.seat) || decision.legal.length < 2) return;
      figures.unforced++;
      const { observation, seat } = decision;
      const analysis: DecisionAnalysis | null = analyze ? analyze(observation) : null;
      const chosen = analysis ? analysis.action : candidate.choose(observation);
      const legal =
        chosen.seat === seat && decision.legal.some((action) => actionId(action) === actionId(chosen));
      const eligible = shadowEligible(candidate.id, observation);
      if (eligible) figures.eligible++;
      // A change outside the declared families is still a change and is never hidden.
      if (!legal || !sameChoice(observation, decision.applied, chosen)) figures.changed++;
      if (!analysis || !legal) return;
      const advice = explain(observation, analysis);
      if (advice.outcome === 'several-reasonable') figures.coach.severalReasonable++;
      else if (advice.explanation === 'facts-only') figures.coach.factsOnly++;
      else figures.coach.suggestions++;
      const claims = advice.claims ?? [];
      if (!claims.length) return;
      if (!checkClaims) {
        figures.coach.claimsNotCheckable += claims.length;
        return;
      }
      const checked = checkClaims(decision.state, seat, structuredClone(claims));
      figures.coach.claimsChecked += checked.checked;
      figures.coach.claimsFalse += checked.falseClaims.length;
      figures.coach.claimsNotCheckable += checked.notCheckable;
      for (const claim of checked.falseClaims)
        if (figures.coach.falseClaimIds.length < MAX_FALSE_CLAIM_IDS) figures.coach.falseClaimIds.push(claimId(claim));
    });
    return figures;
  };
}

export const spadesShadow = createSpadesShadow(loadedClaimChecker);
