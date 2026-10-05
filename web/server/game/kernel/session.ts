import { createHash } from 'node:crypto';
import { assertContract } from '../../../shared/validation.ts';
import type {
  RegisteredActorPacket,
  RegisteredSessionView,
  RegisteredAnalysis,
} from '../../../shared/contracts.ts';
import { assertSeat, SEATS, type Seat } from './seats.ts';
import { array, canonical, freeze, json, object, snapshot, string } from './codec.ts';
import type {
  AccessUnit,
  Candidate,
  Codec,
  Json,
  Module,
  Node,
  Operation,
  Pin,
  RegistrationAdapters,
  Transition,
} from './module.ts';

export type SeatChoice = { seat: Seat; candidateId: string };
export type PreparedDecision = {
  actor: Seat;
  candidateId: string;
  inputDigest: string;
  policyId: string;
  observationSchemaVersion: string;
  analysis: RegisteredAnalysis;
};
export type BoundTransition = { next: BoundSession; privateEvents: readonly Json[] };
export interface BoundSession {
  readonly pin: Pin;
  node(): Node<Json>;
  accessUnit(): AccessUnit | null;
  serializePrivate(): Json;
  packet(actor: Seat): RegisteredActorPacket;
  view(actor: Seat): RegisteredSessionView;
  prepare(actor: Seat, policyId: string): Promise<PreparedDecision>;
  commit(actor: Seat, candidateId: string): BoundTransition;
  commitSealed(windowId: string, choices: readonly SeatChoice[]): BoundTransition;
  advance(transitionId: string): BoundTransition;
  supplyChance(requestId: string, material: Json): BoundTransition;
  continueRound(): BoundTransition;
}
export function parsePin(raw: unknown): Pin {
  assertContract('ModulePin', raw);
  return freeze({ ...raw });
}
/** Shared semantic checks for newly prepared and historical original analysis. */
export function parseRegisteredAnalysis(
  raw: unknown,
  pin: Pin,
  expectedCandidateId?: string,
): RegisteredAnalysis {
  const analysis = json(raw);
  assertContract('RegisteredAnalysis', analysis);
  if (
    analysis.gameId !== pin.gameId ||
    analysis.variantId !== pin.variantId ||
    analysis.publicSchemaVersion !== pin.publicSchemaVersion ||
    (expectedCandidateId !== undefined && analysis.selectedCandidateId !== expectedCandidateId)
  )
    throw new TypeError('Analysis identity mismatch.');
  if (
    analysis.facts.some(
      (fact) => fact.candidateId !== null && fact.candidateId !== analysis.selectedCandidateId,
    )
  )
    throw new TypeError('Analysis selected-action evidence mismatch.');
  if (
    analysis.estimates.some(
      (estimate) => estimate.uncertainty !== null && estimate.uncertainty.lower > estimate.uncertainty.upper,
    )
  )
    throw new TypeError('Analysis uncertainty interval is reversed.');
  return freeze(analysis);
}
export function providerEligibility(packet: { readonly candidates: readonly { id: string }[] }): {
  kind: 'forced' | 'eligible' | 'unsupported-action-space';
  candidateCount: number;
} {
  const ids = packet.candidates.map((candidate) => {
    string(candidate.id);
    return candidate.id;
  });
  if (!ids.length || new Set(ids).size !== ids.length) throw new TypeError('Invalid candidate set.');
  return {
    kind: ids.length === 1 ? 'forced' : ids.length <= 255 ? 'eligible' : 'unsupported-action-space',
    candidateCount: ids.length,
  };
}
export function validatePrivateEvent<E>(
  pin: Pin,
  codec: Codec<E>,
  event: E,
  project: (event: E, viewer: Seat) => Json | null,
): Json {
  const checked = snapshot(codec, event);
  for (const viewer of SEATS) {
    const projected = project(checked, viewer);
    if (projected !== null) {
      const publicEvent = json(projected);
      assertContract('RegisteredActorEvent', publicEvent);
      if (
        publicEvent.gameId !== pin.gameId ||
        publicEvent.variantId !== pin.variantId ||
        publicEvent.publicSchemaVersion !== pin.publicSchemaVersion ||
        publicEvent.eventSchemaVersion !== pin.eventSchemaVersion
      )
        throw new TypeError('Projected event pin mismatch.');
    }
  }
  return json(codec.encode(checked));
}

