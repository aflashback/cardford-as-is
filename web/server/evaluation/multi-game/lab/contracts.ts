import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync,readdirSync } from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import type { LabRun,LabDecision,LabReview } from './types.generated.ts';
import { assertContract } from '../../../../shared/validation.ts';

// JSON Schema is authoritative at every boundary; generate.mjs emits lab types
// and reuses generated public DTOs without filesystem/network dereferencing.
export type JsonObject=Record<string,unknown>;
export type RunEnvelope=LabRun;
export type SeatPolicy=LabRun['lab']['seatPolicies'][number];
export type DecisionRecord=LabDecision;
export type ReviewResult=Pick<LabReview,'status'|'verdict'|'acceptableActions'|'reasons'|'dimensions'>;
export type ReviewRecord=LabReview;
const schemaRoot=new URL('../../../../../contracts/evaluation-lab/',import.meta.url);
const ajv=new Ajv2020({allErrors:true,strict:false});
const publicGames=new URL('../../../../shared/games/',import.meta.url);
for(const file of readdirSync(publicGames).filter(file=>file.endsWith('.schema.json')))ajv.addSchema(JSON.parse(readFileSync(new URL(file,publicGames),'utf8')));
ajv.addSchema(JSON.parse(readFileSync(new URL('../../../../shared/contracts.schema.json',import.meta.url),'utf8')));
const validators=new Map<string,ReturnType<typeof ajv.compile>>();
export function validateRecord<T=unknown>(name:string,value:unknown):T {
 let validator=validators.get(name);if(!validator){assert.match(name,/^[a-z]+$/);validator=ajv.compile(JSON.parse(readFileSync(new URL(`${name}.schema.json`,schemaRoot),'utf8')));validators.set(name,validator);}
 assert.ok(validator(value),`${name} schema: ${ajv.errorsText(validator.errors)}`);
 return value as T;
}
export function validateDecision(value:unknown):DecisionRecord {
 const d=validateRecord<DecisionRecord>('decision',value); assertContract('RegisteredActorPacket',d.actorPacket);
 assert.equal(d.policyPin.seat,d.actor,'Policy actor mismatch');
 assert.equal(d.actor,d.actorPacket.seat,'Actor identity mismatch');assert.equal(d.phase,d.actorPacket.phase,'Phase identity mismatch');
 const ids=d.legalCandidates.map(c=>c.id);assert.equal(new Set(ids).size,ids.length,'Duplicate legal candidates');assert.ok(ids.includes(d.selectedCandidateId),'Selected action is not legal');
 assert.deepEqual([...ids].sort(),d.actorPacket.candidates.map(c=>c.id).sort(),'Complete legal set mismatch');assert.equal(d.forced,ids.length===1,'Forced status mismatch');
 if(d.coachMessage){assertContract('CoachMessage',d.coachMessage);assert.equal(d.coachMessage.decisionId,d.decisionId,'Saved reason decision mismatch');assert.equal(d.coachMessage.selectedAction,d.selectedCandidateId,'Saved reason action mismatch');}
 return d;
}
export function canonical(value:unknown):string {if(value===null||typeof value!=='object')return JSON.stringify(value);if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';return '{'+Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,v])=>JSON.stringify(key)+':'+canonical(v)).join(',')+'}';}
export function digest(value:unknown):string{return createHash('sha256').update(canonical(value)).digest('hex');}
export function deepFreeze<T>(value:T):Readonly<T>{if(value&&typeof value==='object'){Object.values(value).forEach(deepFreeze);Object.freeze(value);}return value;}
