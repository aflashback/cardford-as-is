import type { Codec, Json } from './module.ts';

/** Strict data-only boundary helpers. No coercion, property stripping or JSON casts. */
export function object(raw: unknown, keys: readonly string[]): asserts raw is Record<string, unknown> {
  if (
    raw === null ||
    typeof raw !== 'object' ||
    Array.isArray(raw) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(raw)) ||
    Reflect.ownKeys(raw).some((key) => typeof key !== 'string' || !keys.includes(key)) ||
    keys.some((key) => !Object.hasOwn(raw, key))
  )
    throw new TypeError('Invalid object fields.');
}
export function string(raw: unknown): asserts raw is string {
  if (typeof raw !== 'string' || !raw.length || raw.length > 256) throw new TypeError('Invalid identifier.');
}
export function array(raw: unknown): asserts raw is unknown[] {
  if (!Array.isArray(raw)) throw new TypeError('Invalid array.');
}
export function integer(raw: unknown, minimum = 0): asserts raw is number {
  if (typeof raw !== 'number' || !Number.isSafeInteger(raw) || raw < minimum)
    throw new TypeError('Invalid integer.');
}
export function json(raw: unknown): Json {
  if (raw === null || typeof raw === 'string' || typeof raw === 'boolean') return raw;
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (Array.isArray(raw)) return raw.map(json);
  if (
    typeof raw === 'object' &&
    raw !== null &&
    [Object.prototype, null].includes(Object.getPrototypeOf(raw))
  ) {
    const result: Record<string, Json> = {};
    for (const key of Reflect.ownKeys(raw)) {
      if (typeof key !== 'string') throw new TypeError('Non-JSON key.');
      const descriptor = Object.getOwnPropertyDescriptor(raw, key);
      if (!descriptor || !('value' in descriptor) || !descriptor.enumerable)
        throw new TypeError('Non-data field.');
      Object.defineProperty(result, key, {
        value: json(descriptor.value),
        enumerable: true,
        writable: true,
        configurable: true,
      });
    }
    return result;
  }
  throw new TypeError('Non-JSON value.');
}
export function freeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
/** Round-trip validates encoded output as well as the caller's input. */
export function snapshot<T>(codec: Codec<T>, value: T): T {
  return freeze(codec.parse(json(codec.encode(value))));
}
export function canonical(raw: unknown): string {
  const value = json(raw);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (typeof value === 'object' && value !== null)
    return (
      '{' +
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => JSON.stringify(key) + ':' + canonical(item))
        .join(',') +
      '}'
    );
  return JSON.stringify(value);
}
