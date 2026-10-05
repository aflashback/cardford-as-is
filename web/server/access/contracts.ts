/** Contract freeze only. M04 supplies policy resolution and authoritative record reads.
 * These codecs validate server records; a matching client object never proves a grant,
 * admission, unlock, ownership, or server time. No client endpoint accepts these inputs.
 */
import type {
  AccessOffer,
  AccessOfferPolicy,
  RegisteredTarget,
  VersionedComponent,
} from '../../shared/contracts.ts';
import { assertContract } from '../../shared/validation.ts';
import { array, freeze, integer, json, object, string } from '../game/kernel/codec.ts';
import type { AccessUnit, Codec } from '../game/kernel/module.ts';

export type VerifiedGrant = {
  id: string;
  beneficiaryId: string;
  source: { kind: 'free' | 'access-trial' | 'purchase' | 'family'; id: string };
  terms: AccessOffer;
  validFrom: number;
  validUntil: number | null;
  revokedAt: number | null;
  accessGeneration: number;
};
export type BucketUsage = {
  bucketId: string;
  beneficiaryId: string;
  periodStart: number;
  periodEnd: number;
  used: number;
  reservations: readonly { id: string; offer: VersionedComponent; units: number }[];
};
export type RecordedAdmission = {
  id: string;
  grantId: string;
  sessionId: string;
  unitId: string;
  admittedAt: number;
  expiresAt: number | null;
  revoked: boolean;
};
export type ExistingUnlock = { id: string; sessionId: string; unitId: string; tools: readonly string[] };
export type AccessOperation =
  | { kind: 'play'; intent: 'start'; sessionId: string; unit: AccessUnit }
  | {
      kind: 'play';
      intent: 'continue';
      sessionId: string;
      unit: AccessUnit;
      admission: RecordedAdmission | null;
    }
  | {
      kind: 'coach';
      toolId: string;
      sessionId: string;
      unit: AccessUnit;
      existingUnlock: ExistingUnlock | null;
    }
  | {
      kind: 'read-saved';
      result: {
        id: string;
        ownerId: string;
        sessionId: string;
        delivered: boolean;
        scope: 'current-game' | 'retained';
        retainedUntil: number | null;
      };
    };
