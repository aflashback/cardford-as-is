import {Play,Settings2,Layers} from 'lucide-react';
import {Dialog} from './Dialog';
import {useEffect,useState} from 'react';
import type {RealtimePlaybackView} from '../../shared/local-service.contracts';
import {pauseReasonText,remainingRetention,type PauseReason} from './sessionLifecycle';

export function PauseDialog({busy,viewOnly,notice,onResume,onTakeControl,onSettings,onChooseGame,reason='manual',status='live',lifecycle}:{
  busy:boolean;viewOnly:boolean;notice?:string;onResume:()=>void;onTakeControl:()=>void;
  onSettings:()=>void;onChooseGame:()=>void;
  reason?:PauseReason;status?:string;lifecycle?:(RealtimePlaybackView&{receivedAt?:number})|null;
}) {
  const [elapsed,setElapsed]=useState(()=>Math.max(0,performance.now()-(lifecycle?.receivedAt??performance.now())));
  useEffect(()=>{
    const received=lifecycle?.receivedAt??performance.now();setElapsed(Math.max(0,performance.now()-received));let timer:ReturnType<typeof setTimeout>|undefined;
    let foreground=false;
    const stop=()=>{foreground=false;if(timer!==undefined)clearTimeout(timer);timer=undefined;};
    const tick=()=>{timer=undefined;if(!foreground||document.hidden)return;setElapsed(performance.now()-received);timer=setTimeout(tick,1000);};
    const arm=()=>{
      if(document.hidden||(document.hasFocus&&!document.hasFocus())){stop();return;}
      foreground=true;setElapsed(performance.now()-received);
      if(lifecycle?.expiresAt&&timer===undefined)timer=setTimeout(tick,1000);
    };
    const visibility=()=>{if(document.hidden)stop();else arm();};
    window.addEventListener('blur',stop);window.addEventListener('pagehide',stop);window.addEventListener('focus',arm);window.addEventListener('pageshow',arm);
    document.addEventListener('visibilitychange',visibility);arm();
    return ()=>{stop();window.removeEventListener('blur',stop);window.removeEventListener('pagehide',stop);window.removeEventListener('focus',arm);window.removeEventListener('pageshow',arm);document.removeEventListener('visibilitychange',visibility);};
  },[lifecycle?.expiresAt,lifecycle?.serverNow,lifecycle?.receivedAt]);
  const remaining=remainingRetention(lifecycle?.expiresAt,lifecycle?.serverNow,elapsed);
  const expired=lifecycle?.phase==='expired';
  const explanation=pauseReasonText(reason,status,navigator.onLine);
  return <Dialog title={expired?'This game expired':'Game paused'} onClose={()=>{}} dismissible={false}>
    {explanation&&<p role="status">{explanation}</p>}
    {status==='recovering'&&<p role="status">Reconnecting…</p>}
    {status==='retry'&&<p role="status">Connection could not be restored. Retry Resume when ready.</p>}
    {viewOnly&&<p>This table is open elsewhere. Take control here to continue.</p>}
    {!expired&&<button className="primary-button full-button" disabled={busy} onClick={viewOnly?onTakeControl:onResume}>
      {!viewOnly&&<Play size={18} aria-hidden="true"/>}{viewOnly?'Take control':'Resume game'}
    </button>}
    {remaining!==null&&!expired&&<p title={lifecycle?.retentionSeconds===300?'Free games are kept for 5 minutes.':lifecycle?.retentionSeconds===3600?'Paid games are kept for 1 hour.':undefined}>
      {remaining===0?'Retention ended — reconnect to confirm.':`Saved for ${Math.floor(remaining/60)}:${String(remaining%60).padStart(2,'0')}${lifecycle?.retentionSeconds===300?' · Free':lifecycle?.retentionSeconds===3600?' · Paid':''}`}</p>}
    {notice&&<p role="alert">{notice}</p>}
    <nav className="rally-pause-actions" aria-label="Paused game options">
      <button className="subtle-button" onClick={onSettings}><Settings2 size={18} aria-hidden="true"/>Settings</button>
      <button className="subtle-button" onClick={onChooseGame}><Layers size={18} aria-hidden="true"/>Choose game</button>
    </nav>
  </Dialog>;
}
