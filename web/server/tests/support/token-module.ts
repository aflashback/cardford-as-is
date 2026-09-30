import {
  competitorOf,
  opposingCompetitors,
  teammatesOf,
  type Competitor,
} from '../../game/kernel/competition.ts';
import { validateCompetition, type Competition } from '../../game/kernel/registry.ts';
import { nextSeat, type Seat } from '../../game/kernel/types.ts';
import {
  DEFAULT_SELECTION_RULE,
  type Candidate,
  type DecisionBudget,
  type PlanningPack,
  type SelectionRule,
} from '../../strategy/plan/contract.ts';
import { createRandom, shuffled } from '../../strategy/plan/random.ts';
import {
  PLAN_SCHEMA_VERSION,
  type GamePlan,
  type PlanGoal,
  type PlanRevision,
  type PlayoutModel,
} from '../../strategy/plan/types.ts';

/**
 * GP-06: a test-only hidden-information game that shares nothing with the catalog games.
 *
 * Twenty numbered tokens are dealt by seed, five to each of four seats, and stay concealed.
 * A round has five cycles. In a cycle every seat reveals one token in turn order; the seat
 * that revealed the highest number collects the cycle and opens the next one. A competitor's
 * total is the number of cycles it collected and the LOWEST total wins. A competitor that
 * collects every cycle of the round completes a sweep: its total becomes zero and every other
 * competitor is charged the full round.
 *
 * Two variants differ only in their declared competition.
 */
export const TOKEN_MODULE_VERSION = 'token-module-1.0.0';
export const TOKEN_PLANNER_VERSION = 'token-planner-1.0.0';
export const TOKEN_POLICY_VERSION = 'token-continuation-1.0.0';
export const TOKEN_PACK_ID = 'token-planning-pack';
export const TOKEN_COUNT = 20;
export const TOKENS_PER_SEAT = 5;
export const CYCLES = 5;
export const SWEEP_CHARGE = 5;

/** Work-count budget for one token decision: five tokens under two stances on common worlds. */
export const TOKEN_BUDGET: DecisionBudget = {
  maxWorlds: 64,
  maxSearchedCandidates: 5,
  maxStances: 2,
  maxSteps: 50_000,
};
/** Totals count cycles, so a quarter of a cycle is the smallest difference treated as meaningful. */
export const TOKEN_SELECTION_RULE: SelectionRule = {
  ...DEFAULT_SELECTION_RULE,
  noiseBand: { z: 1.5, floor: 0.25 },
};

export const TOKEN_VARIANTS = ['token-individual', 'token-teams'] as const;
export type TokenVariant = (typeof TOKEN_VARIANTS)[number];

const SEATS: Seat[] = [0, 1, 2, 3];

const COMPETITIONS: Record<TokenVariant, Competition> = {
  'token-individual': {
    mode: 'individual',
    competitors: SEATS.map((seat) => ({ id: `solo-${seat}`, seats: [seat] })),
  },
  // Neighbouring seats are grouped, so any opposite-seat assumption gives the wrong teammate.
  'token-teams': {
    mode: 'partnership',
    competitors: [
      { id: 'A', seats: [0, 1] },
      { id: 'B', seats: [2, 3] },
    ],
  },
};
for (const competition of Object.values(COMPETITIONS)) validateCompetition(competition);

export function tokenCompetition(variant: string): Competition {
  if (!Object.hasOwn(COMPETITIONS, variant)) throw new Error(`Unknown token variant: ${variant}`);
  return structuredClone(COMPETITIONS[variant as TokenVariant]);
}

export type Reveal = { seat: Seat; token: number };
export type TokenCycle = { reveals: Reveal[]; collector: Seat };

/** Authoritative round. Only the test engine and evaluation code hold one. */
export type TokenRound = {
  variant: TokenVariant;
  opener: Seat;
  holdings: number[][];
  cycles: TokenCycle[];
  current: Reveal[];
  /** Acting seat, or null when the round is complete. */
  turn: Seat | null;
  /** Presentation text. It never influences a decision. */
  note: string;
};

