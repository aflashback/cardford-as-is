import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RANDOM_VERSION } from '../../strategy/plan/random.ts';
import { DEAL_GENERATOR } from './deals.ts';

/**
 * SG-05: the committed seed ledger. Every range that any comparison has read, or may
 * read, is declared here with its purpose. A sealed range is read once: the read is
 * recorded in the ledger state file, and a second read is refused.
 */
export const LEDGER_VERSION = '1.0.0';

export type LedgerPurpose =
  | 'historical'
  | 'golden'
  | 'development'
  | 'pilot'
  | 'confirmation'
  | 'cases'
  | 'matches'
  | 'stress'
  | 'tests';

/** `open` may be read again, `sealed` is unread and single-use, `consumed` must not feed a new comparison. */
export type LedgerStatus = 'open' | 'sealed' | 'consumed';

export type LedgerEntry = {
  id: string;
  generator: string;
  from: number;
  count: number;
  purpose: LedgerPurpose;
  status: LedgerStatus;
  note: string;
  /** Declares this range as a part of another entry. It is the only permitted overlap. */
  within?: string;
};

export type SeedRange = { from: number; to: number; count: number };

const LEGACY = 'legacy-linear-congruential';
const UNRECORDED = 'unrecorded';

const sealed = (id: string, purpose: LedgerPurpose, from: number, count: number, note: string): LedgerEntry => ({
  id,
  generator: DEAL_GENERATOR,
  from,
  count,
  purpose,
  status: 'sealed',
  note,
});

const open = (id: string, purpose: LedgerPurpose, from: number, count: number, note: string): LedgerEntry => ({
  id,
  generator: DEAL_GENERATOR,
  from,
  count,
  purpose,
  status: 'open',
  note,
});

const used = (id: string, generator: string, from: number, to: number, note: string): LedgerEntry => ({
  id,
  generator,
  from,
  count: to - from + 1,
  purpose: 'historical',
  status: 'consumed',
  note,
});

const ENTRIES: LedgerEntry[] = [
    used('historical-1', LEGACY, 1, 30, 'Rule regression and the development split of the first local smoke run.'),
    used('historical-10001', LEGACY, 10_001, 10_008, 'Held-out seeds of the first local smoke run.'),
    used('historical-72001', LEGACY, 72_001, 72_024, 'Exploratory 512-round comparison. It established no strength claim.'),
    used('historical-93011', LEGACY, 93_011, 93_120, 'Positions of the legacy case list.'),
    used('historical-172001', LEGACY, 172_001, 172_008, 'Carried-state rounds of the exploratory comparison.'),
    {
      id: 'golden-610001',
      generator: LEGACY,
      from: 610_001,
      count: 24,
      purpose: 'golden',
      status: 'open',
      note: 'Golden decisions that pin the frozen baseline. Read by parity checks only.',
    },
    used('historical-840001', LEGACY, 840_001, 849_999, 'Range reserved by the fresh-style matrix; 840001 to 840012 were read.'),
    {
      id: 'tests',
      generator: RANDOM_VERSION,
      from: 3_000_001,
      count: 299_999,
      purpose: 'tests',
      status: 'open',
      note: 'Automated checks. Never a source of reported comparison figures.',
    },
    used('historical-5000001', UNRECORDED, 5_000_001, 5_000_999, 'Development exploration read during design review.'),
    open('development', 'development', 6_000_001, 400, 'Reusable development range, shared by every mode.'),
    {
      ...open('pilot', 'pilot', 6_000_001, 200, 'First 200 development seeds, used to size a confirmation run.'),
      within: 'development',
    },
    sealed('confirmation-1', 'confirmation', 7_100_001, 1_200, 'First profile gate in version order.'),
    sealed('confirmation-2', 'confirmation', 7_200_001, 1_200, 'Second profile gate in version order.'),
    sealed('confirmation-3', 'confirmation', 7_300_001, 1_200, 'Third profile gate in version order.'),
    sealed('confirmation-4', 'confirmation', 7_400_001, 1_200, 'Fourth profile gate in version order.'),
    open('matches-development', 'matches', 8_000_001, 200, 'Complete-session streams for development.'),
    sealed('matches-confirmation-1', 'matches', 8_100_001, 200, 'Complete-session streams, first profile gate.'),
    sealed('matches-confirmation-2', 'matches', 8_200_001, 200, 'Complete-session streams, second profile gate.'),
    sealed('matches-confirmation-3', 'matches', 8_300_001, 200, 'Complete-session streams, third profile gate.'),
    sealed('matches-confirmation-4', 'matches', 8_400_001, 200, 'Complete-session streams, fourth profile gate.'),
    open('cases', 'cases', 9_000_001, 2_000, 'Streams searched for reviewable positions.'),
    open('stress', 'stress', 9_500_001, 4_000, 'Declared stress generators. No natural-frequency claim.'),
];

