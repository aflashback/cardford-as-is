import type { PassMemory, Play, Trick } from '../../game/kernel/types.ts';
import type { HeartsEvent, HeartsHandResult } from './state.ts';

/** Nested projections also allowlist fields; an injected aggregate canary never becomes actor input. */
export const copyHeartsPlay = (play: Play): Play => ({ seat: play.seat, card: play.card });
export const copyHeartsHistory = (history: Trick[]): Trick[] =>
  history.map((trick) => ({ plays: trick.plays.map(copyHeartsPlay), winner: trick.winner }));
export const copyHeartsPass = (pass: PassMemory): PassMemory => ({
  outgoing: [...pass.outgoing],
  incoming: [...pass.incoming],
  to: pass.to,
  from: pass.from,
});
export function copyHeartsEvent(event: HeartsEvent): HeartsEvent {
  return {
    id: event.id,
    type: event.type,
    message: event.message,
    ...(event.seat === undefined ? {} : { seat: event.seat }),
    ...(event.card === undefined ? {} : { card: event.card }),
  };
}
export const copyHeartsResult = (result: HeartsHandResult): HeartsHandResult => ({
  points: [...result.points],
  ...(result.winner === undefined ? {} : { winner: result.winner }),
});
