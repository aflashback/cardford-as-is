import { competitionFor, competitorOf, opposingCompetitors, teammatesOf } from '../../../game/kernel/competition.ts';
import type { Card, Four, Seat } from '../../../game/kernel/types.ts';
import type { SeatObservation } from '../../../observations/index.ts';
import { PLAN_SCHEMA_VERSION, type GamePlan, type PlanGoal, type PlanRevision } from '../../../strategy/plan/types.ts';
import { worldFromState, type SpadesWorld } from '../playout/kernel.ts';
import {
  F_CAN_SET,
  F_MATE_NIL,
  F_NEED,
  F_OWN_NIL,
  F_REMAINING,
  F_STANCE,
  SPADES_STANCE_IDS,
  STANCE_BOTH_NILS,
  STANCE_CHOOSE,
  STANCE_COVER_NIL,
  STANCE_FIELDS,
  STANCE_LIMIT,
  STANCE_MAKE,
  STANCE_OWN_NIL,
  STANCE_SALVAGE,
  STANCE_SET,
  deriveStance,
  type SpadesStanceId,
} from './stance.ts';

export const SPADES_PLANNER_VERSION = 'spades-planner-1.0.0';
const MATCH_TARGET = 500;

/** COACH-13: one authored title per stance and competition; Solo titles never mention a teammate. */
export const SPADES_STANCE_TITLES: Record<SpadesStanceId, { individual: string; partnership: string | null }> = {
  'spades.choose-commitment': { individual: 'Choose your contract', partnership: 'Choose your part of the team contract' },
  'spades.protect-own-nil': { individual: 'Take no tricks', partnership: 'Take no tricks' },
  'spades.protect-both-nils': { individual: 'Take no tricks', partnership: 'Keep both Nil bids alive' },
  'spades.protect-teammate-nil': { individual: 'Make your contract', partnership: 'Cover your partner’s Nil' },
  'spades.make-contract': { individual: 'Make your contract', partnership: 'Make the team contract' },
  'spades.salvage-hand': { individual: 'Limit the damage', partnership: 'Limit the damage' },
  'spades.limit-bags': { individual: 'Avoid extra tricks', partnership: 'Avoid extra tricks' },
  'spades.set-opponents': { individual: 'Set an opposing contract', partnership: 'Set the opposing contract' },
  'spades.deny-tricks': { individual: 'Keep taking tricks', partnership: 'Keep taking tricks' },
};

const SEATS: Seat[] = [0, 1, 2, 3];

export function observationWorld(observation: SeatObservation): SpadesWorld {
  if (observation.mode !== 'spades-solo' && observation.mode !== 'spades-partners')
    throw new Error('A Spades observation is required.');
  const competition = competitionFor(observation.mode);
  const hands = SEATS.map((seat) => (seat === observation.seat ? [...observation.hand] : [])) as Four<Card[]>;
  return worldFromState(
    {
      mode: observation.mode,
      phase: observation.phase === 'bid' ? 'bid' : observation.phase === 'trick-end' ? 'trick-end' : 'play',
      hands,
      bids: observation.bids as Four<number | null>,
      tricks: observation.tricks as Four<number>,
      scores: observation.scores as Four<number>,
      bags: observation.bags as Four<number>,
      dealer: observation.dealer,
      history: observation.history,
      trick: observation.trick,
      turn: observation.turn,
    },
    SEATS.map((seat) => teammatesOf(competition, seat)[0] ?? -1),
  );
}

function trigger(before: Int16Array, after: Int16Array): string {
  if (before[F_OWN_NIL] === 1 && after[F_OWN_NIL] === 0) return 'own-nil-broken';
  if (before[F_MATE_NIL] === 1 && after[F_MATE_NIL] === 0) return 'teammate-nil-broken';
  if (before[F_NEED] > 0 && after[F_NEED] <= 0) return 'contract-secured';
  if (after[F_NEED] > after[F_REMAINING] && before[F_NEED] <= before[F_REMAINING]) return 'contract-out-of-reach';
  if (before[F_CAN_SET] === 0 && after[F_CAN_SET] === 1) return 'opposing-contract-can-be-set';
  if (before[F_CAN_SET] === 1 && after[F_CAN_SET] === 0) return 'opposing-contract-settled';
  return 'public-state-changed';
}

const PRIORITY: Record<number, string[]> = {
  [STANCE_CHOOSE]: ['spades.choose-commitment'],
  [STANCE_OWN_NIL]: ['spades.own-nil', 'spades.contract'],
  [STANCE_BOTH_NILS]: ['spades.own-nil', 'spades.teammate-nil'],
  [STANCE_COVER_NIL]: ['spades.teammate-nil', 'spades.contract'],
  [STANCE_MAKE]: ['spades.contract'],
  [STANCE_SALVAGE]: ['spades.hold-opposing-contract', 'spades.break-opposing-nil'],
  [STANCE_LIMIT]: ['spades.bag-limit'],
  [STANCE_SET]: ['spades.hold-opposing-contract'],
};

