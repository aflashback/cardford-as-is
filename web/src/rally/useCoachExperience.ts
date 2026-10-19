import {useCallback,useEffect,useRef,useState} from 'react';
import type {ContractName,ContractTypes} from '../../shared/local-service.contracts';
import type {CoachUIAccess,CoachUIFeedbackView,CoachUIItem,CoachUIReplayView,CoachUISession,CoachUISessionView,CoachUIStatusView} from '../../shared/local-service.contracts';
import {api,definiteFailure} from '../api/client';
import {onAuthInvalidated} from '../api/authLifecycle';
import {readLease} from '../api/controlLease';
import {CoachMutationGate,coachPendingKey,packCoachPending,readCoachPending,restoreCoachPending,saveCoachPending,type CoachOperation} from './coachCommands';

export interface CoachLiveContext {gameId:string;decisionId:string;revision:number;controlLeaseToken:string}
export function useCoachExperience(context:CoachLiveContext,onAccessChange?:(access:CoachUIAccess)=>void,enabled=true) {
  const [status,setStatus]=useState<CoachUIStatusView|null>(null);
  const [saved,setSaved]=useState<CoachUISession|null>(null);
  const [busy,setBusy]=useState(false), [loading,setLoading]=useState(false), [uncertain,setUncertain]=useState(false);
  const [error,setError]=useState('');
  const live=useRef(context); live.current=context;
  const accessCallback=useRef(onAccessChange); accessCallback.current=onAccessChange;
  const owner=useRef(''), mounted=useRef(false), generation=useRef(0), readSequence=useRef(0), statusSequence=useRef(0);
  const gate=useRef(new CoachMutationGate());
  const hydratedOwner=useRef('');
  const activeGame=useRef(context.gameId);
  const controllers=useRef(new Map<AbortController,boolean>());
  const foregroundEligible=useRef(!document.hidden),readEnabled=useRef(enabled),interruptionEpoch=useRef(0);
  if(readEnabled.current!==enabled){readEnabled.current=enabled;interruptionEpoch.current++;}
  const request=useCallback(async <N extends ContractName>(path:string,type:N,body?:unknown):Promise<ContractTypes[N]>=>{
    const readOnly=body===undefined;
    if(readOnly&&(!foregroundEligible.current||document.hidden||!readEnabled.current))throw new DOMException('The page is away.','AbortError');
    const controller=new AbortController(); controllers.current.set(controller,readOnly);
    try {return await api(path,type,body,body===undefined?'GET':'POST',controller.signal);}
    finally {controllers.current.delete(controller);}
  },[]);
  const abortRequests=(readsOnly=false)=>{for (const [controller,readOnly] of controllers.current)if(!readsOnly||readOnly){controller.abort();controllers.current.delete(controller);}};
  const clearPending=()=>{try {sessionStorage.removeItem(coachPendingKey);} catch {/* Optional storage. */}};
  const publishAccess=useCallback((access:CoachUIAccess)=>{
    setStatus(old=>old ? {...old,access} : old); accessCallback.current?.(access);
  },[]);
  const reload=useCallback(async()=>{
    if(!foregroundEligible.current||document.hidden||!readEnabled.current)return;
    let epoch=generation.current;
    const sequence=++statusSequence.current;
    try {
      const value=await request('/api/platform/coach','CoachUIStatusView');
      if (!mounted.current || epoch!==generation.current || sequence!==statusSequence.current) return;
      if (owner.current && owner.current!==value.playerId) {
        epoch=++generation.current; readSequence.current++; hydratedOwner.current='';
        setSaved(null); gate.current.clear(); setUncertain(false); setBusy(false); setLoading(false); clearPending();
      }
      owner.current=value.playerId; setStatus(value); accessCallback.current?.(value.access);
      if (hydratedOwner.current!==value.playerId) {
        let raw:string|null=null; try {raw=sessionStorage.getItem(coachPendingKey);} catch {/* Optional storage. */}
        const stored=readCoachPending(raw,value.playerId);
        const retained=stored?.leaseHash && typeof stored.body.gameId==='string'
          ? await readLease(value.playerId,stored.body.gameId,stored.leaseHash) : null;
        const restored=stored ? await restoreCoachPending(stored,retained?.gameId ?? live.current.gameId,
          retained?.token ?? live.current.controlLeaseToken) : null;
        if (epoch!==generation.current || sequence!==statusSequence.current || !mounted.current || value.playerId!==owner.current) return;
        hydratedOwner.current=value.playerId;
        if (restored && !gate.current.pending) {gate.current.pending=restored; setUncertain(true); setError('A Coach request is unconfirmed. Retry to recover it.');}
        else if (raw && !gate.current.pending) {clearPending(); setError('A previous Coach request could not be restored. Check saved sessions before requesting again.');}
      }
    } catch (e) {if (mounted.current && epoch===generation.current && sequence===statusSequence.current) setError(e instanceof Error?e.message:'Coach is unavailable.');}
  },[request]);
  useEffect(()=>{
    mounted.current=true;
    // StrictMode may rerun this effect while an exact persisted intent survives.
    setBusy(false); setUncertain(gate.current.pending!==null);
    const unsubscribe=onAuthInvalidated(()=>{
      generation.current++; readSequence.current++; statusSequence.current++; owner.current=''; hydratedOwner.current=''; gate.current.clear(); clearPending();
      abortRequests();
      setSaved(null); setStatus(null); setUncertain(false); setBusy(false); setLoading(false); setError('Sign in again to open Coach.');
    });
    void reload();
    const away=()=>{foregroundEligible.current=false;interruptionEpoch.current++;readSequence.current++;statusSequence.current++;abortRequests(true);setLoading(false);};
    const foreground=()=>{if (!document.hidden&&(!document.hasFocus||document.hasFocus())){foregroundEligible.current=true;void reload();}};
    const visibility=()=>{if(document.hidden)away();else foreground();};
    window.addEventListener('online',foreground);window.addEventListener('focus',foreground);window.addEventListener('blur',away);window.addEventListener('pagehide',away);window.addEventListener('offline',away);document.addEventListener('visibilitychange',visibility);
    return ()=>{mounted.current=false; generation.current++; readSequence.current++; statusSequence.current++; gate.current.settle(false); abortRequests(); unsubscribe();
      window.removeEventListener('online',foreground);window.removeEventListener('focus',foreground);window.removeEventListener('blur',away);window.removeEventListener('pagehide',away);window.removeEventListener('offline',away);document.removeEventListener('visibilitychange',visibility);};
  },[reload]);
  useEffect(()=>{
    if (activeGame.current===context.gameId) return;
    activeGame.current=context.gameId; readSequence.current++;interruptionEpoch.current++;
    setSaved(null); setLoading(false); void reload();
  },[context.gameId,reload]);
  useEffect(()=>{
    if (!status?.access.resetAt) return;
    const delay=Date.parse(status.access.resetAt)-Date.now()+200;
    if (!Number.isFinite(delay) || delay<=0) return;
    const timer=setTimeout(()=>void reload(),Math.min(delay,86_400_000)); return ()=>clearTimeout(timer);
  },[status?.access.resetAt,reload]);
  const openSaved=useCallback(async(id:string)=>{
    const sequence=++readSequence.current, epoch=generation.current;
    setLoading(true); setError('');
    try {
      const value=await request(`/api/platform/coach/sessions/${encodeURIComponent(id)}`,'CoachUISessionView');
      if (!mounted.current || epoch!==generation.current || sequence!==readSequence.current) return;
      setSaved(value.session);
      if (value.session.gameId===live.current.gameId) publishAccess(value.access);
      else void reload();
    } catch(e) {if (mounted.current && epoch===generation.current && sequence===readSequence.current) setError(e instanceof Error?e.message:'Saved session unavailable.');}
    finally {if (mounted.current && epoch===generation.current && sequence===readSequence.current) setLoading(false);}
  },[publishAccess,request,reload]);
  const write=useCallback(async(operation?:CoachOperation):Promise<boolean>=>{
    if (!owner.current || hydratedOwner.current!==owner.current||!foregroundEligible.current||document.hidden||!readEnabled.current) return false;
    const existingIntent=gate.current.pending!==null;
    const pending=gate.current.begin(operation); if (!pending) return false;
    const epoch=generation.current, player=owner.current, sequence=++readSequence.current,foregroundEpoch=interruptionEpoch.current;
    const canSend=()=>mounted.current&&epoch===generation.current&&player===owner.current&&foregroundEpoch===interruptionEpoch.current&&
      foregroundEligible.current&&!document.hidden&&readEnabled.current;
    const cancelUnsent=()=>{
      if(gate.current.pending===pending){
        gate.current.settle(!existingIntent);
        if(!existingIntent)clearPending();
        if(mounted.current&&epoch===generation.current&&player===owner.current)setUncertain(existingIntent);
      }
      return false;
    };
    ++statusSequence.current;
    let sent=false;
    setLoading(false); setBusy(true); setError('');
    try {
      const packed=await packCoachPending(player,pending);
      if (!canSend()) return cancelUnsent();
      saveCoachPending(packed,sessionStorage);
      if (!canSend()) return cancelUnsent();
      sent=true;
      const result:CoachUISessionView|CoachUIFeedbackView=pending.kind==='feedback'
        ? await request('/api/platform/coach/feedback','CoachUIFeedbackView',pending.body)
        : await request(pending.kind==='start'?'/api/platform/coach/sessions':'/api/platform/coach/items','CoachUISessionView',pending.body);
      if (!mounted.current || epoch!==generation.current || player!==owner.current) return false;
      gate.current.settle(true); clearPending(); setUncertain(false);
      if ('session' in result) {
        if (sequence===readSequence.current) setSaved(result.session);
        if (result.session.gameId===live.current.gameId) publishAccess(result.access);
      }
      else setSaved(old=>old ? {...old,items:old.items.map(item=>item.itemId===result.itemId ? {...item,feedbackRevision:result.feedbackRevision,feedback:result.feedback} : item)} : old);
      void reload(); return true;
    } catch(e) {
      if (!mounted.current || epoch!==generation.current) return false;
      const definite=sent?definiteFailure(e):!existingIntent; gate.current.settle(definite);
      if (definite) clearPending(); setUncertain(!definite);
      setError(e instanceof Error?e.message:'Request unconfirmed. Retry this request.');
      if (definite) {void reload(); if (pending.kind==='feedback' && sequence===readSequence.current) {const id=saved?.sessionId; if(id) void openSaved(id);}}
      return false;
    } finally {if (mounted.current && epoch===generation.current) setBusy(false);}
  },[publishAccess,reload,openSaved,saved?.sessionId,request]);
  const readReplay=useCallback(async(item:CoachUIItem):Promise<CoachUIReplayView>=>{
    const epoch=generation.current,player=owner.current;
    if (!mounted.current || !player) throw new Error('Sign in again to open saved play.');
    const value=await request(`/api/platform/coach/items/${encodeURIComponent(item.itemId)}/replay`,'CoachUIReplayView');
    if (!mounted.current || epoch!==generation.current || player!==owner.current) throw new Error('Saved play is no longer current.');
    return value;
  },[request]);
  return {status,saved,busy,loading,uncertain,error,reload,openSaved,write,readReplay};
}
