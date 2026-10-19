/** Offline hook/DOM contract checks. No browser, renderer, or visual acceptance. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../src/rally/appearance.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 },
}).outputText;

function harness(options: { stored?: string | null; readBlocked?: boolean; writeBlocked?: boolean } = {}) {
  let stored = options.stored ?? null;
  let state: unknown;
  let initialized = false;
  let contextValue: unknown;
  let mounted = false;
  const writes: string[] = [];
  const listeners = new Map<string, (event: unknown) => void>();
  const cleanups: (() => void)[] = [];
  const document = { documentElement: { dataset: {} as Record<string, string> } };
  const storage = {
    getItem() { if (options.readBlocked) throw new Error('Storage denied'); return stored; },
    setItem(_key: string, value: string) {
      if (options.writeBlocked) throw new Error('Storage denied');
      writes.push(value); stored = value;
    },
  };
  const react = {
    createContext: () => ({ Provider: 'appearance-provider' }),
    useContext: () => contextValue,
    useCallback: (callback: unknown) => callback,
    useState(initial: () => unknown) {
      if (!initialized) { state = initial(); initialized = true; }
      return [state, (value: unknown) => { state = value; }];
    },
    useLayoutEffect: (callback: () => void) => callback(),
    useEffect(callback: () => (() => void) | undefined) {
      if (!mounted) { const cleanup = callback(); if (cleanup) cleanups.push(cleanup); }
    },
  };
  const exports: Record<string, (...args: never[]) => unknown> = {};
  const sandbox = { exports, document, window: {
    localStorage: storage,
    addEventListener: (name: string, listener: (event: unknown) => void) => listeners.set(name, listener),
    removeEventListener: (name: string) => listeners.delete(name),
  }, require(name: string) {
    if (name === 'react') return react;
    if (name === 'react/jsx-runtime') return { jsx: (type: unknown, props: Record<string, unknown>) => ({ type, props }), jsxs: (type: unknown, props: Record<string, unknown>) => ({ type, props }) };
    if (name === 'lucide-react') return { Moon: 'Moon', Sun: 'Sun', Sunset: 'Sunset' };
    throw new Error(`Unexpected dependency: ${name}`);
  } };
  vm.runInNewContext(compiled, sandbox);
  function render() {
    const node = (exports.AppearanceProvider as (props: { children: null }) => { props: { value: { theme: string; setTheme: (theme: string) => void } } })({ children: null });
    contextValue = node.props.value; mounted = true;
    return node.props.value;
  }
  return { render, document, writes, storage, listeners, exports,
    emit(key: string | null, newValue: string | null, storageArea: unknown = storage) { listeners.get('storage')?.({ key, newValue, storageArea }); },
    close() { cleanups.forEach(cleanup => cleanup()); },
  };
}

test('appearance boots from a valid local choice and safely defaults for corrupt or unavailable storage', () => {
  for (const stored of ['light', 'dark', 'warm']) {
    const h = harness({ stored }); assert.equal(h.render().theme, stored); assert.equal(h.document.documentElement.dataset.theme, stored);
  }
  for (const options of [{}, { stored: 'unknown-theme' }, { stored: '{malformed' }, { readBlocked: true }]) {
    const h = harness(options); assert.equal(h.render().theme, 'light');
  }
});

test('an explicit choice updates this visit even if persistence is blocked', () => {
  for (const writeBlocked of [false, true]) {
    const h = harness({ writeBlocked }); h.render().setTheme('warm');
    assert.equal(h.render().theme, 'warm'); assert.equal(h.document.documentElement.dataset.theme, 'warm');
    assert.deepEqual(h.writes, writeBlocked ? [] : ['warm']);
    h.render().setTheme('invalid'); assert.equal(h.render().theme, 'warm');
  }
});

test('local appearance follows another tab and clears without echoing storage writes', () => {
  const h = harness({ stored: 'dark' }); h.render();
  h.emit('unrelated-key', 'warm'); assert.equal(h.render().theme, 'dark');
  h.emit('cardford-rally-appearance', 'warm', {}); assert.equal(h.render().theme, 'dark');
  h.emit('cardford-rally-appearance', 'warm'); assert.equal(h.render().theme, 'warm');
  h.emit(null, null); assert.equal(h.render().theme, 'light');
  assert.deepEqual(h.writes, []); h.close(); assert.equal(h.listeners.size, 0);
});

test('theme picker exposes named pressed buttons and the selected action uses the provider', () => {
  const h = harness({ stored: 'dark' }); h.render();
  const picker = (h.exports.ThemePicker as (props: { label: string }) => { props: { role: string; 'aria-label': string; children: { props: { 'aria-pressed': boolean; onClick: () => void } }[] } })({ label: 'Table appearance' });
  assert.equal(picker.props.role, 'group'); assert.equal(picker.props['aria-label'], 'Table appearance');
  assert.deepEqual(Array.from(picker.props.children, child => child.props['aria-pressed']), [false, true, false]);
  picker.props.children[2].props.onClick(); assert.equal(h.render().theme, 'warm');
});
