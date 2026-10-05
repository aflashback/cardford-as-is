import {
  apply,
  collectTrick,
  createGame,
  nextHand,
  type AcceptedAction,
  type Card,
  type GameConfig,
  type PrivateGame,
} from './index.ts';
export type ReplayCommand =
  | { type: 'action'; action: AcceptedAction }
  | { type: 'collect-trick' }
  | { type: 'next-hand'; deal: Card[] };
/** V1 journal dispatcher through game-owned compatibility reducers. Collection remains a
 * distinct command/revision; public replay projects each restored observation separately.
 * Native V2 persistence/journal activation remains M03-M04.
 */
export function replay(
  config: GameConfig,
  initialDeal: Card[],
  commands: ReplayCommand[],
  eventSchemaVersion = '1.0.0',
): PrivateGame {
  if (eventSchemaVersion !== '1.0.0') throw new Error('Unsupported replay schema version.');
  let state = createGame(config, initialDeal);
  for (const command of commands) {
    if (command.type === 'action') state = apply(state, command.action);
    else if (command.type === 'collect-trick') state = collectTrick(state);
    else if (command.type === 'next-hand') state = nextHand(state, command.deal);
    else throw new Error('Unsupported replay command.');
  }
  return state;
}