export const LEDGER: readonly LedgerEntry[] = Object.freeze(ENTRIES.map((entry) => Object.freeze({ ...entry })));

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');

/** Committed record of which sealed ranges have been read. */
export const LEDGER_STATE_PATH = resolve(REPOSITORY_ROOT, 'qa/evaluation/gate/ledger-state.json');

export type ConsumedRecord = {
  id: string;
  manifestId: string;
  manifestHash: string;
  /** Recorded verbatim from the caller. */
  commit: string;
  /** Recorded verbatim from the caller; this module never reads a clock. */
  date: string;
};

export type LedgerState = { schemaVersion: typeof LEDGER_VERSION; consumed: ConsumedRecord[] };

export type LedgerOptions = { ledger?: readonly LedgerEntry[]; statePath?: string };

export class SeedLedgerError extends Error {
  override name = 'SeedLedgerError';
}

const lastOf = (entry: Pick<LedgerEntry, 'from' | 'count'>) => entry.from + entry.count - 1;

export function entryOf(id: string, ledger: readonly LedgerEntry[] = LEDGER): LedgerEntry {
  const found = ledger.find((entry) => entry.id === id);
  if (!found) throw new SeedLedgerError(`The seed ledger has no entry named ${id}.`);
  return found;
}

export function rangeOf(id: string, ledger: readonly LedgerEntry[] = LEDGER): SeedRange {
  const entry = entryOf(id, ledger);
  return { from: entry.from, to: lastOf(entry), count: entry.count };
}

/** Every seed of a range, ascending. */
export function seedsOf(range: Pick<SeedRange, 'from' | 'count'>): number[] {
  return Array.from({ length: range.count }, (_, offset) => range.from + offset);
}

/** Fails on a malformed entry or on any overlap that is not a declared part of another entry. */
export function assertDisjoint(ledger: readonly LedgerEntry[] = LEDGER): void {
  const ids = new Set<string>();
  for (const entry of ledger) {
    if (!entry.id || ids.has(entry.id)) throw new SeedLedgerError(`Ledger entry IDs must be unique: ${entry.id}`);
    ids.add(entry.id);
    if (!Number.isInteger(entry.from) || !Number.isInteger(entry.count) || entry.from < 0 || entry.count < 1)
      throw new SeedLedgerError(`Ledger entry ${entry.id} has an invalid range.`);
    if (lastOf(entry) > 0xffffffff)
      throw new SeedLedgerError(`Ledger entry ${entry.id} leaves the unsigned 32-bit range.`);
    if (!entry.generator) throw new SeedLedgerError(`Ledger entry ${entry.id} names no generator.`);
  }
  for (const entry of ledger) {
    if (entry.within === undefined) continue;
    const whole = ledger.find((other) => other.id === entry.within);
    if (!whole || whole === entry || whole.within !== undefined)
      throw new SeedLedgerError(`Ledger entry ${entry.id} is declared within an unknown entry.`);
    if (entry.from < whole.from || lastOf(entry) > lastOf(whole))
      throw new SeedLedgerError(`Ledger entry ${entry.id} is not contained in ${whole.id}.`);
    if (entry.generator !== whole.generator || entry.status !== whole.status)
      throw new SeedLedgerError(`Ledger entry ${entry.id} must share the generator and status of ${whole.id}.`);
  }
  const ordered = [...ledger].sort((left, right) => left.from - right.from || lastOf(right) - lastOf(left));
  for (let index = 0; index < ordered.length; index++)
    for (let next = index + 1; next < ordered.length && ordered[next].from <= lastOf(ordered[index]); next++) {
      const [first, second] = [ordered[index], ordered[next]];
      const declared = second.within === first.id || first.within === second.id;
      if (!declared) throw new SeedLedgerError(`Seed ranges overlap: ${first.id} and ${second.id}.`);
    }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const RECORD_FIELDS = ['id', 'manifestId', 'manifestHash', 'commit', 'date'] as const;

function parseState(text: string, path: string): LedgerState {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new SeedLedgerError(`The ledger state file is not valid JSON: ${path}`);
  }
  if (!isRecord(parsed) || parsed.schemaVersion !== LEDGER_VERSION || !Array.isArray(parsed.consumed))
    throw new SeedLedgerError(`The ledger state file has an unknown shape or version: ${path}`);
  const consumed = parsed.consumed.map((value): ConsumedRecord => {
    if (!isRecord(value)) throw new SeedLedgerError(`The ledger state file holds a malformed record: ${path}`);
    const record = {} as ConsumedRecord;
    for (const field of RECORD_FIELDS) {
      const text = value[field];
      if (typeof text !== 'string' || text.length === 0)
        throw new SeedLedgerError(`The ledger state file holds a record without ${field}: ${path}`);
      record[field] = text;
    }
    return record;
  });
  return { schemaVersion: LEDGER_VERSION, consumed };
}

