import { randomUUID, randomBytes } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import {
  createGame,
  apply,
  collectTrick,
  nextHand,
  type Four,
  type Card,
  type GameAction as DomainAction,
} from '../game/index.ts';
import { observe, assertObservation, type SeatObservation } from '../observations/index.ts';
import {
  analyzeDecision,
  costOf,
  getReasoningPack,
  getReasoningProfile,
  getLegacyReasoningProfile,
  readSavedAnalysis,
  type DecisionAnalysis,
} from '../strategy/index.ts';
import { explain } from '../coaching/templates.ts';
import { projectAdvice } from '../coaching/project.ts';
import { shuffledDeck, randomDealer } from '../game-deal.ts';
import type { DevScenarioDeal } from '../dev-scenarios.ts';
import { ownedTransaction, idempotent, readCommand, saveGame, savePlayer } from '../records/repository.ts';
import type { Database, Transaction } from '../records/database.ts';
import { validateStoredGameState } from '../records/state-validation.ts';
import type { GameRow, PlayerRow, SavedDecisionAnalysis, ReasoningPolicyPin, PreparedBotDecision, BotDecisionAudit } from '../records/types.ts';
import type {
  ActionsRequest,
  AdviceRequest,
  AdviceView,
  AdvanceRequest,
  CommandEnvelope,
  ExposureRequest,
  HandUnlockRequest,
  HandUnlockView,
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
  SessionView,
} from '../../shared/contracts.ts';
import { ApiFailure, invalid } from './errors.ts';
import { coachAccess, decisionId, observationView, publicAction, sessionView } from './views.ts';

