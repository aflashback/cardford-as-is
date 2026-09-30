import { fullDeck } from '../../game/cards.ts';
import { apply, collectTrick, createGame } from '../../game/index.ts';
import type { Seat } from '../../game/kernel/types.ts';
import { analyzeFrozenSpades } from '../../games/spades/reasoning/frozen/spades-tactics-2.1.0/index.ts';
import { observe, type SeatObservation } from '../../observations/index.ts';
import { JEV_MODEL, RESOLVED_MODELS, validateResult } from '../../providers/openrouter.ts';
import { createRandom, shuffled } from '../../strategy/plan/random.ts';
import type { DecisionAnalysis } from '../../strategy/types.ts';
import { buildJ0Payload, buildJ1Payload, type SpadesMode } from './payloads.ts';
import {
  NO_MODEL_OBSERVED,
  registeredAnalysis,
  withForcedBypass,
  type Arm,
  type ModelArmId,
  type SelectorOutcome,
} from './selectors.ts';

/**
 * SG-06: synthetic fixtures. Every response body in this file was written by hand to
 * exercise the response validator. None is a Jev output, none was recorded from a
 * provider, and none carries any strategy. The only live response in this project
 * failed validation and its body was not retained.
 */
export const SYNTHETIC_PROVENANCE = 'synthetic-fixture';
export const SYNTHETIC_LABEL = 'synthetic fixture (authored; not a Jev output)';
export const SYNTHETIC_SELECTOR = `${SYNTHETIC_LABEL}; observed model: ${NO_MODEL_OBSERVED}`;
const BODY_MARK = 'synthetic fixture — authored; not a Jev output';

/** Which part of a response failed. A category names a field, never its content. */
export type FieldCategory =
  | 'envelope'
  | 'model-pin'
  | 'answers-shape'
  | 'answer-type'
  | 'choice'
  | 'probabilities-shape'
  | 'confidence'
  | 'distribution-keys'
  | 'probability-value'
  | 'distribution-total'
  | 'distribution-argmax'
  | 'usage-shape'
  | 'usage-tokens'
  | 'usage-cost'
  | 'metadata';

/** The validator's own static message for each category. The validator is not changed. */
export const VALIDATOR_CLASS: Record<FieldCategory, string> = {
  envelope: 'Invalid provider response.',
  'model-pin': 'Invalid provider response.',
  'answers-shape': 'Invalid provider response.',
  'answer-type': 'Invalid provider response.',
  choice: 'Invalid provider response.',
  'probabilities-shape': 'Invalid provider response.',
  confidence: 'Invalid provider response.',
  'distribution-keys': 'Invalid provider distribution.',
  'probability-value': 'Invalid provider probability.',
  'distribution-total': 'Invalid provider distribution.',
  'distribution-argmax': 'Invalid provider distribution.',
  'usage-shape': 'Invalid provider usage.',
  'usage-tokens': 'Invalid provider usage.',
  'usage-cost': 'Invalid provider cost.',
  metadata: 'Invalid provider metadata.',
};

const FIELD_PATH: Record<FieldCategory, string> = {
  envelope: '(body)',
  'model-pin': 'model',
  'answers-shape': 'answers',
  'answer-type': 'answers.move.type',
  choice: 'answers.move.choice',
  'probabilities-shape': 'answers.move.probabilities',
  confidence: 'answers.move.confidence',
  'distribution-keys': 'answers.move.probabilities (key set)',
  'probability-value': 'answers.move.probabilities (one value)',
  'distribution-total': 'answers.move.probabilities (total)',
  'distribution-argmax': 'answers.move.probabilities (choice is not the largest)',
  'usage-shape': 'usage',
  'usage-tokens': 'usage token counts',
  'usage-cost': 'usage.cost',
  metadata: 'id or provider',
};

