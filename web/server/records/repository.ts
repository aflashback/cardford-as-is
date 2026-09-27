import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { Transaction, Database } from './database.ts';
import { transaction } from './database.ts';
import type { PlayerProfile, PlayerRow, GameRow } from './types.ts';
import { ApiFailure } from '../http/errors.ts';

export const hashToken = (token:string) => createHash('sha256').update(token).digest('hex');
export async function newIdentity(pool:Database):Promise<string> {
  const token = randomBytes(32).toString('base64url');
  const profile:PlayerProfile = { displayName:'Local player', preferences:{coachMode:'asked',gameSpeed:1},plan:'unlimited',cancelAtPeriodEnd:false,currentPeriodEnd:new Date(Date.now()+30*86400000).toISOString(),billingMode:'fixture' };
  await transaction(pool,async client=>{
    const playerId=randomUUID();
    await client.query('INSERT INTO players(id,profile) VALUES($1,$2)',[playerId,profile]);
    await client.query("INSERT INTO sessions(token_hash,player_id,expires_at) VALUES($1,$2,now()+interval '30 days')",[hashToken(token),playerId]);
  });
  return token;
}
export async function resolveIdentity(pool:Database,token:string|undefined):Promise<string|null> {
  if (!token) return null;
  const result=await pool.query<{player_id:string}>('SELECT player_id FROM sessions WHERE token_hash=$1 AND revoked_at IS NULL AND expires_at>now()',[hashToken(token)]);
  return result.rows[0]?.player_id??null;
}
export async function ownedTransaction<T>(pool:Database,token:string,action:(client:Transaction,player:PlayerRow,game:GameRow|null)=>Promise<T>):Promise<T> {
  return transaction(pool,async client=>{
    const session=await client.query<{player_id:string}>('SELECT player_id FROM sessions WHERE token_hash=$1 AND revoked_at IS NULL AND expires_at>now()',[hashToken(token)]);
    if (!session.rows[0]) throw new ApiFailure(401,'UNAUTHENTICATED','Your local session ended. Start a new local session.');
    const player=(await client.query<PlayerRow>('SELECT * FROM players WHERE id=$1 FOR UPDATE',[session.rows[0].player_id])).rows[0];
    if (!player) throw new ApiFailure(401,'UNAUTHENTICATED','Player not found.');
    const currentSession=await client.query('SELECT 1 FROM sessions WHERE token_hash=$1 AND revoked_at IS NULL AND expires_at>now()',[hashToken(token)]);
    if (!currentSession.rowCount) throw new ApiFailure(401,'UNAUTHENTICATED','Session revoked.');
    const game=player.active_game_id ? (await client.query<GameRow>('SELECT * FROM games WHERE id=$1 AND player_id=$2',[player.active_game_id,player.id])).rows[0]??null : null;
    return action(client,player,game);
  });
}
export async function saveGame(client:Transaction,game:GameRow) {
  await client.query('UPDATE games SET document=$1,revision=$2,updated_at=now() WHERE id=$3',[game.document,game.revision,game.id]);
}
export async function savePlayer(client:Transaction,player:PlayerRow) {
  await client.query('UPDATE players SET profile=$1,active_game_id=$2,access_generation=$3 WHERE id=$4',[player.profile,player.active_game_id,player.access_generation,player.id]);
}
function canonical(value:unknown):unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value==='object') return Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>[key,canonical(item)]));
  return value;
}
export async function idempotent<T>(client:Transaction,playerId:string,commandId:string,body:unknown,operation:()=>Promise<T>):Promise<T> {
  const digest=createHash('sha256').update(JSON.stringify(canonical(body))).digest('hex');
  const existing=(await client.query<{digest:string;response:T}>('SELECT digest,response FROM commands WHERE player_id=$1 AND command_id=$2',[playerId,commandId])).rows[0];
  if(existing) { if(existing.digest!==digest)throw new ApiFailure(409,'IDEMPOTENCY_CONFLICT','This request ID was already used for another command.'); return existing.response; }
  const response=await operation();
  await client.query('INSERT INTO commands(player_id,command_id,digest,response) VALUES($1,$2,$3,$4)',[playerId,commandId,digest,JSON.stringify(response)]);
  return response;
}
