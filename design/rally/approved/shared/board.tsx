import React, {useState,useEffect,useRef} from 'react';
import {useRallyFit} from './useRallyFit';
import {createRoot} from 'react-dom/client';
import {CoachReplay} from './CoachReplay';
import {replayLessons,selectionLessons} from './coach-replay-data';
import {CardFace,PlayerBadge,RemainingCards,TrickCards,LastTrickCards} from './vendor/src/table/CardPrimitives';
import {HandCards} from './vendor/src/table/HandCards';
import {useCardThrows} from './vendor/src/table/useCardThrows';
import {playbackDelay} from './vendor/src/table/playback';
import {RallyJacksLayout} from './RallyJacksLayout';
import {TwoAnnouncements} from './vendor/src/games/trix/TwoAnnouncements';
import {ScoreTotals} from './vendor/src/table/ScoreTotals';
import {cardLabel} from './vendor/src/api/display';
import {Crown,ArrowLeft,Check,Pause,RotateCcw,WifiOff,Copy} from 'lucide-react';

// Authored visual scenarios only. No game engine, network commands or real scores.
const initialHand=['C2','C5','C8','D3','D7','DK','H3','H7','HQ','HK','S4','S9','SA'];
const initialPlays=[{seat:1,card:'D4'},{seat:2,card:'D9'},{seat:3,card:'DQ'}];
const jackHand=['C2','C5','CQ','D3','D7','DK','H3','H7','HQ','HK','S4','S9','SA'];
const params=new URLSearchParams(location.search);
let config={game:params.get('game')||'spades',phase:params.get('phase')||'play',theme:params.get('theme')||'light',concept:params.get('concept')||'studio',variant:params.get('variant')||'partners',complex:params.get('complex')==='true',speed:1};
const tell=(action:string,extra={})=>parent.postMessage({type:'cardford-board-event',action,...extra},location.origin==='null'?'*':location.origin);
function Board(){
 const [options,setOptions]=useState(config),[phase,setPhase]=useState(config.phase),[hand,setHand]=useState(initialHand),[plays,setPlays]=useState(initialPlays),[selected,setSelected]=useState<string[]>([]),[turn,setTurn]=useState(0),[round,setRound]=useState(0),[bid,setBid]=useState(3),[note,setNote]=useState(''),[last,setLast]=useState<any>(undefined),[doubleCards,setDoubleCards]=useState<string[]>([]),[board,setBoard]=useState([{suit:'C',low:9,high:11},{suit:'D',low:8,high:12},{suit:'H',low:9,high:11},{suit:'S',low:10,high:12}]);
 const [orientationBlocked,setOrientationBlocked]=useState(false);
 const [replay,setReplay]=useState<{game:keyof typeof replayLessons;topic:string;kind:'play'|'selection';variant:'solo'|'partners';index:number}|null>(null);
 const replayActive=replay!==null,wasReplaying=useRef(false);
 const lessonFor=(value:NonNullable<typeof replay>)=>value.kind==='selection'?(selectionLessons[value.game]||replayLessons[value.game]):replayLessons[value.game];
 const replayFrame=replay?lessonFor(replay)[replay.index]:null;
 const pendingTurn=useRef<{remaining:number;started:number;note:string}|null>(null),forcedPass=useRef<{remaining:number;started:number;complete:boolean}|null>(null),beforeInterruption=useRef('play'),request=useRef('All combined'),kingdomOwner=useRef(config.phase==='request'?0:2),collection=useRef<{plays:any[];remaining:number;started:number}|null>(null);
 const phaseBlocked=['paused','reconnect','readonly','results','loading','unavailable','storage'].includes(phase);
 const blocked=phaseBlocked||orientationBlocked||replayActive;
 const effectivePhase=phaseBlocked?beforeInterruption.current:phase;
 const selectionOnly=effectivePhase==='pass'||effectivePhase==='double';
 const active=effectivePhase==='play'||effectivePhase==='jacks';
 const fitRoot=useRallyFit(tell,replay?.game||options.game,replayActive?'replay':effectivePhase);
 const root=useCardThrows({deal:`example-${options.game}-${round}`,turn:turn as any,active:active&&!blocked,speed:options.speed});
 const rallyPocket=options.concept==='studio'&&effectivePhase==='play';
 function reset(p:string){setReplay(null);pendingTurn.current=null;forcedPass.current=null;collection.current=null;request.current='All combined';kingdomOwner.current=p==='request'?0:2;setPhase(p);setHand(p==='jacks'?jackHand:initialHand);setPlays(p==='play'?initialPlays:[]);setSelected([]);setDoubleCards([]);setTurn(0);setNote('');setLast(undefined);setRound(n=>n+1);setBoard([{suit:'C',low:9,high:11},{suit:'D',low:8,high:12},{suit:'H',low:9,high:11},{suit:'S',low:10,high:12}]);}
 useEffect(()=>{reset(config.phase);const receive=(event:MessageEvent)=>{if(event.source!==parent||event.origin!==location.origin)return;if(event.data?.type==='cardford-orientation'&&typeof event.data.blocked==='boolean'){setOrientationBlocked(event.data.blocked);return;}if(config.concept==='studio'&&event.data?.type==='cardford-coach-replay'){
 const data=event.data;
 if(data.action==='close'){setReplay(null);return;}
 if(data.action==='open'){const game=(['spades','hearts','trix'].includes(data.game)?data.game:config.game) as keyof typeof replayLessons;const safeGame=replayLessons[game]?game:'spades';const topic=['cue','selection','review','rating'].includes(data.topic)?data.topic:'cue';const currentPhase=['paused','reconnect','readonly'].includes(config.phase)?beforeInterruption.current:config.phase;const kind=topic==='selection'||(topic==='cue'&&['pass','double'].includes(currentPhase))?'selection':'play';const variant=safeGame==='hearts'?'solo':(['solo','partners'].includes(data.variant)?data.variant:config.variant==='solo'?'solo':'partners');setReplay({game:safeGame,topic,kind,variant,index:0});return;}
 if(data.action==='seek'&&Number.isInteger(data.index))setReplay(before=>before?{...before,index:Math.max(0,Math.min(lessonFor(before).length-1,data.index))}:before);
 return;
 }
 if(config.concept==='studio'&&event.data?.type==='cardford-coach-preview'){
 const stage=event.data.stage;if(stage!=='cue'&&stage!=='selection')return;
 const game=stage==='selection'?'hearts':'spades',nextPhase=stage==='selection'?'pass':'play',cards=stage==='selection'?['HQ','HK','SA']:[];
 config={...config,game,phase:nextPhase,variant:game==='hearts'?'solo':'partners',complex:false};setOptions(config);reset(nextPhase);setSelected(cards);
 tell('coach-preview',{game,phase:nextPhase,cards});tell('selected',{cards,phase:nextPhase});return;
 }
 if(event.data?.type!=='cardford-design')return;const incoming=event.data;const next={...config};for(const key of ['game','phase','theme','concept','variant'] as const)if(typeof incoming[key]==='string')next[key]=incoming[key];if([1,1.2,1.4].includes(incoming.speed))next.speed=incoming.speed;if(typeof incoming.complex==='boolean')next.complex=incoming.complex;const gameChanged=next.game!==config.game||next.variant!==config.variant||incoming.reset;const phaseChanged=next.phase!==config.phase;const interrupts=['paused','reconnect','readonly'];const prior=config.phase;config=next;setOptions(next);if(gameChanged)reset(next.phase);else if(phaseChanged){if(interrupts.includes(next.phase)){if(!interrupts.includes(prior))beforeInterruption.current=prior;setPhase(next.phase);}else if(interrupts.includes(prior)&&(next.phase==='play'||next.phase===beforeInterruption.current)){setPhase(beforeInterruption.current);if(!collection.current&&!pendingTurn.current&&!(beforeInterruption.current==='jacks'&&forcedPass.current))setTurn(0);}else reset(next.phase);}};window.addEventListener('message',receive);tell('ready');return()=>{window.removeEventListener('message',receive);};},[]);
 useEffect(()=>{config.phase=phase;},[phase]);
 useEffect(()=>{document.documentElement.dataset.theme=options.theme;document.documentElement.dataset.concept=options.concept;document.documentElement.dataset.game=replay?.game||options.game;document.documentElement.dataset.phase=replayActive?'replay':effectivePhase;},[options.theme,options.concept,options.game,effectivePhase,replay?.game,replayActive]);
 useEffect(()=>{const pending=collection.current;if(!pending||phase!=='play'||orientationBlocked||replayActive)return;pending.started=performance.now();const timer=setTimeout(()=>{if(collection.current!==pending)return;collection.current=null;setLast({plays:pending.plays,winner:pending.plays[3]?.card==='DK'?0:3});setPlays([]);setTurn(0);setNote('Trick complete');tell('trick-complete');},pending.remaining);return()=>{clearTimeout(timer);pending.remaining=Math.max(0,pending.remaining-(performance.now()-pending.started));};},[phase,plays,round,orientationBlocked,replayActive]);
 useEffect(()=>{
  if(replay&&replayFrame){const frames=lessonFor(replay).map(({round,trick,title,caption,moment},index)=>({index,round,trick,title,caption,moment}));tell('replay-frame',{...replay,total:frames.length,frames,title:replayFrame.title,caption:replayFrame.caption,round:replayFrame.round,trick:replayFrame.trick,moment:replayFrame.moment});}
  if(wasReplaying.current&&!replay)tell('replay-closed');wasReplaying.current=Boolean(replay);
 },[replay]);
 useEffect(()=>{
  const pending=pendingTurn.current;if(!pending||blocked||!active)return;
  pending.started=performance.now();const timer=setTimeout(()=>{if(pendingTurn.current!==pending)return;pendingTurn.current=null;setTurn(0);setNote(pending.note);},pending.remaining);
  return()=>{clearTimeout(timer);pending.remaining=Math.max(0,pending.remaining-(performance.now()-pending.started));};
 },[phase,plays,board,round,orientationBlocked,replayActive,turn]);
 function legal(card:string){if(effectivePhase==='double')return (request.current==='Queens'?['HQ']:request.current==='The King'?['HK']:['HQ','HK']).includes(card);if(effectivePhase==='jacks'){const rank=({J:11,Q:12,K:13,A:14} as Record<string,number>)[card.slice(1)]||Number(card.slice(1));const row=board.find(r=>r.suit===card[0]);return !!row&&(rank===row.low-1||rank===row.high+1);}if(effectivePhase==='play'&&plays.length)return card[0]===plays[0].card[0]||!hand.some(c=>c[0]===plays[0].card[0]);return true;}
 const noJacksMove=effectivePhase==='jacks'&&!hand.some(legal);
 useEffect(()=>{
  if(phase!=='jacks'||!noJacksMove||blocked)return;
  if(!forcedPass.current){pendingTurn.current=null;forcedPass.current={remaining:playbackDelay('turn',options.speed),started:0,complete:false};setTurn(3);setNote('Forced pass');}
  const pending=forcedPass.current;if(pending.complete)return;pending.started=performance.now();
  const timer=setTimeout(()=>{pending.complete=true;setTurn(3);setNote('Pass confirmed');tell('forced-pass');},pending.remaining);
  return()=>{clearTimeout(timer);pending.remaining=Math.max(0,pending.remaining-(performance.now()-pending.started));};
 },[phase,noJacksMove,orientationBlocked,replayActive,round]);
 function select(card:string,keep=false){if(blocked)return;setSelected(before=>{const next=before.includes(card)?(keep?before:before.filter(c=>c!==card)):(phase==='pass'&&before.length===3?before:[...before,card]);tell('selected',{cards:next,phase});return next;});}
 function play(card:string){if(blocked||!active||turn!==0||!legal(card))return;setHand(before=>before.filter(c=>c!==card));setSelected([]);setDoubleCards(before=>before.filter(c=>c!==card));setNote(`${cardLabel(card)} played · example confirmed`);tell('played',{card,game:options.game,phase});
  if(phase==='jacks'){const rank=({J:11,Q:12,K:13,A:14} as Record<string,number>)[card.slice(1)]||Number(card.slice(1));setBoard(before=>before.map(row=>row.suit===card[0]?{...row,high:Math.max(row.high,rank),low:Math.min(row.low,rank)}:row));setTurn(3);pendingTurn.current={remaining:playbackDelay('turn',options.speed),started:0,note:'Your turn · scripted layout example'};return;}
  const next=[...plays,{seat:0,card}];setPlays(next);setTurn(3);
  if(next.length===4){collection.current={plays:next,remaining:playbackDelay('trick',options.speed),started:0};}
  else {pendingTurn.current={remaining:playbackDelay('turn',options.speed),started:0,note:'Card played · choose another scenario to reset the example'};}
 }
 function confirm(action:string){if(blocked)return;if(phase==='pass'&&selected.length!==3)return;if(phase==='double'&&action==='double'&&!selected.length)return;const nextPhase=phase==='request'?(action==='Trix Jacks'?'jacks':['Diamonds','Lutoosh'].includes(action)?'play':'double'):'play';tell('confirmed',{phase,nextPhase,choice:action,cards:selected,bid});if(phase==='double'){setDoubleCards(action==='double'?selected:[]);setSelected([]);setPhase('play');setPlays(initialPlays);}else if(phase==='request'){reset(nextPhase);request.current=action;kingdomOwner.current=0;}else if(phase==='pass'){setHand(before=>before.filter(c=>!selected.includes(c)).concat(['C10','D10','S10']));setSelected([]);setPhase('play');setPlays(initialPlays);}else{setPhase('play');setPlays(initialPlays);}setNote('Confirmed');}
 function resume(){if(phase==='results'){reset('play');tell('resume',{phase:'play'});}else{setPhase(beforeInterruption.current);if(!collection.current&&!pendingTurn.current&&!(beforeInterruption.current==='jacks'&&forcedPass.current))setTurn(0);tell('resume',{phase:beforeInterruption.current});}}
 const scores=options.variant==='partners'&&options.game!=='hearts'?[{id:'you',seats:[0,2],total:options.game==='trix'?-40:142},{id:'them',seats:[1,3],total:options.game==='trix'?-85:118}]:[0,1,2,3].map((s)=>({id:`${s}`,seats:[s],total:options.game==='hearts'?[12,28,18,36][s]:options.game==='trix'?[-175,-200,-150,-225][s]:[68,42,56,34][s]}));
 return <div ref={fitRoot} className="app-shell demo-board"><main ref={root as any} className="game-shell" hidden={replayActive} aria-hidden={replayActive} inert={replayActive} aria-label="Interactive example card table"><div className={`table-zone ${rallyPocket?'rally-pocket-table':''}`} aria-label="Four player card table"><div className="table-felt"><div className="table-line"/><img className="felt-symbol" src="assets/cardford-symbol.svg" alt=""/></div><ScoreTotals scores={scores as any} direction={options.game==='hearts'?'lower':'higher'}/>
 {[0,1,2,3].map(seat=><PlayerBadge key={seat} seat={seat as any} active={seat===turn&&!blocked} partner={seat===2&&options.variant==='partners'&&options.game!=='hearts'} announcement={options.game==='trix'&&seat===kingdomOwner.current?<Crown size={14} className="kingdom-crown" aria-label={`${kingdomOwner.current===0?'You':'Maya'}: kingdom owner`}/>:undefined} cards={seat===0?doubleCards:[]} cardAnnouncements={effectivePhase==='jacks'&&options.variant==='partners'?<TwoAnnouncements seat={seat as any} observation={{variantId:'basic-partners',request:'trix',board,twoAnnouncements:{status:'revealed',cards:[{seat:0,card:'C2'},{seat:1,card:'H2'},{seat:2,card:'D2'},{seat:3,card:'S2'}]}} as any}/>:undefined}><span className="player-detail">{options.game==='spades'?'0 / 4':'0'}<RemainingCards count={seat===0?hand.length:effectivePhase==='jacks'?[0,8,9,8][seat]:13-(last?1:0)-(plays.some(p=>p.seat===seat)?1:0)}/></span></PlayerBadge>)}
 {effectivePhase==='play'&&<div className="trick-area"><TrickCards plays={plays as any} winner={plays.length===4?(plays[3]?.card==='DK'?0:3):3} layers={new Map([[1,1],[2,2],[3,plays[3]?.card==='DK'?3:4],[0,plays[3]?.card==='DK'?4:3]]) as any}/></div>}
 {effectivePhase==='jacks'&&<RallyJacksLayout board={board as any}/>}
 {phase==='jacks'&&noJacksMove&&<section className="phase-prompt"><h2>Forced pass</h2><button className="phase-primary" onClick={()=>reset('jacks')}><RotateCcw size={18}/>Replay example</button></section>}
 {phase==='bid'&&<section className="phase-prompt"><h2>Bid</h2><div className="bid-controls"><button aria-label="Decrease bid" title="Decrease bid" disabled={bid===0} onClick={()=>setBid(n=>n-1)}>−</button><output aria-live="polite">{bid===0?'Nil':bid}</output><button aria-label="Increase bid" title="Increase bid" disabled={bid===13} onClick={()=>setBid(n=>n+1)}>+</button></div><div className="prompt-actions"><button className="phase-link" onClick={()=>setBid(0)}>Nil</button><button className="phase-primary" onClick={()=>confirm('bid')}><Check size={18}/>Bid {bid===0?'Nil':bid}</button></div></section>}
 {phase==='pass'&&<section className="phase-prompt"><h2>Pass left</h2><div className="selection-dots" aria-label={`${selected.length} of 3 cards selected`} aria-live="polite">{[0,1,2].map(i=><i key={i} className={i<selected.length?'filled':''}/>)}</div><button className="phase-primary" disabled={selected.length!==3} onClick={()=>confirm('pass')} aria-label="Pass three cards"><ArrowLeft size={20}/>Pass {selected.length}/3</button></section>}
 {phase==='request'&&<section className="phase-prompt request-prompt"><h2>Choose request</h2><div className="request-buttons">{(options.complex?['All combined','Trix Jacks']:['Diamonds','Lutoosh','Queens','The King','Trix Jacks']).map(label=><button key={label} onClick={()=>confirm(label)}><span aria-hidden="true">{({'All combined':'Σ','Trix Jacks':'J','Diamonds':'♦','Lutoosh':'♠','Queens':'Q','The King':'K♥'})[label]}</span>{label}</button>)}</div></section>}
 {phase==='double'&&<section className="double-prompt"><strong>×2?</strong><div className="double-preview">{selected.map(card=><CardFace key={card} card={card}/>)}</div><button className="phase-primary" disabled={!selected.length} onClick={()=>confirm('double')} aria-label="Confirm double"><Check size={18}/>Double</button><button className="phase-link" onClick={()=>confirm('decline')}>Pass</button></section>}
 </div><section className="hand-section" aria-label="Your hand"><div className="board-status" aria-live="polite">{note||(phase==='play'?'Your turn · follow diamonds':phase==='jacks'?'Your turn · play next to a Jack':selectionOnly?'Select in your hand, then confirm':phase==='request'?'Your hand · choose a request above':'Your hand')}</div><HandCards cards={hand} selected={selected} decisionId={`${round}-${phase}-${plays.length}-${turn}`} queueKey={`${round}-${options.game}`} playMode={active} selectionOnly={selectionOnly} disabled={!active&&!selectionOnly} blocked={blocked} myTurn={turn===0} canPlay={turn===0&&active} isLegal={legal} onSelect={select} onPlay={play}/><p id="card-controls" className="board-controls">Double-click or double-tap to play. Hold to lift and drag. Enter / Space to play; Escape cancels a queue.</p></section>
 {phaseBlocked&&<div className="board-overlay" role="dialog" aria-modal="true" aria-label="Example state"><div className="state-panel">{phase==='paused'?<Pause size={30}/>:phase==='readonly'?<Copy size={30}/>:<WifiOff size={30}/>}<h2>{({paused:'Paused',reconnect:'Reconnecting…',readonly:'Playing in another tab',results:'Game over',loading:'Loading…',unavailable:'Unavailable',storage:'Couldn’t save'})[phase]}</h2><button className="phase-primary" onClick={resume}>{phase==='paused'?'Resume':phase==='readonly'?'Play here':phase==='results'?'Play again':'Retry'}</button></div></div>}
 {rallyPocket&&<div className="board-last rally-last" aria-hidden={!last}><LastTrickCards last={last}/></div>}
 </main>{replay&&replayFrame&&<CoachReplay frame={replayFrame} game={replay.game} variant={replay.variant}/>}</div>;
}
createRoot(document.getElementById('root')!).render(<Board/>);
