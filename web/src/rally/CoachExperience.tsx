import {useCallback,useEffect,useLayoutEffect,useRef,useState} from 'react';
import {ArrowLeft,ChevronLeft,ChevronRight,History,Lightbulb,MessageSquare,Pause,Play,RotateCcw,ThumbsDown,ThumbsUp,Trophy,X} from 'lucide-react';
import type {Card,GameAction,ReviewFrame,TrixAction} from '../../shared/contracts';
import type {CoachUIAccess,CoachUIItem,CoachUIReplayView,CoachUIStartRequest} from '../../shared/local-service.contracts';
import {useCoachExperience,type CoachLiveContext} from './useCoachExperience';
import './rally-coach-experience.css';

export interface CoachConfirmedAction {gameId:string;decisionId:string;revision:number;action:GameAction|TrixAction}
export interface CoachExperienceProps {
  session:CoachLiveContext;
  selectedCards?:Card[];
  confirmedAction?:CoachConfirmedAction|null;
  visible:boolean;
  disabled?:boolean;
  cueAvailable?:boolean;
  timing?:'asked'|'nudges'|'after';
  getEnvelope?:()=>{commandId:string;gameId:string;expectedRevision:number;controlLeaseToken:string};
  onReplayChange:(frame:ReviewFrame|null)=>void;
  onBeforeReplay?:()=>Promise<boolean>;
  onAccessChange?:(access:CoachUIAccess)=>void;
  onAccount:()=>void;
}
type FeedbackDraft={item:CoachUIItem;reason:string;text:string};
export function coachFrameLabel(frame:ReviewFrame) {
  if ('observation' in frame.game) {
    const view=frame.game.observation;
    const phase=view.phase==='declare-doubles'?'Doubling':view.phase==='choose-request'?'Choose a request':view.phase==='layout'?'Trix Jacks':
      view.phase==='playing'?`Trick ${view.tricks.length+1}`:view.phase==='round-complete'?'Results':view.phase==='session-complete'?'Game complete':'Saved play';
    return `Deal ${view.dealNumber} · ${phase}`;
  }
  const view=frame.game;
  const phase=view.phase==='bid'?'Bidding':view.phase==='pass'?`Pass ${view.passDirection}`:
    view.phase==='hand-end'||view.phase==='match-end'?'Results':`Trick ${Math.max(1,view.history.length+(view.phase==='trick-end'?0:1))}`;
  return `Hand ${view.handNumber} · ${phase}`;
}
export function CoachExperience(props:CoachExperienceProps) {
  const {session,selectedCards=[],confirmedAction,visible,disabled=false,cueAvailable=true,timing='asked',onAccount}=props;
  const coach=useCoachExperience(session,props.onAccessChange,visible);
  const latest=useRef(props); latest.current=props;
  const panel=useRef<HTMLElement>(null);
  const feedbackForm=useRef<HTMLFormElement>(null);
  // Explicit navigation starts at the new view's first control. Incoming
  // comments and playback ticks never call this or disturb reading position.
  const focusPanel=()=>requestAnimationFrame(()=>{
    const element=panel.current;
    if (!element || !latest.current.visible) return;
    const body=element.closest<HTMLElement>('.rally-coach-body');
    if (body) body.scrollTop=0;
    element.focus({preventScroll:true});
  });
  const [history,setHistory]=useState(false), [feedback,setFeedback]=useState<FeedbackDraft|null>(null);
  const [replay,setReplay]=useState<CoachUIReplayView|null>(null), [frameIndex,setFrameIndex]=useState(0);
  const [playing,setPlaying]=useState(false), [replayBusy,setReplayBusy]=useState(false), [notice,setNotice]=useState('');
  const replayGeneration=useRef(0), sentSelection=useRef(''), sentConfirmation=useRef('');
  const replayForeground=useRef(!document.hidden);
  const attemptedSelection=useRef(''), attemptedConfirmation=useRef('');
  useLayoutEffect(()=>{
    if (!visible || !feedback?.item.itemId) return;
    const form=feedbackForm.current;
    const body=form?.closest<HTMLElement>('.rally-coach-body');
    const reason=form?.querySelector<HTMLSelectElement>('select');
    if (!form || !body || !reason) return;
    reason.focus({preventScroll:true});
    const inset=parseFloat(getComputedStyle(body).paddingTop)||0;
    body.scrollTop+=form.getBoundingClientRect().top-body.getBoundingClientRect().top-inset;
    // Draft edits keep their focus and scroll position; only opening an item moves them.
  },[feedback?.item.itemId,visible]);
  const selectionKey=[...selectedCards].sort().join(',');
  const stopReplay=useCallback(()=>{
    replayGeneration.current++; setPlaying(false); setReplay(null); setReplayBusy(false);
    latest.current.onReplayChange(null);
  },[]);
  useEffect(()=>()=>{replayGeneration.current++; latest.current.onReplayChange(null);},[]);
  useEffect(()=>{if (!visible) {stopReplay(); setFeedback(null);} else void coach.reload();},[visible,stopReplay]);
  useEffect(()=>{stopReplay(); setFeedback(null); setNotice('');},[session.gameId,stopReplay]);
  useEffect(()=>{stopReplay();setFeedback(null);},[coach.status?.playerId,stopReplay]);
  useEffect(()=>{
    const away=()=>{replayForeground.current=false;setPlaying(false);};
    const foreground=()=>{if(!document.hidden)replayForeground.current=true;};
    const visibility=()=>{if(document.hidden)away();else foreground();};
    window.addEventListener('blur',away);window.addEventListener('pagehide',away);window.addEventListener('offline',away);window.addEventListener('focus',foreground);
    document.addEventListener('visibilitychange',visibility); return ()=>{document.removeEventListener('visibilitychange',visibility);window.removeEventListener('blur',away);window.removeEventListener('pagehide',away);window.removeEventListener('offline',away);window.removeEventListener('focus',foreground);};
  },[]);
  useEffect(()=>{
    if (!visible || !replay || !playing || feedback) return;
    if (frameIndex>=replay.frames.length-1) {setPlaying(false); return;}
    const timer=setTimeout(()=>{if(replayForeground.current&&!document.hidden&&latest.current.visible&&!latest.current.disabled)setFrameIndex(index=>Math.min(index+1,replay.frames.length-1));},1400);
    return ()=>clearTimeout(timer);
  },[visible,replay,playing,feedback,frameIndex]);
  useEffect(()=>{
    if (visible && replay) latest.current.onReplayChange(replay.frames[frameIndex] ?? null);
  },[visible,replay,frameIndex]);
  function envelope() {
    return latest.current.getEnvelope?.() ?? {commandId:crypto.randomUUID(),gameId:latest.current.session.gameId,
      expectedRevision:latest.current.session.revision,controlLeaseToken:latest.current.session.controlLeaseToken};
  }
  const current=coach.saved?.gameId===session.gameId && coach.saved.decisionId===session.decisionId;
  const selectionToken=`${coach.saved?.sessionId}:${session.decisionId}:${selectionKey}`;
  const confirmationToken=`${coach.saved?.sessionId}:${confirmedAction?.revision}`;
  const canCommentSelection=current && coach.saved?.kind==='cue' && (selectionKey!=='' || sentSelection.current.startsWith(`${coach.saved.sessionId}:`));
  const canCommentConfirmed=!!confirmedAction && coach.saved?.kind==='cue' && coach.saved.gameId===confirmedAction.gameId &&
    coach.saved.decisionId===confirmedAction.decisionId && session.gameId===confirmedAction.gameId && session.revision>=confirmedAction.revision;
  async function selectionComment() {
    if (!canCommentSelection || coach.busy || coach.uncertain || disabled) return;
    attemptedSelection.current=selectionToken;
    try {
      const body={...envelope(),sessionId:coach.saved!.sessionId,decisionId:session.decisionId,
        kind:'selection' as const,selectedCards:[...selectedCards]};
      if(await coach.write({kind:'item',body})) sentSelection.current=selectionToken;
    } catch(e) {setNotice(e instanceof Error?e.message:'Wait for the current table before requesting a comment.');}
  }
  async function confirmedComment() {
    if (!canCommentConfirmed || coach.busy || coach.uncertain || disabled) return;
    attemptedConfirmation.current=confirmationToken;
    try {
      const body={...envelope(),sessionId:coach.saved!.sessionId,decisionId:confirmedAction!.decisionId,
        kind:(['play','play-card','layout-card','layout-pass'].includes(confirmedAction!.action.kind)?'postplay':'confirmed') as 'postplay'|'confirmed',action:confirmedAction!.action};
      if(await coach.write({kind:'item',body})) sentConfirmation.current=confirmationToken;
    } catch(e) {setNotice(e instanceof Error?e.message:'Wait for the confirmed table before requesting a comment.');}
  }
  useEffect(()=>{
    if (!visible || timing!=='nudges' || disabled || coach.busy || coach.uncertain || !canCommentSelection ||
      sentSelection.current===selectionToken || attemptedSelection.current===selectionToken) return;
    const timer=setTimeout(()=>void selectionComment(),450); return ()=>clearTimeout(timer);
  },[visible,timing,disabled,coach.busy,coach.uncertain,selectionToken,canCommentSelection]);
  useEffect(()=>{
    if (!visible || timing!=='nudges' || disabled || coach.busy || coach.uncertain || !canCommentConfirmed ||
      sentConfirmation.current===confirmationToken || attemptedConfirmation.current===confirmationToken) return;
    void confirmedComment();
  },[visible,timing,disabled,coach.busy,coach.uncertain,confirmationToken,canCommentConfirmed,session.revision]);
  async function start(kind:CoachUIStartRequest['kind']) {
    if (coach.busy || coach.uncertain || disabled || !coach.status?.access.canRequest) return;
    stopReplay(); setHistory(false); setFeedback(null); setNotice('');
    try {if(await coach.write({kind:'start',body:{...envelope(),decisionId:session.decisionId,kind}}))focusPanel();}
    catch(e) {setNotice(e instanceof Error?e.message:'Wait for the current table before opening a session.');}
  }
  async function why(item:CoachUIItem) {
    stopReplay(); setHistory(false); setFeedback(null); setNotice(''); setReplayBusy(true); focusPanel();
    const request=++replayGeneration.current;
    try {
      if (latest.current.onBeforeReplay && !await latest.current.onBeforeReplay()) throw new Error('Pause could not be confirmed. Reconnect and try again.');
      if (request!==replayGeneration.current || !latest.current.visible) return;
      const view=await coach.readReplay(item);
      if (request!==replayGeneration.current || !latest.current.visible) return;
      setFrameIndex(0); setReplay(view); setReplayBusy(false);
      latest.current.onReplayChange(view.frames[0]);
      focusPanel();
    } catch(e) {
      if (request!==replayGeneration.current) return;
      stopReplay(); setNotice(e instanceof Error?e.message:'Playback is unavailable.');
    }
  }
  async function saveFeedback(item:CoachUIItem,value:'helpful'|'not-helpful',reason='',text='') {
    setPlaying(false);
    const currentItem=coach.saved?.items.find(candidate=>candidate.itemId===item.itemId) ?? item;
    const ok=await coach.write({kind:'feedback',body:{commandId:crypto.randomUUID(),itemId:item.itemId,
      expectedFeedbackRevision:currentItem.feedbackRevision,value,reason,text}});
    if (ok) {if(feedback)focusPanel();setFeedback(null); setNotice('Feedback saved.');}
  }
  function savedSession(id:string) {stopReplay();setFeedback(null);setHistory(false);setNotice('');void coach.openSaved(id).then(focusPanel);}
  const blocked=disabled || coach.busy || coach.uncertain || !coach.status?.access.canRequest;
  const items=coach.saved?.items ?? [];
  const replayMode=!!replay || replayBusy;
  return <section ref={panel} tabIndex={-1} className="rally-coach-experience" data-view={replayMode?'replay':history?'history':'session'} aria-label="Coaching sessions">
    {replayMode ? <button className="rally-coach-back rally-replay-back" onClick={()=>{stopReplay();focusPanel();}}><ArrowLeft size={16} aria-hidden="true"/>Back to live play</button> : <>
    <nav className="rally-coach-tools" aria-label="Coach tools">
      <button onClick={()=>void start('cue')} disabled={blocked || !cueAvailable} title="A cue before your choice · uses one session"><Lightbulb size={18} aria-hidden="true"/><span>Cue</span></button>
      <button onClick={()=>void start('review')} disabled={blocked} title="Review your play · uses one session"><MessageSquare size={18} aria-hidden="true"/><span>Review</span></button>
      <button onClick={()=>void start('rating')} disabled={blocked} title="Preview a player comparison · uses one session"><Trophy size={18} aria-hidden="true"/><span>Rating</span></button>
      <button onClick={()=>{setHistory(value=>!value);setPlaying(false);focusPanel();}} aria-pressed={history} aria-label="Saved coaching sessions" title="Saved sessions"><History size={18} aria-hidden="true"/></button>
    </nav>
    {canCommentSelection && <button className="rally-coach-retry" onClick={()=>void selectionComment()} disabled={disabled || coach.busy || coach.uncertain || sentSelection.current===selectionToken}>Comment on selection</button>}
    {canCommentConfirmed && <button className="rally-coach-retry" onClick={()=>void confirmedComment()} disabled={disabled || coach.busy || coach.uncertain || sentConfirmation.current===confirmationToken}>Comment on my choice</button>}
    {coach.status && !coach.status.access.canRequest && <div className="rally-coach-allowance">
      <p>{coach.status.access.remaining===0?'Today’s sessions are used. Saved coaching is still here.':'Coaching is unavailable for this table.'}</p>
      <button className="primary-button" onClick={onAccount}>Unlock coaching</button>
      <small>Resets at {new Date(coach.status.access.resetAt).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})} · {coach.status.access.timezone} day</small>
    </div>}
    </>}
    {(coach.error || notice) && <p className="rally-coach-notice" role="status">{coach.error || notice}</p>}
    {coach.uncertain && <button className="rally-coach-retry" onClick={()=>void coach.write()} disabled={coach.busy}><RotateCcw size={16} aria-hidden="true"/>Retry same request</button>}
    {(!coach.status && !coach.busy) && <button className="rally-coach-retry" onClick={()=>void coach.reload()}>Reconnect Coach</button>}
    {(coach.busy || coach.loading || replayBusy) && <p role="status" className="rally-coach-working">{replayBusy?'Opening saved play…':coach.loading?'Opening session…':'Saving…'}</p>}
    {replayBusy ? null : history ? <div className="rally-coach-history">
      <strong>Saved sessions</strong>
      {coach.status?.recent.length ? coach.status.recent.map(entry=><button key={entry.sessionId} onClick={()=>savedSession(entry.sessionId)} disabled={coach.busy || coach.uncertain}>
        <span>{entry.kind==='cue'?'Cue':entry.kind==='review'?'Review':'Rating'} · {entry.gameType==='trix'?'Trix':entry.gameType==='hearts'?'Hearts':'Spades'}</span>
        <small>{new Date(entry.createdAt).toLocaleString([],{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}</small>
      </button>) : <p>Your requested sessions appear here.</p>}
    </div> : replay ? <div className="rally-coach-replay">
      <div className="rally-replay-controls">
        <button aria-label="Previous saved frame" title="Previous" disabled={frameIndex===0} onClick={()=>{setPlaying(false);setFrameIndex(i=>Math.max(0,i-1));}}><ChevronLeft aria-hidden="true" size={20}/></button>
        <button aria-label={playing?'Pause playback':'Play saved frames'} title={playing?'Pause':'Play'} disabled={replay.frames.length<2} onClick={()=>{if(frameIndex===replay.frames.length-1)setFrameIndex(0);setPlaying(value=>!value);}}>{playing?<Pause size={20} aria-hidden="true"/>:<Play size={20} aria-hidden="true"/>}</button>
        <button aria-label="Next saved frame" title="Next" disabled={frameIndex>=replay.frames.length-1} onClick={()=>{setPlaying(false);setFrameIndex(i=>Math.min(replay.frames.length-1,i+1));}}><ChevronRight aria-hidden="true" size={20}/></button>
        <output aria-live="polite">{frameIndex+1}/{replay.frames.length}</output>
      </div>
      <input type="range" min={0} max={Math.max(0,replay.frames.length-1)} value={frameIndex} disabled={replay.frames.length<2}
        aria-label="Saved frame" onChange={event=>{setPlaying(false);setFrameIndex(Number(event.target.value));}}/>
      <p className="rally-replay-caption">{coachFrameLabel(replay.frames[frameIndex])}{replay.frames[frameIndex].notes.length>0&&` · ${replay.frames[frameIndex].notes.join(' ')}`}</p>
      <span className="rally-coach-preview">Preview explanation</span>
      <p>{replay.explanation}</p>
      <details><summary onClick={()=>setPlaying(false)}>History</summary><ol>{replay.frames.map((frame,index)=><li key={`${frame.decisionId}:${index}`}>
        <button aria-current={index===frameIndex?'step':undefined} onClick={()=>{setPlaying(false);setFrameIndex(index);}}>{coachFrameLabel(frame)}</button>
      </li>)}</ol></details>
      {items.find(item=>item.itemId===replay.itemId) && <button className="rally-coach-back" onClick={()=>{setPlaying(false);setFeedback({item:items.find(item=>item.itemId===replay.itemId)!,reason:'',text:''});}}>Comment on this explanation</button>}
    </div> : <>
      {!items.length && <div className="rally-coach-empty"><img src="/rally/regular-thinking-v2.png" alt="" width={76} height={76}/><p>Pick a coaching tool.</p><small>2 free sessions a day. Explanations are previews while Coach is in training.</small></div>}
      {items.length>0 && <div className="rally-coach-context">{current?'This decision':'Saved decision'}<span>{coach.saved?.kind==='cue'?'Cue':coach.saved?.kind==='rating'?'Comparison':'Review'}</span></div>}
      {[...items].reverse().map(item=><article key={item.itemId} className="rally-coach-item">
        <header><strong>{item.kind==='selection'&&!current?'Earlier selection':item.title}</strong><span className="rally-coach-preview">Preview</span></header>
        {item.kind==='selection'&&!current?<details><summary>View earlier selection</summary><p>{item.body}</p></details>:<p>{item.body}</p>}
        {item.rating && <div className="rally-coach-rating"><strong>{item.rating.percentile}<small>th percentile</small></strong>
          <meter min={0} max={100} value={item.rating.percentile} aria-label="Fictional preview percentile"/>
          <small>Fictional sample · {item.rating.cohortLabel}<br/>{item.rating.sampleSize.toLocaleString()} example players · not a real rating</small></div>}
        <footer>
          <button onClick={()=>void why(item)} disabled={!item.replayAvailable || replayBusy} aria-label={`Why: ${item.title}`}>Why?</button>
          <button onClick={()=>void saveFeedback(item,'helpful')} disabled={coach.busy || coach.uncertain} aria-pressed={item.feedback?.value==='helpful'} aria-label={`Helpful: ${item.title}`} title="Helpful"><ThumbsUp size={17} aria-hidden="true"/></button>
          <button onClick={()=>{setPlaying(false);setFeedback({item,reason:item.feedback?.reason || '',text:item.feedback?.text || ''});}} disabled={coach.busy || coach.uncertain} aria-pressed={item.feedback?.value==='not-helpful'} aria-label={`Not helpful: ${item.title}`} title="Not helpful"><ThumbsDown size={17} aria-hidden="true"/></button>
        </footer>
      </article>)}
    </>}
    {feedback && <form ref={feedbackForm} className="rally-coach-feedback" onSubmit={event=>{event.preventDefault();void saveFeedback(feedback.item,'not-helpful',feedback.reason,feedback.text);}}>
      <header><strong>Your feedback</strong><button type="button" onClick={()=>{setFeedback(null);focusPanel();}} aria-label="Close feedback"><X size={18} aria-hidden="true"/></button></header>
      <label>Reason<select value={feedback.reason} onChange={event=>setFeedback({...feedback,reason:event.target.value})}>
        <option value="">Choose (optional)</option><option value="unclear">Unclear</option><option value="not-relevant">Not relevant</option><option value="disagree">I disagree</option><option value="other">Something else</option>
      </select></label>
      <label>Note<textarea maxLength={2000} rows={3} value={feedback.text} onChange={event=>setFeedback({...feedback,text:event.target.value})} placeholder="Optional"/></label>
      <button className="primary-button" disabled={coach.busy || coach.uncertain}>Save feedback</button>
    </form>}
  </section>;
}