export interface RequestContext {
  token: string;
  tab: string;
}
/** A named policy per mode. A mode without an entry uses the live default. */
export interface StrategyOptions {
  policies?: Partial<Record<string, string>>;
  /** Test seam: observes every analysis call. Production uses the registered packs. */
  analyze?: (observation: SeatObservation, policyVersion: string | undefined) => DecisionAnalysis;
  /** Test seam for cross-instance interruption between admission and computation. */
  beforePrepare?: () => Promise<void>;
}
/** Resolve only future execution. Existing saved analyses and advice remain untouched. */
export function resolveGamePolicy(game: GameRow): string {
  let pin = game.document.reasoningPolicy;
  if (pin === undefined) {
    const versions = new Set<string>();
    for (const saved of Object.values(game.document.decisionAnalyses ?? {})) {
      if (typeof saved.analysis?.policyVersion === 'string') versions.add(saved.analysis.policyVersion);
      if (typeof saved.adviceSnapshot?.policyVersion === 'string') versions.add(saved.adviceSnapshot.policyVersion);
    }
    for (const saved of Object.values(game.document.savedAdvice ?? {}))
      if (typeof saved.policyVersion === 'string') versions.add(saved.policyVersion);
    for (const audit of Object.values(game.document.botDecisionAudits ?? {}))
      if (audit.policyVersion !== null) versions.add(audit.policyVersion);
    if (versions.size > 1)
      throw new ApiFailure(409, 'INVALID_COMMAND', 'Legacy policy evidence is ambiguous; the original history is preserved.');
    const version = [...versions][0];
    let legacyDefault: string;
    try { legacyDefault = getLegacyReasoningProfile(game.document.state.mode).policyVersion; }
    catch { throw new ApiFailure(409, 'INVALID_COMMAND', 'The historical policy for this game is unavailable.'); }
    pin = { policyVersion: version ?? legacyDefault, attribution: version ? 'legacy-saved-analysis' : 'legacy-default' };
  }
  if (!pin || typeof pin.policyVersion !== 'string' ||
    !['new-session', 'legacy-saved-analysis', 'legacy-default'].includes(pin.attribution))
    throw new ApiFailure(409, 'INVALID_COMMAND', 'The recorded policy pin is invalid.');
  try { getReasoningProfile(pin.policyVersion, game.document.state.mode); }
  catch { throw new ApiFailure(409, 'INVALID_COMMAND', 'The recorded policy is unavailable; the original history is preserved.'); }
  game.document.reasoningPolicy ??= pin;
  return pin.policyVersion;
}
class Strategy {
  readonly policies: Partial<Record<string, string>>;
  readonly run: NonNullable<StrategyOptions['analyze']>;
  constructor(options: StrategyOptions = {}) {
    this.policies = { ...options.policies };
    for (const [mode, policy] of Object.entries(this.policies))
      if (policy !== undefined) getReasoningProfile(policy, mode);
    this.run = options.analyze ?? analyzeDecision;
  }
  policyFor(mode: string): string | undefined {
    return this.policies[mode];
  }
  /** STRAT-12: bounded-search analysis is never computed while a transaction is open. */
  inline(mode: string, policy = this.policyFor(mode)): boolean {
    return costOf(policy ? getReasoningProfile(policy, mode) : getReasoningPack(mode)) === 'inline';
  }
  newPin(mode: string): ReasoningPolicyPin {
    return { policyVersion: this.policyFor(mode) ?? getReasoningPack(mode).policyVersion, attribution: 'new-session' };
  }
  policyForGame(game: GameRow): string {
    return resolveGamePolicy(game);
  }
  analyze(observation: SeatObservation, policy = this.policyFor(observation.mode)): DecisionAnalysis {
    return this.run(structuredClone(observation), policy);
  }
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
/** Freeze a human decision without issuing guidance or consuming a coached hand. */
function ensureHumanAnalysis(
  game: GameRow,
  strategy: Strategy,
  obs = observe(game.document.state, 0),
): SavedDecisionAnalysis | undefined {
  const policy = strategy.policyForGame(game);
  if (!obs.legalActions.length) return undefined;
  const id = decisionId(game);
  const saved = game.document.decisionAnalyses?.[id];
  if (saved) return saved;
  // Inside a transaction only inline analysis may run; searched analysis is frozen separately.
  if (!strategy.inline(obs.mode, policy)) return undefined;
  const analysis = strategy.analyze(obs, policy);
  validateOriginalAnalysis(obs, analysis, policy);
  const result = { analysis, adviceSnapshot: explain(obs, analysis) };
  (game.document.decisionAnalyses ??= {})[id] = result;
  return result;
}
function validateOriginalAnalysis(observation: SeatObservation, analysis: DecisionAnalysis, policy: string): void {
  assertObservation(observation);
  if (!readSavedAnalysis(analysis) || analysis.policyVersion !== policy ||
      !observation.legalActions.some(action => isDeepStrictEqual(action, analysis.action)) ||
      analysis.action.seat !== observation.seat ||
      analysis.provenance !== (observation.legalActions.length === 1 ? 'forced' : 'code'))
    invalid('Original analysis does not match this legal decision and policy.');
}
function botAudit(game: GameRow, prepared: PreparedBotDecision | null, action: DomainAction): BotDecisionAudit {
  return {
    schemaVersion: '1.0.0', decisionId: decisionId(game), revision: game.revision,
    handNumber: game.document.state.handNumber, seat: action.seat, action: structuredClone(action),
    policyVersion: prepared?.policyVersion ?? null,
    originalAnalysis: prepared ? 'available' : 'unavailable-legacy-job',
    observation: prepared ? structuredClone(prepared.observation) : null,
    analysis: prepared ? structuredClone(prepared.analysis) : null,
  };
}
/** Strict private job reader. Old bid/play jobs retain an explicit absence of original analysis. */
function readBotJob(value: unknown, game: GameRow, strategy: Strategy): { action: Exclude<DomainAction, { kind: 'pass' }>; prepared: PreparedBotDecision | null } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid('Invalid computer decision.');
  const row = value as Record<string, unknown>;
  let prepared: PreparedBotDecision | null = null;
  let action: unknown = value;
  if (row.kind === 'bot-decision') {
    const keys = ['kind', 'schemaVersion', 'decisionId', 'revision', 'seat', 'policyVersion', 'action', 'observation', 'analysis'];
    if (Object.keys(row).length !== keys.length || keys.some(key => !Object.hasOwn(row, key)) || row.schemaVersion !== '1.0.0')
      invalid('Invalid prepared computer decision envelope.');
    prepared = row as unknown as PreparedBotDecision;
    if (prepared.decisionId !== decisionId(game) || prepared.revision !== game.revision ||
        prepared.seat !== game.document.state.turn || prepared.policyVersion !== strategy.policyForGame(game))
      invalid('Prepared computer decision does not match this revision, seat and policy.');
    const current = observe(game.document.state, prepared.seat);
    assertObservation(prepared.observation);
    if (!isDeepStrictEqual(prepared.observation, current)) invalid('Prepared observation does not match this decision.');
    validateOriginalAnalysis(prepared.observation, prepared.analysis, prepared.policyVersion);
    if (!isDeepStrictEqual(prepared.action, prepared.analysis.action)) invalid('Prepared action does not match its original analysis.');
    action = prepared.action;
  }
  const currentSeat = game.document.state.turn;
  if (currentSeat === null || currentSeat === 0 || !['bid', 'play'].includes(game.document.state.phase))
    invalid('Invalid computer decision.');
  const legal = observe(game.document.state, currentSeat).legalActions.find(candidate => isDeepStrictEqual(candidate, action));
  if (!legal || legal.kind === 'pass') invalid('Invalid computer decision.');
  return { action: legal, prepared };
}
async function persistAdvance(client: Transaction, game: GameRow, event: unknown, strategy: Strategy, save = true) {
  game.revision++;
  ensureHumanAnalysis(game, strategy);
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
  if (save) await saveGame(client, game);
}
async function insertGame(
  client: Transaction,
  player: PlayerRow,
  mode: NewSessionRequest['mode'],
  tab: string,
  strategy: Strategy,
  scenario?: DevScenarioDeal,
): Promise<GameRow> {
  const id = randomUUID();
  const deck = scenario ? [...scenario.deck] : shuffledDeck();
  const game: GameRow = {
    id,
    player_id: player.id,
    revision: 0,
    document: {
      reasoningPolicy: strategy.newPin(mode),
      botDecisionAudits: {},
      tableType: 'practice-bots',
      decisionAnalyses: {},
      state: createGame({ id, mode, dealer: scenario?.dealer ?? randomDealer() }, deck),
      ...(scenario
        ? { openingScenario: { metadata: { ...scenario.metadata }, dealer: scenario.dealer } }
        : {}),
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
  ensureHumanAnalysis(game, strategy);
  game.document.frames.push(frame(game));
  validateStoredGameState(game);
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
  readonly strategy: Strategy;
  readonly scenarios: readonly DevScenarioDeal[];
  readonly beforePrepare: StrategyOptions['beforePrepare'];
  constructor(pool: Database, options: StrategyOptions = {}, scenarios: readonly DevScenarioDeal[] = []) {
    this.pool = pool;
    this.strategy = new Strategy(options);
    this.scenarios = structuredClone(scenarios);
    this.beforePrepare = options.beforePrepare;
  }
  /**
   * STRAT-12: read the pending human decision, analyse it with no transaction open, then
   * commit against the same decision identity. A decision that moved on is discarded.
   */
  private async freezeAnalysis(token: string): Promise<void> {
    const pending = await ownedTransaction(this.pool, token, async (client, _player, game) => {
      if (!game) return null;
      const unpinned = game.document.reasoningPolicy === undefined;
      const policy = this.strategy.policyForGame(game);
      if (unpinned) await saveGame(client, game);
      const id = decisionId(game);
      if (game.document.decisionAnalyses?.[id]) return null;
      const observation = observe(game.document.state, 0);
      if (!observation.legalActions.length || this.strategy.inline(observation.mode, policy)) return null;
      return { gameId: game.id, id, observation, policy };
    });
    if (!pending) return;
    const analysis = this.strategy.analyze(pending.observation, pending.policy);
    validateOriginalAnalysis(pending.observation, analysis, pending.policy);
    const result = { analysis, adviceSnapshot: explain(pending.observation, analysis) };
    await ownedTransaction(this.pool, token, async (client, _player, game) => {
      if (!game || game.id !== pending.gameId || decisionId(game) !== pending.id || this.strategy.policyForGame(game) !== pending.policy) return;
      if (game.document.decisionAnalyses?.[pending.id]) return;
      (game.document.decisionAnalyses ??= {})[pending.id] = result;
      await saveGame(client, game);
    });
  }
  private async frozen<T>(token: string, work: () => Promise<T>, before = false): Promise<T> {
    if (before) await this.freezeAnalysis(token);
    const result = await work();
    await this.freezeAnalysis(token);
    return result;
  }
  async session(context: RequestContext) {
    return this.frozen(context.token, () =>
      ownedTransaction(this.pool, context.token, async (client, player, existing) => {
        const game =
          existing ?? (await insertGame(client, player, 'spades-partners', context.tab, this.strategy));
        if (existing) {
          const unpinned = game.document.reasoningPolicy === undefined;
          const missing = !game.document.decisionAnalyses?.[decisionId(game)];
          const result = ensureHumanAnalysis(game, this.strategy);
          if (unpinned || (missing && result)) await saveGame(client, game);
        }
        return sessionView(client, player, game, context.tab);
      }),
    );
  }
  async newSession(context: RequestContext, body: NewSessionRequest) {
    const accepted = await this.accepted<SessionView>(context, body.commandId, { route: 'sessions', body });
    if (accepted) return accepted.response;
    return this.frozen(context.token, () => this.replaceSession(context, body));
  }
  private async replaceSession(context: RequestContext, body: NewSessionRequest) {
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
        let scenario: DevScenarioDeal | undefined;
        if (body.scenarioId !== undefined || body.replayScenario) {
          if (!this.scenarios.length)
            throw new ApiFailure(403, 'FORBIDDEN', 'Selected deals are disabled on this server.');
          if (body.replayScenario) {
            if (!game?.document.openingScenario || game.document.state.handNumber !== 1)
              throw new ApiFailure(
                400,
                'INVALID_COMMAND',
                'Choose a selected opening deal before replaying it.',
              );
            scenario = {
              metadata: { ...game.document.openingScenario.metadata },
              dealer: game.document.openingScenario.dealer,
              deck: [...game.document.deals[0]],
            };
          } else scenario = this.scenarios.find((item) => item.metadata.id === body.scenarioId);
          if (!scenario || scenario.metadata.mode !== body.mode)
            throw new ApiFailure(400, 'INVALID_COMMAND', 'Choose a listed deal for the selected game.');
        }
        const next = await insertGame(client, player, body.mode, context.tab, this.strategy, scenario);
        return sessionView(client, player, next, context.tab);
      }),
    );
  }
  async control(context: RequestContext, body: CommandEnvelope) {
    const accepted = await this.accepted<SessionView>(context, body.commandId, { route: 'control', body, tab: context.tab });
    if (accepted) return accepted.response;
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
    const accepted = await this.accepted<SessionView>(context, body.commandId, { route: 'action', body });
    if (accepted) return accepted.response;
    return this.frozen(context.token, async () => {
      const passes = body.action.kind === 'pass' ? await this.preparePasses(context, body) : null;
      return this.applyAction(context, body, passes);
    }, true);
  }
  /** Sealed bot choices use their own original observations and run before the commit transaction. */
  private async preparePasses(context: RequestContext, body: ActionsRequest): Promise<{ choices: PreparedBotDecision[]; accessGeneration: number } | null> {
    const snapshots = await ownedTransaction(this.pool, context.token, async (client, player, game) => {
      ownedGame(game, body.gameId);
      // An already accepted pass is replayed by the normal idempotency reader below.
      if (game.document.state.phase !== 'pass') return null;
      await requireCoverage(client, player, game);
      if ((await client.query('SELECT 1 FROM commands WHERE player_id=$1 AND command_id=$2', [player.id, body.commandId])).rowCount) {
        // Validate the original digest before any new pass preparation or revision/lease check.
        await idempotent(client, player.id, body.commandId, { route: 'action', body }, async () => {
          invalid('The accepted action command is unavailable.');
        });
        return null;
      }
      revision(game, body, context.tab);
      const unpinned = game.document.reasoningPolicy === undefined;
      const policyVersion = this.strategy.policyForGame(game);
      if (unpinned) await saveGame(client, game);
      return { accessGeneration: player.access_generation, choices: ([1, 2, 3] as const).map(seat => ({
        kind: 'bot-decision' as const, schemaVersion: '1.0.0' as const,
        decisionId: `${decisionId(game)}:pass:${seat}`, revision: game.revision, seat, policyVersion,
        observation: observe(game.document.state, seat),
      })) };
    });
    if (!snapshots) return null;
    await this.beforePrepare?.();
    return { accessGeneration: snapshots.accessGeneration, choices: snapshots.choices.map(snapshot => {
      const analysis = this.strategy.analyze(snapshot.observation, snapshot.policyVersion);
      validateOriginalAnalysis(snapshot.observation, analysis, snapshot.policyVersion);
      return { ...snapshot, analysis, action: structuredClone(analysis.action) };
    }) };
  }
  private async applyAction(context: RequestContext, body: ActionsRequest, preparedPasses: { choices: PreparedBotDecision[]; accessGeneration: number } | null) {
    return this.change(context, body, 'action', async (client, player, game) => {
      const before = frame(game, body.action),
        obs = observe(game.document.state, 0),
        id = decisionId(game);
      ensureHumanAnalysis(game, this.strategy, obs);
      let accepted: Parameters<typeof apply>[1];
      const passAudits: BotDecisionAudit[] = [];
      if (body.action.kind === 'pass') {
        if (preparedPasses?.accessGeneration !== player.access_generation)
          throw new ApiFailure(409, 'STALE_REVISION', 'Access changed while preparing passes. Retry this decision.');
        const passes: Four<Card[]> = [body.action.cards, [], [], []];
        for (const seat of [1, 2, 3] as const) {
          const prepared = preparedPasses.choices.find(choice => choice.seat === seat);
          if (!prepared || prepared.decisionId !== `${id}:pass:${seat}` || prepared.revision !== game.revision ||
            prepared.policyVersion !== this.strategy.policyForGame(game) ||
            !isDeepStrictEqual(prepared.observation, observe(game.document.state, seat)) ||
            !isDeepStrictEqual(prepared.action, prepared.analysis.action)) invalid('The prepared pass no longer matches this decision.');
          const action = prepared.action;
          if (action.kind !== 'pass') invalid('Not a passing phase.');
          passes[seat] = action.cards;
          if (game.document.botDecisionAudits?.[prepared.decisionId]) invalid('This computer decision was already recorded.');
          passAudits.push({ ...botAudit(game, prepared, action), decisionId: prepared.decisionId });
        }
        accepted = { kind: 'pass-bundle', passes };
      } else accepted = { ...body.action, seat: 0 };
      try {
        game.document.state = apply(game.document.state, accepted);
      } catch {
        invalid('That action is not legal in the current position.');
      }
      game.document.actions.push({ kind: 'action', action: accepted });
      for (const audit of passAudits) (game.document.botDecisionAudits ??= {})[audit.decisionId] = audit;
      const level = Math.max(game.document.exposure[id] ?? 0, game.document.pendingExposure ?? 0);
      game.document.pendingExposure = 0;
      if (obs.legalActions.length > 1) {
        game.document.stats.decisions++;
        if (level > 0) game.document.stats.helped++;
        if (level >= 3) game.document.stats.suggestions++;
      }
      await persistAdvance(client, game, { kind: 'action', action: accepted }, this.strategy, false);
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
    const accepted = await this.accepted<T>(context, body.commandId, { route, body });
    if (accepted) return accepted.response;
    return ownedTransaction(this.pool, context.token, async (client, player, game) => {
      return idempotent(client, player.id, body.commandId, { route, body }, async () => {
        ownedGame(game, body.gameId);
        await requireCoverage(client, player, game);
        revision(game, body, context.tab);
        return operation(client, player, game);
      });
    });
  }
  private accepted<T>(context: RequestContext, commandId: string, body: unknown) {
    return ownedTransaction(this.pool, context.token, (client, player) =>
      readCommand<T>(client, player.id, commandId, body), { loadGame: false });
  }
  async prepare(context: RequestContext, body: PrepareRequest): Promise<PrepareView> {
    const accepted = await this.accepted<PrepareView>(context, body.commandId, { route: 'prepare', body });
    if (accepted) return accepted.response;
    const admitted = await ownedTransaction(this.pool, context.token, async (client, player, game) => {
      const accepted = await readCommand<PrepareView>(client, player.id, body.commandId, { route: 'prepare', body });
      if (accepted) return { cached: accepted.response };
      ownedGame(game, body.gameId);
      await requireCoverage(client, player, game);
      revision(game, body, context.tab);
      const state = game.document.state;
      if (state.turn === null || state.turn === 0 || !['bid', 'play'].includes(state.phase))
        invalid('No computer decision to prepare.');
      const unpinned = game.document.reasoningPolicy === undefined;
      const policyVersion = this.strategy.policyForGame(game);
      if (unpinned) await saveGame(client, game);
      const existing = (await client.query<{
        id: string; result: unknown; access_generation: number; usable: boolean; control_token: string | null;
      }>(`SELECT j.id,j.result,j.access_generation,
          j.status='ready' AND j.expires_at>clock_timestamp() AS usable,a.control_token
        FROM jobs j LEFT JOIN preparation_attempts a ON a.id=j.id
        WHERE j.game_id=$1 AND j.revision=$2 AND j.player_id=$3`,
      [game.id, game.revision, player.id])).rows[0];
      if (existing?.usable && existing.access_generation === player.access_generation &&
          (existing.control_token === null || existing.control_token === game.document.control.token)) {
        const { prepared } = readBotJob(existing.result, game, this.strategy);
        const response: PrepareView = { preparedDecisionId: existing.id, decisionId: decisionId(game),
          revision: game.revision, source: prepared?.analysis.provenance === 'forced' ||
            (!prepared && observe(state, state.turn).legalActions.length === 1) ? 'forced' : 'code' };
        return { cached: await idempotent(client, player.id, body.commandId, { route: 'prepare', body }, async () => response) };
      }
      await client.query(`UPDATE preparation_attempts SET status='rejected'
        WHERE game_id=$1 AND revision=$2 AND status='computing'
          AND (expires_at<=clock_timestamp() OR access_generation<>$3 OR control_token<>$4)`,
      [game.id, game.revision, player.access_generation, game.document.control.token]);
      if ((await client.query(`SELECT 1 FROM preparation_attempts
        WHERE game_id=$1 AND revision=$2 AND status='computing'`, [game.id, game.revision])).rowCount)
        throw new ApiFailure(503, 'SERVICE_UNAVAILABLE', 'This decision is being prepared. Retry the same request.');
      const attemptId = randomUUID();
      await client.query(`INSERT INTO preparation_attempts
        (id,player_id,game_id,revision,access_generation,control_token,status,expires_at)
        VALUES($1,$2,$3,$4,$5,$6,'computing',clock_timestamp()+interval '30 seconds')`,
      [attemptId, player.id, game.id, game.revision, player.access_generation, game.document.control.token]);
      return { snapshot: { observation: observe(state, state.turn), policyVersion, decisionId: decisionId(game),
        revision: game.revision, seat: state.turn }, attemptId, accessGeneration: player.access_generation };
    });
    if (admitted.cached !== undefined) return admitted.cached;
    const { snapshot, attemptId, accessGeneration } = admitted;
    // Computer decisions are always computed with no transaction open.
    try {
      await this.beforePrepare?.();
      const analysis = this.strategy.analyze(snapshot.observation, snapshot.policyVersion);
      validateOriginalAnalysis(snapshot.observation, analysis, snapshot.policyVersion);
      const result: PreparedBotDecision = { kind: 'bot-decision', schemaVersion: '1.0.0', ...snapshot,
        action: structuredClone(analysis.action), analysis };
      return await this.change(context, body, 'prepare', async (client, player, game) => {
        if (player.access_generation !== accessGeneration)
          throw new ApiFailure(409, 'STALE_REVISION', 'Access changed during preparation. Prepare this decision again.');
        if (this.strategy.policyForGame(game) !== snapshot.policyVersion || decisionId(game) !== snapshot.decisionId ||
            !isDeepStrictEqual(observe(game.document.state, snapshot.seat), snapshot.observation))
          invalid('The decision or recorded policy changed during preparation.');
        const published = await client.query(`UPDATE preparation_attempts
          SET status='ready',result=$2,expires_at=clock_timestamp()+interval '10 minutes'
          WHERE id=$1 AND status='computing' AND expires_at>clock_timestamp() RETURNING expires_at`, [attemptId, result]);
        if (!published.rowCount)
          throw new ApiFailure(409, 'STALE_REVISION', 'This preparation expired. Prepare this decision again.');
        // Preserve legacy issued jobs before moving the unique current-decision pointer.
        await client.query(`INSERT INTO preparation_attempts
          (id,player_id,game_id,revision,access_generation,status,result,expires_at)
          SELECT id,player_id,game_id,revision,access_generation,'ready',result,expires_at FROM jobs
          WHERE game_id=$1 AND revision=$2 ON CONFLICT(id) DO NOTHING`, [game.id, game.revision]);
        await client.query(`INSERT INTO jobs(id,player_id,game_id,revision,access_generation,status,result,expires_at)
          VALUES($1,$2,$3,$4,$5,'ready',$6,$7) ON CONFLICT(game_id,revision) DO UPDATE
          SET id=EXCLUDED.id,result=EXCLUDED.result,status='ready',expires_at=EXCLUDED.expires_at,
            access_generation=EXCLUDED.access_generation`,
        [attemptId, player.id, game.id, game.revision, accessGeneration, result, published.rows[0].expires_at]);
        return { preparedDecisionId: attemptId, decisionId: snapshot.decisionId, revision: snapshot.revision,
          source: snapshot.observation.legalActions.length === 1 ? 'forced' as const : 'code' as const };
      });
    } catch (error) {
      await this.pool.query("UPDATE preparation_attempts SET status='rejected' WHERE id=$1 AND status='computing'", [attemptId]);
      throw error;
    }
  }
  async advance(context: RequestContext, body: AdvanceRequest) {
    const accepted = await this.accepted<SessionView>(context, body.commandId, { route: 'advance', body });
    if (accepted) return accepted.response;
    return this.frozen(context.token, () => this.applyAdvance(context, body));
  }
  private async applyAdvance(context: RequestContext, body: AdvanceRequest) {
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
          await client.query<{ result: unknown; access_generation: number; control_token: string | null }>(
            `SELECT j.result,j.access_generation,a.control_token FROM jobs j
              LEFT JOIN preparation_attempts a ON a.id=j.id
              WHERE j.id=$1 AND j.player_id=$2 AND j.game_id=$3 AND j.revision=$4 AND j.status='ready' AND j.expires_at>clock_timestamp()`,
            [body.preparedDecisionId, player.id, game.id, game.revision],
          )
        ).rows[0];
        if (!job || job.access_generation !== player.access_generation ||
            (job.control_token !== null && job.control_token !== game.document.control.token))
          throw new ApiFailure(409, 'STALE_REVISION', 'Prepare this decision again.');
        const { action, prepared } = readBotJob(job.result, game, this.strategy);
        const audit = botAudit(game, prepared, action);
        if (game.document.botDecisionAudits?.[audit.decisionId]) invalid('This computer decision already has a committed audit.');
        game.document.state = apply(game.document.state, action);
        game.document.actions.push({ kind: 'action', action });
        (game.document.botDecisionAudits ??= {})[audit.decisionId] = audit;
        await client.query("UPDATE jobs SET status='accepted' WHERE id=$1", [body.preparedDecisionId]);
      }
      await persistAdvance(client, game, { kind: body.kind }, this.strategy);
      return sessionView(client, player, game, context.tab);
    });
  }
  async nextHand(context: RequestContext, body: CommandEnvelope) {
    const accepted = await this.accepted<SessionView>(context, body.commandId, { route: 'next-hand', body });
    if (accepted) return accepted.response;
    return this.frozen(context.token, () => this.applyNextHand(context, body));
  }
  private async applyNextHand(context: RequestContext, body: CommandEnvelope) {
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
      await persistAdvance(client, game, { kind: 'next-hand', deck }, this.strategy);
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
    const id = source?.id ?? decisionId(game);
    const issued = game.document.savedAdvice[`${id}:${requestedLevel}`];
    if (issued) return issued;
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
    const saved = game.document.decisionAnalyses?.[id];
    if (source && !saved)
      throw new ApiFailure(
        409,
        'INVALID_COMMAND',
        'Original decision analysis is unavailable for this legacy decision.',
      );
    const frozenAdvice =
      saved?.adviceSnapshot ?? ensureHumanAnalysis(game, this.strategy, obs)?.adviceSnapshot;
    if (!frozenAdvice && obs.legalActions.length && !this.strategy.inline(obs.mode, this.strategy.policyForGame(game)))
      throw new ApiFailure(409, 'STALE_REVISION', 'The table changed. Refresh the confirmed position.');
    const advice = frozenAdvice ?? explain(obs);
    // COACH-14: one projection decides what each help level may show.
    const view: AdviceView = projectAdvice(advice, requestedLevel, id);
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
    const accepted = await this.accepted<AdviceView>(context, body.commandId, { route: 'advice', body });
    if (accepted) return accepted.response;
    await this.freezeAnalysis(context.token);
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
    const accepted = await this.accepted<HandUnlockView>(context, body.requestId, { route: 'unlock', body: envelope });
    if (accepted) return accepted.response;
    await this.freezeAnalysis(context.token);
    return ownedTransaction(this.pool, context.token, async (client, player, game) => {
      ownedGame(game, body.gameId);
      return idempotent(client, player.id, body.requestId, { route: 'unlock', body: envelope }, async () => {
        const source =
          body.decisionId === decisionId(game)
            ? undefined
            : game.document.decisions.find((d) => d.id === body.decisionId);
        if (body.decisionId !== decisionId(game) && !source)
          throw new ApiFailure(404, 'NOT_FOUND', 'That decision is not in this current game.');
        const handNumber = source?.handNumber ?? game.document.state.handNumber;
        if (body.handId !== `${game.id}:${handNumber}`)
          throw new ApiFailure(409, 'STALE_REVISION', 'That hand changed.');
        const saved = game.document.savedAdvice[`${body.decisionId}:${body.requestedLevel}`];
        if (saved) return { access: await coachAccess(client, player, game, handNumber), advice: saved };
        await requireCoverage(client, player, game);
        revision(game, envelope, context.tab);
        const advice = await this.issueAdvice(client, player, game, body.requestedLevel, true, source);
        return { access: await coachAccess(client, player, game, handNumber), advice };
      });
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
        cases: game.document.decisions.slice(-1000).map((d) => ({
          decisionId: d.id,
          handNumber: d.handNumber,
          action: d.action,
          assisted: d.assisted,
          status: 'not-assessed',
          summary: game.document.decisionAnalyses?.[d.id]
            ? 'Your decision and the information available then.'
            : 'Original decision analysis is unavailable. Your choice and public replay remain available.',
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
