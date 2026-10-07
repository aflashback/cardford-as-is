import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { validateHumanLabels } from '../spades-pack/labels.ts';
import type { ReviewCase } from '../spades-pack/review.ts';

export const repositoryRoot = new URL('../../../../', import.meta.url);
export const browserRoot = 'qa/experiments/2026-10-02-browser-baseline/';
export const reviewRoot = 'qa/experiments/2026-10-04-spades-evaluation-pack/review/';
export const sha256 = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
export const bytes = (path: string) => readFileSync(new URL(path, repositoryRoot));
export const json = <T>(path: string): T => JSON.parse(bytes(path).toString('utf8')) as T;
const lineRows = <T>(path: string): { row: T; line: number; hash: string }[] => bytes(path).toString('utf8').split('\n')
  .map((line,index) => ({ text: line.replace(/\r$/, ''), line: index+1 }))
  .filter(entry => entry.text.trim()).map(entry => ({ row: JSON.parse(entry.text) as T, line: entry.line, hash: sha256(entry.text) }));
type ObjectRecord = Record<string,unknown>;
function object(value: unknown): ObjectRecord { assert.ok(value && typeof value==='object' && !Array.isArray(value)); return value as ObjectRecord; }
function strings(value: unknown): string[] { assert.ok(Array.isArray(value) && value.every(entry=>typeof entry==='string'));return value as string[]; }
function number(value: unknown): number { assert.ok(typeof value==='number' && Number.isSafeInteger(value));return value; }
function stable(value: unknown): string {
  if(Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if(value && typeof value==='object') return `{${Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,v])=>`${JSON.stringify(k)}:${stable(v)}`).join(',')}}`;
  return JSON.stringify(value);
}
/** Only duplicate grouping uses normalization. Original packet hashes and bytes are never replaced. */
export function normalizeActorPacket(value: unknown): string {
  const packet=object(value);
  const normalized: ObjectRecord = {
    game: packet.game ?? packet.mode, ruleProfile: packet.ruleProfile ?? packet.ruleProfileId,
    seat: packet.seat, phase: packet.phase, dealer: packet.dealer, turn: packet.turn,
    hand: packet.hand, handSizes: packet.handSizes, bids: packet.bids, tricks: packet.tricks,
    scores: packet.scores, bags: packet.bags,
    history: packet.completedTricks ?? packet.history, trick: packet.currentTrick ?? packet.trick,
    spadesBroken: packet.spadesBroken, knownHoldings: packet.knownHoldings ?? [],
    legalIds: (packet.legalActions as unknown[]).map(entry => typeof entry==='string' ? entry : chosenId(entry)).sort(),
  };
  // Historical text packets without turn imply the current actor; no inference about missing history.
  normalized.turn ??= normalized.seat;
  if(Array.isArray(normalized.hand)) normalized.hand=[...normalized.hand].sort();
  return stable(normalized);
}
function chosenId(value: unknown): string {
  const action=object(value);
  if(action.kind==='bid' && Number.isInteger(action.bid)) return `bid:${action.bid}`;
  if(action.kind==='play' && typeof action.card==='string') return `play:${action.card}`;
  throw new Error('Unsupported archived action');
}
export type FamilyMap = { schemaVersion: string; families: { id: string; split: 'discovery'; reason: string; ancestors: { source: string; relationship: string }[] }[] };
export function loadFamilies(value: unknown=json<unknown>('qa/research/multi-game/families.json')) {
  const families=object(value);assert.equal(families.schemaVersion,'research-families-1.0.0');assert.ok(Array.isArray(families.families));
  const assigned=new Map<string,string>(); const ids=new Set<string>();
  for(const raw of families.families) {
    const family=object(raw);assert.equal(typeof family.id,'string');assert.equal(family.split,'discovery');
    const id=family.id as string;assert.ok(!ids.has(id),'Duplicate family');ids.add(id);
    assert.ok(Array.isArray(family.ancestors));
    for(const rawAncestor of family.ancestors) {
      const ancestor=object(rawAncestor);assert.equal(typeof ancestor.source,'string');
      assert.ok(!assigned.has(ancestor.source as string),'Duplicate ancestry assignment');assigned.set(ancestor.source as string,id);
    }
  }
  assert.ok(assigned.size,'Missing family assignments');return assigned;
}
export type ResearchRow = {
  id: string; sourceKind: 'text-discovery'|'browser'; sourcePath: string; sourceHash: string;
  packetHash: string|null; packetProvenance: 'original'|'reconstructed-for-audit'|'unavailable';
  game: string; variant: string; phase: string; actor: number; revision: number;
  chosenId: string; legalIds: string[]; forced: boolean; completeness: 'complete'|'partial'; policyVersion: string|null;
  originFamilyId: string; episodeId: string; duplicatePacketGroup: string; hypotheses: string[]; explanationPath: string|null;
  labels: 'unreviewed'|'acceptable-set'|'contested'|'unknown'; labelRefs: {id:string;version:string;hash:string}[];
  typedClaimStatus: 'present'|'absent'|'not-recorded'; outcomeEligible: boolean; confirmationEligible: false;
  originalPacketPath: string; originalPacketSourceHash: string; originalPacketLineHash: string|null;
  originalSourceLineHash: string|null; committedAuditPath: string|null; committedAuditHash: string|null;
};
type Source = { path:string; episode:string; recordPath?:string; recordFileHash?:string; dealHash:string; decisions?:number; status:'complete'|'partial'|'unstarted' };
type Episode = { id:string; mode:string; [key:string]: unknown };
type TextDecision = { seq:number; seat:number; packet:ObjectRecord; packetHash:string; action:unknown; forced:boolean };
type BrowserDecision = { id:string;runId:string;mode:string;seat:number;forced:boolean;actualAction:unknown;policyVersion:string;matchedCases:string[];advice?:ObjectRecord; originalAnalysis?:ObjectRecord };
type BrowserPacket = { id:string;runId:string;observation:ObjectRecord;observationHash:string };
type Manifest = { fixtures:{id:string;source:string;rotation:number;sourceDealHash:string}[];runs:{id:string;scenarioId:string;mode:string;policy:string}[] };
export type EpisodeInventory = { sourceKind:'text-discovery'|'browser'; episodeId:string;status:'complete'|'partial'|'unstarted'|'unused'; decisions:number;sourcePath:string;sourceHash:string;originFamilyId:string|null;outcomeEligible:boolean };
export type LabelSnapshot = {
  id:string;version:string;hash:string;sourcePath:string;sourceHash:string;sourcePointer:string;packetHash:string;
  status:'pending'|'acceptable-set'|'contested'|'unknown';legalIds:string[];acceptableIds:string[];ruleProfile:string;
  horizon:string|null;objective:string|null;reviewProtocolVersion:string;reviewerId:string|null;
  reviewerQualification:null;independence:'not-established';reasoning:string|null;confirmationEligible:false;
};
export function buildLabelIndex(): LabelSnapshot[] {
  const sourcePath=reviewRoot+'human-labels.json', sourceHash=sha256(bytes(sourcePath));
  const review=json<{cases:ReviewCase[]}>(reviewRoot+'cases.json');
  const labels=json<{cases:{id:string;packetHash:string;status:'supported'|'unknown'|'contested';acceptableActions:string[];reviewerId:string|null;rationale:string|null}[]}>(sourcePath);
  validateHumanLabels(review.cases,labels);
  return labels.cases.map((label,index)=>{
    const entry=review.cases.find(entry=>entry.id===label.id)!;
    assert.equal(sha256(JSON.stringify(entry.packet)),entry.packetHash,'Review packet hash changed');
    const hash=sha256(stable(label));
    return {id:`spades-review:${label.id}:${hash}`,version:'derived-label-index-1.0.0',hash,sourcePath,sourceHash,
      sourcePointer:`/cases/${index}`,packetHash:entry.packetHash,status:label.reviewerId===null ? 'pending' : label.status==='supported' ? 'acceptable-set' : label.status,
      legalIds:[...entry.packet.legalActions],acceptableIds:[...label.acceptableActions],ruleProfile:entry.packet.ruleProfileId,
      horizon:null,objective:null,reviewProtocolVersion:'spades-review-pack-1.0.0',reviewerId:label.reviewerId,
      reviewerQualification:null,independence:'not-established',reasoning:label.rationale,confirmationEligible:false};
  });
}
export function buildResearchLedger() {
  const familyMap=loadFamilies();
  const familyFor=(source:string)=>{const id=familyMap.get(source);assert.ok(id,`Unassigned origin family: ${source}`);return id;};
  const audit=json<{accepted:number;sources:Source[]}>(browserRoot+'source-audit.json');
  const rows:ResearchRow[]=[];const episodes:EpisodeInventory[]=[];
  const sourceHashes:Record<string,string>={};
  const pin=(path:string)=>sourceHashes[path]??=(sha256(bytes(path)));
  pin(browserRoot+'source-audit.json');pin('qa/research/multi-game/families.json');
  for(const source of audit.sources) {
    const dealSource=json<{episodes:Episode[]}>(source.path), config=dealSource.episodes.find(entry=>entry.id===source.episode);
    assert.ok(config);assert.equal(sha256(JSON.stringify(config)),source.dealHash,'Original deal changed');pin(source.path);
    const originFamilyId=familyFor(`${source.path}#${source.episode}`);
    const sourcePath=source.recordPath??source.path, sourceHash=pin(sourcePath);
    episodes.push({sourceKind:'text-discovery',episodeId:source.episode,status:source.status,decisions:source.decisions??0,sourcePath,sourceHash,originFamilyId,outcomeEligible:source.status==='complete'});
    if(source.status==='unstarted') continue;
    const completeness=source.status;
    assert.equal(sourceHash,source.recordFileHash,'Original text record bytes changed');
    const record=json<{dealHash:string;decisions:TextDecision[]}>(sourcePath);
    assert.equal(record.dealHash,source.dealHash);assert.equal(record.decisions.length,source.decisions);
    record.decisions.forEach((decision,index)=>{
      assert.equal(sha256(JSON.stringify(decision.packet)),decision.packetHash,'Original text packet changed');
      const legalIds=strings(decision.packet.legalActions),chosen=chosenId(decision.action);assert.ok(legalIds.includes(chosen));
      if(typeof decision.forced==='boolean') assert.equal(decision.forced,legalIds.length===1);
      rows.push({id:`text:${source.episode}:${decision.seq}`,sourceKind:'text-discovery',sourcePath,sourceHash,
        packetHash:decision.packetHash,packetProvenance:'original',game:'spades',variant:config.mode,phase:String(decision.packet.phase),
        actor:decision.seat,revision:decision.seq,chosenId:chosen,legalIds,forced:legalIds.length===1,completeness,
        policyVersion:null,originFamilyId,episodeId:source.episode,duplicatePacketGroup:`packet:${sha256(normalizeActorPacket(decision.packet))}`,
        hypotheses:[],explanationPath:`${sourcePath}#/decisions/${index}/justification`,labels:'unreviewed',labelRefs:[],typedClaimStatus:'not-recorded',
        outcomeEligible:source.status==='complete',confirmationEligible:false,originalPacketPath:`${sourcePath}#/decisions/${index}/packet`,
        originalPacketSourceHash:sourceHash,originalPacketLineHash:null,originalSourceLineHash:null,committedAuditPath:null,committedAuditHash:null});
    });
  }
  assert.equal(rows.length,audit.accepted);assert.equal(rows.length,706);
  const manifest=json<Manifest>(browserRoot+'manifest.json');pin(browserRoot+'manifest.json');
  const sessions=json<{sessions:{gameId:string;runId:string|null;role:string}[]}>(browserRoot+'sessions.json');pin(browserRoot+'sessions.json');
  const packets=lineRows<BrowserPacket>(browserRoot+'seat-packets.jsonl');
  const decisions=lineRows<BrowserDecision>(browserRoot+'baseline-decisions.jsonl');
  const packetMap=new Map(packets.map(entry=>[entry.row.id,entry]));assert.equal(packetMap.size,672);
  const decisionHash=pin(browserRoot+'baseline-decisions.jsonl'),packetSourceHash=pin(browserRoot+'seat-packets.jsonl');
  for(const run of manifest.runs) {
    const fixture=manifest.fixtures.find(entry=>entry.id===run.scenarioId);assert.ok(fixture);
    const source=audit.sources.find(entry=>`${entry.path}#${entry.episode}`===fixture.source);assert.ok(source);assert.equal(source.dealHash,fixture.sourceDealHash);
    const family=familyFor(fixture.source);const session=sessions.sessions.find(entry=>entry.runId===run.id);assert.ok(session);
    const runPath=browserRoot+`runs/${run.id}.json`, savedRun=json<{status:string}>(runPath);assert.equal(savedRun.status,'complete');
    const count=decisions.filter(entry=>entry.row.runId===run.id).length;assert.equal(count,56);
    episodes.push({sourceKind:'browser',episodeId:run.id,status:'complete',decisions:count,sourcePath:runPath,sourceHash:pin(runPath),originFamilyId:family,outcomeEligible:true});
    const auditPath=browserRoot+`private/${run.id}.json`, privateAudit=json<{actions:{kind:string;action?:unknown}[]}>(auditPath),auditHash=pin(auditPath);
    const committed=privateAudit.actions.filter(entry=>entry.kind==='action').map(entry=>chosenId(entry.action));assert.equal(committed.length,count);
    decisions.filter(entry=>entry.row.runId===run.id).forEach((entry,index)=>{
      const decision=entry.row,packet=packetMap.get(decision.id);assert.ok(packet);assert.equal(packet.row.runId,run.id);
      assert.equal(sha256(JSON.stringify(packet.row.observation)),packet.row.observationHash,'Original browser packet changed');
      const legalIds=(packet.row.observation.legalActions as unknown[]).map(chosenId),chosen=chosenId(decision.actualAction);
      assert.ok(legalIds.includes(chosen));assert.equal(chosen,committed[index],'Committed action mismatch');
      assert.equal(decision.forced,legalIds.length===1);
      assert.equal(decision.seat,packet.row.observation.seat);assert.equal(decision.mode,run.mode);assert.equal(decision.policyVersion,run.policy);
      const revision=number(Number(decision.id.split(':')[1]));
      rows.push({id:`browser:${decision.id}`,sourceKind:'browser',sourcePath:browserRoot+'baseline-decisions.jsonl',sourceHash:decisionHash,
        packetHash:packet.row.observationHash,packetProvenance:'original',game:'spades',variant:decision.mode,phase:String(packet.row.observation.phase),
        actor:decision.seat,revision,chosenId:chosen,legalIds,forced:decision.forced,completeness:'complete',policyVersion:decision.policyVersion,
        originFamilyId:family,episodeId:run.id,duplicatePacketGroup:`packet:${sha256(normalizeActorPacket(packet.row.observation))}`,
        hypotheses:decision.matchedCases??[],explanationPath:`${browserRoot}baseline-decisions.jsonl#L${entry.line}/advice`,
        labels:'unreviewed',labelRefs:[],typedClaimStatus:Array.isArray(decision.advice?.claims)?'present':'absent',outcomeEligible:true,confirmationEligible:false,
        originalPacketPath:`${browserRoot}seat-packets.jsonl#L${packet.line}/observation`,originalPacketSourceHash:packetSourceHash,
        originalPacketLineHash:packet.hash,originalSourceLineHash:entry.hash,committedAuditPath:auditPath,committedAuditHash:auditHash});
    });
  }
  for(const session of sessions.sessions.filter(entry=>entry.runId===null)) episodes.push({sourceKind:'browser',episodeId:session.gameId,status:'unused',decisions:0,
    sourcePath:browserRoot+'sessions.json',sourceHash:sourceHashes[browserRoot+'sessions.json'],originFamilyId:null,outcomeEligible:false});
  assert.equal(rows.filter(row=>row.sourceKind==='browser').length,672);assert.equal(episodes.length,30);
  assert.equal(new Set(rows.map(row=>row.id)).size,1378);
  // Identical actor information cannot cross the declared split family.
  const duplicates=new Map<string,string>();for(const row of rows){const family=duplicates.get(row.duplicatePacketGroup);
    assert.ok(!family||family===row.originFamilyId,'Duplicate actor packet crosses origin families');duplicates.set(row.duplicatePacketGroup,row.originFamilyId);}
  pin(reviewRoot+'cases.json');pin(reviewRoot+'human-labels.json');pin(browserRoot+'audit.json');
  const labels=buildLabelIndex();
  return {rows,episodes,labels,sourceHashes};
}