/** Captures one concrete state/action pair; heterogeneous types never leave this closure. */
export function bindSession<S, O, A, E, Q, C, V, F, G>(
  module: Module<S, O, A, E, Q, C, V, F, G>,
  initialState: S,
  adapters: RegistrationAdapters<S, O, E, Q, C, V, F>,
): BoundSession {
  const pin = parsePin(module.pin);
  const state = snapshot(module.stateCodec, initialState);
  const ensurePin = () => {
    if (canonical(module.pin) !== canonical(pin)) throw new Error('Module pin changed.');
  };
  const node = (): Node<Json> => {
    ensurePin();
    const value = module.node(state);
    string(value.phase);
    switch (value.kind) {
      case 'actor':
        object(value, ['kind', 'phase', 'seat']);
        assertSeat(value.seat);
        return freeze({ ...value });
      case 'sealed': {
        object(value, ['kind', 'phase', 'windowId', 'actors']);
        string(value.windowId);
        array(value.actors);
        const actors = value.actors.map((actor) => {
          assertSeat(actor);
          return actor;
        });
        if (!actors.length || new Set(actors).size !== actors.length)
          throw new TypeError('Invalid sealed actors.');
        return freeze({ ...value, actors });
      }
      case 'automatic':
        object(value, ['kind', 'phase', 'transitionId']);
        string(value.transitionId);
        return freeze({ ...value });
      case 'chance':
        object(value, ['kind', 'phase', 'requestId', 'request']);
        string(value.requestId);
        return freeze({
          ...value,
          request: json(adapters.chanceCodec.encode(snapshot(adapters.chanceCodec, value.request))),
        });
      case 'round-complete':
      case 'session-complete':
        object(value, ['kind', 'phase']);
        return freeze({ ...value });
      default:
        throw new TypeError('Unsupported lifecycle node.');
    }
  };
  const observation = (actor: Seat): O => {
    assertSeat(actor);
    ensurePin();
    return snapshot(module.observationCodec, module.observe(state, actor));
  };
  const inputFor = (
    actor: Seat,
  ): { input: O; candidates: readonly Candidate<A, C>[]; packet: RegisteredActorPacket } => {
    const current = node();
    if (
      !(current.kind === 'actor' && current.seat === actor) &&
      !(current.kind === 'sealed' && current.actors.includes(actor))
    )
      throw new Error('Seat is not eligible at this node.');
    const input = observation(actor);
    const candidates = freeze(structuredClone(module.candidates(input)));
    providerEligibility({ candidates });
    const packet = json(
      adapters.packet(
        input,
        candidates.map((candidate) => ({ id: candidate.id, public: candidate.public })),
      ),
    );
    assertContract('RegisteredActorPacket', packet);
    if (
      packet.gameId !== pin.gameId ||
      packet.variantId !== pin.variantId ||
      packet.publicSchemaVersion !== pin.publicSchemaVersion ||
      packet.seat !== actor ||
      packet.phase !== current.phase ||
      canonical(packet.candidates) !==
        canonical(candidates.map((candidate) => ({ id: candidate.id, public: candidate.public })))
    )
      throw new TypeError('Packet identity or complete candidate set mismatch.');
    return { input, candidates, packet: freeze(packet) };
  };
  const apply = (operation: Operation<A, Q>): BoundTransition => {
    ensurePin();
    const transition: Transition<S, E> = module.reduce(state, freeze(operation));
    const events = transition.events.map((event) =>
      validatePrivateEvent(pin, adapters.eventCodec, event, (checked, viewer) =>
        module.projectEvent(checked, viewer),
      ),
    );
    return freeze({ next: bindSession(module, transition.state, adapters), privateEvents: events });
  };
  const resolve = (candidates: readonly Candidate<A, C>[], id: string): A => {
    string(id);
    const candidate = candidates.find((value) => value.id === id);
    if (!candidate) throw new Error('Unknown or ineligible candidate.');
    return candidate.action;
  };
  return Object.freeze({
    pin,
    node,
    accessUnit() {
      ensurePin();
      const unit = module.accessUnit(state);
      if (unit === null) return null;
      const checked = json(unit);
      assertContract('CoachedUnit', checked);
      return freeze(checked);
    },
    serializePrivate() {
      ensurePin();
      const payload = json(adapters.document(state));
      const checked = module.stateCodec.parse(payload);
      if (canonical(module.stateCodec.encode(checked)) !== canonical(module.stateCodec.encode(state)))
        throw new TypeError('Private document changed state.');
      return freeze(payload);
    },
    packet(actor: Seat) {
      return inputFor(actor).packet;
    },
    view(actor: Seat) {
      const view = json(adapters.view(module.table(observation(actor))));
      assertContract('RegisteredSessionView', view);
      if (
        view.gameId !== pin.gameId ||
        view.variantId !== pin.variantId ||
        view.publicSchemaVersion !== pin.publicSchemaVersion ||
        view.seat !== actor ||
        view.phase !== node().phase
      )
        throw new TypeError('View identity mismatch.');
      return freeze(view);
    },
    async prepare(actor: Seat, policyId: string) {
      string(policyId);
      const { input, candidates, packet } = inputFor(actor);
      const inputDigest = createHash('sha256')
        .update(
          canonical({ pin, actor, policyId, observation: module.observationCodec.encode(input), packet }),
        )
        .digest('hex');
      const result = await adapters.analyze(input, freeze(structuredClone(module.facts(input))), policyId);
      resolve(candidates, result.candidateId);
      const analysis = parseRegisteredAnalysis(result.analysis, pin, result.candidateId);
      ensurePin();
      return freeze({
        actor,
        candidateId: result.candidateId,
        inputDigest,
        policyId,
        observationSchemaVersion: pin.observationSchemaVersion,
        analysis,
      });
    },
    commit(actor: Seat, candidateId: string) {
      const current = node();
      if (current.kind !== 'actor' || current.seat !== actor) throw new Error('Not an actor node.');
      const { candidates } = inputFor(actor);
      return apply({ kind: 'actor', seat: actor, action: resolve(candidates, candidateId) });
    },
    commitSealed(windowId: string, choices: readonly SeatChoice[]) {
      const current = node();
      if (current.kind !== 'sealed' || current.windowId !== windowId) throw new Error('Wrong sealed window.');
      array(choices);
      for (const choice of choices) {
        object(choice, ['seat', 'candidateId']);
        assertSeat(choice.seat);
        string(choice.candidateId);
      }
      if (
        choices.length !== current.actors.length ||
        new Set(choices.map((choice) => choice.seat)).size !== choices.length ||
        choices.some((choice) => !current.actors.includes(choice.seat))
      )
        throw new Error('Sealed choices must cover each participant exactly once.');
      // Project EVERY actor from the same frozen state before resolving or applying a choice.
      const inputs = current.actors.map((actor) => ({ actor, input: inputFor(actor) }));
      const actions = inputs.map(({ actor, input }) => {
        const choice = choices.find((value) => value.seat === actor);
        if (!choice) throw new Error('Missing sealed choice.');
        return { seat: actor, action: resolve(input.candidates, choice.candidateId) };
      });
      return apply({ kind: 'sealed', windowId, actions });
    },
    advance(transitionId: string) {
      const current = node();
      if (current.kind !== 'automatic' || current.transitionId !== transitionId)
        throw new Error('Wrong automatic transition.');
      return apply({ kind: 'automatic', transitionId });
    },
    supplyChance(requestId: string, material: Json) {
      const current = node();
      if (current.kind !== 'chance' || current.requestId !== requestId)
        throw new Error('Wrong chance request.');
      return apply({
        kind: 'chance',
        requestId,
        material: snapshot(adapters.chanceCodec, adapters.chanceCodec.parse(json(material))),
      });
    },
    continueRound() {
      if (node().kind !== 'round-complete') throw new Error('Not a round boundary.');
      return apply({ kind: 'continue-round' });
    },
  });
}
