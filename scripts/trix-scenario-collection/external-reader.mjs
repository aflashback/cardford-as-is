// TSC-12: independent offline input; never impersonate deterministic lab advice.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import { canonical, validatePlayerPacket } from './contracts.mjs';
import { safePath, sha, jsonBytes } from './journal.mjs';

const schemaRoot = new URL('../../contracts/trix-scenario-collection/', import.meta.url);
const ajv = new Ajv2020({ allErrors: true, strict: true });
for (const name of ['packet','decision-review','game-review','game-findings','case','strategy','export']) ajv.addSchema(JSON.parse(readFileSync(new URL(`${name}.schema.json`,schemaRoot),'utf8')));
export function validateArtifact(name,value) {
  const validator=ajv.getSchema(`https://cardford.local/schemas/trix-scenario-collection/${name}.schema.json`);
  assert.ok(validator,`Unknown artifact schema ${name}`);
  assert.ok(validator(value),`${name} schema: ${ajv.errorsText(validator.errors)}`);
  return value;
}
export function applicableCategory(category,variant,request) {
  return !((category==='TEAM'&&!variant.endsWith('partners'))||(category==='COMB'&&request!=='complex')||(category==='DBL'&&!['king','queens','complex'].includes(request)));
}
export function resolveActorEvidence(packet,ref) {
  assert.ok(typeof ref==='string'&&ref.startsWith('actor:/'),'Actor evidence requires actor:/ JSON pointer');
  let value=packet;
  for(const encoded of ref.slice(7).split('/')) {
    assert.ok(!/~(?:[^01]|$)/.test(encoded),'Malformed JSON pointer escape');
    const key=encoded.replace(/~1/g,'/').replace(/~0/g,'~');
    assert.ok(!['__proto__','constructor','prototype'].includes(key),'Unsafe evidence pointer');
    assert.ok(value!==null&&typeof value==='object'&&Object.hasOwn(value,key),'Unresolved actor evidence reference');
    if(Array.isArray(value))assert.match(key,/^(0|[1-9][0-9]*)$/,'Noncanonical array index');
    value=value[key];
  }
  return value;
}
export function validateExternalCase(row) {
  validateArtifact('case',row);validatePlayerPacket(row.actorPacket);
  const p=row.actorPacket;
  for(const key of ['variant','request','objective','actor'])assert.deepEqual(row[key],p[key],`Case ${key} mismatch`);
  assert.deepEqual(row.pin,p.pin);assert.equal(row.revision,p.nativeRevision);
  assert.equal(row.decisionId,`${row.episodeId}:${row.revision}:${row.actor}`,'Case actor/revision identity mismatch');
  assert.ok(p.legalOptions.length>1,'Forced case rejected');
  assert.ok(p.legalOptions.some(o=>o.candidateId===row.originalChoice),'Case original choice illegal');
  assert.ok(row.tags.includes(row.primaryCategory)&&row.tags.every(c=>applicableCategory(c,row.variant,row.request)),'Case categories mismatch');
  assert.equal(row.caseId,sha(`${row.runId}:${row.decisionId}`),'Case identity mismatch');
  const {invocationId,nativeRevision,...comparable}=p;
  assert.equal(row.exactDecisionFingerprint,sha(canonical({packet:comparable,choice:row.originalChoice})),'Case observation/action fingerprint mismatch');
  const stage=p.publicPhaseAndTurn.phase==='declare-doubles'?'declaration':p.completedTricks.length<=3?'opening':p.completedTricks.length<=8?'middle':'late';
  assert.equal(row.stage,stage,'Case stage mismatch');
  assert.notEqual(row.rationaleAssessment,'forced','Forced rationale cannot fill quota');
  if(row.missedOpportunity){
    const claim=row.missedOpportunity;assert.equal(row.actionAssessment,'proved-correction');assert.equal(row.eligibilityReceipt.correctionVerified,true);assert.ok(row.acceptedProofReceiptRef,'Verified correction receipt required');
    assert.equal(claim.proofKind,'native-objective-dominance');assert.equal(claim.objective,row.objective);assert.notEqual(claim.alternativeCandidateId,row.originalChoice);assert.ok(p.legalOptions.some(o=>o.candidateId===claim.alternativeCandidateId));
    claim.actorEvidenceRefs.forEach(ref=>resolveActorEvidence(p,ref));
  }else{
    assert.equal(row.acceptedProofReceiptRef,null);assert.equal(row.eligibilityReceipt.correctionVerified,false);assert.equal(row.eligibilityReceipt.materialChecksSupported,true);assert.ok(['adequate','uncertain'].includes(row.rationaleAssessment));
    assert.equal(row.actionAssessment,row.rationaleAssessment==='uncertain'?'ambiguous':'supported-for-testing');
  }
  for(const ref of [...row.evidenceRefs,row.retrospectiveRef,...(row.acceptedProofReceiptRef?[row.acceptedProofReceiptRef,row.missedOpportunity.proofRef]:[])])assert.equal(ref.path,`blobs/${ref.sha256}`,'Invalid evidence reference');
  assert.equal(new Set(row.evidenceRefs.map(r=>r.kind)).size,3,'Distinct original/review/receipt evidence required');
  return row;
}
function parseLines(bytes,name) {
  const value=bytes.toString('utf8');assert.ok(value===''||value.endsWith('\n'),`Torn ${name}`);
  return value.split('\n').filter(Boolean).map(line=>JSON.parse(line));
}
export function readExternalCases(directory,{publicationManifest=null}={}) {
  // Only the exporter supplies an unpublished manifest while holding the corpus lock.
  const manifest=validateArtifact('export',publicationManifest??JSON.parse(readFileSync(safePath(directory,'source-manifest.json'),'utf8')));
  assert.equal(basename(directory),manifest.exportVersion,'Export version/directory mismatch');
  const {exportVersion,...identity}=manifest;assert.equal(exportVersion,sha(jsonBytes(identity)).slice(0,24),'Export manifest identity digest mismatch');
  const files={};
  for(const [name,digest]of Object.entries(manifest.files)) {
    const bytes=readFileSync(safePath(directory,name));assert.equal(sha(bytes),digest,`Export digest mismatch: ${name}`);files[name]=bytes;
  }
  const cases=parseLines(files['cases.jsonl'],'cases.jsonl').map(validateExternalCase),ids=new Set();
  for(const row of cases){assert.equal(row.runId,manifest.runId);assert.equal(row.corpusId,manifest.corpusId);assert.ok(!ids.has(row.caseId),'Duplicate exported case');ids.add(row.caseId);}
  assert.equal(cases.length,manifest.caseCount,'Export count mismatch');
  const phaseCaps={'basic-solo':200,'complex-solo':200,'basic-partners':200,'complex-partners':400},phaseCounts={},requestCounts={},familyCounts={};
  const decisions=new Set(),fingerprints=new Set();
  for(const row of cases){
    assert.ok(!decisions.has(row.decisionId)&&!fingerprints.has(row.exactDecisionFingerprint),'Duplicate exported decision problem');decisions.add(row.decisionId);fingerprints.add(row.exactDecisionFingerprint);
    phaseCounts[row.variant]=(phaseCounts[row.variant]??0)+1;requestCounts[`${row.variant}:${row.request}`]=(requestCounts[`${row.variant}:${row.request}`]??0)+1;familyCounts[row.familyId]=(familyCounts[row.familyId]??0)+1;
    assert.ok(phaseCounts[row.variant]<=phaseCaps[row.variant],'Export phase cap');assert.ok(requestCounts[`${row.variant}:${row.request}`]<=(row.variant.startsWith('basic')?50:phaseCaps[row.variant]),'Export request cap');assert.ok(familyCounts[row.familyId]<=8,'Export family cap');
  }
  assert.ok(manifest.mode==='live'||cases.length===0,'Fixture cases cannot fill corpus');
  const strategies=parseLines(files['category-strategies.jsonl'],'category-strategies.jsonl');
  const strategyIds=new Set();
  for(const strategy of strategies){
    validateArtifact('strategy',strategy);assert.ok(!strategyIds.has(strategy.id),'Duplicate strategy revision');strategyIds.add(strategy.id);
    const referenced=[...strategy.supportingCaseIds,...strategy.counterexampleCaseIds].map(id=>{assert.ok(ids.has(id),'Unknown strategy case');return cases.find(c=>c.caseId===id);});
    assert.ok(referenced.every(c=>c.tags.includes(strategy.categoryId)&&strategy.variants.includes(c.variant)&&strategy.requests.includes(c.request)&&c.objective===strategy.objective),'Strategy evidence scope mismatch');
    assert.ok(strategy.evidenceLevel!=='supported-for-testing'||strategy.counterexampleCaseIds.length>0,'Strategy counterexample required');
    assert.ok(!strategy.supportingCaseIds.some(id=>strategy.counterexampleCaseIds.includes(id)),'Support cannot double as counterexample');
  }
  const coverage=JSON.parse(files['coverage.json'].toString('utf8'));
  assert.equal(coverage.runId,manifest.runId);assert.equal(coverage.mode,manifest.mode);assert.equal(coverage.curatedCasesThisRun,cases.length,'Coverage count mismatch');
  const games=parseLines(files['game-findings.jsonl'],'game-findings.jsonl').map(g=>{
    validateArtifact('game-findings',g);assert.equal(g.episodeId,g.gameReview.episodeId);assert.deepEqual(g.nativeTotals,g.gameReview.nativeTotals);
    const plays=g.publicTricks.flatMap(t=>t.plays);assert.equal(plays.length,52);assert.equal(new Set(plays.map(p=>p.card)).size,52,'Public terminal cards incomplete');
    return g;
  });
  assert.equal(new Set(games.map(g=>g.episodeId)).size,games.length,'Duplicate game finding');
  for(const row of cases)assert.ok(games.some(g=>g.episodeId===row.episodeId&&g.variant===row.variant&&g.request===row.request),'Missing separate retrospective finding');
  return {manifest,cases,strategies,coverage,games};
}