/** Seat-scoped view: own tokens and public reveals only, built by allowlisting fields. */
export type TokenObservation = {
  variant: TokenVariant;
  seat: Seat;
  opener: Seat;
  own: number[];
  /** Public count of concealed tokens per seat. */
  held: number[];
  cycles: TokenCycle[];
  current: Reveal[];
  turn: Seat | null;
  note: string;
};

/** A sampled round plus the focal seat's fixed intent, used only inside playouts. */
export type TokenWorld = TokenRound & { focal: Seat; focalIntent: number };

export const TOKEN_STANCE_IDS = [
  'token.stay-under',
  'token.sweep',
  'token.stop-sweep',
  'token.close-out',
] as const;
export type TokenStanceId = (typeof TOKEN_STANCE_IDS)[number];

const STANCE_TITLES: Record<TokenStanceId, { individual: string; partnership: string }> = {
  'token.stay-under': { individual: 'Collect as little as you can', partnership: 'Keep your side’s total low' },
  'token.sweep': { individual: 'Collect every cycle', partnership: 'Collect every cycle as a side' },
  'token.stop-sweep': { individual: 'Collect one cycle to end the sweep', partnership: 'End the other side’s sweep' },
  'token.close-out': { individual: 'Reveal your last token', partnership: 'Reveal your last token' },
};

/** A first move carrying a fixed intent is `token + INTENT_SHIFT * intent`; tokens stay below the shift. */
const INTENT_SHIFT = 32;
const INTENT_DERIVED = 0;
const intentOf = (stanceId: string): number => {
  const index = TOKEN_STANCE_IDS.indexOf(stanceId as TokenStanceId);
  if (index < 0) throw new Error(`Unknown token stance: ${stanceId}`);
  return index + 1;
};

function assertVariant(variant: string): asserts variant is TokenVariant {
  if (!(TOKEN_VARIANTS as readonly string[]).includes(variant)) throw new Error(`Unknown token variant: ${variant}`);
}

export function createTokenRound(
  variant: TokenVariant,
  holdings: readonly (readonly number[])[],
  opener: Seat,
  note = '',
): TokenRound {
  assertVariant(variant);
  const all = holdings.flat();
  if (
    holdings.length !== 4 ||
    holdings.some((held) => held.length !== TOKENS_PER_SEAT) ||
    new Set(all).size !== TOKEN_COUNT ||
    all.some((token) => !Number.isInteger(token) || token < 1 || token > TOKEN_COUNT) ||
    !SEATS.includes(opener)
  )
    throw new Error('A round needs twenty distinct tokens, five for each seat.');
  return {
    variant,
    opener,
    holdings: holdings.map((held) => [...held].sort((a, b) => a - b)),
    cycles: [],
    current: [],
    turn: opener,
    note,
  };
}

export function dealTokens(variant: TokenVariant, seed: number, note = ''): TokenRound {
  const tokens = shuffled(
    Array.from({ length: TOKEN_COUNT }, (_, index) => index + 1),
    createRandom(seed >>> 0, 11),
  );
  return createTokenRound(
    variant,
    SEATS.map((seat) => tokens.slice(seat * TOKENS_PER_SEAT, (seat + 1) * TOKENS_PER_SEAT)),
    (seed % 4) as Seat,
    note,
  );
}

export function observeTokens(round: TokenRound, seat: Seat): TokenObservation {
  if (!SEATS.includes(seat)) throw new Error('Invalid seat.');
  return {
    variant: round.variant,
    seat,
    opener: round.opener,
    own: [...round.holdings[seat]],
    held: round.holdings.map((held) => held.length),
    cycles: round.cycles.map((cycle) => ({
      reveals: cycle.reveals.map((reveal) => ({ seat: reveal.seat, token: reveal.token })),
      collector: cycle.collector,
    })),
    current: round.current.map((reveal) => ({ seat: reveal.seat, token: reveal.token })),
    turn: round.turn,
    note: round.note,
  };
}

export const legalTokens = (observation: TokenObservation): number[] =>
  observation.turn === observation.seat ? [...observation.own] : [];

