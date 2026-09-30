import { parentPort } from 'node:worker_threads';
import { simulateTrial } from './trials.ts';
import type { SeatObservation } from '../observations/index.ts';
import type { GameAction } from '../game/index.ts';
parentPort?.on(
  'message',
  (input: {
    id: string;
    observation: SeatObservation;
    alternative: GameAction;
    seed: number;
    policyVersion?: string;
  }) => {
    try {
      parentPort?.postMessage({
        id: input.id,
        result: simulateTrial(input.observation, input.alternative, input.seed, input.policyVersion),
      });
    } catch {
      parentPort?.postMessage({
        id: input.id,
        result: { status: 'unavailable', reason: 'The sampled continuation could not be completed.' },
      });
    }
  },
);
