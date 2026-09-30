import { cardLabel, sorted } from '../../game/cards.ts';
import { competitionFor, competitorOf, opponentsOf, teammatesOf } from '../../game/kernel/competition.ts';
import type { GameAction, Seat } from '../../game/kernel/types.ts';
import { actionId } from '../../game/rules.ts';
import { SPADES_SCENARIOS } from '../../games/spades/reasoning/catalog.ts';
import { assertObservation, type SeatObservation } from '../../observations/index.ts';
import { buildDecisionRequest } from '../../providers/openrouter.ts';
import { hashText } from '../../strategy/plan/random.ts';
import { readSavedAnalysis, type DecisionAnalysis, type NilStatus } from '../../strategy/types.ts';

/**
 * SG-06: offline payload builders for the J0 and J1 comparison arms. They build the
 * record a later, separately approved experiment would submit. Nothing here sends,
 * reads a credential or touches the network.
 *
 * J0 = the adapter's seat-safe request + exact code facts + the complete legal set.
 * J1 = J0 + labelled hypotheses and per-candidate evidence from a local analysis.
 * Neither reads the local selection, its order, its weights or any sampled value.
 */
export const OFFLINE_HARNESS_VERSION = 'jev-offline-1.0.0';
export const EXPERIMENT_ID_PLACEHOLDER = 'unassigned — no approved experiment';
export const CANDIDATE_ENCODING = 'canonical-order-1.0.0';
export const PROMPT_VERSIONS = { J0: 'cardford-j0-offline-1.0.0', J1: 'cardford-j1-offline-1.0.0' } as const;

export const CODE_FACTS_LABEL =
  'Exact facts computed by code from public state and your own hand. They are counts, not forecasts.';
export const DERIVED_ANALYSIS_LABEL =
  'Derived local analysis. Hypotheses are labelled, uncalibrated and may be wrong. No recommended action is included.';
export const PLAN_LABEL = 'One plan among others, derived from exact public counts.';

export type OfflineArm = keyof typeof PROMPT_VERSIONS;
export type SpadesMode = 'spades-solo' | 'spades-partners';
type AdapterRequest = ReturnType<typeof buildDecisionRequest>;

export type CodeFacts = {
  description: typeof CODE_FACTS_LABEL;
  competition: {
    kind: 'individual' | 'partnership';
    competitorId: string;
    memberSeats: Seat[];
    /** From the declared competition, never from seat arithmetic. Null in individual competition. */
    partnerSeat: Seat | null;
    opponentSeats: Seat[];
  };
  contract: {
    /** True once every member of this competitor has bid. */
    biddingComplete: boolean;
    bid: number | null;
    creditedTricks: number | null;
    needed: number | null;
  };
  nil: {
    own: NilStatus;
    partner: NilStatus | null;
    opponents: { seat: Seat; status: NilStatus }[];
  };
  bags: {
    carried: number;
    addedThisHand: number;
    /** Further bags at which the ten-bag penalty is charged; 1 means the next bag is penalised. */
    bagRoom: number;
  };
  tricksRemaining: number;
};

export type DerivedEvidence = {
  id: string;
  kind: 'hypothesis' | 'fact-stated-by-local-analysis';
  text: string;
};

export type DerivedAnalysis = {
  description: typeof DERIVED_ANALYSIS_LABEL;
  plan: {
    description: typeof PLAN_LABEL;
    stance: { id: string; title: string };
    goals: {
      id: string;
      title: string;
      beneficiary: 'self' | 'team';
      against: { competitorIds: string[]; seats: Seat[] } | null;
      horizon: string;
      priority: number;
      status: string;
      progress: {
        unit: string;
        comparator: string;
        target: number | null;
        current: number | null;
        remainingOpportunities: number | null;
      } | null;
    }[];
    competing: { stanceId: string; whyNot: string }[];
    revisions: { step: number; trigger: string; from: string; to: string }[];
  } | null;
  /** Evidence that applies to the decision as a whole, ordered by identifier. */
  shared: DerivedEvidence[];
  /** One entry per legal action in canonical order, each with the evidence that names it. */
  candidates: { id: string; evidence: DerivedEvidence[] }[];
  evidenceKinds: string[];
  limitations: string[];
};

type PayloadRecord<Arm extends OfflineArm, State> = {
  harnessVersion: typeof OFFLINE_HARNESS_VERSION;
  arm: Arm;
  /** This harness has no dispatch path. */
  dispatch: 'never-sent';
  experimentId: string;
  promptVersion: (typeof PROMPT_VERSIONS)[Arm];
  /** Hash of every instruction sentence in the request, so a text change cannot hide behind a version. */
  promptTextHash: string;
  featureVersion: string;
  observationSchemaVersion: string;
  ruleProfileId: string;
  candidateEncoding: typeof CANDIDATE_ENCODING;
  candidateIds: string[];
  request: { model: AdapterRequest['model']; state: State; questions: AdapterRequest['questions'] };
};

