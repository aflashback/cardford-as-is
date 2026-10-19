import {tabId} from './client.ts';
import type {PauseReason} from '../table/sessionLifecycle.ts';
const key=()=>`cardford-go-pending-v1:${tabId()}:stop-intent`;
export type StopIntent={version:1;ownerId:string;gameId:string;reason:PauseReason};
const reasons:PauseReason[]=['manual','away','layout_unavailable','idle','connection_lost','service_unavailable','lease_expired','control_lost','access_required','reopened'];
/** Store intent before the network/authentication path; never store credentials. */
export function retainStopIntent(ownerId:string,gameId:string,reason:PauseReason) {
  try{localStorage.setItem(key(),JSON.stringify({version:1,ownerId,gameId,reason}));}catch{/* The foreground lease remains the final fallback. */}
}
export function readStopIntent(ownerId:string,gameId:string):StopIntent|null {
  try {
    const value:unknown=JSON.parse(localStorage.getItem(key())??'null');
    if(!value||typeof value!=='object'||Array.isArray(value))return null;
    const stop=value as StopIntent;
    if(Object.keys(value).some(name=>!['version','ownerId','gameId','reason'].includes(name))||stop.version!==1||
      stop.ownerId!==ownerId||stop.gameId!==gameId||!reasons.includes(stop.reason))return null;
    return stop;
  }catch{return null;}
}
export function clearStopIntent(ownerId:string,gameId:string) {
  if(readStopIntent(ownerId,gameId))try{localStorage.removeItem(key());}catch{/* Optional storage. */}
}
