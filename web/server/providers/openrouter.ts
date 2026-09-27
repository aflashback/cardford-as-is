import { assertObservation, type SeatObservation } from '../observations/index.ts';
import { actionId, cardLabel, trickWinner, type GameAction } from '../game/index.ts';
export const JEV_MODEL = 'typesafe/jev-1.13';
export const RESOLVED_MODELS = [JEV_MODEL, 'typesafe/jev-1.13-20260917'] as const;
export const DECISIONS_URL = 'https://openrouter.ai/api/alpha/decisions';
export type Experiment = { id: string; maxRequests: number; maxCostUsd: number };
export type AttemptRecord = { status: string; observedModel: string | null; costUsd: number | null };
export type AttemptDeadline = { deadlineAt: number; signal?: AbortSignal };
export interface AttemptPort {
  reserve(experiment: Experiment, requestedModel: string, deadline?: AttemptDeadline): Promise<string | null>;
  finish(id: string, record: AttemptRecord, deadline?: AttemptDeadline): Promise<void>;
}
export type Usage = { inputTokens: number | null; outputTokens: number | null };
export type ProviderOutcome =
  | { status: 'disabled'; requestedModel: typeof JEV_MODEL; observedModel: null }
  | {
      status: 'bypassed';
      provenance: 'code' | 'forced';
      choice: string;
      requestedModel: typeof JEV_MODEL;
      observedModel: null;
    }
  | {
      status: 'unavailable';
      reason: string;
      requestedModel: typeof JEV_MODEL;
      observedModel: string | null;
      costUsd: number | null;
    }
  | {
      status: 'selected';
      application: 'shadow-only';
      choice: string;
      probabilities: Record<string, number>;
      confidence: number;
      requestedModel: typeof JEV_MODEL;
      observedModel: string;
      usage: Usage | null;
      costUsd: number | null;
      requestId: string | null;
      provider: string | null;
    };