type J0State = AdapterRequest['state'] & {
  codeFacts: CodeFacts;
  legalSet: { complete: true; count: number; encoding: typeof CANDIDATE_ENCODING };
};
type J1State = J0State & { derivedAnalysis: DerivedAnalysis };

export type J0Payload = PayloadRecord<'J0', J0State>;
export type J1Payload = PayloadRecord<'J1', J1State> & {
  derivedFrom: { policyVersion: string; analysisSchemaVersion: string; plannerVersion: string | null };
  /** Counts only. What was withheld is never described per action. */
  withheld: {
    reasonsOutsideEvidenceAllowlist: number;
    sentencesNamingAnAction: number;
    reasonsLeftWithoutText: number;
    sampledValues: 'withheld';
    localSelection: 'not-read';
  };
};

export const isSpadesMode = (mode: string): mode is SpadesMode =>
  mode === 'spades-solo' || mode === 'spades-partners';

/** Bids ascend from Nil; cards follow suit order C, D, H, S and then rank. Never the tactical order. */
export function canonicalActions(observation: SeatObservation): GameAction[] {
  const legal = observation.legalActions;
  const bids = legal.filter((action) => action.kind === 'bid');
  if (bids.length === legal.length) return bids.toSorted((a, b) => a.bid - b.bid);
  const plays = legal.filter((action) => action.kind === 'play');
  if (plays.length !== legal.length)
    throw new Error('The offline comparison supports bids and card plays only.');
  return sorted(plays.map((action) => action.card)).map((card) =>
    plays.find((action) => action.card === card)!,
  );
}

export const canonicalCandidateIds = (observation: SeatObservation): string[] =>
  canonicalActions(observation).map(actionId);

function requireStrategicDecision(observation: SeatObservation): GameAction[] {
  assertObservation(observation);
  if (!isSpadesMode(observation.mode))
    throw new Error('The offline comparison covers Spades Solo and Spades Partners only.');
  if (!observation.legalActions.length) throw new Error('No decision is available for this seat.');
  if (observation.legalActions.length === 1)
    throw new Error('Forced decisions bypass every arm; no payload is built.');
  return canonicalActions(observation);
}

const nilStatus = (bid: number | null, tricks: number): NilStatus =>
  bid === 0 ? (tricks === 0 ? 'live' : 'failed') : 'none';

/** Exact arithmetic over public counts. Membership comes from the declared competition. */
export function buildCodeFacts(observation: SeatObservation): CodeFacts {
  assertObservation(observation);
  if (!isSpadesMode(observation.mode))
    throw new Error('The offline comparison covers Spades Solo and Spades Partners only.');
  const competition = competitionFor(observation.mode);
  const own = competitorOf(competition, observation.seat);
  const partnerSeat = teammatesOf(competition, observation.seat)[0] ?? null;
  const opponentSeats = opponentsOf(competition, observation.seat);
  const members = [...own.seats];
  const biddingComplete = members.every((seat) => observation.bids[seat] !== null);
  const positive = members.filter((seat) => (observation.bids[seat] ?? 0) > 0);
  const bid = biddingComplete
    ? positive.reduce<number>((sum, seat) => sum + (observation.bids[seat] ?? 0), 0)
    : null;
  const creditedTricks =
    bid === null ? null : positive.reduce<number>((sum, seat) => sum + observation.tricks[seat], 0);
  const needed = bid === null || creditedTricks === null ? null : Math.max(0, bid - creditedTricks);
  const failedNilTricks = members
    .filter((seat) => observation.bids[seat] === 0)
    .reduce<number>((sum, seat) => sum + observation.tricks[seat], 0);
  const ordinary = bid === null || creditedTricks === null ? 0 : Math.max(0, creditedTricks - bid);
  const carried = observation.bags[observation.seat];
  const addedThisHand = ordinary + failedNilTricks;
  return {
    description: CODE_FACTS_LABEL,
    competition: {
      kind: competition.mode,
      competitorId: own.id,
      memberSeats: members,
      partnerSeat,
      opponentSeats,
    },
    contract: { biddingComplete, bid, creditedTricks, needed },
    nil: {
      own: nilStatus(observation.bids[observation.seat], observation.tricks[observation.seat]),
      partner:
        partnerSeat === null
          ? null
          : nilStatus(observation.bids[partnerSeat], observation.tricks[partnerSeat]),
      opponents: opponentSeats.map((seat) => ({
        seat,
        status: nilStatus(observation.bids[seat], observation.tricks[seat]),
      })),
    },
    bags: { carried, addedThisHand, bagRoom: 10 - ((carried + addedThisHand) % 10) },
    tricksRemaining: 13 - observation.history.length,
  };
}

