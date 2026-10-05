import type { RegisteredAnalysis } from '../../shared/contracts.ts';
import { array, freeze, integer, json, object, string } from '../game/kernel/codec.ts';
import type { Json, Pin } from '../game/kernel/module.ts';
import {
  assertSeat,
  parseCompetition,
  parseControllers,
  type Competition,
  type Controller,
  type Seat,
} from '../game/kernel/seats.ts';
import {
  parsePin,
  parseRegisteredAnalysis,
  type BoundSession,
  type SeatChoice,
} from '../game/kernel/session.ts';

export type RecordedOperation =
  | { kind: 'actor'; seat: Seat; candidateId: string }
  | { kind: 'sealed'; windowId: string; choices: readonly SeatChoice[] }
  | { kind: 'automatic'; transitionId: string }
  | { kind: 'chance'; requestId: string; material: Json }
  | { kind: 'continue-round' };
export type JournalEntry = { revision: number; commandId: string; operation: RecordedOperation };
export type AnalysisAudit = {
  id: string;
  policyId: string;
  inputDigest: string;
  observationSchemaVersion: string;
  analysis: RegisteredAnalysis;
};
export type GameDocument = {
  documentVersion: '2.0.0';
  pin: Pin;
  competition: Competition;
  controllers: readonly Controller[];
  payload: Json;
  journal: { version: '2.0.0'; revision: number; entries: readonly JournalEntry[] };
  audits: { version: '2.0.0'; entries: readonly AnalysisAudit[] };
};
function parseOperation(input: unknown): RecordedOperation {
  if (input === null || typeof input !== 'object') throw new TypeError('Missing operation.');
  object(input, Object.keys(input));
  const raw: Record<string, unknown> = input;
  switch (raw.kind) {
    case 'actor':
      object(raw, ['kind', 'seat', 'candidateId']);
      assertSeat(raw.seat);
      string(raw.candidateId);
      return { kind: raw.kind, seat: raw.seat, candidateId: raw.candidateId };
    case 'sealed': {
      object(raw, ['kind', 'windowId', 'choices']);
      string(raw.windowId);
      array(raw.choices);
      const choices = raw.choices.map((choice) => {
        object(choice, ['seat', 'candidateId']);
        assertSeat(choice.seat);
        string(choice.candidateId);
        return { seat: choice.seat, candidateId: choice.candidateId };
      });
      if (!choices.length || new Set(choices.map((choice) => choice.seat)).size !== choices.length)
        throw new TypeError('Invalid sealed journal.');
      return { kind: raw.kind, windowId: raw.windowId, choices };
    }
    case 'automatic':
      object(raw, ['kind', 'transitionId']);
      string(raw.transitionId);
      return { kind: raw.kind, transitionId: raw.transitionId };
    case 'chance':
      object(raw, ['kind', 'requestId', 'material']);
      string(raw.requestId);
      return { kind: raw.kind, requestId: raw.requestId, material: json(raw.material) };
    case 'continue-round':
      object(raw, ['kind']);
      return { kind: raw.kind };
    default:
      throw new TypeError('Unknown operation.');
  }
}
/** Envelope and metadata are private. A matching typed registration validates payload next. */
export function parseDocumentEnvelope(input: unknown): GameDocument {
  const raw = json(input);
  object(raw, ['documentVersion', 'pin', 'competition', 'controllers', 'payload', 'journal', 'audits']);
  if (raw.documentVersion !== '2.0.0')
    throw new TypeError('Unsupported document version; use the original V1 reader for legacy data.');
  const pin = parsePin(raw.pin),
    competition = parseCompetition(raw.competition),
    controllers = parseControllers(raw.controllers);
  object(raw.journal, ['version', 'revision', 'entries']);
  if (raw.journal.version !== '2.0.0') throw new TypeError('Unsupported journal version.');
  integer(raw.journal.revision);
  array(raw.journal.entries);
  const entries = raw.journal.entries.map((entry) => {
    object(entry, ['revision', 'commandId', 'operation']);
    integer(entry.revision, 1);
    string(entry.commandId);
    return {
      revision: entry.revision,
      commandId: entry.commandId,
      operation: parseOperation(entry.operation),
    };
  });
  if (
    entries.length !== raw.journal.revision ||
    entries.some((entry, i) => entry.revision !== i + 1) ||
    new Set(entries.map((entry) => entry.commandId)).size !== entries.length
  )
    throw new TypeError('Invalid journal revisions or command identities.');
  object(raw.audits, ['version', 'entries']);
  if (raw.audits.version !== '2.0.0') throw new TypeError('Unsupported audit version.');
  array(raw.audits.entries);
  const audits = raw.audits.entries.map((entry) => {
    object(entry, ['id', 'policyId', 'inputDigest', 'observationSchemaVersion', 'analysis']);
    string(entry.id);
    string(entry.policyId);
    string(entry.inputDigest);
    string(entry.observationSchemaVersion);
    const analysis = parseRegisteredAnalysis(entry.analysis, pin);
    if (
      !/^[a-f0-9]{64}$/.test(entry.inputDigest) ||
      entry.observationSchemaVersion !== pin.observationSchemaVersion
    )
      throw new TypeError('Audit pin or digest mismatch.');
    return {
      id: entry.id,
      policyId: entry.policyId,
      inputDigest: entry.inputDigest,
      observationSchemaVersion: entry.observationSchemaVersion,
      analysis,
    };
  });
  if (new Set(audits.map((entry) => entry.id)).size !== audits.length)
    throw new TypeError('Duplicate audit identity.');
  return freeze({
    documentVersion: '2.0.0',
    pin,
    competition,
    controllers,
    payload: json(raw.payload),
    journal: { version: '2.0.0', revision: raw.journal.revision, entries },
    audits: { version: '2.0.0', entries: audits },
  });
}
