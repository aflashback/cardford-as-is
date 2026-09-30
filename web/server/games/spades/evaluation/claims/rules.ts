import {
  apply,
  createGame,
  fullDeck,
  legalActions,
  trickWinner,
  type Card,
  type Four,
  type PrivateGame,
  type Seat,
  type Trick,
} from '../../../../game/index.ts';
import { competitionFor } from '../../../../game/kernel/competition.ts';
import { scoreCompetitor } from '../../../../game/spades/score.ts';

/**
 * COACH-15: rule statements are checked against the behaviour of the production engine
 * and scorer on small constructed hands, never against the fact builder or authored text.
 */
export type SpadesMode = 'spades-solo' | 'spades-partners';
export type RuleArgs = Record<string, string | number | boolean | null>;
export type RuleVerdict = { holds: boolean; detail: string };

const SEATS: Seat[] = [0, 1, 2, 3];
const LAST_TRICK: Card[] = ['C2', 'C3', 'C4', 'CA'];

/**
 * Plays the final trick of a constructed hand through the engine so that the engine
 * itself scores the hand. `tricks` are the totals after that trick; seat 3 wins it.
 */
export function scoreThroughEngine(
  mode: SpadesMode,
  bids: Four<number>,
  tricks: Four<number>,
  scores: Four<number> = [0, 0, 0, 0],
  bags: Four<number> = [0, 0, 0, 0],
): { before: PrivateGame; after: PrivateGame } {
  if (tricks.reduce((sum, value) => sum + value, 0) !== 13 || tricks[3] < 1)
    throw new Error('A constructed hand needs thirteen tricks and a last trick for seat 3.');
  const start = createGame({ id: 'claim-rule-check', mode, dealer: 3 }, fullDeck());
  const earlier = fullDeck().filter((card) => !LAST_TRICK.includes(card));
  const winners: Seat[] = SEATS.flatMap((seat) =>
    Array.from({ length: tricks[seat] - (seat === 3 ? 1 : 0) }, () => seat),
  );
  const history: Trick[] = winners.map((winner, index) => ({
    plays: SEATS.map((seat) => ({ seat, card: earlier[index * 4 + seat] })),
    winner,
  }));
  const before: PrivateGame = {
    ...start,
    phase: 'play',
    hands: SEATS.map((seat) => [LAST_TRICK[seat]]) as Four<Card[]>,
    bids: [...bids] as Four<number | null>,
    tricks: SEATS.map((seat) => tricks[seat] - (seat === 3 ? 1 : 0)) as Four<number>,
    scores: [...scores] as Four<number>,
    bags: [...bags] as Four<number>,
    trick: [],
    history,
    turn: 0,
    spadesBroken: true,
  };
  let after = before;
  for (const seat of SEATS) after = apply(after, { kind: 'play', seat, card: LAST_TRICK[seat] });
  return { before, after };
}

const points = (mode: SpadesMode, bids: Four<number>, tricks: Four<number>) => {
  const { after } = scoreThroughEngine(mode, bids, tricks);
  if (!after.handResult) throw new Error('The engine did not score the constructed hand.');
  return after.handResult;
};

/** A seat that cannot follow, holding trump and a side card, with a trump already in the trick. */
function voidSeatChoices(mode: SpadesMode): string[] {
  const start = createGame({ id: 'claim-rule-check', mode, dealer: 3 }, fullDeck());
  const state: PrivateGame = {
    ...start,
    phase: 'play',
    hands: [['C5'], ['S4'], ['SK', 'S3', 'D4'], ['C9']],
    bids: [3, 3, 3, 3],
    trick: [
      { seat: 0, card: 'C2' },
      { seat: 1, card: 'S9' },
    ],
    history: [],
    turn: 2,
    spadesBroken: true,
  };
  return legalActions(state, 2).map((action) => (action.kind === 'play' ? action.card : ''));
}