function reveal(round: TokenRound, token: number): void {
  const seat = round.turn;
  if (seat === null) throw new Error('The round is complete.');
  const at = round.holdings[seat].indexOf(token);
  if (at < 0) throw new Error('That token is not held by the acting seat.');
  round.holdings[seat].splice(at, 1);
  round.current.push({ seat, token });
  if (round.current.length < 4) {
    round.turn = nextSeat(seat);
    return;
  }
  const collector = round.current.reduce((top, entry) => (entry.token > top.token ? entry : top)).seat;
  round.cycles.push({ reveals: round.current, collector });
  round.current = [];
  round.turn = round.cycles.length === CYCLES ? null : collector;
}

/** Engine transition. It never mutates its input. */
export function revealToken(round: TokenRound, seat: Seat, token: number): TokenRound {
  if (round.turn !== seat) throw new Error('It is not this seat’s turn.');
  const next = structuredClone(round);
  reveal(next, token);
  return next;
}

const collectedBySeat = (cycles: readonly TokenCycle[]): number[] =>
  SEATS.map((seat) => cycles.filter((cycle) => cycle.collector === seat).length);

/** Totals per competitor in declared order, with the sweep rule applied to a complete round. */
function totals(competition: Competition, cycles: readonly TokenCycle[]): number[] {
  const bySeat = collectedBySeat(cycles);
  const counts = competition.competitors.map((entry) =>
    entry.seats.reduce<number>((sum, seat) => sum + bySeat[seat], 0),
  );
  const sweeper = cycles.length === CYCLES ? counts.indexOf(CYCLES) : -1;
  return counts.map((count, index) => (sweeper < 0 ? count : index === sweeper ? 0 : SWEEP_CHARGE));
}

export type TokenResult = { competitorId: string; collected: number; total: number };

export function roundResults(round: TokenRound): TokenResult[] {
  if (round.turn !== null) throw new Error('Only a complete round has results.');
  const competition = tokenCompetition(round.variant);
  const bySeat = collectedBySeat(round.cycles);
  const scored = totals(competition, round.cycles);
  return competition.competitors.map((entry, index) => ({
    competitorId: entry.id,
    collected: entry.seats.reduce<number>((sum, seat) => sum + bySeat[seat], 0),
    total: scored[index],
  }));
}

export type TokenStance = {
  stanceId: TokenStanceId;
  /** The seat's competitor has collected every completed cycle. True before the first cycle ends. */
  ownEvery: boolean;
  /** An opposing competitor that has collected every completed cycle, once one is complete. */
  rival: Competitor | null;
};

/**
 * GP-02: the stance follows exact public counts only. The planner and the playout
 * continuation share this function, so every simulated seat follows the plan it would report.
 */
export function deriveTokenStance(
  competition: Competition,
  cycles: readonly TokenCycle[],
  seat: Seat,
): TokenStance {
  const done = cycles.length;
  const bySeat = collectedBySeat(cycles);
  const count = (entry: Competitor) => entry.seats.reduce<number>((sum, member) => sum + bySeat[member], 0);
  const ownEvery = count(competitorOf(competition, seat)) === done;
  const rival =
    done === 0 ? null : (opposingCompetitors(competition, seat).find((entry) => count(entry) === done) ?? null);
  // A sweep of one's own is never derived: it is only ever an alternative that evidence may select.
  const stanceId: TokenStanceId =
    done >= CYCLES - 1 ? 'token.close-out' : done >= 2 && rival ? 'token.stop-sweep' : 'token.stay-under';
  return { stanceId, ownEvery, rival };
}

/**
 * Continuation policy. It reads the acting seat's own tokens, the public reveals and the
 * declared competition. It is a named assumption about how play continues, not good play.
 */
