import { competitionFor, competitorOf, teammatesOf } from '../../../game/kernel/competition.ts';
import type { SeatObservation } from '../../../observations/index.ts';
import { PLAN_SCHEMA_VERSION, type GamePlan, type PlanGoal, type PlanRevision } from '../../../strategy/plan/types.ts';
import { HAND_POINTS, QUEEN_BIT, SPADES, type HeartsWorld } from './kernel.ts';
import { SEALED_STEP_LIMITATION, observationWorld } from './model.ts';
import {
  F_CARDS,
  F_DANGER,
  F_MASTERS,
  F_OWN,
  F_REMAINING,
  F_RUNNER,
  F_STANCE,
  F_TAKEN,
  HEARTS_STANCE_IDS,
  RUN_LIVE_POINTS,
  STANCE_AVOID,
  STANCE_FIELDS,
  STANCE_RUN,
  STANCE_SHED,
  STANCE_STOP,
  deriveStance,
  type HeartsStanceId,
} from './stance.ts';

export const HEARTS_PLANNER_VERSION = 'hearts-planner-1.0.0';
const MATCH_LIMIT = 100;

/** Authored titles. Hearts is scored alone, so no title mentions a teammate. */
export const HEARTS_STANCE_TITLES: Record<HeartsStanceId, string> = {
  'hearts.avoid-points': 'Take as few points as you can',
  'hearts.shed-dangerous-cards': 'Get rid of your dangerous cards',
  'hearts.stop-a-runner': 'Stop one player taking every point',
  'hearts.run-every-point': 'Take every point',
  'hearts.choose-pass': 'Choose three cards to pass',
};

const PRIORITY: Record<number, string[]> = {
  [STANCE_AVOID]: ['hearts.take-no-points', 'hearts.avoid-the-queen'],
  [STANCE_SHED]: ['hearts.avoid-the-queen', 'hearts.take-no-points'],
  [STANCE_STOP]: ['hearts.hold-a-runner', 'hearts.avoid-the-queen', 'hearts.take-no-points'],
  [STANCE_RUN]: ['hearts.take-every-point'],
};

function trigger(before: Int16Array, after: Int16Array): string {
  if (after[F_STANCE] === STANCE_RUN) return 'own-run-live';
  if (after[F_STANCE] === STANCE_STOP) return 'one-seat-holds-every-point';
  if (before[F_STANCE] === STANCE_STOP) return after[F_REMAINING] === 0 ? 'no-points-remain' : 'run-broken';
  if (before[F_STANCE] === STANCE_RUN)
    return after[F_REMAINING] === 0
      ? 'no-points-remain'
      : after[F_OWN] !== after[F_TAKEN]
        ? 'own-run-broken'
        : 'own-certain-winners-too-few';
  if (before[F_DANGER] === 1 && after[F_DANGER] === 0) return 'dangerous-cards-gone';
  return 'public-state-changed';
}

function passPlan(observation: SeatObservation): GamePlan {
  const competition = competitionFor(observation.mode);
  const title = HEARTS_STANCE_TITLES['hearts.choose-pass'];
  return {
    schemaVersion: PLAN_SCHEMA_VERSION,
    plannerVersion: HEARTS_PLANNER_VERSION,
    mode: observation.mode,
    seat: observation.seat,
    competitorId: competitorOf(competition, observation.seat).id,
    teammates: teammatesOf(competition, observation.seat),
    phaseId: 'hearts.passing',
    decisionKind: 'commitment',
    stance: { id: 'hearts.choose-pass', title, evidence: 'exact' },
    goals: [
      {
        id: 'hearts.choose-pass', title, beneficiary: 'self', against: null, horizon: 'step', priority: 1,
        status: 'open', evidence: 'exact',
        progress: { unit: 'cards', comparator: 'exactly', target: 3, current: 0, remainingOpportunities: 1 },
        cancelWhen: ['The pass is made.'],
      },
    ],
    competing: [],
    revisions: [],
    estimates: [],
    limitations: [
      SEALED_STEP_LIMITATION,
      'Every seat passes at once and in secret, so the pass keeps the baseline ranking and receives no playouts.',
    ],
  };
}

/**
 * GP-02: the plan is a pure function of the seat observation. Stance, goal status and
 * revisions use exact arithmetic on captured points, played cards and the seat's own
 * cards; nothing here samples or estimates.
 */
