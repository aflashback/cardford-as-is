/** V1 observation compatibility; native projections are game-owned and actor scoped. */
import type { PrivateGame, Seat } from '../game/legacy/types.ts';
import { projectV1HeartsState as fromV1Hearts } from '../games/hearts/compatibility.ts';
import { observeV1Hearts } from '../games/hearts/observation.ts';
import { projectV1SpadesState as fromV1Spades } from '../games/spades/compatibility.ts';
import { observeV1Spades } from '../games/spades/observation.ts';
export * from './types.ts';
export { assertObservation, getMemory, projectEvent } from '../game/legacy/observation.ts';
export function observe(state: PrivateGame, seat: Seat) {
  return state.mode === 'hearts'
    ? observeV1Hearts(fromV1Hearts(state), seat)
    : observeV1Spades(fromV1Spades(state), seat);
}
