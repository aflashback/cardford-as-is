import { RANDOM_VERSION, createRandom, shuffled } from '../../strategy/plan/random.ts';

/**
 * SG-05: deterministic item order for evaluation starts. The game supplies its own item
 * list; this module only orders it. No clock and no process-level randomness.
 */
export const DEAL_GENERATOR = `shuffle-1.0.0+${RANDOM_VERSION}`;

/** Highest round position a stream may ask for. */
export const MAX_STREAM_INDEX = 0xffff;

const STREAM_STEP = 0x9e3779b9;

function assertUint32(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 0 || value > 0xffffffff)
    throw new Error(`${name} must be an unsigned 32-bit integer.`);
}

/** A one-to-one mixing of 32-bit integers, so distinct inputs never share an output. */
function mix(value: number): number {
  let z = value >>> 0;
  z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
  z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
  return (z ^ (z >>> 16)) >>> 0;
}

/**
 * Seed for position `index` of the stream that starts at `seed`. It reads (seed, index)
 * only, so two arms whose sessions have different lengths still receive the same order
 * at every position. For one seed, every index gives a different value.
 */
export function streamSeed(seed: number, index: number): number {
  assertUint32(seed, 'seed');
  if (!Number.isInteger(index) || index < 0 || index > MAX_STREAM_INDEX)
    throw new Error(`index must be an integer from 0 to ${MAX_STREAM_INDEX}.`);
  return mix((seed ^ Math.imul(index + 1, STREAM_STEP)) >>> 0);
}

/** Unbiased order of a copy of `items` for one (seed, stream) pair. */
export function shuffleItems<T>(items: readonly T[], seed: number, stream = 0): T[] {
  return shuffled(items, createRandom(seed, stream));
}

/**
 * Picks `count` positions out of `length` without replacement and returns them ascending.
 * The choice reads (seed, stream, length) only.
 */
export function pickPositions(length: number, count: number, seed: number, stream: number): number[] {
  if (!Number.isInteger(length) || length < 0) throw new Error('length must be a non-negative integer.');
  if (!Number.isInteger(count) || count < 0) throw new Error('count must be a non-negative integer.');
  const positions = Array.from({ length }, (_, position) => position);
  if (count >= length) return positions;
  return shuffleItems(positions, seed, stream)
    .slice(0, count)
    .sort((left, right) => left - right);
}
