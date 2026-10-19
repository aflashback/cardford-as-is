import assert from 'node:assert/strict';
import {assertContract} from '../../../../shared/validation.ts';
import {validateDecision,digest,type ReviewRecord,type JsonObject} from './contracts.ts';
import {exportBlindPacket,presentationHash,type ReviewPacket} from './packets.ts';

const layoutHistoryEncoding='trix-layout-turn-delta-1.0.0';

function afterLayoutTurn(turn:JsonObject):JsonObject {
 const board=structuredClone(turn.boardBefore) as {suit:string;low:number;high:number}[];
 const counts=[...turn.handCountsBefore as number[]];
 if(turn.kind==='layout-card'){
  const card=turn.card as string,row=board.find(row=>row.suit===card[0])!;
  const rank=['2','3','4','5','6','7','8','9','10','J','Q','K','A'].indexOf(card.slice(1))+2;
  row.low=row.low===0?rank:Math.min(row.low,rank);row.high=Math.max(row.high,rank);
  counts[turn.seat as number]=counts[turn.seat as number]!-1;
 }
 return {boardBefore:board,handCountsBefore:counts,twoAnnouncementsBefore:structuredClone(turn.twoAnnouncementsBefore)};
}

/** Decode one append, passing the last decoded turn from this deal only. */
export function decodeRetrospectiveLayoutTurns(encoding:unknown,entries:JsonObject[],previous?:JsonObject):JsonObject[] {
 assert.equal(encoding,layoutHistoryEncoding,'Unsupported retrospective layout encoding');
 if(previous)assertContract('TrixLayoutTurn',previous);
 return entries.map(entry=>{
  assert.equal(entry.ordinal,previous?Number(previous.ordinal)+1:1,'Layout delta requires a contiguous ordinal and a new-deal anchor');
  const turn={...(previous?afterLayoutTurn(previous):{}),...structuredClone(entry)};
  assertContract('TrixLayoutTurn',turn);
  previous=turn;
  return turn;
 });
}

function compactLayoutTurns(entries:JsonObject[],previous?:JsonObject):JsonObject[] {
 return entries.map(turn=>{
  const expected=previous?afterLayoutTurn(previous):{},compact=structuredClone(turn);
  for(const field of ['boardBefore','handCountsBefore','twoAnnouncementsBefore']){
   if(previous&&digest(turn[field])===digest(expected[field]))delete compact[field];
  }
  previous=turn;
  return compact;
 });
}

