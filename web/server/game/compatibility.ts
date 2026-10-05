/** V1 service facade. Native state/rules are game-owned; HTTP/storage migration is M03-M04. */
import {
  RULE_PROFILES,
  assertSeat,
  type AcceptedAction,
  type Card,
  type GameConfig,
  type GameEvent,
  type Mode,
  type PrivateGame,
  type Seat,
} from './legacy/types.ts';
import { actionsFor } from './rules.ts';
import {
  createHeartsGame,
  applyHeartsAction,
  collectHeartsTrick,
  nextHeartsHand,
  matchHeartsWinner,
} from '../games/hearts/engine.ts';
import {
  projectV1HeartsState as fromV1Hearts,
  projectHeartsStateToV1 as toV1Hearts,
} from '../games/hearts/compatibility.ts';
import {
  createSpadesGame,
  applySpadesAction,
  collectSpadesTrick,
  nextSpadesHand,
  matchSpadesWinner,
} from '../games/spades/engine.ts';
import {
  projectV1SpadesState as fromV1Spades,
  renderV1SpadesState as toV1Spades,
} from '../games/spades/compatibility.ts';

function requireLegacyPin(state: PrivateGame): void {
  if (
    state.moduleVersion !== '1.0.0' ||
    state.eventSchemaVersion !== '1.0.0' ||
    state.ruleProfileId !== RULE_PROFILES[state.mode]
  )
    throw new Error('Unsupported stored rules version.');
}
export function createGame(config: GameConfig, deck: Card[]): PrivateGame {
  if (!Object.hasOwn(RULE_PROFILES, config.mode) || typeof config.id !== 'string' || !config.id)
    throw new Error('Invalid game configuration.');
  assertSeat(config.dealer);
  if (config.mode === 'hearts') return toV1Hearts(createHeartsGame(config, deck));
  return toV1Spades(createSpadesGame({ ...config, mode: config.mode }, deck));
}
export function legalActions(state: PrivateGame, seat: Seat) {
  assertSeat(seat);
  return actionsFor(
    {
      mode: state.mode,
      phase: state.phase,
      turn: state.turn,
      trick: state.trick,
      history: state.history,
      heartsBroken: state.heartsBroken,
      spadesBroken: state.spadesBroken,
      hand: state.hands[seat],
    },
    seat,
  );
}
export function matchWinner(mode: Mode, scores: number[]): Seat | undefined {
  return mode === 'hearts' ? matchHeartsWinner(scores) : matchSpadesWinner(mode, scores);
}
export function apply(state: PrivateGame, action: AcceptedAction): PrivateGame {
  requireLegacyPin(state);
  if (state.mode === 'hearts') {
    if (action.kind === 'bid') throw new Error('Unsupported action.');
    return toV1Hearts(applyHeartsAction(fromV1Hearts(state), action));
  }
  return toV1Spades(applySpadesAction(fromV1Spades(state), action));
}
export function collectTrick(state: PrivateGame): PrivateGame {
  requireLegacyPin(state);
  return state.mode === 'hearts'
    ? toV1Hearts(collectHeartsTrick(fromV1Hearts(state)))
    : toV1Spades(collectSpadesTrick(fromV1Spades(state)));
}
export function nextHand(state: PrivateGame, deck: Card[]): PrivateGame {
  requireLegacyPin(state);
  return state.mode === 'hearts'
    ? toV1Hearts(nextHeartsHand(fromV1Hearts(state), deck))
    : toV1Spades(nextSpadesHand(fromV1Spades(state), deck));
}
export function applyAction(
  state: PrivateGame,
  action: AcceptedAction,
): { state: PrivateGame; events: GameEvent[] } {
  const next = apply(state, action);
  return { state: next, events: next.events.slice(state.events.length) };
}
