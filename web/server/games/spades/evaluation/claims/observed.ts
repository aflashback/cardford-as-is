import { cardRank, cardSuit, legalActions, type PrivateGame, type Seat, type Suit } from '../../../../game/index.ts';
import { competitionFor, opponentsOf, teammatesOf } from '../../../../game/kernel/competition.ts';
import { observe } from '../../../../observations/index.ts';
import type { ReasonClaim } from '../../../../strategy/types.ts';
import { feasible, searchTrick, seatKnowledge, seatsAfter } from './worlds.ts';

type Verdict = { verdict: 'confirmed' | 'false' | 'not-checkable'; reason: string };
const falseClaim = (reason: string): Verdict => ({ verdict: 'false', reason });
const confirmed = (): Verdict => ({ verdict: 'confirmed', reason: 'independent-public-proof' });

/** CASE claims are re-derived from own/public engine projections, never runtime facts or proofs. */
export function checkObservedCase(state: PrivateGame, seat: Seat, predicate: string, args: ReasonClaim['args'], bound: number): Verdict {
  const suit = args.suit;
  if (suit !== 'C' && suit !== 'D' && suit !== 'H') return falseClaim('malformed-args');
  if (state.phase !== 'play' || state.turn !== seat) return falseClaim('state-mismatch');
  const obs = observe(state, seat);
  const knowledge = seatKnowledge(obs);
  if (!knowledge.consistent || !feasible(knowledge)) return { verdict: 'not-checkable', reason: 'inconsistent-observation' };
  const canHold = (member: Seat, of: Suit) => member === seat
    ? obs.hand.some((card) => cardSuit(card) === of)
    : knowledge.unknown.some((card) => cardSuit(card) === of && feasible(knowledge, { holds: [{ seat: member, card }] }));
  if (predicate === 'case-no-entry') {
    const holds = obs.hand.length > 0 && obs.hand.every((card) => cardSuit(card) === suit) &&
      knowledge.unknown.every((card) => cardSuit(card) !== suit) &&
      obs.trick.length > 0 && cardSuit(obs.trick[0].card) !== suit;
    return holds ? confirmed() : falseClaim('not-knowable');
  }
  if (predicate === 'case-partner-resource') {
    const competition = competitionFor(state.mode);
    const partner = teammatesOf(competition, seat)[0];
    const entry = args.entry;
    const needed = partner === undefined ? 0 : (obs.bids[seat] ?? 0) + (obs.bids[partner] ?? 0) - obs.tricks[seat] - obs.tricks[partner];
    const holds = obs.mode === 'spades-partners' && partner !== undefined && args.partner === partner &&
      !obs.trick.length && obs.bids.every((bid) => bid !== null && bid > 0) && needed > 0 &&
      typeof entry === 'string' && obs.hand.includes(entry) && cardSuit(entry) === 'S' &&
      obs.hand.some((card) => cardSuit(card) === suit) && obs.hand.every((card) => cardSuit(card) === suit || cardSuit(card) === 'S') &&
      !canHold(partner, suit) && canHold(partner, 'S') &&
      opponentsOf(competition, seat).every((member) => !canHold(member, 'S')) &&
      [...obs.hand, ...knowledge.unknown].every((card) => cardSuit(card) !== 'S' || cardRank(card) <= cardRank(entry));
    return holds ? confirmed() : falseClaim('not-knowable');
  }
  if (predicate !== 'case-public-sweep') return falseClaim('unknown-predicate');
  const winner = args.winner;
  if (typeof winner !== 'number' || ![0, 1, 2, 3].includes(winner) || winner === seat) return falseClaim('malformed-args');
  const leader = winner as Seat;
  const unknownSuit = knowledge.unknown.filter((card) => cardSuit(card) === suit);
  const monopoly = !obs.hand.some((card) => cardSuit(card) === suit) && unknownSuit.length > 0 &&
    unknownSuit.length === obs.handSizes[leader] &&
    (['C', 'D', 'H', 'S'] as Suit[]).filter((of) => of !== suit).every((of) => !canHold(leader, of));
  if (!monopoly || knowledge.unknown.some((card) => cardSuit(card) === 'S')) return falseClaim('not-knowable');
  let spent = 0;
  const actions = legalActions(state, seat);
  for (const action of actions) {
    if (action.kind !== 'play' || obs.hand.some((card) => card !== action.card && cardSuit(card) === 'S')) return falseClaim('not-knowable');
    const plays = [...obs.trick, { seat, card: action.card }];
    const search = searchTrick(knowledge, plays, seatsAfter(seat, obs.trick.length), (final) => final === leader, bound - spent);
    spent += search.evaluations;
    if (search.outcome === 'violation') return falseClaim('not-knowable');
    if (search.outcome === 'bound-exceeded') return { verdict: 'not-checkable', reason: 'work-bound-exceeded' };
  }
  return actions.length ? confirmed() : falseClaim('action-not-legal');
}
