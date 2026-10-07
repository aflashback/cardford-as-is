import assert from 'node:assert/strict';
import test from 'node:test';
import { clearLeases, readLease, retainLease } from '../src/api/controlLease.ts';

test('tab leases retain original reconciliation secrets across takeover and remain owner bound', async (context) => {
  const values = new Map<string, string>();
  const original = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
    get length() { return values.size; }, key: (index: number) => [...values.keys()][index] ?? null,
  }});
  context.after(() => {
    if (original) Object.defineProperty(globalThis, 'sessionStorage', original);
    else Reflect.deleteProperty(globalThis, 'sessionStorage');
  });
  const first = await retainLease('owner-a', 'game-a', 'a'.repeat(40), 1);
  await retainLease('owner-a', 'game-a', 'b'.repeat(40), 2);
  assert.equal((await readLease('owner-a', 'game-a'))?.generation, 2);
  assert.equal((await readLease('owner-a', 'game-a', first.hash))?.token, 'a'.repeat(40));
  assert.equal(await readLease('owner-b', 'game-a', first.hash), null);
  assert.equal(await readLease('owner-a', 'game-b', first.hash), null);
  const key = [...values.keys()].find(key => key.endsWith(first.hash))!;
  values.set(key, JSON.stringify({ ...first, token: 'c'.repeat(40) }));
  assert.equal(await readLease('owner-a', 'game-a', first.hash), null);
  values.set('unrelated', 'keep');
  clearLeases();
  assert.deepEqual([...values.entries()], [['unrelated', 'keep']]);
});
