/**
 * GP-04 / SG-05: deterministic randomness shared by playouts and evaluation deals.
 * No clock, no Math.random. Bounded draws use rejection, so they carry no modulo bias.
 */
export const RANDOM_VERSION = 'xoshiro128ss-splitmix-1.0.0';

export type Random = {
  /** Uniform unsigned 32-bit integer. */
  next(): number;
  /** Uniform integer in [0, limit). */
  below(limit: number): number;
  /** Uniform float in [0, 1). */
  unit(): number;
};

function assertUint32(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 0 || value > 0xffffffff)
    throw new Error(`${name} must be an unsigned 32-bit integer.`);
}

/** Independent streams for one seed: (seed, stream) pairs never share a state. */
export function createRandom(seed: number, stream = 0): Random {
  assertUint32(seed, 'seed');
  assertUint32(stream, 'stream');
  let mix = (seed ^ Math.imul(stream + 1, 0x9e3779b9)) >>> 0;
  const splitmix = () => {
    mix = (mix + 0x9e3779b9) >>> 0;
    let z = mix;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
    return (z ^ (z >>> 16)) >>> 0;
  };
  let a = splitmix(),
    b = splitmix(),
    c = splitmix(),
    d = splitmix();
  if ((a | b | c | d) === 0) a = 1;
  const next = () => {
    const rotated = Math.imul(b, 5);
    const result = Math.imul((rotated << 7) | (rotated >>> 25), 9) >>> 0;
    const t = b << 9;
    c ^= a;
    d ^= b;
    b ^= c;
    a ^= d;
    c ^= t;
    d = (d << 11) | (d >>> 21);
    return result;
  };
  for (let warm = 0; warm < 8; warm++) next();
  const below = (limit: number) => {
    if (!Number.isInteger(limit) || limit < 1 || limit > 0x100000000)
      throw new Error('Random limit must be an integer from 1 to 2^32.');
    if (limit === 1) return 0;
    const ceiling = 0x100000000 - (0x100000000 % limit);
    for (;;) {
      const value = next();
      if (value < ceiling) return value % limit;
    }
  };
  return { next, below, unit: () => next() / 0x100000000 };
}

/** Unbiased Fisher–Yates over a copy; the caller supplies the game's own deck or item list. */
export function shuffled<T>(items: readonly T[], random: Random): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = random.below(i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/** Stable 32-bit FNV-1a hash of text, used to derive a decision seed from an observation. */
export function hashText(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}
