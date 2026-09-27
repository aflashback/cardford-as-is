import { randomUUID, randomBytes } from 'node:crypto';
import {
  createGame,
  apply,
  collectTrick,
  nextHand,
  type Four,
  type Card,
  type GameAction as DomainAction,
} from '../game/index.ts';
import { observe, type SeatObservation } from '../observations/index.ts';
import { chooseAction } from '../strategy/index.ts';
import { explain } from '../coaching/templates.ts';
import { shuffledDeck, randomDealer } from '../game-deal.ts';
import { ownedTransaction, idempotent, saveGame, savePlayer } from '../records/repository.ts';
import type { Database, Transaction } from '../records/database.ts';
import type { GameRow, PlayerRow } from '../records/types.ts';
import type {
  ActionsRequest,
  AdviceRequest,
  AdviceView,
  AdvanceRequest,
  CommandEnvelope,
  ExposureRequest,
  HandUnlockRequest,
  NewSessionRequest,
  PreferencesRequest,
  PrepareRequest,
  PrepareView,
  ReviewFrame,
  ReviewIndex,
  ReviewView,
  RecapView,
  NotesView,
  AccountView,
  AccountCommand,
} from '../../shared/contracts.ts';
import { ApiFailure, invalid } from './errors.ts';
import { coachAccess, decisionId, observationView, publicAction, sessionView } from './views.ts';