function chooseToken(competition: Competition, world: TokenRound, seat: Seat, intent: TokenStanceId): number {
  const own = world.holdings[seat];
  if (!own.length) throw new Error('The acting seat holds no token.');
  const lowest = own[0];
  const highest = own[own.length - 1];
  if (own.length === 1) return lowest;
  const facts = deriveTokenStance(competition, world.cycles, seat);
  // A fixed intent is pursued only while exact public counts still allow it.
  let pursuit = intent;
  if (pursuit === 'token.sweep' && !facts.ownEvery) pursuit = 'token.stay-under';
  if (pursuit === 'token.stop-sweep' && !facts.rival) pursuit = 'token.stay-under';
  const top = world.current.length
    ? world.current.reduce((best, entry) => (entry.token > best.token ? entry : best))
    : null;
  if (!top) return pursuit === 'token.sweep' || pursuit === 'token.stop-sweep' ? highest : lowest;
  const under = own.filter((token) => token < top.token);
  const over = own.filter((token) => token > top.token);
  const last = world.current.length === 3;
  if (pursuit === 'token.sweep') {
    // A teammate is ahead: keep the strong tokens for later cycles.
    if (teammatesOf(competition, seat).includes(top.seat)) return lowest;
    return over.length ? over[0] : lowest;
  }
  if (pursuit === 'token.stop-sweep' && facts.rival!.seats.includes(top.seat))
    return over.length ? over[0] : lowest;
  if (under.length) return under[under.length - 1];
  // Staying under is impossible. Acting last the cycle is collected whatever is revealed.
  return last ? highest : lowest;
}

const stanceForActor = (competition: Competition, world: TokenWorld, seat: Seat): TokenStanceId =>
  seat === world.focal && world.focalIntent !== INTENT_DERIVED
    ? TOKEN_STANCE_IDS[world.focalIntent - 1]
    : deriveTokenStance(competition, world.cycles, seat).stanceId;

const revealedTokens = (observation: Pick<TokenObservation, 'cycles' | 'current'>): number[] => [
  ...observation.cycles.flatMap((cycle) => cycle.reveals.map((entry) => entry.token)),
  ...observation.current.map((entry) => entry.token),
];

/** Tokens concealed in other seats, ascending. Exact from own tokens and public reveals. */
export function concealedTokens(observation: TokenObservation): number[] {
  const known = new Set([...observation.own, ...revealedTokens(observation)]);
  const concealed: number[] = [];
  for (let token = 1; token <= TOKEN_COUNT; token++) if (!known.has(token)) concealed.push(token);
  return concealed;
}

function worldFrom(observation: TokenObservation, concealed: readonly number[]): TokenWorld {
  const holdings: number[][] = SEATS.map(() => []);
  holdings[observation.seat] = [...observation.own].sort((a, b) => a - b);
  let offset = 0;
  for (const seat of SEATS) {
    if (seat === observation.seat) continue;
    holdings[seat] = concealed.slice(offset, offset + observation.held[seat]).sort((a, b) => a - b);
    offset += observation.held[seat];
  }
  return {
    variant: observation.variant,
    opener: observation.opener,
    holdings,
    cycles: structuredClone(observation.cycles),
    current: structuredClone(observation.current),
    turn: observation.turn,
    note: '',
    focal: observation.seat,
    focalIntent: INTENT_DERIVED,
  };
}

/**
 * Every assignment of the concealed tokens that fits the observation, for exact reference
 * values in tests. The count is small because only the split between seats is hidden.
 */
export function enumerateTokenWorlds(observation: TokenObservation): TokenWorld[] {
  const concealed = concealedTokens(observation);
  const others = SEATS.filter((seat) => seat !== observation.seat);
  const worlds: TokenWorld[] = [];
  const assign = (index: number, groups: number[][]) => {
    if (index === concealed.length) {
      worlds.push(worldFrom(observation, groups.flat()));
      return;
    }
    groups.forEach((group, position) => {
      if (group.length === observation.held[others[position]]) return;
      group.push(concealed[index]);
      assign(index + 1, groups);
      group.pop();
    });
  };
  assign(
    0,
    others.map(() => []),
  );
  return worlds;
}

export type TokenPlayoutModel = PlayoutModel<TokenWorld, number> & { readonly focal: Seat };

