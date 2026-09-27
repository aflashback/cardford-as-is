import { trickWinner, type GameAction as DomainAction } from '../game/index.ts';
import { observe, type SeatObservation } from '../observations/index.ts';
import type { GameRow, PlayerRow } from '../records/types.ts';
import type { Transaction } from '../records/database.ts';
import type { CoachAccess, GameAction, GameView, SessionView } from '../../shared/contracts.ts';
import { effectiveFamilyGrant } from '../access/family.ts';
import { applyDuePlan } from '../billing/service.ts';

export function publicAction(action: DomainAction): GameAction {
  if (action.kind === 'play') return { kind: 'play', card: action.card };
  if (action.kind === 'bid') return { kind: 'bid', bid: action.bid };
  return { kind: 'pass', cards: [...action.cards] };
}
export const decisionId = (game: GameRow) => `${game.id}:${game.document.state.handNumber}:${game.revision}`;
export function observationView(id: string, obs: SeatObservation): GameView {
  return {
    id,
    mode: obs.mode,
    phase: obs.phase,
    hand: [...obs.hand],
    handCounts: [...obs.handSizes],
    bids: [...obs.bids],
    tricks: [...obs.tricks],
    scores: [...obs.scores],
    bags: [...obs.bags],
    trick: obs.trick.map((p) => ({ seat: p.seat, card: p.card })),
    history: obs.history.map((t) => ({
      winner: t.winner,
      plays: t.plays.map((p) => ({ seat: p.seat, card: p.card })),
    })),
    turn: obs.turn,
    dealer: obs.dealer,
    handNumber: obs.handNumber,
    heartsBroken: obs.heartsBroken,
    spadesBroken: obs.spadesBroken,
    passDirection: obs.passDirection,
    received: [...obs.pass.incoming],
    outgoing: [...obs.pass.outgoing],
    handResult: obs.handResult
      ? {
          points: [...obs.handResult.points],
          bags: [...obs.handResult.bags],
          ...(obs.handResult.winner !== undefined ? { winner: obs.handResult.winner } : {}),
        }
      : null,
    currentWinner: obs.trick.length ? trickWinner(obs.trick, obs.mode) : null,
    legalActions: obs.legalActions.map(publicAction),
  };
}
export async function coachAccess(
  client: Transaction,
  player: PlayerRow,
  game: GameRow | null,
  handNumber = game?.document.state.handNumber,
): Promise<CoachAccess> {
  if (player.profile.scheduledPlan && Date.parse(player.profile.currentPeriodEnd) <= Date.now()) {
    await applyDuePlan(client, player.id);
    player.profile.plan = player.profile.scheduledPlan;
    player.profile.scheduledPlan = null;
    player.access_generation++;
  }
  const individual = new Date(player.profile.currentPeriodEnd).getTime() > Date.now();
  const family = await effectiveFamilyGrant(client, player.id);
  const covered = individual || family !== null;
  const plan =
    family && (!individual || (player.profile.plan === 'practice' && family.plan === 'unlimited'))
      ? family.plan
      : player.profile.plan;
  const used = Number(
    (
      await client.query<{ used: string }>(
        "SELECT count(*) AS used FROM coached_hands WHERE player_id=$1 AND period=(now() AT TIME ZONE 'UTC')::date",
        [player.id],
      )
    ).rows[0].used,
  );
  const unlocked = game
    ? Boolean(
        (
          await client.query(
            'SELECT 1 FROM coached_hands WHERE player_id=$1 AND game_id=$2 AND hand_number=$3',
            [player.id, game.id, handNumber],
          )
        ).rowCount,
      )
    : false;
  const limited = plan === 'practice';
  const remaining = limited ? Math.max(0, 4 - used) : null;
  const reset = new Date();
  reset.setUTCHours(24, 0, 0, 0);
  const canCoach = covered && (unlocked || remaining === null || remaining > 0);
  return {
    plan,
    coverage: covered ? 'active' : 'expired',
    canPlay: covered,
    canCoach,
    remainingHands: remaining,
    resetsAt: limited ? reset.toISOString() : null,
    handUnlocked: unlocked,
    canStartWork: canCoach,
    localMock: true,
  };
}
export async function sessionView(
  client: Transaction,
  player: PlayerRow,
  game: GameRow,
  tab: string,
): Promise<SessionView> {
  return {
    game: observationView(game.id, observe(game.document.state, 0)),
    revision: game.revision,
    decisionId: decisionId(game),
    preferences: player.profile.preferences,
    access: await coachAccess(client, player, game),
    source: 'code',
    controlLeaseToken: game.document.control.tab === tab ? game.document.control.token : 'view-only',
    stats: { ...game.document.stats },
  };
}