export type RequestOptions = {
  observation: SeatObservation;
  candidateIds: string[];
  mode: 'off' | 'shadow';
  experiment: Experiment;
  deadlineAt: number;
  signal?: AbortSignal;
};
export type ProviderDependencies = {
  loadKey: (signal?: AbortSignal) => Promise<string | null>;
  attempts: AttemptPort;
  fetch?: typeof globalThis.fetch;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
};
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
function costOf(body: unknown): number | null {
  return record(body) && record(body.usage) && finite(body.usage.cost) && body.usage.cost >= 0
    ? body.usage.cost
    : null;
}
function observedOf(body: unknown): string | null {
  return record(body) &&
    typeof body.model === 'string' &&
    (RESOLVED_MODELS as readonly string[]).includes(body.model)
    ? body.model
    : null;
}
const unavailable = (
  reason: string,
  costUsd: number | null = null,
  observedModel: string | null = null,
): ProviderOutcome => ({ status: 'unavailable', reason, requestedModel: JEV_MODEL, observedModel, costUsd });
function validateCandidates(obs: SeatObservation, ids: string[]): GameAction[] {
  if (
    !Array.isArray(ids) ||
    !ids.length ||
    ids.length > 255 ||
    new Set(ids).size !== ids.length ||
    ids.some((id) => typeof id !== 'string')
  )
    throw new Error('Invalid provider candidate set.');
  return ids.map((id) => {
    const action = obs.legalActions.find((a) => actionId(a) === id);
    if (!action) throw new Error('Provider candidate is not legal.');
    return action;
  });
}
/** Second allowlist projection: no identity, events, hidden aggregate or caller-authored prompt. */
export function buildDecisionRequest(obs: SeatObservation, candidateIds: string[]) {
  assertObservation(obs);
  const candidates = validateCandidates(obs, candidateIds);
  const describe = (a: GameAction) =>
    a.kind === 'bid'
      ? a.bid === 0
        ? 'Bid ordinary Nil: take no tricks.'
        : `Bid ${a.bid} tricks.`
      : a.kind === 'pass'
        ? `Pass these three cards together: ${a.cards.map(cardLabel).join(', ')}.`
        : `Play ${cardLabel(a.card)}.`;
  const objective =
    obs.mode === 'hearts'
      ? 'Minimize your Hearts penalty score; collecting all 26 instead gives each opponent 26.'
      : obs.mode === 'spades-solo'
        ? 'Maximize your individual score under positive contracts, Nil bonuses and bag penalties.'
        : 'Maximize your partnership score. Partners are opposite seats; protect a live partner Nil even after the positive contract is met.';
  const consequences = candidates.map((action) => ({
    id: actionId(action),
    description: describe(action),
    currentlyWins:
      action.kind === 'play' && obs.trick.length > 0
        ? trickWinner([...obs.trick, { seat: obs.seat, card: action.card }], obs.mode) === obs.seat
        : null,
    completesTrick: action.kind === 'play' && obs.trick.length === 3,
  }));
  return {
    model: JEV_MODEL,
    state: {
      mode: obs.mode,
      ruleProfileId: obs.ruleProfileId,
      seat: obs.seat,
      phase: obs.phase,
      hand: obs.hand.map(cardLabel),
      handSizes: [...obs.handSizes],
      bids: [...obs.bids],
      tricks: [...obs.tricks],
      scores: [...obs.scores],
      bags: [...obs.bags],
      turn: obs.turn,
      dealer: obs.dealer,
      handNumber: obs.handNumber,
      heartsBroken: obs.heartsBroken,
      spadesBroken: obs.spadesBroken,
      trick: obs.trick.map((p) => ({ seat: p.seat, card: cardLabel(p.card) })),
      history: obs.history.map((t) => ({
        winner: t.winner,
        plays: t.plays.map((p) => ({ seat: p.seat, card: cardLabel(p.card) })),
      })),
      passDirection: obs.passDirection,
      ownPass: {
        outgoing: obs.pass.outgoing.map(cardLabel),
        incoming: obs.pass.incoming.map(cardLabel),
        to: obs.pass.to,
        from: obs.pass.from,
      },
      memory: obs.memory.map((m) => ({
        suit: m.suit,
        played: m.played,
        remaining: m.remaining,
        voidSeats: [...m.voidSeats],
      })),
      knownHoldings: obs.knownHoldings.map((h) => ({ seat: h.seat, card: cardLabel(h.card) })),
      objective,
      candidates: consequences,
      limitations:
        'Other hands are unknown. Currently winning an unfinished trick is not a guaranteed win. No outcome probabilities or calibrated estimates are supplied.',
    },
    questions: {
      move: {
        type: 'choice',
        instructions:
          'Select one supplied legal candidate serving the stated objective. Use only the supplied information; do not invent hidden cards. Choice concentration is not a probability of winning.',
        criteria: Object.fromEntries(candidates.map((a) => [actionId(a), describe(a)])),
      },
    },
  };
}
export function validateResult(
  body: unknown,
  candidateIds: string[],
): Extract<ProviderOutcome, { status: 'selected' }> {
  if (
    !record(body) ||
    typeof body.model !== 'string' ||
    !(RESOLVED_MODELS as readonly string[]).includes(body.model) ||
    !record(body.answers) ||
    Object.keys(body.answers).length !== 1 ||
    !record(body.answers.move)
  )
    throw new Error('Invalid provider response.');
  const answer = body.answers.move;
  if (
    answer.type !== 'choice' ||
    typeof answer.choice !== 'string' ||
    !candidateIds.includes(answer.choice) ||
    !record(answer.probabilities) ||
    !finite(answer.confidence) ||
    answer.confidence < 0 ||
    answer.confidence > 1
  )
    throw new Error('Invalid provider response.');
  const keys = Object.keys(answer.probabilities).sort();
  if (JSON.stringify(keys) !== JSON.stringify([...candidateIds].sort()))
    throw new Error('Invalid provider distribution.');
  let sum = 0;
  const probabilities: Record<string, number> = {};
  for (const key of keys) {
    const value = answer.probabilities[key];
    if (!finite(value) || value < 0 || value > 1) throw new Error('Invalid provider probability.');
    probabilities[key] = value;
    sum += value;
  }
  if (
    Math.abs(sum - 1) > 0.02 + Number.EPSILON ||
    probabilities[answer.choice] + 1e-6 < Math.max(...Object.values(probabilities))
  )
    throw new Error('Invalid provider distribution.');
  let usage: Usage | null = null;
  if (body.usage !== undefined) {
    if (!record(body.usage)) throw new Error('Invalid provider usage.');
    for (const key of ['input_tokens', 'output_tokens']) {
      const value = body.usage[key];
      if (value !== undefined && (!Number.isSafeInteger(value) || typeof value !== 'number' || value < 0))
        throw new Error('Invalid provider usage.');
    }
    if (body.usage.cost !== undefined && (!finite(body.usage.cost) || body.usage.cost < 0))
      throw new Error('Invalid provider cost.');
    usage = {
      inputTokens: typeof body.usage.input_tokens === 'number' ? body.usage.input_tokens : null,
      outputTokens: typeof body.usage.output_tokens === 'number' ? body.usage.output_tokens : null,
    };
  }
  for (const key of ['id', 'provider'])
    if (body[key] !== undefined && (typeof body[key] !== 'string' || (body[key] as string).length > 256))
      throw new Error('Invalid provider metadata.');
  return {
    status: 'selected',
    application: 'shadow-only',
    choice: answer.choice,
    probabilities,
    confidence: answer.confidence,
    requestedModel: JEV_MODEL,
    observedModel: body.model,
    usage,
    costUsd: costOf(body),
    requestId: typeof body.id === 'string' ? body.id : null,
    provider: typeof body.provider === 'string' ? body.provider : null,
  };
}
function retryDelay(header: string | null, now: number): number | null {
  if (header === null) return 0;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const date = Date.parse(header);
  return Number.isFinite(date) ? Math.max(0, date - now) : null;
}
/** Late rejection is consumed; callers must fence side effects after a late resolution. */
export async function beforeDeadline<T>(
  work: () => Promise<T>,
  deadline: AttemptDeadline,
  now: () => number = Date.now,
): Promise<T> {
  if (deadline.signal?.aborted || now() >= deadline.deadlineAt) throw new Error('deadline');
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abort: (() => void) | undefined;
  const expired = new Promise<never>((_, reject) => {
    abort = () => reject(new Error('deadline'));
    deadline.signal?.addEventListener('abort', abort, { once: true });
    timer = setTimeout(abort, Math.max(1, deadline.deadlineAt - now()));
  });
  try {
    const result = await Promise.race([
      Promise.resolve().then(() => {
        if (deadline.signal?.aborted || now() >= deadline.deadlineAt) throw new Error('deadline');
        return work();
      }),
      expired,
    ]);
    if (deadline.signal?.aborted || now() >= deadline.deadlineAt) throw new Error('deadline');
    return result;
  } finally {
    clearTimeout(timer);
    if (abort) deadline.signal?.removeEventListener('abort', abort);
  }
}
/** Dispatch only after durable admission. All returned errors are static, redacted categories. */
export async function selectWithJev(
  options: RequestOptions,
  deps: ProviderDependencies,
): Promise<ProviderOutcome> {
  const { observation: obs, experiment } = options;
  assertObservation(obs);
  const candidates = validateCandidates(obs, options.candidateIds);
  if (
    !['off', 'shadow'].includes(options.mode) ||
    !experiment.id ||
    !Number.isInteger(experiment.maxRequests) ||
    experiment.maxRequests < 0 ||
    experiment.maxRequests > 3 ||
    !Number.isFinite(experiment.maxCostUsd) ||
    experiment.maxCostUsd <= 0 ||
    !Number.isFinite(options.deadlineAt)
  )
    throw new Error('Invalid provider experiment.');
  if (options.mode === 'off' || experiment.maxRequests === 0)
    return { status: 'disabled', requestedModel: JEV_MODEL, observedModel: null };
  if (candidates.length === 1)
    return {
      status: 'bypassed',
      provenance: obs.legalActions.length === 1 ? 'forced' : 'code',
      choice: actionId(candidates[0]),
      requestedModel: JEV_MODEL,
      observedModel: null,
    };
  const now = deps.now ?? Date.now,
    fetcher = deps.fetch ?? globalThis.fetch,
    sleep = deps.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const deadline = Math.min(options.deadlineAt, now() + 8000);
  if (options.signal?.aborted || now() >= deadline) return unavailable('deadline');
  const lifetime = new AbortController();
  const abortLifetime = () => lifetime.abort();
  options.signal?.addEventListener('abort', abortLifetime, { once: true });
  const budget = { deadlineAt: deadline, signal: lifetime.signal };
  const expired = () => lifetime.signal.aborted || now() >= deadline;
  const bounded = <T>(work: () => Promise<T>) => beforeDeadline(work, budget, now);
  const lifetimeTimer = setTimeout(abortLifetime, Math.max(1, deadline - now()));
  try {
    let key: string | null;
    try {
      key = await bounded(() => deps.loadKey(lifetime.signal));
    } catch {
      return unavailable(expired() ? 'deadline' : 'credential-unavailable');
    }
    if (!key) return unavailable('credential-unavailable');
    const body = JSON.stringify(buildDecisionRequest(obs, options.candidateIds));
    for (let attempt = 0; attempt < 2; attempt++) {
      if (expired()) return unavailable('deadline');
      let id: string | null;
      try {
        id = await bounded(() => deps.attempts.reserve(experiment, JEV_MODEL, budget));
      } catch {
        return unavailable(expired() ? 'deadline' : 'attempt-storage-unavailable');
      }
      // A reservation that commits after expiry remains pending, with unknown cost. Never dispatch it.
      if (expired()) return unavailable('deadline');
      if (!id) return unavailable('experiment-cap');
      let outcome: ProviderOutcome;
      let response: Response | undefined;
      let raw: unknown;
      try {
        const call = async () => {
          if (expired()) throw new Error('deadline');
          response = await fetcher(DECISIONS_URL, {
            method: 'POST',
            headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
            body,
            signal: lifetime.signal,
            redirect: 'error',
          });
          const text = await response.text();
          if (text.length > 1000000) throw new Error('response-size');
          try {
            raw = JSON.parse(text);
          } catch {
            throw new Error('response-json');
          }
        };
        await bounded(call);
        if (now() >= deadline || lifetime.signal.aborted)
          outcome = unavailable('deadline', costOf(raw), observedOf(raw));
        else if (response!.ok) {
          try {
            outcome = validateResult(raw, options.candidateIds);
          } catch {
            outcome = unavailable('invalid-response', costOf(raw), observedOf(raw));
          }
        } else outcome = unavailable(`http-${response!.status}`, costOf(raw), observedOf(raw));
      } catch {
        outcome = unavailable(expired() ? 'deadline' : 'transport-failure');
      }
      if (outcome.status !== 'selected' && outcome.status !== 'unavailable')
        throw new Error('Unexpected provider outcome.');
      try {
        await bounded(() =>
          deps.attempts.finish(
            id,
            {
              status: outcome.status === 'selected' ? 'selected' : outcome.reason,
              observedModel: outcome.observedModel,
              costUsd: outcome.costUsd,
            },
            budget,
          ),
        );
      } catch {
        return unavailable(expired() ? 'deadline' : 'attempt-storage-unavailable');
      }
      if (outcome.status === 'selected') return outcome;
      const retry =
        attempt === 0 &&
        response &&
        [429, 503].includes(response.status) &&
        outcome.reason === `http-${response.status}` &&
        outcome.costUsd !== null;
      if (!retry) return outcome;
      const delay = retryDelay(response!.headers.get('retry-after'), now());
      if (delay === null || now() + delay >= deadline) return outcome;
      try {
        await bounded(() => sleep(delay));
      } catch {
        return unavailable('deadline');
      }
    }
    return unavailable('attempt-limit');
  } finally {
    clearTimeout(lifetimeTimer);
    options.signal?.removeEventListener('abort', abortLifetime);
    lifetime.abort();
  }
}
