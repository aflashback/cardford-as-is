import Fastify, { type FastifyRequest, type FastifyReply } from 'fastify';
import cookie from '@fastify/cookie';
import staticFiles from '@fastify/static';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Config } from '../config.ts';
import type { Database } from '../records/database.ts';
import { newIdentity, resolveIdentity, ownedTransaction, hashToken } from '../records/repository.ts';
import { GameService, type RequestContext } from './game-service.ts';
import { ApiFailure } from './errors.ts';
import { assertContract, validateContract } from '../../shared/validation.ts';
import type { ContractName, ContractTypes } from '../../shared/contracts.ts';
import { coachAccess } from './views.ts';
import { previewChange, confirmChange } from '../billing/service.ts';
import { getFamily, mutateFamily } from '../access/family.ts';
import { BillingFailure } from '../billing/store.ts';
import type { Transaction } from '../records/database.ts';
import { exportAccount, deleteLocalAccount } from '../access/account-data.ts';
import { TrialService } from './trial-service.ts';
import { loadDevScenarios } from '../dev-scenarios.ts';

declare module 'fastify' {
  interface FastifyContextConfig {
    accessPolicy?: string;
  }
}

export async function createApp(config: Config, pool: Database) {
  if (config.devScenariosFile && config.appEnv !== 'local' && config.appEnv !== 'test')
    throw new Error('Selected deals require a local or test environment.');
  const scenarios = await loadDevScenarios(config.devScenariosFile);
  const app = Fastify({ logger: false, bodyLimit: 32768, trustProxy: false });
  const policies: Partial<Record<string, string>> = config.spadesPolicy
    ? { 'spades-solo': config.spadesPolicy, 'spades-partners': config.spadesPolicy }
    : {};
  const service = new GameService(pool, { policies }, scenarios);
  const trials = new TrialService(pool, policies);
  app.addHook('onClose', async () => trials.close());
  await app.register(cookie);
  app.addHook('onRoute', (options) => {
    if (options.url.startsWith('/api/') && !options.config?.accessPolicy)
      throw new Error(`Unclassified API route ${options.url}`);
  });
  app.addHook('onRequest', async (request, reply) => {
    reply
      .header('X-Content-Type-Options', 'nosniff')
      .header('Referrer-Policy', 'same-origin')
      .header('X-Frame-Options', 'DENY');
    reply.header(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self' https://checkout.stripe.com",
    );
    const hostname = (request.headers.host ?? '').split(':')[0];
    if (!['127.0.0.1', 'localhost', '[', ''].includes(hostname))
      throw new ApiFailure(403, 'FORBIDDEN', 'Unrecognized local host.');
    if (request.url.startsWith('/api/')) {
      reply.header('Cache-Control', 'no-store');
      const origin = request.headers.origin;
      const allowed = new Set([
        config.origin,
        'http://127.0.0.1:5173',
        'http://localhost:5173',
        `http://localhost:${config.port}`,
      ]);
      if (origin && !allowed.has(origin)) throw new ApiFailure(403, 'FORBIDDEN', 'Origin is not allowed.');
      if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method) && request.headers['x-tricks-client'] !== '1')
        throw new ApiFailure(403, 'FORBIDDEN', 'Missing same-origin request marker.');
    }
  });
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ApiFailure || error instanceof BillingFailure)
      return reply.status(error.status).send({ code: error.code, message: error.message });
    if ((error as { statusCode?: number }).statusCode === 400)
      return reply.status(400).send({ code: 'INVALID_COMMAND', message: 'Malformed request.' });
    return reply.status(503).send({
      code: 'SERVICE_UNAVAILABLE',
      message: 'The server could not complete this request. Your last confirmed table is saved.',
    });
  });
  async function context(
    request: FastifyRequest,
    reply: FastifyReply,
    allowCreate = false,
  ): Promise<RequestContext> {
    let token = request.cookies.tc_session;
    if (!token && allowCreate) {
      token = await newIdentity(pool);
      reply.setCookie('tc_session', token, {
        httpOnly: true,
        sameSite: 'strict',
        path: '/',
        maxAge: 30 * 86400,
        secure: false,
      });
    }
    if (!token || !(await resolveIdentity(pool, token)))
      throw new ApiFailure(401, 'UNAUTHENTICATED', 'Start a local session to continue.');
    const tab = request.headers['x-tricks-tab'];
    if (typeof tab !== 'string' || !/^[a-zA-Z0-9_-]{8,80}$/.test(tab))
      throw new ApiFailure(400, 'INVALID_COMMAND', 'A valid tab identifier is required.');
    return { token, tab };
  }
  async function billingContext(ctx: RequestContext) {
    const playerId = await resolveIdentity(pool, ctx.token);
    if (!playerId) throw new ApiFailure(401, 'UNAUTHENTICATED', 'Session ended.');
    const guard = async (client: Transaction, id: string) => {
      const allowed = await client.query(
        'SELECT 1 FROM sessions WHERE token_hash=$1 AND player_id=$2 AND revoked_at IS NULL AND expires_at>now()',
        [hashToken(ctx.token), id],
      );
      if (!allowed.rowCount) throw new ApiFailure(401, 'UNAUTHENTICATED', 'Session ended.');
    };
    return { playerId, guard };
  }
  function get<N extends ContractName>(
    url: string,
    responseName: N,
    handler: (ctx: RequestContext, request: FastifyRequest) => Promise<ContractTypes[N]>,
    allowCreate = false,
  ) {
    app.get(url, { config: { accessPolicy: 'owned-player' } }, async (request, reply) => {
      const queryName =
        url === '/api/coaching/access'
          ? 'AccessQuery'
          : url === '/api/session/reviews'
            ? 'ReviewQuery'
            : url === '/api/session/reviews/:decisionId'
              ? 'ReviewStepQuery'
              : null;
      if (
        queryName
          ? !validateContract(queryName, request.query)
          : Object.keys(request.query as object).length > 0
      )
        throw new ApiFailure(400, 'INVALID_COMMAND', 'Unexpected query parameters.');
      const result = await handler(await context(request, reply, allowCreate), request);
      assertContract(responseName, result);
      return result;
    });
  }
  function post<B extends ContractName, R extends ContractName>(
    url: string,
    bodyName: B,
    responseName: R,
    handler: (
      ctx: RequestContext,
      body: ContractTypes[B],
      request: FastifyRequest,
    ) => Promise<ContractTypes[R]>,
    method: 'POST' | 'PUT' = 'POST',
  ) {
    app.route({
      method,
      url,
      config: { accessPolicy: 'owned-player' },
      handler: async (request, reply) => {
        if (!validateContract(bodyName, request.body))
          throw new ApiFailure(400, 'INVALID_COMMAND', 'Request does not match the public contract.');
        const result = await handler(await context(request, reply), request.body, request);
        assertContract(responseName, result);
        return result;
      },
    });
  }
  app.get('/api/health', { config: { accessPolicy: 'public-health' } }, async () => {
    await pool.query('SELECT 1');
    return { status: 'ready', mode: 'local', provider: 'off', payments: 'fixture' };
  });
  get('/api/session', 'SessionView', (ctx) => service.session(ctx), true);
  get('/api/dev/scenarios', 'DevScenariosView', async () => ({
    scenarios: scenarios.map(({ metadata }) => ({ ...metadata })),
  }));
  post('/api/sessions', 'NewSessionRequest', 'SessionView', (ctx, body) => service.newSession(ctx, body));
  post('/api/session/control', 'CommandEnvelope', 'SessionView', (ctx, body) => service.control(ctx, body));
  post('/api/session/actions', 'ActionsRequest', 'SessionView', (ctx, body) => service.action(ctx, body));
  post('/api/session/prepare', 'PrepareRequest', 'PrepareView', (ctx, body) => service.prepare(ctx, body));
  post('/api/session/advance', 'AdvanceRequest', 'SessionView', (ctx, body) => service.advance(ctx, body));
  post('/api/session/next-hand', 'NextHandRequest', 'SessionView', (ctx, body) =>
    service.nextHand(ctx, body),
  );
  post(
    '/api/preferences',
    'PreferencesRequest',
    'SessionView',
    (ctx, body) => service.preferences(ctx, body),
    'PUT',
  );
  post('/api/session/advice', 'AdviceRequest', 'AdviceView', (ctx, body) => service.advice(ctx, body));
  post('/api/coaching/hand-unlocks', 'HandUnlockRequest', 'HandUnlockView', (ctx, body) =>
    service.unlock(ctx, body),
  );
  post('/api/session/notes', 'CommandEnvelope', 'NotesView', (ctx, body) => service.notes(ctx, body));
  post('/api/session/exposures', 'ExposureRequest', 'AcceptedView', (ctx, body) =>
    service.exposure(ctx, body),
  );
  get('/api/coaching/access', 'CoachAccess', (ctx, request) =>
    ownedTransaction(pool, ctx.token, (client, player, game) => {
      const handId = (request.query as { handId?: string }).handId;
      if (!handId) return coachAccess(client, player, game);
      const hand = game?.document.frames.find((f) => `${game.id}:${f.game.handNumber}` === handId)?.game
        .handNumber;
      if (hand === undefined)
        throw new ApiFailure(404, 'NOT_FOUND', 'That hand is not in this current game.');
      return coachAccess(client, player, game, hand);
    }),
  );
  get('/api/session/recap', 'RecapView', (ctx) => service.recap(ctx));
  get('/api/session/reviews', 'ReviewIndex', (ctx) => service.reviews(ctx));
  get('/api/session/reviews/:decisionId', 'ReviewView', (ctx, request) =>
    service.review(ctx, (request.params as { decisionId: string }).decisionId),
  );
  post('/api/session/reviews/:decisionId/trials', 'TrialRequest', 'ReviewTrial', (ctx, body, request) => {
    if ((request.params as { decisionId: string }).decisionId !== body.decisionId)
      throw new ApiFailure(400, 'INVALID_COMMAND', 'Mismatched review decision.');
    return trials.run(ctx, body);
  });
  get('/api/account', 'AccountView', (ctx) => service.account(ctx), true);
  get('/api/account/export', 'ExportView', async (ctx) => {
    const auth = await billingContext(ctx);
    return exportAccount(pool, auth.playerId, auth.guard);
  });
  post('/api/account/delete', 'AccountDeleteRequest', 'AccountDeleteView', async (ctx, body) => {
    const auth = await billingContext(ctx);
    return deleteLocalAccount(pool, auth.playerId, body, auth.guard);
  });
  post('/api/account', 'AccountCommand', 'AccountView', async () => {
    throw new ApiFailure(400, 'INVALID_COMMAND', 'Preview and confirm subscription changes from Account.');
  });
  post('/api/subscription/preview', 'BillingPreviewRequest', 'BillingPreview', async (ctx, body) => {
    const auth = await billingContext(ctx);
    return previewChange(pool, auth.playerId, body, auth.guard);
  });
  post('/api/subscription/change', 'BillingConfirmRequest', 'BillingOperation', async (ctx, body) => {
    const auth = await billingContext(ctx);
    return confirmChange(pool, auth.playerId, body, auth.guard);
  });
  get('/api/family', 'FamilyView', async (ctx) => {
    const auth = await billingContext(ctx);
    return getFamily(pool, auth.playerId, auth.guard);
  });
  post('/api/family', 'FamilyCommand', 'FamilyView', async (ctx, body) => {
    const auth = await billingContext(ctx);
    return mutateFamily(pool, auth.playerId, body, auth.guard);
  });
  app.post('/api/local/session', { config: { accessPolicy: 'local-entry' } }, async (_request, reply) => {
    const token = await newIdentity(pool);
    reply.setCookie('tc_session', token, {
      httpOnly: true,
      sameSite: 'strict',
      path: '/',
      maxAge: 30 * 86400,
      secure: false,
    });
    return { accepted: true };
  });
  app.post('/api/logout', { config: { accessPolicy: 'owned-player' } }, async (request, reply) => {
    const ctx = await context(request, reply);
    await ownedTransaction(pool, ctx.token, async (client) => {
      await client.query('UPDATE sessions SET revoked_at=now() WHERE token_hash=$1', [hashToken(ctx.token)]);
    });
    reply.clearCookie('tc_session', { path: '/' });
    return { accepted: true };
  });
  const dist = fileURLToPath(new URL('../../dist/', import.meta.url));
  if (existsSync(dist)) await app.register(staticFiles, { root: dist, prefix: '/', index: ['index.html'] });
  app.setNotFoundHandler((request, reply) => {
    if (request.url.startsWith('/api/'))
      return reply.status(404).send({ code: 'NOT_FOUND', message: 'Route not found.' });
    if (existsSync(dist)) return reply.sendFile('index.html');
    return reply.status(404).send('Build the web app first.');
  });
  return app;
}