/** A missing file means that nothing has been read. A damaged file fails closed. */
export function readLedgerState(statePath: string = LEDGER_STATE_PATH): LedgerState {
  if (!existsSync(statePath)) return { schemaVersion: LEDGER_VERSION, consumed: [] };
  return parseState(readFileSync(statePath, 'utf8'), statePath);
}

export function consumedRecord(id: string, options: LedgerOptions = {}): ConsumedRecord | undefined {
  return readLedgerState(options.statePath).consumed.find((record) => record.id === id);
}

/** The declared status, or `consumed` once the state file records a read. */
export function statusOf(id: string, options: LedgerOptions = {}): LedgerStatus {
  const entry = entryOf(id, options.ledger);
  if (entry.status === 'sealed' && consumedRecord(id, options)) return 'consumed';
  return entry.status;
}

/** Records the single read of a sealed range. A range that was read before is refused. */
export function consume(record: ConsumedRecord, options: LedgerOptions = {}): ConsumedRecord {
  const statePath = options.statePath ?? LEDGER_STATE_PATH;
  const entry = entryOf(record.id, options.ledger);
  if (entry.status !== 'sealed')
    throw new SeedLedgerError(`Only a sealed range can be consumed; ${entry.id} is ${entry.status}.`);
  const stored = {} as ConsumedRecord;
  for (const field of RECORD_FIELDS) {
    const text = record[field];
    if (typeof text !== 'string' || text.trim().length === 0)
      throw new SeedLedgerError(`A consumed range must record ${field}.`);
    stored[field] = text;
  }
  const state = readLedgerState(statePath);
  const earlier = state.consumed.find((item) => item.id === entry.id);
  if (earlier)
    throw new SeedLedgerError(
      `Seed range ${entry.id} was already read on ${earlier.date} by manifest ${earlier.manifestId}; it cannot run again.`,
    );
  state.consumed.push(stored);
  mkdirSync(dirname(statePath), { recursive: true });
  const pending = `${statePath}.pending`;
  writeFileSync(pending, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  renameSync(pending, statePath);
  return stored;
}

export type SeedRequest = {
  purpose: 'development' | 'confirmation';
  dealGenerator: string;
  seeds: { from: number; count: number; ledgerEntry: string };
};

const DEVELOPMENT_PURPOSES: readonly LedgerPurpose[] = [
  'development',
  'pilot',
  'matches',
  'cases',
  'stress',
  'tests',
];

/**
 * Checks a manifest's seed request against the ledger before anything is read.
 * Returns notes for the run summary. It records nothing; see `consume`.
 */
export function assertReadable(request: SeedRequest, options: LedgerOptions = {}): string[] {
  const ledger = options.ledger ?? LEDGER;
  assertDisjoint(ledger);
  const entry = entryOf(request.seeds.ledgerEntry, ledger);
  const { from, count } = request.seeds;
  if (!Number.isInteger(from) || !Number.isInteger(count) || count < 1)
    throw new SeedLedgerError('A seed request needs an integer start and a positive count.');
  if (from < entry.from || from + count - 1 > lastOf(entry))
    throw new SeedLedgerError(
      `Seeds ${from} to ${from + count - 1} leave ledger entry ${entry.id} (${entry.from} to ${lastOf(entry)}).`,
    );
  const status = statusOf(entry.id, options);
  const notes: string[] = [];
  if (request.purpose === 'confirmation') {
    if (entry.status !== 'sealed')
      throw new SeedLedgerError(`A confirmation run reads a sealed range; ${entry.id} is declared ${entry.status}.`);
    if (status === 'consumed') {
      const earlier = consumedRecord(entry.id, options);
      throw new SeedLedgerError(
        `Seed range ${entry.id} was already read on ${earlier?.date} by manifest ${earlier?.manifestId}; it cannot run again.`,
      );
    }
    if (request.dealGenerator !== entry.generator)
      throw new SeedLedgerError(
        `The manifest names generator ${request.dealGenerator}; ledger entry ${entry.id} is declared for ${entry.generator}.`,
      );
    return notes;
  }
  if (status !== 'open' || !DEVELOPMENT_PURPOSES.includes(entry.purpose))
    throw new SeedLedgerError(
      `A development run reads an open development range; ${entry.id} is ${status} with purpose ${entry.purpose}.`,
    );
  if (request.dealGenerator !== entry.generator)
    notes.push(
      `The manifest names generator ${request.dealGenerator}; ledger entry ${entry.id} is declared for ${entry.generator}.`,
    );
  return notes;
}