export function createTokenPlayoutModel(observation: TokenObservation): TokenPlayoutModel {
  assertVariant(observation.variant);
  if (observation.turn !== observation.seat) throw new Error('A playout model needs the acting seat.');
  const competition = tokenCompetition(observation.variant);
  const focal = observation.seat;
  const ownIndex = competition.competitors.findIndex((entry) => entry.seats.includes(focal));
  const concealed = concealedTokens(observation);
  const needed = SEATS.filter((seat) => seat !== focal).reduce<number>((sum, seat) => sum + observation.held[seat], 0);
  const consistent = needed === concealed.length && observation.held[focal] === observation.own.length;
  const value = (world: TokenWorld) => {
    if (world.turn !== null) throw new Error('Only a complete round has a value.');
    const scored = totals(competition, world.cycles);
    const opposing = scored.filter((_, index) => index !== ownIndex);
    const reference = opposing.reduce((sum, total) => sum + total, 0) / opposing.length;
    const bySeat = collectedBySeat(world.cycles);
    const counts = competition.competitors.map((entry) =>
      entry.seats.reduce<number>((sum, seat) => sum + bySeat[seat], 0),
    );
    return {
      // Lowest total wins, so the value is turned round: higher is better for the focal competitor.
      utility: reference - scored[ownIndex],
      events: {
        collectedNothing: counts[ownIndex] === 0 ? 1 : 0,
        sweepCompleted: counts[ownIndex] === CYCLES ? 1 : 0,
        sweepSuffered: counts.some((count, index) => index !== ownIndex && count === CYCLES) ? 1 : 0,
      },
    };
  };
  return {
    id: 'token-playout-model',
    version: TOKEN_MODULE_VERSION,
    allocationModel: 'uniform-over-concealed-splits',
    continuationPolicy: TOKEN_POLICY_VERSION,
    focal,
    sample(seed) {
      if (!consistent) return null;
      return { world: worldFrom(observation, shuffled(concealed, createRandom(seed >>> 0, 5))), weight: 1 };
    },
    // Completed cycles are never mutated, so a copy may share them.
    clone: (world) => ({
      ...world,
      holdings: world.holdings.map((held) => [...held]),
      cycles: [...world.cycles],
      current: [...world.current],
    }),
    actor: (world) => world.turn,
    apply(world, move) {
      if (move >= INTENT_SHIFT) {
        if (world.turn !== world.focal) throw new Error('Only the focal seat may fix an intent.');
        world.focalIntent = Math.floor(move / INTENT_SHIFT);
        reveal(world, move % INTENT_SHIFT);
      } else reveal(world, move);
    },
    defaultMove(world) {
      const seat = world.turn;
      if (seat === null) throw new Error('The round is complete.');
      return chooseToken(competition, world, seat, stanceForActor(competition, world, seat));
    },
    moveId: (move) => `reveal:${move % INTENT_SHIFT}`,
    utility: (world) => value(world).utility,
    events: (world) => value(world).events,
  };
}

/** The alternative stances that exact facts leave open, after the plan's own stance. */
function openStances(observation: TokenObservation, stance: TokenStance): TokenStanceId[] {
  // With fewer than three tokens the rest of the round is already fixed by the first reveal.
  if (observation.own.length < 3) return [stance.stanceId];
  if (stance.stanceId === 'token.stay-under' && stance.ownEvery) return ['token.stay-under', 'token.sweep'];
  if (stance.stanceId === 'token.stop-sweep') return ['token.stop-sweep', 'token.stay-under'];
  return [stance.stanceId];
}

const WHY_NOT: Record<TokenStanceId, string> = {
  'token.stay-under': 'One opposing competitor has collected every completed cycle, so its sweep decides the round.',
  'token.sweep': 'No cycle has gone to anyone else yet, but a sweep needs every one of them.',
  'token.stop-sweep': 'No competitor has collected every completed cycle.',
  'token.close-out': 'More than one token is still held.',
};

function trigger(before: TokenStance, after: TokenStance): string {
  if (after.stanceId === 'token.close-out') return 'final-cycle-reached';
  if (after.stanceId === 'token.stop-sweep') return 'opposing-sweep-threat';
  if (before.stanceId === 'token.stop-sweep') return 'opposing-sweep-ended';
  return 'public-state-changed';
}

