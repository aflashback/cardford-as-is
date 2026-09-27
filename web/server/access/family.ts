import { randomBytes, randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import type { FamilyCommand, FamilyView, FamilyMember, FamilyInvitation } from '../../shared/contracts.ts';
import { assertContract } from '../../shared/validation.ts';
import { BillingFailure, fingerprint, inTransaction, lockPlayer, requireFixture, type RequestGuard } from '../billing/store.ts';
interface Group {id:string;payer_id:string;period_end:Date}
interface Invite {id:string;family_id:string;invitee_id:string;seat_class:'unlimited'|'limited';expires_at:Date;status:string}
const noFamily=():FamilyView=>({familyId:null,role:'none',payer:null,members:[],invitations:[],periodEnd:null,localMock:true});
async function view(client:PoolClient,playerId:string):Promise<FamilyView> {
  const group=(await client.query<Group>("SELECT g.* FROM family_groups g WHERE g.payer_id=$1 OR EXISTS (SELECT 1 FROM family_assignments a WHERE a.family_id=g.id AND a.player_id=$1 AND a.status='active' AND a.period_end>now()) ORDER BY (g.payer_id=$1) DESC LIMIT 1",[playerId])).rows[0];
  if(!group)return noFamily();
  const payer=group.payer_id===playerId;
  const display=(await client.query<{name:string}>('SELECT profile->>\'displayName\' AS name FROM players WHERE id=$1',[group.payer_id])).rows[0]?.name??'Family payer';
  const assignments=await client.query<{id:string;player_id:string;name:string;seat_class:'unlimited'|'limited';status:'active'|'held';period_end:Date}>("SELECT a.*,p.profile->>'displayName' AS name FROM family_assignments a JOIN players p ON p.id=a.player_id WHERE a.family_id=$1 AND a.period_end>now() AND ($2::boolean OR a.player_id=$3) ORDER BY a.accepted_at",[group.id,payer,playerId]);
  const members:FamilyMember[]=assignments.rows.map(a=>({assignmentId:a.id,playerId:a.player_id,displayName:a.name,seatClass:a.seat_class,status:a.status,periodEnd:a.period_end.toISOString()}));
  const invites=payer?(await client.query<Invite>("SELECT * FROM family_invitations WHERE family_id=$1 AND status='pending' AND expires_at>now() ORDER BY created_at",[group.id])).rows:[];
  const invitations:FamilyInvitation[]=invites.map(i=>({invitationId:i.id,inviteeId:i.invitee_id,seatClass:i.seat_class,expiresAt:i.expires_at.toISOString()}));
  return {familyId:group.id,role:payer?'payer':'member',payer:{playerId:group.payer_id,displayName:display},members,invitations,periodEnd:group.period_end.toISOString(),localMock:true};
}
export async function getFamily(pool:Pool,playerId:string,guard?:RequestGuard):Promise<FamilyView> {return inTransaction(pool,async c=>{await lockPlayer(c,playerId);await guard?.(c,playerId);return view(c,playerId);});}
async function capacity(client:PoolClient,groupId:string,seatClass:'unlimited'|'limited'):Promise<void> {
  const row=(await client.query<{used:string}>("SELECT (SELECT count(*) FROM family_assignments WHERE family_id=$1 AND seat_class=$2 AND period_end>now()) + (SELECT count(*) FROM family_invitations WHERE family_id=$1 AND seat_class=$2 AND status='pending' AND expires_at>now()) AS used",[groupId,seatClass])).rows[0]!;
  if(Number(row.used)>=(seatClass==='unlimited'?3:2))throw new BillingFailure(409,'INVALID_COMMAND','No seat of this class is available. Removed seats remain held until renewal.');
}
/** playerId is the server-resolved authenticated local identity, never a body owner. */
export async function mutateFamily(pool:Pool,playerId:string,command:FamilyCommand,guard?:RequestGuard):Promise<FamilyView> {
  assertContract('FamilyCommand',command);
  return inTransaction(pool,async client=>{
    // All mutations of one group use its row lock before changing members/capacity.
    let invite:Invite|undefined;
    let group:Group|undefined;
    if(command.action==='accept') {
      invite=(await client.query<Invite>('SELECT * FROM family_invitations WHERE token_hash=$1',[fingerprint(command.token)])).rows[0];
      if(!invite || invite.invitee_id!==playerId)throw new BillingFailure(403,'FORBIDDEN','This invitation belongs to another verified local account or is invalid.');
      group=(await client.query<Group>('SELECT * FROM family_groups WHERE id=$1 FOR UPDATE',[invite.family_id])).rows[0];
    } else if(command.action!=='create') {
      group=(await client.query<Group>("SELECT g.* FROM family_groups g WHERE g.payer_id=$1 OR ($2='leave' AND EXISTS (SELECT 1 FROM family_assignments a WHERE a.family_id=g.id AND a.player_id=$1 AND a.status='active')) FOR UPDATE",[playerId,command.action])).rows[0];
    }
    const profile=await lockPlayer(client,playerId);requireFixture(profile);await guard?.(client,playerId);
    const digest=fingerprint(command);
    const old=(await client.query<{digest:string;response:FamilyView}>('SELECT digest,response FROM family_commands WHERE player_id=$1 AND command_id=$2',[playerId,command.commandId])).rows[0];
    if(old){if(old.digest!==digest)throw new BillingFailure(409,'IDEMPOTENCY_CONFLICT','This family request ID was already used.');return old.response;}
    const now=(await client.query<{now:Date}>('SELECT now()')).rows[0]!.now;
    let issued:FamilyInvitation|undefined;
    if(command.action==='create') {
      if(profile.plan!=='family'||Date.parse(profile.currentPeriodEnd)<=now.getTime())throw new BillingFailure(403,'FORBIDDEN','An active local family plan is required.');
      if((await client.query("SELECT 1 FROM family_assignments WHERE player_id=$1 AND status='active'",[playerId])).rowCount)throw new BillingFailure(409,'INVALID_COMMAND','This account already belongs to a family.');
      const existing=(await client.query<Group>('SELECT * FROM family_groups WHERE payer_id=$1 FOR UPDATE',[playerId])).rows[0];
      if(existing)throw new BillingFailure(409,'INVALID_COMMAND','This account already manages a family.');
      const familyId=randomUUID();
      await client.query('INSERT INTO family_groups(id,payer_id,period_end) VALUES($1,$2,$3)',[familyId,playerId,profile.currentPeriodEnd]);
      await client.query("INSERT INTO family_assignments(id,family_id,player_id,seat_class,status,period_end) VALUES($1,$2,$3,'unlimited','active',$4)",[randomUUID(),familyId,playerId,profile.currentPeriodEnd]);
    } else {
      if(!group)throw new BillingFailure(404,'NOT_FOUND','Family membership not found.');
      if(!['accept','leave'].includes(command.action) && group.payer_id!==playerId)throw new BillingFailure(403,'FORBIDDEN','Only the family payer may manage seats.');
      const payer=(await client.query<{valid:boolean}>("SELECT (profile->>'plan'='family' AND (profile->>'currentPeriodEnd')::timestamptz>now()) AS valid FROM players WHERE id=$1",[group.payer_id])).rows[0];
      if(['invite','accept'].includes(command.action)&&(!payer?.valid||group.period_end<=now))throw new BillingFailure(403,'FORBIDDEN','The family plan has expired.');
      if(command.action==='invite') {
        if(command.inviteeId===playerId)throw new BillingFailure(400,'INVALID_COMMAND','The payer already occupies a seat.');
        if(!(await client.query('SELECT 1 FROM players WHERE id=$1',[command.inviteeId])).rowCount)throw new BillingFailure(404,'NOT_FOUND','The invited local account does not exist.');
        await client.query("UPDATE family_invitations SET status='revoked' WHERE family_id=$1 AND status='pending' AND expires_at<=now()",[group.id]);
        if((await client.query("SELECT 1 FROM family_assignments WHERE player_id=$1 AND status='active'",[command.inviteeId])).rowCount)throw new BillingFailure(409,'INVALID_COMMAND','That account already belongs to a family.');
        if((await client.query("SELECT 1 FROM family_invitations WHERE family_id=$1 AND invitee_id=$2 AND status='pending'",[group.id,command.inviteeId])).rowCount)throw new BillingFailure(409,'INVALID_COMMAND','An invitation is already pending for that account.');
        await capacity(client,group.id,command.seatClass);
        const token=randomBytes(32).toString('base64url');
        issued={invitationId:randomUUID(),inviteeId:command.inviteeId,seatClass:command.seatClass,expiresAt:new Date(Math.min(now.getTime()+7*86400000,group.period_end.getTime())).toISOString(),token};
        await client.query('INSERT INTO family_invitations(id,family_id,invitee_id,seat_class,token_hash,expires_at) VALUES($1,$2,$3,$4,$5,$6)',[issued.invitationId,group.id,issued.inviteeId,issued.seatClass,fingerprint(token),issued.expiresAt]);
      } else if(command.action==='accept') {
        invite=(await client.query<Invite>('SELECT * FROM family_invitations WHERE id=$1 FOR UPDATE',[invite!.id])).rows[0]!;
        if(invite.status!=='pending'||invite.expires_at<=now)throw new BillingFailure(409,'INVALID_COMMAND','This invitation expired or was already used.');
        if(Date.parse(profile.currentPeriodEnd)>now.getTime()&&!command.acknowledgeIndividualCoverage)throw new BillingFailure(409,'INVALID_COMMAND','Confirm that your existing individual coverage remains separate. It will not be canceled automatically.');
        if((await client.query("SELECT 1 FROM family_assignments WHERE player_id=$1 AND status='active'",[playerId])).rowCount)throw new BillingFailure(409,'INVALID_COMMAND','This account already belongs to a family.');
        await client.query("UPDATE family_invitations SET status='accepted' WHERE id=$1",[invite.id]);
        await client.query("INSERT INTO family_assignments(id,family_id,player_id,seat_class,status,period_end) VALUES($1,$2,$3,$4,'active',$5)",[randomUUID(),group.id,playerId,invite.seat_class,group.period_end]);
        await client.query('UPDATE players SET access_generation=access_generation+1 WHERE id=$1',[playerId]);
      } else if(command.action==='revoke-invite') {
        const changed=await client.query("UPDATE family_invitations SET status='revoked' WHERE id=$1 AND family_id=$2 AND status='pending'",[command.invitationId,group.id]);
        if(!changed.rowCount)throw new BillingFailure(404,'NOT_FOUND','Pending invitation not found.');
      } else {
        const target=command.action==='leave'?playerId:(await client.query<{player_id:string}>('SELECT player_id FROM family_assignments WHERE id=$1 AND family_id=$2',[command.assignmentId,group.id])).rows[0]?.player_id;
        if(!target || target===group.payer_id)throw new BillingFailure(403,'FORBIDDEN','The payer seat cannot be removed.');
        await lockPlayer(client,target);
        await client.query("UPDATE family_assignments SET status='held' WHERE family_id=$1 AND player_id=$2 AND status='active'",[group.id,target]);
        await client.query('UPDATE players SET access_generation=access_generation+1 WHERE id=$1',[target]);
      }
    }
    const result=await view(client,playerId);
    if(issued)result.invitations=result.invitations.map(i=>i.invitationId===issued!.invitationId?issued!:i);
    await client.query('INSERT INTO family_commands(player_id,command_id,digest,response) VALUES($1,$2,$3,$4)',[playerId,command.commandId,digest,result]);
    return result;
  });
}
/** Invoke under the member player lock, shared with game mutations and seat removal. */
export async function effectiveFamilyGrant(client:PoolClient,playerId:string):Promise<{plan:'practice'|'unlimited';currentPeriodEnd:string;payerId:string}|null> {
  const row=(await client.query<{seat_class:'unlimited'|'limited';period_end:Date;payer_id:string}>("SELECT a.seat_class,LEAST(a.period_end,g.period_end,(p.profile->>'currentPeriodEnd')::timestamptz) AS period_end,g.payer_id FROM family_assignments a JOIN family_groups g ON g.id=a.family_id JOIN players p ON p.id=g.payer_id WHERE a.player_id=$1 AND a.status='active' AND a.period_end>now() AND g.period_end>now() AND p.profile->>'plan'='family' AND (p.profile->>'currentPeriodEnd')::timestamptz>now()",[playerId])).rows[0];
  return row?{plan:row.seat_class==='unlimited'?'unlimited':'practice',currentPeriodEnd:row.period_end.toISOString(),payerId:row.payer_id}:null;
}