export type ResponseDiagnostic = {
  category: FieldCategory;
  field: string;
  validatorClass: string;
  redacted: true;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/**
 * Field-category diagnostic. It follows the validator's checks in the validator's order
 * and reports the first category that fails, or null when every check holds. It returns
 * fixed words only: no value, key or fragment of the inspected body leaves this function.
 * It runs beside the validator and never replaces or relaxes it.
 */
export function diagnoseResponse(body: unknown, candidateIds: readonly string[]): ResponseDiagnostic | null {
  const category = firstFailure(body, candidateIds);
  return category === null
    ? null
    : { category, field: FIELD_PATH[category], validatorClass: VALIDATOR_CLASS[category], redacted: true };
}

function firstFailure(body: unknown, candidateIds: readonly string[]): FieldCategory | null {
  if (!isRecord(body)) return 'envelope';
  if (typeof body.model !== 'string' || !(RESOLVED_MODELS as readonly string[]).includes(body.model))
    return 'model-pin';
  if (!isRecord(body.answers) || Object.keys(body.answers).length !== 1 || !isRecord(body.answers.move))
    return 'answers-shape';
  const answer = body.answers.move;
  if (answer.type !== 'choice') return 'answer-type';
  if (typeof answer.choice !== 'string' || !candidateIds.includes(answer.choice)) return 'choice';
  if (!isRecord(answer.probabilities)) return 'probabilities-shape';
  if (!finite(answer.confidence) || answer.confidence < 0 || answer.confidence > 1) return 'confidence';
  const keys = Object.keys(answer.probabilities).sort();
  if (JSON.stringify(keys) !== JSON.stringify([...candidateIds].sort())) return 'distribution-keys';
  let total = 0;
  let largest = -Infinity;
  for (const key of keys) {
    const value = answer.probabilities[key];
    if (!finite(value) || value < 0 || value > 1) return 'probability-value';
    total += value;
    largest = Math.max(largest, value);
  }
  if (Math.abs(total - 1) > 0.02 + Number.EPSILON) return 'distribution-total';
  if ((answer.probabilities[answer.choice] as number) + 1e-6 < largest) return 'distribution-argmax';
  if (body.usage !== undefined) {
    if (!isRecord(body.usage)) return 'usage-shape';
    for (const key of ['input_tokens', 'output_tokens']) {
      const value = body.usage[key];
      if (value !== undefined && (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0))
        return 'usage-tokens';
    }
    if (body.usage.cost !== undefined && (!finite(body.usage.cost) || body.usage.cost < 0))
      return 'usage-cost';
  }
  for (const key of ['id', 'provider']) {
    const value = body[key];
    if (value !== undefined && (typeof value !== 'string' || value.length > 256)) return 'metadata';
  }
  return null;
}

type SyntheticBody = {
  fixture: string;
  id: string;
  /** The validator requires a pinned name here. It is an authored placeholder, not an observed model. */
  model: string;
  provider: string;
  answers: Record<
    string,
    { type: string; choice: string; probabilities: Record<string, number>; confidence: number }
  >;
  usage?: { input_tokens: number; output_tokens: number; cost: number };
};

/** Names the first candidate in canonical order with a uniform distribution. It carries no strategy. */
function wellFormed(candidateIds: readonly string[]): SyntheticBody {
  if (candidateIds.length < 2) throw new Error('A synthetic response needs at least two candidates.');
  return {
    fixture: BODY_MARK,
    id: 'synthetic-fixture-response',
    model: JEV_MODEL,
    provider: 'none (synthetic fixture)',
    answers: {
      move: {
        type: 'choice',
        choice: candidateIds[0],
        probabilities: Object.fromEntries(candidateIds.map((id) => [id, 1 / candidateIds.length])),
        confidence: 0,
      },
    },
  };
}

export type SyntheticResponse = {
  id: string;
  authored: true;
  description: string;
  expected: 'accepted' | FieldCategory;
  body(candidateIds: readonly string[]): unknown;
};

const broken = (
  id: string,
  expected: FieldCategory,
  description: string,
  change: (body: SyntheticBody, candidateIds: readonly string[]) => unknown,
): SyntheticResponse => ({
  id,
  authored: true,
  description,
  expected,
  body: (candidateIds) => {
    const body = wellFormed(candidateIds);
    return change(body, candidateIds) ?? body;
  },
});

export const WELL_FORMED_RESPONSE: SyntheticResponse = {
  id: 'well-formed',
  authored: true,
  description: 'Well-formed body naming the first candidate in canonical order, uniform distribution.',
  expected: 'accepted',
  body: wellFormed,
};

/** One authored body per failure class of the response validator, plus the well-formed body. */
export const SYNTHETIC_RESPONSES: readonly SyntheticResponse[] = [
  WELL_FORMED_RESPONSE,
  {
    id: 'well-formed-with-usage',
    authored: true,
    description: 'Well-formed body with authored zero usage figures.',
    expected: 'accepted',
    body: (candidateIds) => ({
      ...wellFormed(candidateIds),
      usage: { input_tokens: 0, output_tokens: 0, cost: 0 },
    }),
  },
  broken('envelope-not-object', 'envelope', 'The body is text, not an object.', () => BODY_MARK),
  broken('model-pin-unknown', 'model-pin', 'The model name is outside the pinned list.', (body) => {
    body.model = 'unpinned/placeholder';
  }),
  broken('answers-missing', 'answers-shape', 'The answers object is missing.', (body) => {
    const { answers: _answers, ...rest } = body;
    return rest;
  }),
  broken('answers-extra-question', 'answers-shape', 'A second answer is present.', (body) => {
    body.answers.extra = structuredClone(body.answers.move);
  }),
  broken('answer-not-object', 'answers-shape', 'The answer is text, not an object.', (body) => ({
    ...body,
    answers: { move: BODY_MARK },
  })),
  broken('answer-type-wrong', 'answer-type', 'The answer type is not a choice.', (body) => {
    body.answers.move.type = 'score';
  }),
  broken('choice-outside-candidates', 'choice', 'The choice is not a supplied candidate.', (body) => {
    body.answers.move.choice = 'outside-the-candidate-set';
  }),
  broken('probabilities-not-object', 'probabilities-shape', 'The distribution is a list.', (body, ids) => ({
    ...body,
    answers: { move: { ...body.answers.move, probabilities: ids.map(() => 1 / ids.length) } },
  })),
  broken('confidence-out-of-range', 'confidence', 'The concentration figure is above 1.', (body) => {
    body.answers.move.confidence = 1.5;
  }),
  broken(
    'distribution-missing-candidate',
    'distribution-keys',
    'One candidate has no entry.',
    (body, ids) => {
      delete body.answers.move.probabilities[ids[ids.length - 1]];
    },
  ),
  broken(
    'distribution-extra-candidate',
    'distribution-keys',
    'An unknown candidate has an entry.',
    (body) => {
      body.answers.move.probabilities['outside-the-candidate-set'] = 0;
    },
  ),
  broken('probability-out-of-range', 'probability-value', 'One entry is negative.', (body, ids) => {
    body.answers.move.probabilities[ids[ids.length - 1]] = -0.1;
  }),
  broken('distribution-total-off', 'distribution-total', 'The entries total 1.2.', (body, ids) => {
    for (const id of ids) body.answers.move.probabilities[id] = 1.2 / ids.length;
  }),
  broken(
    'choice-not-most-probable',
    'distribution-argmax',
    'Another candidate has a larger entry.',
    (body, ids) => {
      for (const id of ids) body.answers.move.probabilities[id] = 0.4 / (ids.length - 1);
      body.answers.move.probabilities[ids[ids.length - 1]] = 0.6;
    },
  ),
  broken('usage-not-object', 'usage-shape', 'Usage is a number.', (body) => ({ ...body, usage: 5 })),
  broken('usage-tokens-negative', 'usage-tokens', 'A token count is negative.', (body) => {
    body.usage = { input_tokens: -1, output_tokens: 0, cost: 0 };
  }),
  broken('usage-cost-invalid', 'usage-cost', 'The cost is negative.', (body) => {
    body.usage = { input_tokens: 0, output_tokens: 0, cost: -1 };
  }),
  broken('metadata-too-long', 'metadata', 'The response identifier exceeds 256 characters.', (body) => {
    body.id = 'x'.repeat(300);
  }),
];

export type FixtureCheck = {
  fixtureId: string;
  expected: SyntheticResponse['expected'];
  accepted: boolean;
  /** The validator's static message, or null when it accepted the body. */
  validatorClass: string | null;
  diagnostic: ResponseDiagnostic | null;
};

/** Runs one authored body through the unchanged validator and through the diagnostic. */
export function checkResponse(response: SyntheticResponse, candidateIds: readonly string[]): FixtureCheck {
  const body = response.body(candidateIds);
  let validatorClass: string | null = null;
  try {
    validateResult(body, [...candidateIds]);
  } catch (error) {
    // The validator throws fixed messages only; anything else is reported as unclassified.
    const message = error instanceof Error ? error.message : '';
    validatorClass = Object.values(VALIDATOR_CLASS).includes(message) ? message : 'unclassified';
  }
  return {
    fixtureId: response.id,
    expected: response.expected,
    accepted: validatorClass === null,
    validatorClass,
    diagnostic: diagnoseResponse(body, candidateIds),
  };
}

/**
 * A model arm backed by one authored response. It builds the arm's payload, asks nothing
 * of anyone, and validates the authored body with the production validator. Its outcome
 * names no model: the body's pinned name is a placeholder the validator requires.
 */
export function createSyntheticFixtureArm(
  id: ModelArmId,
  options: { response?: SyntheticResponse; derivedFrom?: string } = {},
): Arm {
  const response = options.response ?? WELL_FORMED_RESPONSE;
  let analyze: ((observation: SeatObservation) => DecisionAnalysis) | null = null;
  if (id === 'J1') {
    if (!options.derivedFrom) throw new Error('J1 needs the policy version of its local analysis.');
    analyze = registeredAnalysis(options.derivedFrom);
  } else if (options.derivedFrom) throw new Error('J0 receives no local analysis.');
  return {
    id,
    kind: 'synthetic-fixture',
    policyOrModel: SYNTHETIC_SELECTOR,
    select: withForcedBypass((observation): SelectorOutcome => {
      let analysis: DecisionAnalysis | null = null;
      if (analyze) {
        try {
          analysis = analyze(observation);
        } catch {
          return { status: 'unavailable', reason: 'local-analysis-unavailable' };
        }
      }
      const payload = analysis ? buildJ1Payload(observation, analysis) : buildJ0Payload(observation);
      const body = response.body(payload.candidateIds);
      try {
        const result = validateResult(body, payload.candidateIds);
        return {
          status: 'selected',
          actionId: result.choice,
          provenance: SYNTHETIC_PROVENANCE,
          policyOrModel: SYNTHETIC_SELECTOR,
        };
      } catch {
        const category = diagnoseResponse(body, payload.candidateIds)?.category ?? 'unclassified';
        return { status: 'unavailable', reason: `synthetic-fixture-invalid-response:${category}` };
      }
    }),
  };
}

export type SyntheticPosition = {
  /** Evaluation-side label. It never enters a payload. */
  id: string;
  mode: SpadesMode;
  phase: 'bid' | 'play';
  forced: boolean;
  observation: SeatObservation;
};

export const POSITION_GENERATOR = 'jev-offline-positions-1.0.0';
const DEAL_STREAM = 0x4a30;
const PICK_STREAM = 0x4a31;

/**
 * Harness test material: one bid, one play and one last-trick position per seed, reached
 * through the production engine with the frozen baseline in every seat. These are not the
 * SG-04 cases and carry no natural-frequency claim.
 */
export function syntheticPositions(mode: SpadesMode, seeds: readonly number[]): SyntheticPosition[] {
  const positions: SyntheticPosition[] = [];
  for (const seed of seeds) {
    const pick = createRandom(seed, PICK_STREAM);
    const wanted = new Set([pick.below(4), 4 + pick.below(48), 52 + pick.below(4)]);
    let state = createGame(
      { id: 'synthetic-position', mode, dealer: (seed % 4) as Seat },
      shuffled(fullDeck(), createRandom(seed, DEAL_STREAM)),
    );
    for (let index = 0; index < 56; index++) {
      if (state.phase === 'trick-end') state = collectTrick(state);
      if ((state.phase !== 'bid' && state.phase !== 'play') || state.turn === null)
        throw new Error('The synthetic hand ended early.');
      const observation = observe(state, state.turn);
      if (wanted.has(index))
        positions.push({
          id: `${mode}/${seed}/${index}`,
          mode,
          phase: state.phase,
          forced: observation.legalActions.length === 1,
          observation,
        });
      const action = analyzeFrozenSpades(observation).action;
      if (action.kind === 'pass') throw new Error('Spades has no pass.');
      state = apply(state, action);
    }
  }
  return positions;
}