/** GP-02: a pure function of the seat observation; nothing here samples or estimates. */
export function deriveTokenPlan(observation: TokenObservation): GamePlan {
  assertVariant(observation.variant);
  const competition = tokenCompetition(observation.variant);
  const seat = observation.seat;
  const own = competitorOf(competition, seat);
  const partnership = competition.mode === 'partnership';
  const beneficiary = partnership ? ('team' as const) : ('self' as const);
  const stance = deriveTokenStance(competition, observation.cycles, seat);
  const title = (id: TokenStanceId) => STANCE_TITLES[id][partnership ? 'partnership' : 'individual'];
  const done = observation.cycles.length;
  const remaining = CYCLES - done;
  const bySeat = collectedBySeat(observation.cycles);
  const count = (entry: Competitor) => entry.seats.reduce<number>((sum, member) => sum + bySeat[member], 0);
  const goals: PlanGoal[] = [
    {
      id: 'token.low-total', title: title('token.stay-under'), beneficiary, against: null, horizon: 'round',
      priority: 0, status: 'open', evidence: 'exact',
      progress: { unit: 'cycles', comparator: 'at-most', target: null, current: count(own), remainingOpportunities: remaining },
      cancelWhen: ['The round ends.'],
    },
  ];
  if (done > 0 || stance.ownEvery)
    goals.push({
      id: 'token.complete-sweep', title: title('token.sweep'), beneficiary, against: null, horizon: 'round',
      priority: 0, status: stance.ownEvery ? (remaining === 0 ? 'secured' : 'open') : 'failed', evidence: 'exact',
      progress: { unit: 'cycles', comparator: 'exactly', target: CYCLES, current: count(own), remainingOpportunities: remaining },
      cancelWhen: ['Another competitor collects a cycle.'],
    });
  for (const opposing of opposingCompetitors(competition, seat)) {
    if (count(opposing) === 0) continue;
    const every = count(opposing) === done;
    goals.push({
      id: `token.stop-sweep:${opposing.id}`, title: title('token.stop-sweep'), beneficiary,
      against: { competitorIds: [opposing.id], seats: [...opposing.seats] }, horizon: 'round', priority: 0,
      status: every ? (remaining === 0 ? 'failed' : 'open') : 'secured', evidence: 'exact',
      progress: { unit: 'cycles', comparator: 'at-most', target: CYCLES - 1, current: count(opposing), remainingOpportunities: remaining },
      cancelWhen: ['A different competitor collects a cycle.'],
    });
  }
  const first = stance.stanceId === 'token.stop-sweep' ? 'token.stop-sweep' : 'token.low-total';
  const rank = (goal: PlanGoal) =>
    (goal.id === first || goal.id.startsWith(`${first}:`) ? 0 : 10) + (goal.status === 'open' ? 0 : 5);
  goals
    .map((goal, index) => ({ goal, index }))
    .sort((a, b) => rank(a.goal) - rank(b.goal) || a.index - b.index)
    .forEach(({ goal }, index) => (goal.priority = index + 1));
  goals.sort((a, b) => a.priority - b.priority);

  const revisions: PlanRevision[] = [];
  let before = deriveTokenStance(competition, [], seat);
  observation.cycles.forEach((_, index) => {
    const after = deriveTokenStance(competition, observation.cycles.slice(0, index + 1), seat);
    if (after.stanceId !== before.stanceId)
      revisions.push({ step: index + 1, trigger: trigger(before, after), from: before.stanceId, to: after.stanceId });
    before = after;
  });

  return {
    schemaVersion: PLAN_SCHEMA_VERSION,
    plannerVersion: TOKEN_PLANNER_VERSION,
    mode: observation.variant,
    seat,
    competitorId: own.id,
    teammates: teammatesOf(competition, seat),
    phaseId: 'token.revealing',
    decisionKind: 'play',
    stance: { id: stance.stanceId, title: title(stance.stanceId), evidence: 'exact' },
    goals,
    competing: openStances(observation, stance)
      .slice(1)
      .map((stanceId) => ({ stanceId, whyNot: WHY_NOT[stanceId] })),
    revisions,
    estimates: [],
    limitations: ['The stance follows exact public counts. It does not predict concealed tokens.'],
  };
}

