import type { Pool } from 'pg';
import type { AccountDeleteRequest, AccountDeleteView, ExportView, ReviewFrame, AdviceView, BillingOperation } from '../../shared/contracts.ts';
import { assertContract } from '../../shared/validation.ts';
import { BillingFailure, inTransaction, lockPlayer, requireFixture, type RequestGuard } from '../billing/store.ts';
function record(value:unknown):Record<string,unknown> {if(!value||typeof value!=='object'||Array.isArray(value))throw new BillingFailure(503,'SERVICE_UNAVAILABLE','Saved account data could not be safely exported.');return value as Record<string,unknown>;}
function array(value:unknown):unknown[] {if(!Array.isArray(value))throw new BillingFailure(503,'SERVICE_UNAVAILABLE','Saved account data could not be safely exported.');return value;}
/** Explicit field construction is independent of the private game aggregate. */
export function exportFrame(value:unknown):ReviewFrame {
  const frame=record(value),g=record(frame.game);
  const game={id:g.id,mode:g.mode,phase:g.phase,hand:g.hand,handCounts:g.handCounts,bids:g.bids,tricks:g.tricks,scores:g.scores,bags:g.bags,trick:g.trick,history:g.history,turn:g.turn,dealer:g.dealer,handNumber:g.handNumber,heartsBroken:g.heartsBroken,spadesBroken:g.spadesBroken,passDirection:g.passDirection,received:g.received,outgoing:g.outgoing,handResult:g.handResult,currentWinner:g.currentWinner,legalActions:g.legalActions};
  const result={game,action:frame.action,decisionId:frame.decisionId,notes:frame.notes};assertContract('ReviewFrame',result);return result;
}
function exportAdvice(value:unknown):AdviceView {
  const a=record(value);const result:Record<string,unknown>={focus:a.focus,notice:a.notice,reason:a.reason,suggestion:a.suggestion,source:a.source,decisionId:a.decisionId,requestedLevel:a.requestedLevel};
  for(const key of ['card','pass','bid','highlightSuit'])if(a[key]!==undefined)result[key]=a[key];
  assertContract('AdviceView',result);return result;
}
export async function exportAccount(pool:Pool,playerId:string,guard?:RequestGuard):Promise<ExportView> {
  return inTransaction(pool,async client=>{
    const profile=await lockPlayer(client,playerId);await guard?.(client,playerId);requireFixture(profile);
    const p=record(profile);const rawPrefs=record(p.preferences);const preferences:unknown={coachMode:rawPrefs.coachMode,gameSpeed:rawPrefs.gameSpeed};assertContract('Preferences',preferences);
    const rows=(await client.query<{id:string;revision:number;document:unknown}>('SELECT id,revision,document FROM games WHERE player_id=$1 ORDER BY updated_at,id',[playerId])).rows;
    const games=rows.map(row=>{const doc=record(row.document),statsRaw=record(doc.stats);const stats:unknown={decisions:statsRaw.decisions,helped:statsRaw.helped,suggestions:statsRaw.suggestions};assertContract('SessionStats',stats);
      return {id:row.id,revision:row.revision,frames:array(doc.frames).map(exportFrame),advice:Object.values(record(doc.savedAdvice)).map(exportAdvice),stats};});
    const usage=(await client.query<{game_id:string;hand_number:number;period:Date|string}>('SELECT game_id,hand_number,period FROM coached_hands WHERE player_id=$1 ORDER BY period,game_id,hand_number',[playerId])).rows;
    const operations=(await client.query<{response:unknown}>('SELECT response FROM billing_operations WHERE player_id=$1 ORDER BY created_at,id',[playerId])).rows;
    const billing:BillingOperation[]=operations.map(row=>{const r=record(row.response);const result={operationId:r.operationId,status:r.status,effectiveAt:r.effectiveAt,plan:r.plan,cancelAtPeriodEnd:r.cancelAtPeriodEnd,mode:r.mode,message:r.message};assertContract('BillingOperation',result);return result;});
    const result:ExportView={formatVersion:'local-export-1',exportedAt:new Date().toISOString(),mode:'local-test',player:{id:playerId,displayName:profile.displayName,preferences},subscription:{plan:profile.plan,cancelAtPeriodEnd:profile.cancelAtPeriodEnd,currentPeriodEnd:profile.currentPeriodEnd},games,coachedHands:usage.map(u=>({gameId:u.game_id,handNumber:u.hand_number,period:typeof u.period==='string'?u.period:u.period.toISOString().slice(0,10)})),billing};
    assertContract('ExportView',result);return result;
  });
}
/** Revokes and deletes only local fixture data. Hosted billing/retention requires its own release policy. */
export async function deleteLocalAccount(pool:Pool,playerId:string,request:AccountDeleteRequest,guard?:RequestGuard):Promise<AccountDeleteView> {
  assertContract('AccountDeleteRequest',request);
  return inTransaction(pool,async client=>{
    // Group before member rows matches family mutations. Lock all affected identities in stable order.
    const groups=(await client.query<{id:string;payer_id:string}>("SELECT g.id,g.payer_id FROM family_groups g WHERE g.payer_id=$1 OR EXISTS (SELECT 1 FROM family_assignments a WHERE a.family_id=g.id AND a.player_id=$1) ORDER BY g.id FOR UPDATE",[playerId])).rows;
    const payerGroups=groups.filter(g=>g.payer_id===playerId).map(g=>g.id);
    const affected=(await client.query<{player_id:string}>('SELECT DISTINCT player_id FROM family_assignments WHERE family_id=ANY($1::uuid[]) AND player_id IS NOT NULL',[payerGroups])).rows.map(r=>r.player_id);
    for(const id of [...new Set([playerId,...affected])].sort())await lockPlayer(client,id);
    const profile=await lockPlayer(client,playerId);await guard?.(client,playerId);requireFixture(profile);
    await client.query('UPDATE sessions SET revoked_at=now() WHERE player_id=$1',[playerId]);
    await client.query('UPDATE players SET access_generation=access_generation+1 WHERE id=ANY($1::uuid[])',[[...new Set([playerId,...affected])]]);
    await client.query("UPDATE family_assignments SET status='held' WHERE player_id=$1 AND family_id<>ALL($2::uuid[])",[playerId,payerGroups]);
    await client.query('DELETE FROM billing_events WHERE id IN (SELECT j.event_id FROM billing_reconcile_jobs j JOIN billing_purchases p ON p.id=j.purchase_id WHERE p.player_id=$1)',[playerId]);
    await client.query('DELETE FROM players WHERE id=$1',[playerId]);
    return {deleted:true,mode:'local-test',message:'Your local fixture account and owned game records were deleted. Local billing simulations ended; no real subscription was charged or canceled. Other family members keep their own accounts.'};
  });
}
