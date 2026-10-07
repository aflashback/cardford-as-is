import assert from 'node:assert/strict';
import test from 'node:test';
import { backendFrom, externalUrl, webPlatform } from '../src/platform/web.ts';

test('backend selection is explicit and never falls back to another authority', () => {
  assert.equal(backendFrom(undefined), 'node');
  assert.equal(backendFrom('node'), 'node');
  assert.equal(backendFrom('go'), 'go');
  assert.throws(() => backendFrom('automatic'));
});

test('foreground notifications require a visible document and detach on cleanup', (context) => {
  const doc = Object.assign(new EventTarget(), { hidden: true });
  const win = new EventTarget();
  const originals = ['document', 'window'].map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const);
  Object.defineProperty(globalThis, 'document', { configurable: true, value: doc });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: win });
  context.after(() => {
    for (const [name, original] of originals) {
      if (original) Object.defineProperty(globalThis, name, original);
      else Reflect.deleteProperty(globalThis, name);
    }
  });
  let called = 0;
  const stop = webPlatform.onForeground(() => called++);
  win.dispatchEvent(new Event('online'));
  assert.equal(called, 0);
  doc.hidden = false;
  for (const event of ['focus', 'pageshow', 'online']) win.dispatchEvent(new Event(event));
  doc.dispatchEvent(new Event('visibilitychange'));
  assert.equal(called, 4);
  stop();
  win.dispatchEvent(new Event('focus'));
  assert.equal(called, 4);
});

test('external links require an exact configured HTTPS origin without credentials', () => {
  const allowlist = ['https://billing.example.test'];
  assert.equal(externalUrl('https://billing.example.test/manage?id=1', allowlist),
    'https://billing.example.test/manage?id=1');
  for (const url of ['javascript:alert(1)', 'http://billing.example.test/manage',
    'https://billing.example.test.evil.test/manage', 'https://user@billing.example.test/manage']) {
    assert.throws(() => externalUrl(url, allowlist));
  }
  assert.throws(() => externalUrl('https://billing.example.test/manage', []));
});