/** Entire executed public timeline, never all-seat hands or sealed intentions. */
export function buildRetrospectivePacket(target:unknown,decisions:unknown[],receipt:JsonObject,prior?:ReviewRecord):ReviewPacket {
 const d=validateDecision(target);
 const episode=(receipt.episodes as JsonObject[]).find(e=>e.episodeId===d.episodeId);
 assert.ok(episode&&episode.status==='complete'&&episode.outcome,'Full-game retrospective requires a completed native episode');
 const safe=exportBlindPacket(d);
 if(!d.forced)assert.ok(prior&&prior.caseId===safe.caseId&&prior.stage==='B-reason'&&['completed','abstained','disputed'].includes(prior.status),'Freeze decision-time B-reason first');
 if(prior)assert.equal(prior.presentationHash,presentationHash(d),'Retrospective prior presentation mismatch');
 const history:JsonObject[]=[];
 const seenRevision=new Set<number>();
 const executedRevisions=new Map<number,string>();
 const last:JsonObject={};
 const arrays=new Map<string,string[]>();
 let layoutScope:string|undefined;
 const rows=decisions.map(validateDecision).filter(row=>row.episodeId===d.episodeId).sort((a,b)=>a.revision-b.revision||a.actor-b.actor);
 const trix=d.actorPacket.gameId==='trix';
 const compactChronology=trix&&rows.some(row=>Object.hasOwn(row.actorPacket.observation,'layoutHistory'));
 // Plays and layout actions reconstruct transient trick/board state. Completed
 // histories and scoring ledgers are emitted as append deltas, not snapshots.
 const fields=trix?['gameId','variantId','kingdom','dealNumber','owner','request','remainingRequests','handCounts','finishOrder','lastExternalLeader','totals','requestTotals','kingdomTotals','winners','twoAnnouncements']:['handCounts','bids','tricks','scores','bags','turn','dealer','roundNumber','heartsBroken','spadesBroken','passDirection'];
 const appendFields=trix?['tricks','declarations','passes','ledger','withheldBonuses']:['history'];
 const emit=(event:JsonObject)=>history.push({id:(compactChronology?'p:':'public:')+history.length,...event});
 for(const row of rows) {
  const observation=row.actorPacket.observation as unknown as JsonObject;
  if(!seenRevision.has(row.revision)) {
   seenRevision.add(row.revision);
   const changes:JsonObject={};
   const context:JsonObject=trix?{dealNumber:observation.dealNumber,kingdom:observation.kingdom,request:observation.request}:{roundNumber:observation.roundNumber};
   for(const key of fields) {
    if(!Object.hasOwn(observation,key)){
     // Native observations omit inactive announcements. Retrospective deltas
     // use null as an explicit clear, then forget the previous comparison value.
     if(trix&&key==='twoAnnouncements'&&Object.hasOwn(last,key)){changes[key]=null;delete last[key];}
     continue;
    }
    const value=observation[key];
    if(!Object.hasOwn(last,key)||digest(last[key])!==digest(value)){changes[key]=structuredClone(value);last[key]=structuredClone(value);}
   }
   if(trix){
    const layout=observation.layoutHistory as JsonObject|undefined;
    if(layout){
     // Reset each deal before appending its captured turns. Metadata changes
     // never copy later turns into an earlier decision-time observation.
     const scope=String(observation.dealNumber),metadata={version:layout.version,status:layout.status,turns:[]};
     if(layoutScope!==scope||!Object.hasOwn(last,'layoutHistory')||digest(last.layoutHistory)!==digest(metadata))changes.layoutHistory=metadata;
     last.layoutHistory=metadata;layoutScope=scope;
    }else if(Object.hasOwn(last,'layoutHistory')){
     changes.layoutHistory=null;delete last.layoutHistory;layoutScope=undefined;
    }
   }
   const appends:JsonObject[]=[];
   for(const field of [...appendFields,...(trix&&Object.hasOwn(observation,'layoutHistory')?['layoutHistory.turns']:[])]) {
    if(field!=='layoutHistory.turns'&&!Object.hasOwn(observation,field))continue;
    const entries=field==='layoutHistory.turns'?(observation.layoutHistory as JsonObject).turns:observation[field];assert.ok(Array.isArray(entries),'Public history field must be an array');
    const scope=field==='ledger'||field==='withheldBonuses'?'game':field==='layoutHistory.turns'?String(observation.dealNumber):digest(context);
    const key=field+':'+scope;
    const previous=arrays.get(key)??[];
    const hashes=entries.map(entry=>digest(entry));
    assert.ok(previous.length<=hashes.length&&previous.every((hash,i)=>hash===hashes[i]),'Public cumulative history changed within its round/deal scope');
    if(entries.length>previous.length){
     if(field==='layoutHistory.turns'){
      changes.layoutHistoryAppend={startIndex:previous.length,entries:compactLayoutTurns(entries.slice(previous.length) as JsonObject[],entries[previous.length-1] as JsonObject|undefined)};
     }else appends.push({revision:row.revision,kind:'public-append',field,context,startIndex:previous.length,entries:structuredClone(entries.slice(previous.length))});
    }
    arrays.set(key,hashes);
   }
   if(Object.keys(changes).length)emit({revision:row.revision,kind:'public-observation',changes});
   for(const append of appends)emit(append);
  }
  if(row.executionStatus!=='committed')continue;
  const chosen=row.actorPacket.candidates.find(c=>c.id===row.selectedCandidateId)!.public as unknown as JsonObject;
  if(['play','play-card','layout-card','layout-pass','choose-request'].includes(String(chosen.kind))){
   const signature=digest({actor:row.actor,action:chosen}),previous=executedRevisions.get(row.revision);
   if(previous){assert.equal(previous,signature,'Conflicting executed public actions at one revision');continue;}
   executedRevisions.set(row.revision,signature);
   emit({revision:row.revision,actor:row.actor,kind:'executed-public-action',action:structuredClone(chosen)});
  }
 }
 const outcome=episode.outcome as JsonObject;
 assert.ok(Object.keys(outcome).every(k=>['scores','winner','winnerSeats','winnerIds','rounds'].includes(k)),'Unknown terminal outcome field');
 const packet:ReviewPacket={stage:'C',case:safe,presentationHash:presentationHash(d),evidenceRefs:['actor-observation','legal-candidates','public-history','native-result',...history.map(event=>String(event.id))],selectedAction:d.selectedCandidateId,retrospective:{coverage:'complete',publicHistory:history,result:structuredClone(outcome),limitations:['Later public play and the final outcome are retrospective context only.','An outcome cannot revise the earlier actor-safe action or explanation judgment.','Private passes and unpublished sealed bids/declarations are absent.','Transient boards/tricks are reconstructed from executed actions; cumulative public records use append deltas scoped to each round/deal.','Layout chronology appends are captured observations of those executed moves, not additional moves to replay. An empty layoutHistory.turns reset begins each available deal; null means the archive lacks chronology.','In retrospective public-observation deltas, twoAnnouncements: null clears a previous announcement when the native optional field is absent.','Completed public records come from saved decision-time observations; the terminal transition is represented by its executed action and native game outcome, without inventing an unseen final ledger/trick record.']}};
 if(prior)packet.prior=structuredClone(prior);
 if(compactChronology){
  packet.retrospective!.layoutHistoryEncoding=layoutHistoryEncoding;
  (packet.retrospective!.limitations as string[]).push('trix-layout-turn-delta-1.0.0: public-observation changes.layoutHistoryAppend contains startIndex and captured turn entries for the current deal/kingdom/request. Apply any layoutHistory reset first. The first turn anchors boardBefore, handCountsBefore and twoAnnouncementsBefore; later omitted boards/counts follow the previous captured placement or pass, and omitted twos retain the previous snapshot. Explicit null clears twos. Supplied snapshots override derived values. These entries are observations, never extra executed actions. Event IDs and evidence references are opaque identifiers.');
 }
 if(d.coachMessage){packet.cue=d.coachMessage.cue;packet.reason=structuredClone(d.coachMessage.reason);packet.evidenceRefs.push('saved-cue','saved-reason');}
 assert.ok(history.length<=8192&&Buffer.byteLength(JSON.stringify(packet))<=524288,'Full retrospective packet exceeds bounded export; nothing was truncated');
 return packet;
}
