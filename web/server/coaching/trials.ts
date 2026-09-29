import { apply, actionId, type GameAction, type Play } from '../game/index.ts';
import { observe, assertObservation, type SeatObservation } from '../observations/index.ts';
import { chooseAction, getReasoningPack } from '../strategy/index.ts';
import { sampleWorld, SAMPLER_VERSION, SampleUnavailableError } from '../strategy/sampler.ts';
export type TrialResult =
  | {
      status: 'available';
      label: 'Possible continuation';
      frames: SeatObservation[];
      plays: Play[];
      seed: number;
      samplerVersion: string;
      policyVersion: string;
      limitations: string[];
    }
  | { status: 'unavailable'; reason: string };
/** One illustrative, sampled trick. Never imports or reads the live aggregate or its future events. */
export function simulateTrial(
  observation: SeatObservation,
  alternative: GameAction,
  seed: number,
): TrialResult {
  assertObservation(observation);
  if (
    observation.phase !== 'play' ||
    observation.turn !== observation.seat ||
    alternative.kind !== 'play' ||
    alternative.seat !== observation.seat ||
    !observation.legalActions.some((a) => actionId(a) === actionId(alternative))
  )
    return { status: 'unavailable', reason: 'Choose a legal play at the original decision.' };
  let state;
  try {
    state = sampleWorld(observation, seed);
  } catch (error) {
    if (error instanceof SampleUnavailableError) return { status: 'unavailable', reason: error.reason };
    throw error;
  }
  const frames: SeatObservation[] = [observe(state, observation.seat)];
  const plays: Play[] = [];
  state = apply(state, alternative);
  plays.push({ seat: alternative.seat, card: alternative.card });
  frames.push(observe(state, observation.seat));
  for (let step = 0; step < 3 && state.phase === 'play'; step++) {
    if (state.turn === null) throw new Error('Sampled trick has no active seat.');
    // The simulated actor receives its own sampled hand, never the human observation or full aggregate.
    const choice = chooseAction(observe(state, state.turn));
    if (choice.kind !== 'play') throw new Error('Sampled continuation left the playing phase.');
    state = apply(state, choice);
    plays.push({ seat: choice.seat, card: choice.card });
    frames.push(observe(state, observation.seat));
  }
  return {
    status: 'available',
    label: 'Possible continuation',
    frames,
    plays,
    seed,
    samplerVersion: SAMPLER_VERSION,
    policyVersion: getReasoningPack(observation.mode).policyVersion,
    limitations: [
      'One uniformly sampled feasible deal; this is not the original hidden deal or a quality grade.',
      'The named local policy is uncalibrated. This illustration stops after one trick.',
      'Other seats’ private pass memories are unavailable and are not reconstructed; the current baseline does not use those memories.',
    ],
  };
}
