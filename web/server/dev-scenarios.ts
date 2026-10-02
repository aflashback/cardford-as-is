import { readFile } from 'node:fs/promises';
import { validateDeal, type Card, type Seat } from './game/index.ts';
import type { DevScenarioView } from '../shared/contracts.ts';
import { assertContract } from '../shared/validation.ts';

export interface DevScenarioDeal {
  metadata: DevScenarioView;
  dealer: Seat;
  deck: Card[];
}

const seats = ['south', 'west', 'north', 'east'] as const;
function object(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Dev scenarios require objects.');
  const result = value as Record<string, unknown>;
  if (Object.keys(result).length !== keys.length || keys.some((key) => !Object.hasOwn(result, key)))
    throw new Error('Dev scenarios contain missing or unexpected fields.');
  return result;
}

/** RD-01: trusted, private opening deals; the public contract contains metadata only. */
export function parseDevScenarios(value: unknown): DevScenarioDeal[] {
  const file = object(value, ['schemaVersion', 'scenarios']);
  if (file.schemaVersion !== '1.0.0') throw new Error('Unsupported dev scenario file version.');
  if (!Array.isArray(file.scenarios) || file.scenarios.length < 1 || file.scenarios.length > 100)
    throw new Error('A dev scenario file requires 1 to 100 scenarios.');
  const rows: unknown[] = file.scenarios;
  const ids = new Set<string>();
  return rows.map((value) => {
    const row = object(value, ['id', 'version', 'label', 'mode', 'dealer', 'hands']);
    const metadata = { id: row.id, version: row.version, label: row.label, mode: row.mode };
    assertContract('DevScenarioView', metadata);
    if (ids.has(metadata.id)) throw new Error('Duplicate dev scenario ID.');
    ids.add(metadata.id);
    if (typeof row.dealer !== 'number' || !Number.isInteger(row.dealer) || row.dealer < 0 || row.dealer > 3)
      throw new Error('Dev scenario dealer must be a seat from 0 to 3.');
    const dealer = row.dealer as Seat;
    const source = object(row.hands, seats);
    const hands = seats.map((seat) => {
      const hand = source[seat];
      if (!Array.isArray(hand) || hand.length !== 13)
        throw new Error('Each dev scenario hand must contain 13 cards.');
      const cards: unknown[] = hand;
      return cards.map((card) => {
        assertContract('Card', card);
        return card;
      });
    });
    // The engine deals singly clockwise from the seat after the dealer.
    const first = (dealer + 1) % 4;
    const deck: Card[] = [];
    for (let round = 0; round < 13; round++)
      for (let offset = 0; offset < 4; offset++) deck.push(hands[(first + offset) % 4][round]);
    validateDeal(deck);
    return { metadata, dealer, deck };
  });
}

export async function loadDevScenarios(path: string | null): Promise<DevScenarioDeal[]> {
  if (!path) return [];
  const text = await readFile(path, 'utf8');
  if (Buffer.byteLength(text, 'utf8') > 1024 * 1024) throw new Error('Dev scenario file exceeds 1 MiB.');
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error('Dev scenario file is not valid JSON.');
  }
  return parseDevScenarios(value);
}
