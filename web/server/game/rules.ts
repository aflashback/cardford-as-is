/** V1 action/context compatibility. Rules and trick ranking belong to each game. */
import type { Card, GameAction, LegalContext, Mode, Play, Seat } from './legacy/types.ts';
import { heartsActionsFor, heartsTrickWinner } from '../games/hearts/engine.ts';
import { spadesActionsFor, spadesTrickWinner } from '../games/spades/rules.ts';
export { actionId } from './legacy/rules.ts';
export function actionsFor(context: LegalContext, seat: Seat): GameAction[] {
  if (context.mode === 'hearts') {
    if (context.phase === 'bid') return [];
    return heartsActionsFor({ ...context, phase: context.phase }, seat);
  }
  if (context.phase === 'pass') return [];
  return spadesActionsFor({ ...context, phase: context.phase }, seat);
}
export function legalCards(context: LegalContext, seat: Seat): Card[] {
  return actionsFor(context, seat).flatMap((action) => (action.kind === 'play' ? [action.card] : []));
}
export function trickWinner(plays: Play[], mode: Mode): Seat {
  return mode === 'hearts' ? heartsTrickWinner(plays) : spadesTrickWinner(plays);
}