const CHECKS: Record<string, (mode: SpadesMode, args: RuleArgs) => RuleVerdict> = {
  'trump-optional': (mode) => {
    const choices = voidSeatChoices(mode);
    const holds = ['SK', 'S3', 'D4'].every((card) => choices.includes(card));
    return { holds, detail: `void seat may play ${choices.join(',')}` };
  },
  'team-contract-rule': (mode) => {
    if (competitionFor(mode).mode !== 'partnership')
      return { holds: false, detail: 'this table has no shared contract' };
    // Seat 0 takes 1 of its 3; its teammate supplies the rest of the shared contract of 5.
    const pooled = points(mode, [3, 4, 2, 4], [1, 4, 4, 4]);
    const holds = pooled.points[0] === 50 && pooled.points[2] === 50 && pooled.points[1] === 80;
    return { holds, detail: `engine points ${pooled.points.join(',')}` };
  },
  'mode-objective': (mode, args) => {
    const competition = competitionFor(mode);
    const scored = points(mode, [3, 4, 2, 4], [1, 4, 4, 4]);
    const together = scored.points[0] === 50 && scored.points[2] === 50;
    const apart = scored.points[0] === -30 && scored.points[2] === 22;
    const engineAgrees = competition.mode === 'partnership' ? together : apart;
    return {
      holds: engineAgrees && args.competition === competition.mode,
      detail: `${competition.mode}; engine points ${scored.points.join(',')}`,
    };
  },
  'nil-tricks-no-credit': (mode) => {
    const alone = scoreCompetitor({ bids: [0], tricks: [3], oldBags: 0 });
    const beside = scoreCompetitor({ bids: [0, 4], tricks: [2, 2], oldBags: 0 });
    let holds = alone.delta === -100 && beside.delta === -140 && beside.bags === 2;
    if (competitionFor(mode).mode === 'partnership') {
      // Seat 0 bid Nil and took 2; its teammate bid 4 and took 2: the contract is not made.
      const scored = points(mode, [0, 4, 4, 5], [2, 4, 2, 5]);
      holds = holds && scored.points[0] === -140 && scored.points[2] === -140;
    }
    return { holds, detail: `scorer ${alone.delta}/${beside.delta}` };
  },
  'nil-award': (_mode, args) => {
    const made = scoreCompetitor({ bids: [0], tricks: [0], oldBags: 0 }).delta;
    const failed = scoreCompetitor({ bids: [0], tricks: [1], oldBags: 0 }).delta;
    const both = scoreCompetitor({ bids: [0, 0], tricks: [0, 1], oldBags: 0 }).delta;
    return {
      holds: args.made === made && args.failed === failed && both === made + failed,
      detail: `scorer made ${made}, failed ${failed}, one of each ${both}`,
    };
  },
  'nil-bid-rule': () => {
    const kept = scoreCompetitor({ bids: [0], tricks: [0], oldBags: 0 }).delta;
    const broken = [1, 2, 5, 13].map((taken) => scoreCompetitor({ bids: [0], tricks: [taken], oldBags: 0 }).delta);
    return {
      holds: kept > 0 && broken.every((delta) => delta < 0),
      detail: `scorer kept ${kept}, broken ${broken.join(',')}`,
    };
  },
  'failed-nil-bags': () => {
    const two = scoreCompetitor({ bids: [0], tricks: [2], oldBags: 0 });
    const three = scoreCompetitor({ bids: [0], tricks: [3], oldBags: 0 });
    const beside = scoreCompetitor({ bids: [0, 2], tricks: [1, 2], oldBags: 0 });
    const holds =
      two.delta === -100 && two.bags === 2 && three.delta === -100 && three.bags === 3 &&
      beside.delta === -80 && beside.bags === 1;
    return { holds, detail: `scorer ${two.delta}/${two.bags}, ${three.delta}/${three.bags}, ${beside.delta}/${beside.bags}` };
  },
  'match-after-hand': (mode) => {
    // A score above the target in the middle of a hand must not end the match.
    const start = createGame({ id: 'claim-rule-check', mode, dealer: 3 }, fullDeck());
    let middle: PrivateGame = { ...start, scores: [600, 600, 600, 600] };
    for (const seat of SEATS) middle = apply(middle, { kind: 'bid', seat, bid: 3 });
    const lead = legalActions(middle, middle.turn!)[0];
    if (lead.kind !== 'play') return { holds: false, detail: 'no card to lead' };
    middle = apply(middle, lead);
    const open = middle.phase === 'play' && middle.handResult === undefined;
    const { before, after } = scoreThroughEngine(mode, [3, 3, 3, 3], [3, 3, 3, 4], [480, 100, 100, 100]);
    const decided = before.handResult === undefined && after.handResult?.winner !== undefined;
    return { holds: open && decided, detail: `mid-hand phase ${middle.phase}; winner ${after.handResult?.winner}` };
  },
  'hand-trick-total': (mode, args) => {
    const total = fullDeck().length / SEATS.length;
    const { before, after } = scoreThroughEngine(mode, [3, 3, 3, 3], [3, 3, 3, 4]);
    const scoredAtTotal =
      before.history.length === total - 1 && before.handResult === undefined && after.handResult !== undefined;
    return { holds: args.total === total && scoredAtTotal, detail: `engine scores after ${total} tricks` };
  },
  'trump-beats-side-suit': (mode) => {
    const ruff = trickWinner([{ seat: 0, card: 'CA' }, { seat: 1, card: 'S2' }], mode) === 1;
    const higher = trickWinner([{ seat: 0, card: 'S2' }, { seat: 1, card: 'SA' }], mode) === 1;
    const top =
      trickWinner(
        [{ seat: 0, card: 'SA' }, { seat: 1, card: 'SK' }, { seat: 2, card: 'CA' }, { seat: 3, card: 'S2' }],
        mode,
      ) === 0;
    return { holds: ruff && higher && top, detail: 'engine trick winners' };
  },
};

export const RULE_PREDICATES: readonly string[] = Object.keys(CHECKS);

const cache = new Map<string, RuleVerdict>();

/** Rule statements depend only on the mode and the arguments, so each is decided once. */
export function checkRule(predicate: string, mode: SpadesMode, args: RuleArgs): RuleVerdict | null {
  if (!Object.hasOwn(CHECKS, predicate)) return null;
  const key = `${predicate}|${mode}|${JSON.stringify(Object.entries(args).sort(([a], [b]) => a.localeCompare(b)))}`;
  const saved = cache.get(key);
  if (saved) return saved;
  const verdict = CHECKS[predicate](mode, args);
  cache.set(key, verdict);
  return verdict;
}