export function deriveHeartsPlan(observation: SeatObservation): GamePlan {
  if (observation.mode !== 'hearts') throw new Error('A Hearts observation is required.');
  if (observation.phase === 'pass') return passPlan(observation);
  const competition = competitionFor(observation.mode);
  const seat = observation.seat;
  const own = competitorOf(competition, seat);

  // Revisions: the same stance function at the start of the hand and after every completed trick,
  // with this seat's cards as they were then. Its played cards are public, so the replay is exact.
  const revisions: PlanRevision[] = [];
  const timeline: Int16Array[] = [];
  const note = (world: HeartsWorld, completed: number) => {
    const after = new Int16Array(STANCE_FIELDS);
    deriveStance(world, seat, after);
    const before = timeline.at(-1);
    if (before && after[F_STANCE] !== before[F_STANCE])
      revisions.push({
        step: completed,
        trigger: trigger(before, after),
        from: HEARTS_STANCE_IDS[before[F_STANCE]],
        to: HEARTS_STANCE_IDS[after[F_STANCE]],
      });
    timeline.push(after);
  };
  const world = observationWorld(observation, note);
  // A card played in the trick in progress can change the stance before the trick is complete.
  note(world, world.completed);
  const now = timeline.at(-1)!;
  const code = now[F_STANCE];
  const stanceId = HEARTS_STANCE_IDS[code];
  const taken = now[F_TAKEN];
  const ownPoints = now[F_OWN];
  const remaining = now[F_REMAINING];
  const runOpen = now[F_RUNNER] === seat;
  const queenPlayed = (world.played[SPADES] & QUEEN_BIT) !== 0;
  // The queen still counts as uncaptured while it lies in the trick in progress.
  const queenCaptured = world.queenTaker >= 0;

  const goals: PlanGoal[] = [];
  const goal = (entry: Omit<PlanGoal, 'priority' | 'beneficiary' | 'evidence'>) =>
    goals.push({ ...entry, beneficiary: 'self', evidence: 'exact', priority: 0 });
  goal({
    id: 'hearts.take-no-points', title: 'Take no points this hand', against: null, horizon: 'round',
    status: ownPoints > 0 ? 'failed' : remaining === 0 ? 'secured' : 'open',
    progress: { unit: 'points', comparator: 'exactly', target: 0, current: ownPoints, remainingOpportunities: remaining },
    cancelWhen: ['You take a point.'],
  });
  goal({
    id: 'hearts.avoid-the-queen', title: 'Stay clear of the queen of spades', against: null, horizon: 'round',
    status:
      world.queenTaker === seat ? 'failed' : queenCaptured ? 'secured' : code === STANCE_RUN ? 'dropped' : 'open',
    progress: {
      unit: 'queens of spades', comparator: 'exactly', target: 0, current: world.queenTaker === seat ? 1 : 0,
      remainingOpportunities: queenCaptured ? 0 : 1,
    },
    cancelWhen: ['The queen of spades is taken.', 'You set out to take every point.'],
  });
  for (const other of competition.competitors) {
    if (other.id === own.id) continue;
    const runner = other.seats[0];
    if (world.points[runner] < RUN_LIVE_POINTS) continue;
    const alone = world.points[runner] === taken;
    goal({
      id: `hearts.hold-a-runner:${other.id}`,
      title: 'Keep one player from taking every point',
      against: { competitorIds: [other.id], seats: [...other.seats] },
      horizon: 'round',
      status: !alone ? 'secured' : remaining === 0 ? 'failed' : 'open',
      progress: {
        unit: 'points', comparator: 'at-most', target: HAND_POINTS - 1, current: world.points[runner],
        remainingOpportunities: remaining,
      },
      cancelWhen: ['Another player takes a point.'],
    });
  }
  if (ownPoints >= RUN_LIVE_POINTS)
    goal({
      id: 'hearts.take-every-point', title: 'Take every point', against: null, horizon: 'round',
      status: ownPoints !== taken ? 'failed' : remaining === 0 ? 'secured' : code === STANCE_RUN ? 'open' : 'dropped',
      progress: {
        unit: 'points', comparator: 'exactly', target: HAND_POINTS, current: ownPoints,
        remainingOpportunities: remaining,
      },
      cancelWhen: ['Another player takes a point.'],
    });
  if (Math.max(...observation.scores) + HAND_POINTS >= MATCH_LIMIT)
    goal({
      id: 'hearts.stay-under-the-limit', title: 'Finish the match with the lowest score', against: null,
      horizon: 'match', status: 'open',
      progress: {
        unit: 'points', comparator: 'at-most', target: MATCH_LIMIT - 1, current: observation.scores[seat],
        remainingOpportunities: null,
      },
      cancelWhen: ['The match ends.'],
    });

  const order = PRIORITY[code] ?? [];
  const rank = (entry: PlanGoal) => {
    const at = order.findIndex((prefix) => entry.id === prefix || entry.id.startsWith(`${prefix}:`));
    return (at < 0 ? order.length : at) * 10 + (entry.status === 'open' ? 0 : 5);
  };
  goals
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => rank(a.entry) - rank(b.entry) || a.index - b.index)
    .forEach(({ entry }, index) => (entry.priority = index + 1));
  goals.sort((a, b) => a.priority - b.priority);

  const competing: GamePlan['competing'] = [];
  if (code === STANCE_RUN)
    competing.push({
      stanceId: 'hearts.avoid-points',
      whyNot: 'You hold every point taken so far and at least half of your cards cannot be beaten.',
    });
  if (code === STANCE_STOP)
    competing.push({
      stanceId: 'hearts.avoid-points',
      whyNot: 'One player holds every point taken so far, so ducking every trick could hand that player the rest.',
    });
  if ((code === STANCE_AVOID || code === STANCE_SHED) && runOpen)
    competing.push({
      stanceId: 'hearts.run-every-point',
      whyNot: `Only ${now[F_MASTERS]} of your ${now[F_CARDS]} cards cannot be beaten.`,
    });
  if (code === STANCE_SHED)
    competing.push({
      stanceId: 'hearts.avoid-points',
      whyNot: 'You hold the queen of spades, or a higher spade while the queen is unplayed.',
    });
  if (code === STANCE_AVOID && !runOpen)
    competing.push({
      stanceId: 'hearts.shed-dangerous-cards',
      whyNot: queenPlayed
        ? 'The queen of spades has been played.'
        : 'You hold neither the queen of spades nor a higher spade.',
    });

  return {
    schemaVersion: PLAN_SCHEMA_VERSION,
    plannerVersion: HEARTS_PLANNER_VERSION,
    mode: observation.mode,
    seat,
    competitorId: own.id,
    teammates: teammatesOf(competition, seat),
    phaseId: 'hearts.playing',
    decisionKind: 'play',
    stance: { id: stanceId, title: HEARTS_STANCE_TITLES[stanceId], evidence: 'exact' },
    goals,
    competing,
    revisions,
    estimates: [],
    limitations: ['The stance follows exact counts of points and played cards. It does not predict concealed cards or later play.'],
  };
}
