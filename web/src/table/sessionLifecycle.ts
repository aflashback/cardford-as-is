/** PL-F01/F04: client intent is independent of server permission and transport. */
export type PauseReason='manual'|'away'|'layout_unavailable'|'idle'|'connection_lost'|'service_unavailable'|'lease_expired'|'control_lost'|'access_required'|'reopened';
export type LifecyclePhase='running'|'held'|'paused'|'expired'|'completed';
export interface ClientLifecycleState {
  gameId:string;epoch:number;generation:number;requiresResume:boolean;expired:boolean;
  reason:PauseReason;reasons:PauseReason[];blockers:PauseReason[];holds:string[];
}
export type LifecycleEvent=
  | {type:'interrupt';reason:PauseReason}
  | {type:'blockersChanged';blockers:PauseReason[]}
  | {type:'holdAdded'|'holdRemoved';cause:string}
  | {type:'serverView';gameId:string;generation:number;phase:LifecyclePhase;reason:PauseReason|null}
  | {type:'resumeStarted'|'resumeConfirmed';epoch:number;gameId?:string}
  | {type:'authInvalidated'}
  | {type:'gameReplaced';gameId:string};
const priorities:PauseReason[]=['access_required','control_lost','connection_lost','service_unavailable','lease_expired','layout_unavailable','away','idle','manual','reopened'];
export function createLifecycle(gameId=''):ClientLifecycleState {
  return {gameId,epoch:0,generation:0,requiresResume:true,expired:false,reason:'reopened',reasons:['reopened'],blockers:[],holds:[]};
}
export function canResumeLifecycle(state:ClientLifecycleState,epoch:number) {
  return epoch===state.epoch&&!state.expired&&state.blockers.length===0;
}
export function reduceLifecycle(state:ClientLifecycleState,event:LifecycleEvent):ClientLifecycleState {
  switch(event.type) {
    case 'interrupt': {
      const reasons=[...new Set([...state.reasons,event.reason])];
      return {...state,epoch:state.epoch+1,requiresResume:true,reasons,reason:priorities.find(r=>reasons.includes(r))??event.reason};
    }
    case 'blockersChanged':return {...state,blockers:[...new Set(event.blockers)]};
    case 'holdAdded':return state.holds.includes(event.cause)?state:{...state,holds:[...state.holds,event.cause]};
    case 'holdRemoved':return {...state,holds:state.holds.filter(c=>c!==event.cause)};
    case 'resumeStarted':return state;
    case 'resumeConfirmed':return (!event.gameId||event.gameId===state.gameId)&&canResumeLifecycle(state,event.epoch)
      ? {...state,requiresResume:false,reasons:[],reason:'manual'}:state;
    case 'serverView': {
      if(event.gameId!==state.gameId||event.generation<state.generation)return state;
      const updated={...state,generation:event.generation};
      if(event.phase==='expired')return {...updated,expired:true,requiresResume:true,epoch:state.epoch+1};
      if(event.phase==='paused'&&!state.requiresResume)return reduceLifecycle(updated,{type:'interrupt',reason:event.reason??'reopened'});
      return updated;
    }
    case 'authInvalidated':return {...reduceLifecycle(state,{type:'interrupt',reason:'control_lost'}),holds:[]};
    case 'gameReplaced':return {...createLifecycle(event.gameId),epoch:state.epoch+1};
  }
}
export function pauseReasonText(reason:PauseReason,status='live',online=true) {
  switch(reason) {
    case 'connection_lost':return online&&(status==='live'||status==='http')?'Connection restored — Resume when ready':'Connection lost — play is paused on this device';
    case 'away':return 'Paused while you were away';
    case 'layout_unavailable':return 'Paused while the table layout was unavailable';
    case 'idle':return 'Paused after inactivity';
    case 'lease_expired':return 'Your foreground session ended — Resume when ready';
    case 'service_unavailable':return 'The service is unavailable — play is paused on this device';
    case 'control_lost':return 'This table is controlled elsewhere';
    case 'access_required':return 'Check your account to continue';
    default:return '';
  }
}
/** Elapsed time is performance.now() delta from receipt, never client wall time. */
export function remainingRetention(expiresAt:string|null|undefined,serverNow:string|null|undefined,elapsedMs:number) {
  if(!expiresAt||!serverNow)return null;
  const remaining=Date.parse(expiresAt)-Date.parse(serverNow)-Math.max(0,elapsedMs);
  return Number.isFinite(remaining)?Math.max(0,Math.ceil(remaining/1000)):null;
}
