import {useCallback,useEffect,useRef,useState} from 'react';
import {PauseIntent,registerTableExitGuard} from './pauseLifecycle';
import type {PauseReason} from './sessionLifecycle';
import {IdlePresence} from './idlePresence';
import {authSession} from '../auth/session';

/** One persistent pause policy for every table, including navigation and focus. */
export function useGamePause(options:{stop:(reason:PauseReason)=>Promise<boolean>;canStop:boolean;blocked?:boolean}) {
  const [state,changed]=useState<{paused:boolean;reason:PauseReason}>({paused:true,reason:'reopened'});
  const [idleWarning,setIdleWarning]=useState(false);
  const latest=useRef(options);latest.current=options;
  const intent=useRef<PauseIntent|null>(null);
  const idle=useRef<IdlePresence|null>(null);
  intent.current??=new PauseIntent((paused,reason)=>changed({paused,reason}));
  const setPaused=useCallback((value:boolean,reason:PauseReason='manual')=>{if(value){idle.current?.stop();setIdleWarning(false);intent.current!.pause(reason);}},[]);
  const pause=useCallback(async(reason:PauseReason='manual')=>{
    idle.current?.stop();setIdleWarning(false);
    intent.current!.pause(reason);
    if(!latest.current.canStop)return true; // Never stop another tab's table.
    try{return await latest.current.stop(reason);}catch{return false;}
  },[]);
  useEffect(()=>{
    const hidden=()=>{if(document.hidden)void pause('away');};
    const leave=()=>{void pause('away');};
    const offline=()=>{void pause('connection_lost');};
    const unregister=registerTableExitGuard(()=>pause('away'));
    document.addEventListener('visibilitychange',hidden);
    window.addEventListener('blur',leave);
    window.addEventListener('pagehide',leave);
    window.addEventListener('pageshow',leave);
    window.addEventListener('offline',offline);
    return ()=>{
      intent.current!.invalidateResume();
      unregister();
      document.removeEventListener('visibilitychange',hidden);
      window.removeEventListener('blur',leave);
      window.removeEventListener('pagehide',leave);
      window.removeEventListener('pageshow',leave);
      window.removeEventListener('offline',offline);
      // Normal app navigation awaits the guard. Other unmounts also stop the
      // owned runner; a closed transport alone does not stop server playback.
      if(latest.current.canStop)void latest.current.stop('away').catch(()=>false);
    };
  },[pause]);
  useEffect(()=>{
    if(state.paused)return;
    const policy=new IdlePresence(()=>!document.hidden, setIdleWarning,()=>{void pause('idle');});idle.current=policy;
    authSession.setPlayActive(true);
    const engage=(event:Event)=>{policy.engage();if(event.isTrusted&&event.type!=='focusin')authSession.noteInteraction();};policy.engage();
    const events=['pointerdown','keydown','wheel','touchstart','focusin'] as const;
    for(const event of events)window.addEventListener(event,engage,{passive:true});
    return ()=>{authSession.setPlayActive(false);policy.stop();if(idle.current===policy)idle.current=null;for(const event of events)window.removeEventListener(event,engage);};
  },[state.paused,pause]);
  return {...state,idleWarning,setPaused,pause,
    beginResume:()=>intent.current!.beginResume(),
    canResume:(ticket:number)=>!document.hidden&&navigator.onLine&&!latest.current.blocked&&intent.current!.canResume(ticket),
    finishResume:(ticket:number)=>!document.hidden&&navigator.onLine&&!latest.current.blocked&&intent.current!.finishResume(ticket)};
}
