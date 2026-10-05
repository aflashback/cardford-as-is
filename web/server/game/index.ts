/** Preserved V1 API; implementations dispatch to game-owned reducers. */
export * from './legacy/types.ts';
export * from './cards.ts';
export { actionId, trickWinner } from './rules.ts';
export {
  createGame,
  legalActions,
  matchWinner,
  apply,
  collectTrick,
  nextHand,
  applyAction,
} from './compatibility.ts';