/** Every field the adapter emits today. A new adapter field is reviewed before it reaches a payload. */
const ADAPTER_STATE_KEYS = [
  'mode',
  'ruleProfileId',
  'seat',
  'phase',
  'hand',
  'handSizes',
  'bids',
  'tricks',
  'scores',
  'bags',
  'turn',
  'dealer',
  'handNumber',
  'heartsBroken',
  'spadesBroken',
  'trick',
  'history',
  'passDirection',
  'ownPass',
  'memory',
  'knownHoldings',
  'objective',
  'candidates',
  'limitations',
];

function adapterRequest(observation: SeatObservation, candidateIds: string[]): AdapterRequest {
  const base = buildDecisionRequest(observation, candidateIds);
  const stateKeys = Object.keys(base.state);
  if (
    JSON.stringify(Object.keys(base)) !== JSON.stringify(['model', 'state', 'questions']) ||
    JSON.stringify(Object.keys(base.questions)) !== JSON.stringify(['move']) ||
    stateKeys.length !== ADAPTER_STATE_KEYS.length ||
    stateKeys.some((key) => !ADAPTER_STATE_KEYS.includes(key))
  )
    throw new Error('The adapter request changed; review the offline payload allowlist first.');
  return base;
}

function record<Arm extends OfflineArm, State>(
  arm: Arm,
  observation: SeatObservation,
  candidateIds: string[],
  base: AdapterRequest,
  state: State,
  labels: string[],
): PayloadRecord<Arm, State> {
  return {
    harnessVersion: OFFLINE_HARNESS_VERSION,
    arm,
    dispatch: 'never-sent',
    experimentId: EXPERIMENT_ID_PLACEHOLDER,
    promptVersion: PROMPT_VERSIONS[arm],
    promptTextHash: hashText(
      JSON.stringify([
        PROMPT_VERSIONS[arm],
        base.state.objective,
        base.state.limitations,
        base.questions.move.instructions,
        ...labels,
      ]),
    )
      .toString(16)
      .padStart(8, '0'),
    featureVersion: observation.featureVersion,
    observationSchemaVersion: observation.observationSchemaVersion,
    ruleProfileId: observation.ruleProfileId,
    candidateEncoding: CANDIDATE_ENCODING,
    candidateIds: [...candidateIds],
    request: { model: base.model, state, questions: base.questions },
  };
}

function j0State(observation: SeatObservation, base: AdapterRequest, count: number): J0State {
  return {
    ...base.state,
    codeFacts: buildCodeFacts(observation),
    legalSet: { complete: true, count, encoding: CANDIDATE_ENCODING },
  };
}

export function buildJ0Payload(observation: SeatObservation): J0Payload {
  const candidateIds = requireStrategicDecision(observation).map(actionId);
  const base = adapterRequest(observation, candidateIds);
  return record('J0', observation, candidateIds, base, j0State(observation, base, candidateIds.length), [
    CODE_FACTS_LABEL,
  ]);
}

const SENTENCE_BREAK = /(?<=[.!?])\s+/;

/** True when a sentence names one specific legal action, which would work as a recommendation. */
function namesAnAction(sentence: string, actions: readonly GameAction[]): boolean {
  const lower = sentence.toLowerCase();
  return actions.some((action) => {
    if (action.kind === 'bid')
      return new RegExp(`\\bbid(?:s|ding)?\\s+${action.bid === 0 ? '(?:0|nil)' : action.bid}\\b`, 'i').test(
        sentence,
      );
    if (action.kind === 'play')
      return (
        lower.includes(cardLabel(action.card).toLowerCase()) ||
        new RegExp(`\\b${action.card}\\b`).test(sentence)
      );
    return true;
  });
}

/**
 * The local analysis without its recommendation. This function never reads the selected
 * action, a disposition, the candidate order, the trace, the decision record or the search
 * summary, so its output cannot depend on them.
 */
