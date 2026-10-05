import type { Seat, Competition } from './seats.ts';
export type { Competition } from './seats.ts';
export { validateCompetition } from './seats.ts';
export type Lifecycle = 'awaiting_action' | 'round_complete' | 'session_complete';
/** The shared seam makes no assumption about cards, tricks, bids, trump or score direction. */
export interface GameModule<State, Observation, Action> {
  manifest: { id: string; version: string; capabilities: string[] };
  competition: Competition;
  create(): State;
  lifecycle(state: State): Lifecycle;
  observe(state: State, seat: Seat): Observation;
  legalActions(observation: Observation): Action[];
  apply(state: State, seat: Seat, action: Action): State;
  scores(state: State): { competitorId: string; value: number }[];
}
export const catalog = ['hearts', 'spades-solo', 'spades-partners'] as const;
export function assertCatalogMode(mode: string): void {
  if (!(catalog as readonly string[]).includes(mode)) throw new Error('Unsupported game mode.');
}

// Additive V2 registry. The legacy catalog above remains the V1 application API.
import { array, canonical, freeze, json, object, snapshot, string } from './codec.ts';
import { parseCompetition, parseControllers } from './seats.ts';
import {
  bindSession,
  parsePin,
  validatePrivateEvent,
  type BoundSession,
  type BoundTransition,
} from './session.ts';
import type { Module, Pin, RegistrationAdapters, VersionedComponent } from './module.ts';
import { parseDocumentEnvelope, type GameDocument } from '../../records/game-document-codec.ts';