/**
 * GP-02: the plan is a pure function of the seat observation. Stance, goal status and
 * revisions use exact public arithmetic only; nothing here samples or estimates.
 */
export function deriveSpadesPlan(observation: SeatObservation): GamePlan {
  const world = observationWorld(observation);
  const competition = competitionFor(observation.mode);
  const seat = observation.seat;
  const own = competitorOf(competition, seat);
  const teammates = teammatesOf(competition, seat);
  const partnership = competition.mode === 'partnership';
  const now = new Int16Array(STANCE_FIELDS);
  deriveStance(world, seat, now);
  const stanceId = SPADES_STANCE_IDS[now[F_STANCE]];
  const title = (id: SpadesStanceId) =>
    (partnership ? SPADES_STANCE_TITLES[id].partnership : null) ?? SPADES_STANCE_TITLES[id].individual;
  const beneficiary = partnership ? ('team' as const) : ('self' as const);
  const bidding = observation.phase === 'bid';
  const remaining = 13 - observation.history.length;
  const goals: PlanGoal[] = [];
  const goal = (entry: Omit<PlanGoal, 'priority'>) => goals.push({ ...entry, priority: 0 });

  if (bidding)
    goal({
      id: 'spades.choose-commitment', title: title('spades.choose-commitment'), beneficiary, against: null,
      horizon: 'round', status: 'open', evidence: 'exact', progress: null,
      cancelWhen: ['The bid is placed.'],
    });
  const members = [...own.seats];
  const positive = members.filter((member) => (observation.bids[member] ?? 0) > 0);
  if (!bidding && positive.length) {
    const contract = positive.reduce<number>((sum, member) => sum + observation.bids[member]!, 0);
    const credit = positive.reduce<number>((sum, member) => sum + observation.tricks[member], 0);
    goal({
      id: 'spades.contract', title: title('spades.make-contract'), beneficiary, against: null, horizon: 'round',
      status: credit >= contract ? 'secured' : contract - credit > remaining ? 'failed' : 'open',
      evidence: 'exact',
      progress: { unit: 'tricks', comparator: 'at-least', target: contract, current: credit, remainingOpportunities: remaining },
      cancelWhen: ['More tricks are needed than remain in the hand.'],
    });
  }
  for (const member of members) {
    if (observation.bids[member] !== 0) continue;
    const mine = member === seat;
    goal({
      id: mine ? 'spades.own-nil' : 'spades.teammate-nil',
      title: mine ? 'Take no tricks' : 'Keep your partner from taking a trick',
      beneficiary: mine ? 'self' : 'team', against: null, horizon: 'round',
      status: observation.tricks[member] > 0 ? 'failed' : remaining === 0 ? 'secured' : 'open',
      evidence: 'exact',
      progress: { unit: 'tricks', comparator: 'exactly', target: 0, current: observation.tricks[member], remainingOpportunities: remaining },
      cancelWhen: ['The Nil bidder takes a trick.'],
    });
  }
  if (!bidding) {
    const contract = positive.reduce<number>((sum, member) => sum + observation.bids[member]!, 0);
    const credit = positive.reduce<number>((sum, member) => sum + observation.tricks[member], 0);
    const failedNilTricks = members
      .filter((member) => observation.bids[member] === 0)
      .reduce<number>((sum, member) => sum + observation.tricks[member], 0);
    const added = (credit >= contract ? credit - contract : 0) + failedNilTricks;
    const room = 9 - observation.bags[seat];
    goal({
      id: 'spades.bag-limit', title: 'Stay below ten bags', beneficiary, against: null, horizon: 'match',
      status: added > room ? 'failed' : 'open', evidence: 'exact',
      progress: { unit: 'bags', comparator: 'at-most', target: room, current: added, remainingOpportunities: remaining },
      cancelWhen: ['The tenth bag is taken.'],
    });
    for (const opposing of opposingCompetitors(competition, seat)) {
      const bidders = opposing.seats.filter((member) => (observation.bids[member] ?? 0) > 0);
      if (bidders.length) {
        const theirContract = bidders.reduce<number>((sum, member) => sum + observation.bids[member]!, 0);
        const theirCredit = bidders.reduce<number>((sum, member) => sum + observation.tricks[member], 0);
        goal({
          id: `spades.hold-opposing-contract:${opposing.id}`,
          title: 'Hold an opposing contract short',
          beneficiary, against: { competitorIds: [opposing.id], seats: [...opposing.seats] }, horizon: 'round',
          status: theirCredit >= theirContract ? 'failed' : theirContract - theirCredit > remaining ? 'secured' : 'open',
          evidence: 'exact',
          progress: { unit: 'tricks', comparator: 'at-most', target: theirContract - 1, current: theirCredit, remainingOpportunities: remaining },
          cancelWhen: ['That contract is made.'],
        });
      }
      for (const member of opposing.seats) {
        if (observation.bids[member] !== 0) continue;
        goal({
          id: `spades.break-opposing-nil:${member}`,
          title: 'Make an opposing Nil bidder take a trick',
          beneficiary, against: { competitorIds: [opposing.id], seats: [member] }, horizon: 'round',
          status: observation.tricks[member] > 0 ? 'secured' : remaining === 0 ? 'failed' : 'open',
          evidence: 'exact',
          progress: { unit: 'tricks', comparator: 'at-least', target: 1, current: observation.tricks[member], remainingOpportunities: remaining },
          cancelWhen: ['The hand ends with that Nil intact.'],
        });
      }
    }
  }
  const ownScore = observation.scores[seat];
  const best = Math.max(...opposingCompetitors(competition, seat).map((entry) => observation.scores[entry.seats[0]]));
  if (ownScore >= MATCH_TARGET - 130 || best >= MATCH_TARGET - 130) {
    goal({
      id: 'spades.reach-target', title: 'Reach the match target first', beneficiary, against: null,
      horizon: 'match', status: 'open', evidence: 'exact',
      progress: { unit: 'points', comparator: 'at-least', target: MATCH_TARGET, current: ownScore, remainingOpportunities: null },
      cancelWhen: ['The match ends.'],
    });
  }

  const order = PRIORITY[now[F_STANCE]] ?? [];
  const rank = (entry: PlanGoal) => {
    const at = order.findIndex((prefix) => entry.id === prefix || entry.id.startsWith(`${prefix}:`));
    return (at < 0 ? order.length : at) * 10 + (entry.status === 'open' ? 0 : 5);
  };
  goals
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => rank(a.entry) - rank(b.entry) || a.index - b.index)
    .forEach(({ entry }, index) => (entry.priority = index + 1));
  goals.sort((a, b) => a.priority - b.priority);

  // Revisions: replay exact public counts after every completed trick of this hand.
  const revisions: PlanRevision[] = [];
  if (!bidding) {
    const replay = worldFromState(
      {
        mode: observation.mode, phase: 'play',
        hands: SEATS.map(() => []) as unknown as Four<Card[]>,
        bids: observation.bids as Four<number | null>, tricks: [0, 0, 0, 0],
        scores: observation.scores as Four<number>, bags: observation.bags as Four<number>,
        dealer: observation.dealer, history: [], trick: [], turn: observation.turn,
      },
      [...world.mate],
    );
    let before = new Int16Array(STANCE_FIELDS);
    deriveStance(replay, seat, before);
    observation.history.forEach((trick, index) => {
      replay.tricks[trick.winner]++;
      replay.completed = index + 1;
      const after = new Int16Array(STANCE_FIELDS);
      deriveStance(replay, seat, after);
      if (after[F_STANCE] !== before[F_STANCE])
        revisions.push({
          step: index + 1,
          trigger: trigger(before, after),
          from: SPADES_STANCE_IDS[before[F_STANCE]],
          to: SPADES_STANCE_IDS[after[F_STANCE]],
        });
      before = after;
    });
  }

  const competing: GamePlan['competing'] = [];
  if (now[F_STANCE] === STANCE_LIMIT)
    competing.push({
      stanceId: 'spades.deny-tricks',
      whyNot: 'No credited trick is needed and one more trick cannot set an opposing contract.',
    });
  if (now[F_STANCE] === STANCE_SET)
    competing.push({
      stanceId: 'spades.limit-bags',
      whyNot: 'An opposing contract needs every remaining trick, so one more trick sets it.',
    });
  if (now[F_STANCE] === STANCE_MAKE)
    competing.push({ stanceId: 'spades.limit-bags', whyNot: 'The contract still needs credited tricks.' });
  if (now[F_STANCE] === STANCE_BOTH_NILS)
    competing.push({
      stanceId: 'spades.protect-teammate-nil',
      whyNot: 'Your own Nil is still live; giving it up is a tradeoff, not a rule.',
    });

  return {
    schemaVersion: PLAN_SCHEMA_VERSION,
    plannerVersion: SPADES_PLANNER_VERSION,
    mode: observation.mode,
    seat,
    competitorId: own.id,
    teammates,
    phaseId: bidding ? 'spades.bidding' : 'spades.playing',
    decisionKind: bidding ? 'commitment' : 'play',
    stance: { id: stanceId, title: title(stanceId), evidence: 'exact' },
    goals,
    competing,
    revisions,
    estimates: [],
    limitations: [
      'The stance follows exact public counts. It does not predict concealed cards or later play.',
      ...(bidding ? ['Before the bid is placed the plan is a choice of commitment, not a line of play.'] : []),
    ],
  };
}
