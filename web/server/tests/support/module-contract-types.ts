/** Compile-time M01 declaration checks. Never executed or registered. */
import type {
  Module,
  ScoringFacet,
  KnowledgeFacet,
  ScenarioFacet,
  DecisionFacet,
  InitialChanceRequest,
} from '../../game/kernel/module.ts';
import type { State, Observation, Action, Event, Chance, Config, Facts } from './module-contract-fixture.ts';
import type { HeartsCandidate, HeartsSessionView, RegisteredActorPacket } from '../../../shared/contracts.ts';
import type { ClientPlatform } from '../../../src/platform/runtime.ts';

type FixtureModule = Module<
  State,
  Observation,
  Action,
  Event,
  Chance,
  HeartsCandidate,
  HeartsSessionView,
  Facts,
  Config
>;
export function declarationChecks(
  module: FixtureModule,
  state: State,
  input: Observation,
  packet: RegisteredActorPacket,
  scoring: ScoringFacet<State>,
  knowledge: KnowledgeFacet<Observation, Facts>,
  scenarios: ScenarioFacet<Observation, Facts>,
  decisions: DecisionFacet<Observation, HeartsCandidate, Facts>,
  chance: InitialChanceRequest<Config, Chance>,
  platform: ClientPlatform,
): void {
  module.observe(state, 0);
  // @ts-expect-error Private aggregate is not the policy observation type.
  module.candidates(state);
  // @ts-expect-error Candidate IDs cannot be substituted for native reducer actions.
  module.reduce(state, { kind: 'actor', seat: 0, action: 'take-0' });
  // @ts-expect-error A shared facade never exposes all hidden seat hands.
  packet.hands;
  // @ts-expect-error Four seats, never seat 4.
  module.observe(state, 4);
  // @ts-expect-error A code policy requires permitted information, not authoritative state.
  decisions.analyze(state, [], knowledge.facts(input));
  scoring.evaluate(state, scoring.horizons[0]);
  scenarios.detect(input, knowledge.facts(input));
  chance.initialChanceRequest({ stage: 'actor', count: 286 });
  platform.onForeground(() => undefined);
}