export function buildJ1Payload(observation: SeatObservation, analysis: DecisionAnalysis): J1Payload {
  const actions = requireStrategicDecision(observation);
  const candidateIds = actions.map(actionId);
  if (readSavedAnalysis(analysis) === null) throw new Error('The local analysis has an unsupported shape.');
  if (analysis.facts.seat !== observation.seat || analysis.facts.mode !== observation.mode)
    throw new Error('The local analysis describes another decision.');
  const analysed = analysis.candidates.map((candidate) => actionId(candidate.action));
  if (
    analysed.length !== candidateIds.length ||
    new Set(analysed).size !== analysed.length ||
    candidateIds.some((id) => !analysed.includes(id))
  )
    throw new Error('The local analysis does not cover the complete legal set.');

  let sentencesNamingAnAction = 0;
  let reasonsLeftWithoutText = 0;
  const supported = (text: string): string => {
    const kept = text
      .split(SENTENCE_BREAK)
      .map((sentence) => sentence.trim())
      .filter((sentence) => sentence.length > 0)
      .filter((sentence) => {
        if (!namesAnAction(sentence, actions)) return true;
        sentencesNamingAnAction++;
        return false;
      });
    return kept.join(' ');
  };

  // Evidence allowlist: reasons of a catalogued scenario. Plan and selection reasons are outside it.
  const scenarios = new Set(SPADES_SCENARIOS.map((scenario) => scenario.id));
  const evidence = new Map<string, DerivedEvidence>();
  let reasonsOutsideEvidenceAllowlist = 0;
  for (const reason of analysis.reasons) {
    if (!scenarios.has(reason.id.split('.')[0])) {
      reasonsOutsideEvidenceAllowlist++;
      continue;
    }
    const text = supported(reason.text);
    if (!text) {
      reasonsLeftWithoutText++;
      continue;
    }
    evidence.set(reason.id, {
      id: reason.id,
      kind: reason.kind === 'fact' ? 'fact-stated-by-local-analysis' : 'hypothesis',
      text,
    });
  }
  const attached = new Map(
    analysis.candidates.map((candidate) => [actionId(candidate.action), new Set(candidate.reasonIds)]),
  );
  const identifiers = [...evidence.keys()].sort();
  const sharedIds = identifiers.filter((id) =>
    candidateIds.every((candidate) => attached.get(candidate)!.has(id)),
  );
  const derivedAnalysis: DerivedAnalysis = {
    description: DERIVED_ANALYSIS_LABEL,
    plan:
      analysis.schemaVersion === '1.1.0'
        ? {
            description: PLAN_LABEL,
            stance: { id: analysis.plan.stance.id, title: supported(analysis.plan.stance.title) },
            goals: analysis.plan.goals.map((goal) => ({
              id: goal.id,
              title: supported(goal.title),
              beneficiary: goal.beneficiary,
              against: goal.against
                ? { competitorIds: [...goal.against.competitorIds], seats: [...goal.against.seats] }
                : null,
              horizon: goal.horizon,
              priority: goal.priority,
              status: goal.status,
              progress: goal.progress
                ? {
                    unit: goal.progress.unit,
                    comparator: goal.progress.comparator,
                    target: goal.progress.target,
                    current: goal.progress.current,
                    remainingOpportunities: goal.progress.remainingOpportunities,
                  }
                : null,
            })),
            competing: analysis.plan.competing.map((entry) => ({
              stanceId: entry.stanceId,
              whyNot: supported(entry.whyNot),
            })),
            revisions: analysis.plan.revisions.map((entry) => ({
              step: entry.step,
              trigger: entry.trigger,
              from: entry.from,
              to: entry.to,
            })),
          }
        : null,
    shared: sharedIds.map((id) => evidence.get(id)!),
    candidates: candidateIds.map((candidate) => ({
      id: candidate,
      evidence: identifiers
        .filter((id) => !sharedIds.includes(id) && attached.get(candidate)!.has(id))
        .map((id) => evidence.get(id)!),
    })),
    evidenceKinds: [...new Set(analysis.candidates.map((candidate) => candidate.evidence))].sort(),
    limitations: [...new Set(analysis.limitations.map(supported).filter((text) => text.length > 0))],
  };

  const base = adapterRequest(observation, candidateIds);
  const state: J1State = { ...j0State(observation, base, candidateIds.length), derivedAnalysis };
  return {
    ...record('J1', observation, candidateIds, base, state, [
      CODE_FACTS_LABEL,
      DERIVED_ANALYSIS_LABEL,
      PLAN_LABEL,
    ]),
    derivedFrom: {
      policyVersion: analysis.policyVersion,
      analysisSchemaVersion: analysis.schemaVersion,
      plannerVersion: analysis.schemaVersion === '1.1.0' ? analysis.plan.plannerVersion : null,
    },
    withheld: {
      reasonsOutsideEvidenceAllowlist,
      sentencesNamingAnAction,
      reasonsLeftWithoutText,
      sampledValues: 'withheld',
      localSelection: 'not-read',
    },
  };
}

/** Byte-stable text of a payload record: keys are written in one fixed order by the builders. */
export const serializePayload = (payload: J0Payload | J1Payload): string => JSON.stringify(payload);