export type RegistrationSelector = Readonly<{
  gameId: string;
  variantId: string;
  moduleVersion: string;
  ruleProfileId: string;
}>;
export type RegistrationDescriptor = Readonly<{
  gameId: string;
  moduleVersion: string;
  variants: readonly Readonly<{
    id: string;
    ruleProfileId: string;
    competition: Competition;
    tableTypes: readonly 'practice'[];
    defaultPolicy: VersionedComponent;
  }>[];
  schemas: Readonly<{ state: string; observation: string; public: string; event: string }>;
  requiredEngineCapabilities: readonly string[];
  requiredUICapabilities: readonly string[];
  supportedHorizonIds: readonly string[];
}>;
export type InstalledHandlers = Readonly<{
  engine: readonly string[];
  ui: readonly string[];
  schemas: readonly string[];
}>;
/** Erasure is of functions returning a checked facade, never of Module<S,...>. */
export interface Registration {
  readonly descriptor: RegistrationDescriptor;
  readonly pin: Pin;
  create(rawConfig: unknown, rawMaterial: unknown): BoundSession;
  decode(document: GameDocument): BoundSession;
}
export interface RegisteredSessions {
  createRegisteredSession(
    selector: RegistrationSelector,
    rawConfig: unknown,
    rawMaterial: unknown,
  ): BoundSession;
  decodeDocument(raw: unknown): BoundSession;
  catalog(
    engineHandlers: readonly string[],
    uiHandlers: readonly string[],
  ): readonly RegistrationDescriptor[];
}
export function parseSelector(raw: unknown): RegistrationSelector {
  object(raw, ['gameId', 'variantId', 'moduleVersion', 'ruleProfileId']);
  string(raw.gameId);
  string(raw.variantId);
  string(raw.moduleVersion);
  string(raw.ruleProfileId);
  return freeze({
    gameId: raw.gameId,
    variantId: raw.variantId,
    moduleVersion: raw.moduleVersion,
    ruleProfileId: raw.ruleProfileId,
  });
}
function validateDescriptor(raw: RegistrationDescriptor): RegistrationDescriptor {
  object(raw, [
    'gameId',
    'moduleVersion',
    'variants',
    'schemas',
    'requiredEngineCapabilities',
    'requiredUICapabilities',
    'supportedHorizonIds',
  ]);
  string(raw.gameId);
  string(raw.moduleVersion);
  array(raw.variants);
  if (!raw.variants.length) throw new TypeError('Registration needs a variant.');
  for (const variant of raw.variants) {
    object(variant, ['id', 'ruleProfileId', 'competition', 'tableTypes', 'defaultPolicy']);
    string(variant.id);
    string(variant.ruleProfileId);
    parseCompetition(variant.competition);
    array(variant.tableTypes);
    if (canonical(variant.tableTypes) !== '["practice"]') throw new TypeError('Unsupported table type.');
    object(variant.defaultPolicy, ['id', 'version']);
    string(variant.defaultPolicy.id);
    string(variant.defaultPolicy.version);
  }
  if (new Set(raw.variants.map((variant) => variant.id)).size !== raw.variants.length)
    throw new TypeError('Duplicate variant.');
  object(raw.schemas, ['state', 'observation', 'public', 'event']);
  Object.values(raw.schemas).forEach(string);
  for (const list of [raw.requiredEngineCapabilities, raw.requiredUICapabilities, raw.supportedHorizonIds]) {
    array(list);
    list.forEach(string);
    if (!list.length || new Set(list).size !== list.length)
      throw new TypeError('Missing or duplicate capability/horizon.');
  }
  return freeze(structuredClone(raw));
}
export function createRegistration<S, O, A, E, Q, C, V, F, G>(
  rawDescriptor: RegistrationDescriptor,
  module: Module<S, O, A, E, Q, C, V, F, G>,
  adapters: RegistrationAdapters<S, O, E, Q, C, V, F>,
): Registration {
  const descriptor = validateDescriptor(rawDescriptor),
    pin = parsePin(module.pin);
  const ensureRegistrationPin = () => {
    if (canonical(module.pin) !== canonical(pin)) throw new TypeError('Registered module pin changed.');
  };
  const variant = descriptor.variants.find(
    (value) => value.id === pin.variantId && value.ruleProfileId === pin.ruleProfileId,
  );
  if (descriptor.gameId !== pin.gameId || descriptor.moduleVersion !== pin.moduleVersion || !variant)
    throw new TypeError('Descriptor and module pin disagree.');
  // One concrete typed branch per exact variant/rule/pin; sibling variants have sibling registrations.
  if (descriptor.variants.length !== 1)
    throw new TypeError('A typed registration must bind one exact variant.');
  const bindDocument = (document: GameDocument): BoundSession => {
    ensureRegistrationPin();
    if (
      canonical(document.pin) !== canonical(pin) ||
      canonical(document.competition) !== canonical(variant.competition)
    )
      throw new TypeError('Unsupported document pin or competition.');
    const state = module.stateCodec.parse(document.payload);
    const wrap = (bound: BoundSession): BoundSession => {
      const transition = (value: BoundTransition): BoundTransition =>
        freeze({ next: wrap(value.next), privateEvents: value.privateEvents });
      const wrapped: BoundSession = {
        ...bound,
        serializePrivate() {
          const result = json({ ...document, payload: bound.serializePrivate() });
          parseDocumentEnvelope(result);
          return freeze(result);
        },
        commit: (actor, candidateId) => transition(bound.commit(actor, candidateId)),
        commitSealed: (windowId, choices) => transition(bound.commitSealed(windowId, choices)),
        advance: (id) => transition(bound.advance(id)),
        supplyChance: (id, material) => transition(bound.supplyChance(id, material)),
        continueRound: () => transition(bound.continueRound()),
      };
      return Object.freeze(wrapped);
    };
    return wrap(bindSession(module, state, adapters));
  };
  return freeze({
    descriptor,
    pin,
    create(rawConfig: unknown, rawMaterial: unknown) {
      ensureRegistrationPin();
      const config = snapshot(module.configurationCodec, module.configurationCodec.parse(rawConfig));
      const material = snapshot(adapters.chanceCodec, adapters.chanceCodec.parse(rawMaterial));
      const transition = module.create(config, material);
      // Creation events are validated here; persistence/revision activation remains M03.
      for (const event of transition.events)
        validatePrivateEvent(pin, adapters.eventCodec, event, (checked, viewer) =>
          module.projectEvent(checked, viewer),
        );
      const document = parseDocumentEnvelope(
        json({
          documentVersion: '2.0.0',
          pin,
          competition: variant.competition,
          controllers: parseControllers(
            [0, 1, 2, 3].map((seat) => ({ seat, kind: seat === 0 ? 'human' : 'computer' })),
          ),
          payload: module.stateCodec.encode(snapshot(module.stateCodec, transition.state)),
          journal: { version: '2.0.0', revision: 0, entries: [] },
          audits: { version: '2.0.0', entries: [] },
        }),
      );
      return bindDocument(document);
    },
    decode(document: GameDocument) {
      return bindDocument(parseDocumentEnvelope(json(document)));
    },
  });
}
export function createRegistry(
  registrations: readonly Registration[],
  installed: InstalledHandlers,
): RegisteredSessions {
  const branches = [...registrations];
  const pins = branches.map((branch) => canonical(branch.pin));
  if (new Set(pins).size !== pins.length) throw new TypeError('Duplicate installed pin.');
  // A new-session selector must resolve exactly one complete immutable pin.
  // Schema revisions require a new module version, never array-order selection.
  const selectors = branches.map(({ pin }) =>
    canonical({
      gameId: pin.gameId,
      variantId: pin.variantId,
      moduleVersion: pin.moduleVersion,
      ruleProfileId: pin.ruleProfileId,
    }),
  );
  if (new Set(selectors).size !== selectors.length) throw new TypeError('Duplicate installed selector.');
  for (const branch of branches) {
    validateDescriptor(branch.descriptor);
    parsePin(branch.pin);
    if (
      Object.values(branch.descriptor.schemas).some((id) => !installed.schemas.includes(id)) ||
      branch.descriptor.requiredEngineCapabilities.some((id) => !installed.engine.includes(id))
    )
      throw new TypeError('Registration requires an uninstalled schema or engine handler.');
  }
  return Object.freeze({
    createRegisteredSession(rawSelector: RegistrationSelector, rawConfig: unknown, rawMaterial: unknown) {
      const selector = parseSelector(rawSelector);
      const branch = branches.find(
        (item) =>
          item.pin.gameId === selector.gameId &&
          item.pin.variantId === selector.variantId &&
          item.pin.moduleVersion === selector.moduleVersion &&
          item.pin.ruleProfileId === selector.ruleProfileId,
      );
      if (!branch || branch.descriptor.requiredUICapabilities.some((id) => !installed.ui.includes(id)))
        throw new Error('Uninstalled or unavailable game selector.');
      return branch.create(rawConfig, rawMaterial);
    },
    decodeDocument(raw: unknown) {
      const document = parseDocumentEnvelope(raw);
      const branch = branches.find((item) => canonical(item.pin) === canonical(document.pin));
      if (!branch || branch.descriptor.requiredUICapabilities.some((id) => !installed.ui.includes(id)))
        throw new Error('Uninstalled or unavailable module pin; gameplay unavailable.');
      return branch.decode(document);
    },
    catalog(engineHandlers: readonly string[], uiHandlers: readonly string[]) {
      return freeze(
        branches
          .filter(
            (branch) =>
              branch.descriptor.requiredEngineCapabilities.every(
                (id) => installed.engine.includes(id) && engineHandlers.includes(id),
              ) &&
              branch.descriptor.requiredUICapabilities.every(
                (id) => installed.ui.includes(id) && uiHandlers.includes(id),
              ),
          )
          .map((branch) => branch.descriptor),
      );
    },
  });
}
// Installed game factories live in games/registrations.ts; this kernel has no game import.
