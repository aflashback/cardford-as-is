import type { GameAction, GameView, Mode, RegisteredActorPacket, RegisteredSessionView } from '../../shared/contracts.ts';

const modes: Record<'hearts'|'spades', readonly Mode[]> = {
  hearts: ['hearts'], spades: ['spades-solo', 'spades-partners'],
};
/** Registered current-game display adapters consume server-owned projections. */
export function presentation(view: RegisteredSessionView, game: GameView | import('../../shared/contracts.ts').TokenPresentation,
  actor: RegisteredActorPacket | null, instanceId: string): GameView {
  if (view.gameId === 'test-token' || 'gameId' in game)
    throw new Error('This test module requires its installed non-card presentation adapter.');
  const expected: Mode = view.gameId === 'hearts' ? 'hearts' :
    view.variantId === 'solo' ? 'spades-solo' : 'spades-partners';
  if (!modes[view.gameId].includes(expected) || game.mode !== expected || game.id !== instanceId ||
      view.seat !== 0 || JSON.stringify(game.hand) !== JSON.stringify(view.table.hand) ||
      JSON.stringify(game.scores) !== JSON.stringify(view.table.scores) ||
      (actor && (actor.gameId !== view.gameId || actor.variantId !== view.variantId ||
        actor.seat !== 0 || actor.phase !== view.phase)))
    throw new Error('The table presentation does not match its registered session.');
  return game;
}
function sameAction(left: GameAction, right: GameAction): boolean {
  if (left.kind !== right.kind) return false;
  if (left.kind === 'play' && right.kind === 'play') return left.card === right.card;
  if (left.kind === 'bid' && right.kind === 'bid') return left.bid === right.bid;
  return left.kind === 'pass' && right.kind === 'pass' && new Set(left.cards).size === 3 &&
    left.cards.length === 3 && left.cards.every(card => right.cards.includes(card));
}
export function resolveCandidate(actor: RegisteredActorPacket | null, action: GameAction): string {
  if (actor?.gameId === 'test-token') throw new Error('Numeric token choices require the test module adapter.');
  const candidates = actor?.candidates.filter(candidate => sameAction(action, candidate.public)) ?? [];
  if (candidates.length !== 1) throw new Error('That action is unavailable at this confirmed decision.');
  return candidates[0].id;
}
/** Frozen current-game compatibility IDs; source membership still comes from the server. */
export function reviewCandidate(game:GameView, card:string):string {
  if (!modes[game.mode === 'hearts' ? 'hearts' : 'spades'].includes(game.mode) ||
      !game.legalActions.some(action=>action.kind === 'play' && action.card === card))
    throw new Error('That alternative is unavailable at the original decision.');
  return `play:${card}`;
}