export type AccessResolverInput = {
  policy: AccessOfferPolicy;
  grants: readonly VerifiedGrant[];
  beneficiaryId: string;
  target: RegisteredTarget;
  operation: AccessOperation;
  usage: readonly BucketUsage[];
  now: number;
};
function time(raw: unknown): number | null {
  if (raw === null) return null;
  integer(raw);
  return raw;
}
function bool(raw: unknown): asserts raw is boolean {
  if (typeof raw !== 'boolean') throw new TypeError('Invalid flag.');
}
function strings(raw: unknown): string[] {
  array(raw);
  const result = raw.map((value) => {
    string(value);
    return value;
  });
  if (new Set(result).size !== result.length) throw new TypeError('Duplicate identifier.');
  return result;
}
function component(raw: unknown): VersionedComponent {
  assertContract('VersionedComponent', raw);
  return { ...raw };
}
function unit(raw: unknown): AccessUnit {
  assertContract('CoachedUnit', raw);
  return { ...raw };
}
function offer(raw: unknown): AccessOffer {
  assertContract('AccessOffer', raw);
  if (
    (raw.kind === 'access-trial' &&
      (raw.activation !== 'once-per-identity' || raw.validitySeconds === null)) ||
    (raw.kind === 'paid' && raw.activation !== 'verified-purchase') ||
    (raw.kind === 'free' && raw.activation !== 'automatic')
  )
    throw new TypeError('Offer activation/validity mismatch.');
  return raw;
}
export const accessOfferPolicyCodec: Codec<AccessOfferPolicy> = {
  parse(input) {
    const raw = json(input);
    assertContract('AccessOfferPolicy', raw);
    raw.offers.forEach(offer);
    const ids = raw.offers.map((item) => item.id);
    if (
      new Set(ids).size !== ids.length ||
      raw.precedence.length !== ids.length ||
      raw.precedence.some((id) => !ids.includes(id))
    )
      throw new TypeError('Offer precedence must name each offer exactly once.');
    return freeze(raw);
  },
  encode: json,
};
export const verifiedGrantCodec: Codec<VerifiedGrant> = {
  parse(input) {
    const raw = json(input);
    object(raw, [
      'id',
      'beneficiaryId',
      'source',
      'terms',
      'validFrom',
      'validUntil',
      'revokedAt',
      'accessGeneration',
    ]);
    string(raw.id);
    string(raw.beneficiaryId);
    integer(raw.validFrom);
    integer(raw.accessGeneration);
    object(raw.source, ['kind', 'id']);
    string(raw.source.id);
    const kind = raw.source.kind;
    if (kind !== 'free' && kind !== 'access-trial' && kind !== 'purchase' && kind !== 'family')
      throw new TypeError('Invalid grant source.');
    const terms = offer(raw.terms),
      validUntil = time(raw.validUntil),
      revokedAt = time(raw.revokedAt);
    if (
      (validUntil !== null && validUntil <= raw.validFrom) ||
      (kind === 'free' && terms.kind !== 'free') ||
      (kind === 'access-trial' && terms.kind !== 'access-trial') ||
      ((kind === 'purchase' || kind === 'family') && terms.kind !== 'paid')
    )
      throw new TypeError('Grant terms mismatch.');
    return freeze({
      id: raw.id,
      beneficiaryId: raw.beneficiaryId,
      source: { kind, id: raw.source.id },
      terms,
      validFrom: raw.validFrom,
      validUntil,
      revokedAt,
      accessGeneration: raw.accessGeneration,
    });
  },
  encode: json,
};
export const bucketUsageCodec: Codec<BucketUsage> = {
  parse(input) {
    const raw = json(input);
    object(raw, ['bucketId', 'beneficiaryId', 'periodStart', 'periodEnd', 'used', 'reservations']);
    string(raw.bucketId);
    string(raw.beneficiaryId);
    integer(raw.periodStart);
    integer(raw.periodEnd);
    integer(raw.used);
    array(raw.reservations);
    if (raw.periodEnd <= raw.periodStart) throw new TypeError('Invalid bucket period.');
    const reservations = raw.reservations.map((item) => {
      object(item, ['id', 'offer', 'units']);
      string(item.id);
      integer(item.units, 1);
      return { id: item.id, offer: component(item.offer), units: item.units };
    });
    if (new Set(reservations.map((item) => item.id)).size !== reservations.length)
      throw new TypeError('Duplicate reservation.');
    return freeze({
      bucketId: raw.bucketId,
      beneficiaryId: raw.beneficiaryId,
      periodStart: raw.periodStart,
      periodEnd: raw.periodEnd,
      used: raw.used,
      reservations,
    });
  },
  encode: json,
};
function admission(input: unknown): RecordedAdmission | null {
  if (input === null) return null;
  object(input, ['id', 'grantId', 'sessionId', 'unitId', 'admittedAt', 'expiresAt', 'revoked']);
  string(input.id);
  string(input.grantId);
  string(input.sessionId);
  string(input.unitId);
  integer(input.admittedAt);
  bool(input.revoked);
  const expiresAt = time(input.expiresAt);
  if (expiresAt !== null && expiresAt <= input.admittedAt) throw new TypeError('Invalid admission period.');
  return {
    id: input.id,
    grantId: input.grantId,
    sessionId: input.sessionId,
    unitId: input.unitId,
    admittedAt: input.admittedAt,
    expiresAt,
    revoked: input.revoked,
  };
}
function operation(input: unknown): AccessOperation {
  if (input === null || typeof input !== 'object') throw new TypeError('Invalid access operation.');
  object(input, Object.keys(input));
  const raw: Record<string, unknown> = input;
  if (raw.kind === 'play') {
    if (raw.intent === 'start') {
      object(raw, ['kind', 'intent', 'sessionId', 'unit']);
      string(raw.sessionId);
      return { kind: 'play', intent: 'start', sessionId: raw.sessionId, unit: unit(raw.unit) };
    }
    object(raw, ['kind', 'intent', 'sessionId', 'unit', 'admission']);
    string(raw.sessionId);
    if (raw.intent !== 'continue') throw new TypeError('Invalid play intent.');
    const checkedUnit = unit(raw.unit),
      admitted = admission(raw.admission);
    if (admitted !== null && (admitted.sessionId !== raw.sessionId || admitted.unitId !== checkedUnit.id))
      throw new TypeError('Admission targets another unit.');
    return {
      kind: 'play',
      intent: 'continue',
      sessionId: raw.sessionId,
      unit: checkedUnit,
      admission: admitted,
    };
  }
  if (raw.kind === 'coach') {
    object(raw, ['kind', 'toolId', 'sessionId', 'unit', 'existingUnlock']);
    string(raw.toolId);
    string(raw.sessionId);
    const checkedUnit = unit(raw.unit);
    let existingUnlock: ExistingUnlock | null = null;
    if (raw.existingUnlock !== null) {
      object(raw.existingUnlock, ['id', 'sessionId', 'unitId', 'tools']);
      string(raw.existingUnlock.id);
      string(raw.existingUnlock.sessionId);
      string(raw.existingUnlock.unitId);
      if (raw.existingUnlock.sessionId !== raw.sessionId || raw.existingUnlock.unitId !== checkedUnit.id)
        throw new TypeError('Unlock targets another unit.');
      existingUnlock = {
        id: raw.existingUnlock.id,
        sessionId: raw.existingUnlock.sessionId,
        unitId: raw.existingUnlock.unitId,
        tools: strings(raw.existingUnlock.tools),
      };
    }
    return { kind: 'coach', toolId: raw.toolId, sessionId: raw.sessionId, unit: checkedUnit, existingUnlock };
  }
  if (raw.kind === 'read-saved') {
    object(raw, ['kind', 'result']);
    object(raw.result, ['id', 'ownerId', 'sessionId', 'delivered', 'scope', 'retainedUntil']);
    string(raw.result.id);
    string(raw.result.ownerId);
    string(raw.result.sessionId);
    bool(raw.result.delivered);
    if (raw.result.scope !== 'current-game' && raw.result.scope !== 'retained')
      throw new TypeError('Invalid saved result scope.');
    return {
      kind: 'read-saved',
      result: {
        id: raw.result.id,
        ownerId: raw.result.ownerId,
        sessionId: raw.result.sessionId,
        delivered: raw.result.delivered,
        scope: raw.result.scope,
        retainedUntil: time(raw.result.retainedUntil),
      },
    };
  }
  throw new TypeError('Unsupported access operation.');
}
export const accessOperationCodec: Codec<AccessOperation> = {
  parse: (input) => freeze(operation(json(input))),
  encode: json,
};
export const accessResolverInputCodec: Codec<AccessResolverInput> = {
  parse(input) {
    const raw = json(input);
    object(raw, ['policy', 'grants', 'beneficiaryId', 'target', 'operation', 'usage', 'now']);
    string(raw.beneficiaryId);
    integer(raw.now);
    array(raw.grants);
    array(raw.usage);
    assertContract('RegisteredTarget', raw.target);
    const grants = raw.grants.map(verifiedGrantCodec.parse),
      usage = raw.usage.map(bucketUsageCodec.parse);
    if (
      grants.some((grant) => grant.beneficiaryId !== raw.beneficiaryId) ||
      usage.some((bucket) => bucket.beneficiaryId !== raw.beneficiaryId) ||
      new Set(grants.map((grant) => grant.id)).size !== grants.length ||
      new Set(usage.map((bucket) => `${bucket.bucketId}:${bucket.periodStart}`)).size !== usage.length
    )
      throw new TypeError('Mismatched or duplicate access records.');
    return freeze({
      policy: accessOfferPolicyCodec.parse(raw.policy),
      grants,
      beneficiaryId: raw.beneficiaryId,
      target: raw.target,
      operation: accessOperationCodec.parse(raw.operation),
      usage,
      now: raw.now,
    });
  },
  encode: json,
};