export interface RequestContext {
  token: string;
  tab: string;
}
const leaseToken = () => randomBytes(24).toString('base64url');
function requireGame(game: GameRow | null): asserts game is GameRow {
  if (!game) throw new ApiFailure(404, 'NOT_FOUND', 'Start a game first.');
}
function ownedGame(game: GameRow | null, id: string): asserts game is GameRow {
  requireGame(game);
  if (game.id !== id) throw new ApiFailure(404, 'NOT_FOUND', 'That game is no longer your current table.');
}
function revision(game: GameRow, body: CommandEnvelope, tab: string) {
  if (game.document.control.tab !== tab || game.document.control.token !== body.controlLeaseToken)
    throw new ApiFailure(409, 'LEASE_LOST', 'Another tab controls this table. Take control to continue.');
  if (game.revision !== body.expectedRevision)
    throw new ApiFailure(409, 'STALE_REVISION', 'The table changed. Refresh the confirmed position.');
}
async function requireCoverage(client: Transaction, player: PlayerRow, game: GameRow | null) {
  if (!(await coachAccess(client, player, game)).canPlay)
    throw new ApiFailure(
      403,
      'FORBIDDEN',
      'Your local fixture coverage has expired. Open Account to choose a local plan.',
    );
}
function frame(game: GameRow, action: ReviewFrame['action'] = null): ReviewFrame {
  return {
    game: observationView(game.id, observe(game.document.state, 0)),
    action,
    decisionId: decisionId(game),
    notes: [],
  };
}
async function persistAdvance(client: Transaction, game: GameRow, event: unknown) {
  game.revision++;
  game.document.frames.push(frame(game));
  await client.query('INSERT INTO game_events(game_id,revision,event) VALUES($1,$2,$3)', [
    game.id,
    game.revision,
    event,
  ]);
  await client.query(
    "UPDATE jobs SET status='expired' WHERE game_id=$1 AND status='ready' AND revision<>$2",
    [game.id, game.revision],
  );
  await saveGame(client, game);
}
async function insertGame(
  client: Transaction,
  player: PlayerRow,
  mode: NewSessionRequest['mode'],
  tab: string,
): Promise<GameRow> {
  const id = randomUUID();
  const deck = shuffledDeck();
  const game: GameRow = {
    id,
    player_id: player.id,
    revision: 0,
    document: {
      state: createGame({ id, mode, dealer: randomDealer() }, deck),
      control: { tab, token: leaseToken() },
      stats: { decisions: 0, helped: 0, suggestions: 0 },
      exposure: {},
      savedAdvice: {},
      decisions: [],
      frames: [],
      deals: [deck],
      actions: [],
    },
  };
  game.document.frames.push(frame(game));
  await client.query('INSERT INTO games(id,player_id,document) VALUES($1,$2,$3)', [
    id,
    player.id,
    game.document,
  ]);
  player.active_game_id = id;
  await savePlayer(client, player);
  return game;
}
export class GameService {
  readonly pool: Database;
  constructor(pool: Database) {
    this.pool = pool;
  }
  async session(context: RequestContext) {
    return ownedTransaction(this.pool, context.token, async (client, player, existing) => {
      const game = existing ?? (await insertGame(client, player, 'spades-partners', context.tab));
      return sessionView(client, player, game, context.tab);
    });
  }
  async newSession(context: RequestContext, body: NewSessionRequest) {
    return ownedTransaction(this.pool, context.token, async (client, player, game) =>
      idempotent(client, player.id, body.commandId, { route: 'sessions', body }, async () => {
        await requireCoverage(client, player, game);
        if (player.active_game_id !== body.expectedActiveGameId)
          throw new ApiFailure(
            409,
            'STALE_REVISION',
            'Your current table changed. Refresh before replacing it.',
          );
        if (game && game.document.control.tab !== context.tab)
          throw new ApiFailure(409, 'LEASE_LOST', 'Take control before replacing the table.');
        const next = await insertGame(client, player, body.mode, context.tab);
        return sessionView(client, player, next, context.tab);
      }),
    );
  }
  async control(context: RequestContext, body: CommandEnvelope) {
    return ownedTransaction(this.pool, context.token, async (client, player, game) => {
      ownedGame(game, body.gameId);
      return idempotent(
        client,
        player.id,
        body.commandId,
        { route: 'control', body, tab: context.tab },
        async () => {
          if (game.revision !== body.expectedRevision)
            throw new ApiFailure(409, 'STALE_REVISION', 'Refresh before transferring control.');
          game.document.control = { tab: context.tab, token: leaseToken() };
          await saveGame(client, game);
          return sessionView(client, player, game, context.tab);
        },
      );
    });
  }
  async action(context: RequestContext, body: ActionsRequest) {
    return this.change(context, body, 'action', async (client, player, game) => {
      const before = frame(game, body.action),
        obs = observe(game.document.state, 0),
        id = decisionId(game);
      let accepted: Parameters<typeof apply>[1];
      if (body.action.kind === 'pass') {
        const passes: Four<Card[]> = [body.action.cards, [], [], []];
        for (const seat of [1, 2, 3] as const) {
          const action = chooseAction(observe(game.document.state, seat));
          if (action.kind !== 'pass') invalid('Not a passing phase.');
          passes[seat] = action.cards;
        }
        accepted = { kind: 'pass-bundle', passes };
      } else accepted = { ...body.action, seat: 0 };
      try {
        game.document.state = apply(game.document.state, accepted);
      } catch {
        invalid('That action is not legal in the current position.');
      }
      game.document.actions.push({ kind: 'action', action: accepted });
      const level = Math.max(game.document.exposure[id] ?? 0, game.document.pendingExposure ?? 0);
      game.document.pendingExposure = 0;
      if (obs.legalActions.length > 1) {
        game.document.stats.decisions++;
        if (level > 0) game.document.stats.helped++;
        if (level >= 3) game.document.stats.suggestions++;
      }
      await persistAdvance(client, game, { kind: 'action', action: accepted });
      game.document.decisions.push({
        id,
        handNumber: obs.handNumber,
        action: body.action,
        assisted: level > 0,
        observation: obs,
        before,
        after: frame(game, body.action),
      });
      await saveGame(client, game);
      return sessionView(client, player, game, context.tab);
    });
  }
  async change<T>(
    context: RequestContext,
    body: CommandEnvelope,
    route: string,
    operation: (client: Transaction, player: PlayerRow, game: GameRow) => Promise<T>,
  ): Promise<T> {
    return ownedTransaction(this.pool, context.token, async (client, player, game) => {
      ownedGame(game, body.gameId);
      await requireCoverage(client, player, game);
      return idempotent(client, player.id, body.commandId, { route, body }, async () => {
        revision(game, body, context.tab);
        return operation(client, player, game);
      });
    });
  }
  async prepare(context: RequestContext, body: PrepareRequest): Promise<PrepareView> {
    const snapshot = await ownedTransaction(this.pool, context.token, async (client, player, game) => {
      ownedGame(game, body.gameId);
      await requireCoverage(client, player, game);
      revision(game, body, context.tab);
      const state = game.document.state;
      if (state.turn === null || state.turn === 0 || !['bid', 'play'].includes(state.phase))
        invalid('No computer decision to prepare.');
      return observe(state, state.turn);
    });
    const action = chooseAction(snapshot);
    return this.change(context, body, 'prepare', async (client, player, game) => {
      const existing = (
        await client.query<{ id: string }>('SELECT id FROM jobs WHERE game_id=$1 AND revision=$2', [
          game.id,
          game.revision,
        ])
      ).rows[0];
      const id = existing?.id ?? randomUUID();
      await client.query(
        "INSERT INTO jobs(id,player_id,game_id,revision,access_generation,status,result,expires_at) VALUES($1,$2,$3,$4,$5,'ready',$6,now()+interval '10 minutes') ON CONFLICT(game_id,revision) DO UPDATE SET result=EXCLUDED.result,status='ready',expires_at=EXCLUDED.expires_at,access_generation=EXCLUDED.access_generation",
        [id, player.id, game.id, game.revision, player.access_generation, action],
      );
      return {
        preparedDecisionId: id,
        decisionId: decisionId(game),
        revision: game.revision,
        source: snapshot.legalActions.length === 1 ? 'forced' : 'code',
      };
    });
  }
  async advance(context: RequestContext, body: AdvanceRequest) {
    return this.change(context, body, 'advance', async (client, player, game) => {
      if (body.kind === 'collect-trick') {
        try {
          game.document.state = collectTrick(game.document.state);
        } catch {
          invalid('No completed trick to collect.');
        }
        game.document.actions.push({ kind: 'collect' });
      } else {
        const job = (
          await client.query<{ result: DomainAction; access_generation: number }>(
            "SELECT result,access_generation FROM jobs WHERE id=$1 AND player_id=$2 AND game_id=$3 AND revision=$4 AND status='ready' AND expires_at>now()",
            [body.preparedDecisionId, player.id, game.id, game.revision],
          )
        ).rows[0];
        if (!job || job.access_generation !== player.access_generation)
          throw new ApiFailure(409, 'STALE_REVISION', 'Prepare this decision again.');
        if (job.result.kind === 'pass' || job.result.seat === 0) invalid('Invalid computer decision.');
        game.document.state = apply(game.document.state, job.result);
        game.document.actions.push({ kind: 'action', action: job.result });
        await client.query("UPDATE jobs SET status='accepted' WHERE id=$1", [body.preparedDecisionId]);
      }
      await persistAdvance(client, game, { kind: body.kind });
      return sessionView(client, player, game, context.tab);
    });
  }
  async nextHand(context: RequestContext, body: CommandEnvelope) {
    return this.change(context, body, 'next-hand', async (client, player, game) => {
      const deck = shuffledDeck();
      try {
        game.document.state = nextHand(game.document.state, deck);
      } catch {
        invalid('Finish the hand before continuing.');
      }
      game.document.deals.push(deck);
      game.document.actions.push({ kind: 'next-hand', deck });
      game.document.stats = { decisions: 0, helped: 0, suggestions: 0 };
      await persistAdvance(client, game, { kind: 'next-hand', deck });
      return sessionView(client, player, game, context.tab);
    });
  }
  async preferences(context: RequestContext, body: PreferencesRequest) {
    return ownedTransaction(this.pool, context.token, async (client, player, game) => {
      requireGame(game);
      return idempotent(client, player.id, body.commandId, { route: 'preferences', body }, async () => {
        player.profile.preferences = body.preferences;
        await savePlayer(client, player);
        return sessionView(client, player, game, context.tab);
      });
    });
  }
  async issueAdvice(
    client: Transaction,
    player: PlayerRow,
    game: GameRow,
    requestedLevel: 1 | 2 | 3,
    unlock: boolean,
    source?: { observation: SeatObservation; id: string },
  ): Promise<AdviceView> {
    const obs = source?.observation ?? observe(game.document.state, 0);
    if (!obs.legalActions.length && requestedLevel !== 1)
      invalid('Move suggestions are available at your decision.');
    const access = await coachAccess(client, player, game, obs.handNumber);
    if (!access.handUnlocked && !unlock)
      throw new ApiFailure(403, 'FORBIDDEN', 'Unlock coaching for this hand first.');
    if (!access.canStartWork)
      throw new ApiFailure(
        403,
        'QUOTA_EXHAUSTED',
        'All four coached hands are used today. You can keep playing.',
      );
    const advice = explain(obs);
    const id = source?.id ?? decisionId(game);
    const view: AdviceView = {
      focus: advice.focus,
      notice: advice.notice,
      reason: requestedLevel >= 2 ? advice.reason : '',
      suggestion: requestedLevel === 3 ? advice.suggestion : '',
      source: advice.provenance,
      decisionId: id,
      requestedLevel,
      ...(requestedLevel === 3
        ? {
            ...(advice.card ? { card: advice.card } : {}),
            ...(advice.pass ? { pass: advice.pass } : {}),
            ...(advice.bid !== undefined ? { bid: advice.bid } : {}),
          }
        : {}),
      ...(advice.highlightSuit ? { highlightSuit: advice.highlightSuit } : {}),
    };
    if (!access.handUnlocked)
      await client.query(
        "INSERT INTO coached_hands(player_id,game_id,hand_number,period) VALUES($1,$2,$3,(now() AT TIME ZONE 'UTC')::date) ON CONFLICT DO NOTHING",
        [player.id, game.id, obs.handNumber],
      );
    game.document.exposure[id] = Math.max(game.document.exposure[id] ?? 0, requestedLevel);
    if (!obs.legalActions.length || source)
      game.document.pendingExposure = Math.max(game.document.pendingExposure ?? 0, requestedLevel);
    game.document.savedAdvice[`${id}:${requestedLevel}`] = view;
    await saveGame(client, game);
    return view;
  }
  async advice(context: RequestContext, body: AdviceRequest) {
    const saved = await ownedTransaction(this.pool, context.token, async (client, player, game) => {
      ownedGame(game, body.gameId);
      const result = game.document.savedAdvice[`${body.decisionId}:${body.requestedLevel}`];
      return result
        ? idempotent(client, player.id, body.commandId, { route: 'advice', body }, async () => result)
        : null;
    });
    if (saved) return saved;
    return this.change(context, body, 'advice', async (client, player, game) => {
      if (body.decisionId !== decisionId(game))
        throw new ApiFailure(409, 'STALE_REVISION', 'That coaching decision has passed.');
      const access = await coachAccess(client, player, game);
      return this.issueAdvice(client, player, game, body.requestedLevel, access.plan !== 'practice');
    });
  }
  async unlock(context: RequestContext, body: HandUnlockRequest) {
    const envelope = { ...body, commandId: body.requestId };
    return this.change(context, envelope, 'unlock', async (client, player, game) => {
      const source =
        body.decisionId === decisionId(game)
          ? undefined
          : game.document.decisions.find((d) => d.id === body.decisionId);
      if (body.decisionId !== decisionId(game) && !source)
        throw new ApiFailure(404, 'NOT_FOUND', 'That decision is not in this current game.');
      const handNumber = source?.handNumber ?? game.document.state.handNumber;
      if (body.handId !== `${game.id}:${handNumber}`)
        throw new ApiFailure(409, 'STALE_REVISION', 'That hand changed.');
      const advice = await this.issueAdvice(client, player, game, body.requestedLevel, true, source);
      return { access: await coachAccess(client, player, game, handNumber), advice };
    });
  }
  async notes(context: RequestContext, body: CommandEnvelope): Promise<NotesView> {
    return this.change(context, body, 'notes', async (client, player, game) => {
      if (!(await coachAccess(client, player, game)).handUnlocked)
        throw new ApiFailure(403, 'FORBIDDEN', 'Unlock this hand to open the optional memory aid.');
      const obs = observe(game.document.state, 0);
      const id = decisionId(game);
      game.document.exposure[id] = Math.max(1, game.document.exposure[id] ?? 0);
      if (!obs.legalActions.length)
        game.document.pendingExposure = Math.max(1, game.document.pendingExposure ?? 0);
      await saveGame(client, game);
      const plays = obs.history.flatMap((t) => t.plays);
      if (obs.trick.length < 4) plays.push(...obs.trick);
      return {
        memory: obs.memory.map((row) => ({
          ...row,
          playedCards: plays.filter((p) => p.card.startsWith(row.suit)).map((p) => p.card),
        })),
        outgoing: obs.pass.outgoing,
        received: obs.pass.incoming,
        history: obs.history,
      };
    });
  }
  async exposure(context: RequestContext, body: ExposureRequest) {
    return ownedTransaction(this.pool, context.token, async (client, player, game) => {
      ownedGame(game, body.gameId);
      return idempotent(client, player.id, body.eventId, { route: 'exposure', body }, async () => {
        if (!game.document.savedAdvice[`${body.decisionId}:${body.displayedLevel}`])
          invalid('Only issued guidance can be marked displayed.');
        return { accepted: true as const };
      });
    });
  }
  async reviews(context: RequestContext): Promise<ReviewIndex> {
    return ownedTransaction(this.pool, context.token, async (_client, _player, game) => {
      requireGame(game);
      return {
        cases: game.document.decisions
          .slice(-1000)
          .map((d) => ({
            decisionId: d.id,
            handNumber: d.handNumber,
            action: d.action,
            assisted: d.assisted,
            status: 'not-assessed',
            summary: 'Your decision and the information available then.',
          })),
      };
    });
  }
  async review(context: RequestContext, id: string): Promise<ReviewView> {
    return ownedTransaction(this.pool, context.token, async (_client, _player, game) => {
      requireGame(game);
      const record = game.document.decisions.find((d) => d.id === id);
      if (!record) throw new ApiFailure(404, 'NOT_FOUND', 'Review is available only for this current game.');
      const start = game.document.frames.findIndex((f) => f.decisionId === id);
      const following =
        start >= 0
          ? game.document.frames.slice(start + 1).filter((f) => f.game.handNumber === record.handNumber)
          : [record.after];
      return {
        decisionId: id,
        label: 'Original',
        liveRevision: game.revision,
        frames: [record.before, ...following].slice(0, 1000),
      };
    });
  }
  async recap(context: RequestContext): Promise<RecapView> {
    return ownedTransaction(this.pool, context.token, async (_client, _player, game) => {
      requireGame(game);
      return {
        handNumber: game.document.state.handNumber,
        result: game.document.state.handResult ?? null,
        assessmentStatus: 'partial',
        message: 'Exact score and help used. Strategy grades are not enabled without independent evidence.',
        stats: game.document.stats,
      };
    });
  }
  async account(context: RequestContext): Promise<AccountView> {
    return ownedTransaction(this.pool, context.token, async (client, player, game) =>
      this.accountView(client, player, game),
    );
  }
  async accountView(client: Transaction, player: PlayerRow, game: GameRow | null): Promise<AccountView> {
    return {
      authMode: 'local-test',
      player: { id: player.id, displayName: player.profile.displayName },
      access: await coachAccess(client, player, game),
      subscription: {
        status: 'local-mock',
        plan: player.profile.plan,
        cancelAtPeriodEnd: player.profile.cancelAtPeriodEnd,
        currentPeriodEnd: player.profile.currentPeriodEnd,
        billingAvailable: false,
      },
      offers: [
        {
          id: 'practice',
          name: 'Practice',
          description: 'Local fixture: four coached hands each UTC day.',
          price: null,
          currency: null,
        },
        {
          id: 'unlimited',
          name: 'Unlimited',
          description: 'Local fixture: unlimited coached hands.',
          price: null,
          currency: null,
        },
        {
          id: 'family',
          name: 'Family',
          description: 'Local fixture: five separate players, including the payer.',
          price: null,
          currency: null,
        },
      ],
    };
  }
  async accountCommand(context: RequestContext, body: AccountCommand) {
    return ownedTransaction(this.pool, context.token, async (client, player, game) =>
      idempotent(client, player.id, body.commandId, { route: 'account', body }, async () => {
        if (body.action === 'select-plan') {
          player.profile.plan = body.plan;
          player.profile.currentPeriodEnd = new Date(Date.now() + 30 * 86400000).toISOString();
          player.profile.cancelAtPeriodEnd = false;
        } else player.profile.cancelAtPeriodEnd = body.action === 'cancel';
        await savePlayer(client, player);
        return this.accountView(client, player, game);
      }),
    );
  }
}
