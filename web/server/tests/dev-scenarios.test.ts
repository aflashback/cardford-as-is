import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { mkdtemp, writeFile, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadDevScenarios, parseDevScenarios } from '../dev-scenarios.ts';
import { createGame, fullDeck, type Seat } from '../game/index.ts';
import { observe } from '../observations/index.ts';
import { validateContract } from '../../shared/validation.ts';

const sampleFile = fileURLToPath(new URL('../../../examples/dev-deals.json', import.meta.url));
const fixture = () => ({
  schemaVersion: '1.0.0',
  scenarios: [
    {
      id: 'opening-a',
      version: '1.0.0',
      label: 'Opening A',
      mode: 'hearts',
      dealer: 3,
      hands: {
        south: fullDeck().slice(0, 13),
        west: fullDeck().slice(13, 26),
        north: fullDeck().slice(26, 39),
        east: fullDeck().slice(39),
      },
    },
  ],
});

test('RD-01: fixed hands survive every dealer position and every game mode', () => {
  for (const mode of ['hearts', 'spades-solo', 'spades-partners'])
    for (const dealer of [0, 1, 2, 3] as Seat[]) {
      const file = fixture();
      Object.assign(file.scenarios[0], { mode, dealer });
      const before = structuredClone(file);
      const [scenario] = parseDevScenarios(file);
      const state = createGame({ id: 'fixture', mode: scenario.metadata.mode, dealer }, scenario.deck);
      assert.deepEqual(state.hands, Object.values(file.scenarios[0].hands));
      assert.equal(state.dealer, dealer);
      assert.deepEqual(file, before);
      assert.deepEqual(parseDevScenarios(file), [scenario]);
      const observation = observe(state, 0);
      assert.equal('scenario' in observation, false);
      assert.equal('deck' in observation, false);
      assert.equal('hands' in observation, false);
    }
});

test('RD-01: malformed, incomplete, duplicate and unexpected fixture data fail closed', () => {
  const file = fixture(),
    scenario = file.scenarios[0];
  const invalid: unknown[] = [
    null,
    [],
    { ...file, seed: 17 },
    { ...file, schemaVersion: '2.0.0' },
    { ...file, scenarios: [] },
    { ...file, scenarios: [scenario, scenario] },
    ...[
      { ...scenario, mode: 'poker' },
      { ...scenario, dealer: 4 },
      { ...scenario, dealer: '3' },
      { ...scenario, dealer: 1.5 },
      { ...scenario, id: '../file' },
      { ...scenario, version: 'latest' },
      { ...scenario, label: 'Line\nbreak' },
      { ...scenario, token: 'canary' },
      { ...scenario, hands: { ...scenario.hands, north: scenario.hands.south } },
      { ...scenario, hands: { ...scenario.hands, south: scenario.hands.south.slice(1) } },
      { ...scenario, hands: { ...scenario.hands, south: ['S1', ...scenario.hands.south.slice(1)] } },
      { ...scenario, hands: { ...scenario.hands, observer: [] } },
    ].map((item) => ({ ...file, scenarios: [item] })),
  ];
  for (const value of invalid) assert.throws(() => parseDevScenarios(value));
});

test('RD-01: shipped examples are valid, separate by mode and return metadata only', async () => {
  const scenarios = await loadDevScenarios(sampleFile);
  assert.equal(scenarios.length, 3);
  assert.deepEqual(
    scenarios.map((item) => item.metadata.mode),
    ['hearts', 'spades-solo', 'spades-partners'],
  );
  assert.equal(
    validateContract('DevScenariosView', { scenarios: scenarios.map((item) => item.metadata) }),
    true,
  );
  assert.deepEqual(await loadDevScenarios(null), []);
  assert.equal(
    validateContract('DevScenarioView', { ...scenarios[0].metadata, deck: scenarios[0].deck }),
    false,
  );
  assert.equal(validateContract('DevScenariosView', { scenarios }), false);
});

test('RD-01: unreadable, malformed and oversized files cannot enable a partial catalog', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'cardford-dev-deals-'));
  const path = join(directory, 'scenarios.json');
  try {
    await assert.rejects(loadDevScenarios(path));
    await writeFile(path, '{ invalid JSON');
    await assert.rejects(loadDevScenarios(path), /not valid JSON/);
    await writeFile(path, ' '.repeat(1024 * 1024 + 1));
    await assert.rejects(loadDevScenarios(path), /exceeds/);
  } finally {
    await unlink(path);
    await rmdir(directory);
  }
});
