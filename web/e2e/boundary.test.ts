import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('production table does not import browser-owned game, strategy or aggregate persistence', () => {
  const source = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /from ['"]\.\/(?:game|coach|storage)['"]/);
});

test('card preparation does not install an automatic human-play timer', () => {
  const source = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /setTimeout\([^;]*playChosenCard/s);
});