/** Presentation text, the variant and the pack version are excluded, so twins share sampled worlds. */
export function tokenObservationKey(observation: TokenObservation): string {
  return JSON.stringify([
    'token', observation.seat, observation.opener, [...observation.own].sort((a, b) => a - b), observation.held,
    observation.cycles.map((cycle) => cycle.reveals.map((entry) => [entry.seat, entry.token])),
    observation.current.map((entry) => [entry.seat, entry.token]),
  ]);
}

export const tokenActionId = (token: number) => `reveal:${token}`;

export type TokenPackOptions = {
  /** False leaves interchangeable tokens unmerged, so a test can compare both ways. Default true. */
  merge?: boolean;
};

/** GP-05: the token planning pack. It goes through the same orchestrator as every catalog game. */
export function createTokenPlanningPack(
  options: TokenPackOptions = {},
): PlanningPack<TokenObservation, number, TokenWorld> {
  const merge = options.merge ?? true;
  const stanceOf = (observation: TokenObservation) =>
    deriveTokenStance(tokenCompetition(observation.variant), observation.cycles, observation.seat);
  let ownStance: string | null = null;
  return {
    id: TOKEN_PACK_ID,
    version: TOKEN_PLANNER_VERSION,
    modes: TOKEN_VARIANTS,
    competition: tokenCompetition,
    observationKey: tokenObservationKey,
    candidates(observation) {
      const legal = legalTokens(observation);
      if (!legal.length) return [];
      const competition = tokenCompetition(observation.variant);
      const preferred = chooseToken(competition, worldFrom(observation, []), observation.seat, stanceOf(observation).stanceId);
      const ordered = [preferred, ...legal.filter((token) => token !== preferred).sort((a, b) => a - b)];
      return ordered.map((token): Candidate<number> => ({ id: tokenActionId(token), move: token }));
    },
    ...(merge
      ? {
          equivalent(observation: TokenObservation, candidates: readonly Candidate<number>[]) {
            // Only the order against tokens held elsewhere or revealed in this cycle matters.
            const between = new Set([
              ...concealedTokens(observation),
              ...observation.current.map((entry) => entry.token),
            ]);
            const mine = candidates.map((entry) => entry.move).sort((a, b) => a - b);
            const groups: number[][] = [];
            let group: number[] = [];
            for (const token of mine) {
              const previous = group[group.length - 1];
              let separated = false;
              if (previous !== undefined)
                for (let middle = previous + 1; middle < token; middle++) if (between.has(middle)) separated = true;
              if (previous !== undefined && separated) {
                if (group.length > 1) groups.push(group);
                group = [];
              }
              group.push(token);
            }
            if (group.length > 1) groups.push(group);
            return groups.map((entries) => entries.map(tokenActionId));
          },
        }
      : {}),
    plan: deriveTokenPlan,
    stances(observation) {
      const open = openStances(observation, stanceOf(observation));
      ownStance = open[0];
      return open;
    },
    playout: createTokenPlayoutModel,
    withStance(move, stanceId) {
      if (ownStance === null) throw new Error('Stances are required before one is applied.');
      // The plan's own stance keeps being derived from exact facts; an alternative is held fixed.
      return move + INTENT_SHIFT * (stanceId === ownStance ? INTENT_DERIVED : intentOf(stanceId));
    },
    supports(observation, stanceId, candidate) {
      // Exact and deliberately narrow: only a certain contradiction of the stance fails.
      if (observation.current.length !== 3) return true;
      const competition = tokenCompetition(observation.variant);
      const top = observation.current.reduce((best, entry) => (entry.token > best.token ? entry : best));
      const collects = candidate.move > top.token;
      const couldStayUnder = observation.own.some((token) => token < top.token);
      const couldCollect = observation.own.some((token) => token > top.token);
      const own = competitorOf(competition, observation.seat);
      const ahead = !own.seats.includes(top.seat);
      if (stanceId === 'token.stay-under') return !(collects && couldStayUnder && ahead);
      if (stanceId === 'token.sweep') return !(!collects && couldCollect && ahead);
      if (stanceId === 'token.stop-sweep') {
        const rival = deriveTokenStance(competition, observation.cycles, observation.seat).rival;
        return !(rival !== null && rival.seats.includes(top.seat) && !collects && couldCollect);
      }
      return true;
    },
  };
}
