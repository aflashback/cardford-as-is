import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  ChevronRight,
  Eye,
  Flag,
  Focus,
  Lightbulb,
  LockKeyhole,
  Trophy,
  UserRound,
  Play,
  RotateCcw,
  Settings2,
  Sparkles,
  X,
} from 'lucide-react';
import type {
  AdviceView,
  Card,
  DevScenarioView,
  GameView,
  GameAction,
  ReviewFrame,
  Mode,
  NewSessionRequest,
  Seat,
} from '../shared/contracts';
import { cardLabel, cardSuit, playerNames as names } from './api/display';
import { useSession } from './api/useSession';
import { api } from './api/client';
import { AccountPage } from './features/AccountPage';
import { ReviewPanel } from './features/ReviewPanel';
import { DemoPage } from './features/DemoPage';
import { backend, webPlatform } from './platform/web';
import { ProgressiveAdviceRequests } from './api/progressiveAdvice';
import { trickLayers } from './api/tablePresentation';
import { TrixTable } from './games/trix/Table.tsx';
import { variantLabel } from './games/trix/adapter.ts';
import { RemainingCards, PlayerBadge, LastTrickCards, TrickCards } from './table/CardPrimitives';
import { HandCards } from './table/HandCards';
import { ScoreTotals } from './table/ScoreTotals';
import { useCardThrows } from './table/useCardThrows';
import { Dialog } from './table/Dialog';
import { PauseDialog } from './table/PauseDialog';
import { useGamePause } from './table/useGamePause';
import { isTableRoute,pauseBeforeTableExit } from './table/pauseLifecycle';
import { useViewport } from './table/useViewport';
import { RotationGate } from './table/RotationGate';
import { playbackDelay, completedTrickDelay } from './table/playback';
import { usePresentedRevision } from './table/usePresentedRevision';
import { RallyHeader } from './rally/RallyHeader';
import { ThemePicker } from './rally/appearance';
import { CoachWindow, type CoachWindowDisplay } from './rally/CoachWindow';
import { useResponsiveTableFit } from './table/useResponsiveTableFit';
import {CoachExperience, type CoachConfirmedAction} from './rally/CoachExperience';
import {RallyReplayTable} from './rally/RallyReplayTable';
import {coachSessionLabel} from './rally/coachCommands';
import type {CoachUIAccess} from '../shared/local-service.contracts';
import { AuthGate } from './auth/AuthGate';

const modeNames: Record<Mode, string> = {
  hearts: 'Hearts',
  'spades-solo': 'Spades',
  'spades-partners': 'Spades',
};
type Modal = 'games' | 'settings' | 'pause' | 'review' | 'scores' | 'menu' | null;

type HintLevel = 0 | 1 | 2 | 3;


function Player({ seat, game, active }: { seat: Seat; game: GameView; active: boolean }) {
  return <PlayerBadge seat={seat} active={active} partner={game.mode === 'spades-partners' && seat === 2}>
    <PlayerCount seat={seat} game={game} />
  </PlayerBadge>;
}

function PlayerCount({ seat, game }: { seat: Seat; game: GameView }) {
  const bid = game.bids[seat];
  const bidLabel = bid === null ? '—' : bid === 0 ? 'Nil' : bid;
  return (
    <span className="player-detail">
      <span aria-hidden="true">
        {game.tricks[seat]}
        {game.mode !== 'hearts' && ` / ${bidLabel}`}
      </span>
      <span className="sr-only">
        {`${game.tricks[seat]} tricks${game.mode === 'hearts' ? '' : bid === null ? ', not bid yet' : `, bid ${bidLabel}`}`}
      </span>
      {seat !== 0 && <RemainingCards count={game.handCounts[seat]} />}
    </span>
  );
}

export default function App() {
  const [route, setRoute] = useState(window.location.hash);
  const currentRoute=useRef(route),navigation=useRef(0);
  currentRoute.current=route;
  useEffect(() => {
    const update = async () => {
      const target=window.location.hash,ticket=++navigation.current;
      if(isTableRoute(currentRoute.current)&&!isTableRoute(target)) {
        const stopped=await pauseBeforeTableExit();
        if(ticket!==navigation.current)return;
        if(!stopped) {
          history.replaceState(null,'',currentRoute.current||'#');
          return;
        }
      }
      if(ticket===navigation.current)setRoute(target);
    };
    window.addEventListener('hashchange', update);
    return () => window.removeEventListener('hashchange', update);
  }, []);
  if (route === '#demo') return <DemoPage />;
  return <AuthGate>{route === '#account' ? <AccountPage onRefresh={() => Promise.resolve()} /> : <LiveTable />}</AuthGate>;
}

function LiveTable() {
  const controller = useSession();
  if('lifecycle' in controller&&controller.lifecycle?.phase==='expired')return <main className="account-page">
    <h1>This game expired</h1><p>The saved pause window ended. Choose a new game when ready.</p>
    <details><summary>Choose game</summary>{controller.catalog.map(entry=><button key={entry.mode} className="primary-button"
      disabled={controller.busy||!entry.start.allowed} onClick={()=>{void controller.startRegistered(entry.mode);}}>{entry.mode.startsWith('trix-')?`Trix ${variantLabel(entry.mode.slice(5))}`:modeNames[entry.mode as keyof typeof modeNames]??entry.mode}</button>)}</details>
    {controller.error&&<p role="alert">{controller.error}</p>}<a href="#account">Account &amp; settings</a>
  </main>;
  if ('trixSession' in controller && controller.trixSession)
    return <TrixTable session={controller.trixSession} controller={controller} />;
  if (!controller.session)
    return (
      <main className="account-page">
        <div className="loading-logo" role="img" aria-label="CardFord">
          <img src="/brand/cardford-symbol.svg" alt="" />
          <span>CardFord</span>
        </div>
        <p role="status">{controller.error || 'Opening your table…'}</p>
        <button className="primary-button" onClick={() => void controller.retry()}>
          Reconnect
        </button>
        <a href="#demo">Try the example game</a>
        <a href="#account">Account</a>
      </main>
    );
  return <Table controller={controller} />;
}

function Table({ controller }: { controller: ReturnType<typeof useSession> }) {
  const session = controller.session!;
  const game = session.game;
  usePresentedRevision(session, 'notePresented' in controller ? controller.notePresented : undefined);
  const { coachMode, gameSpeed } = session.preferences;
  const stats = session.stats;
  const [selected, setSelected] = useState<Card[]>([]);
  const [bid, setBid] = useState(3);
  const [hint, setHint] = useState<HintLevel>(0);
  const [advice, setAdvice] = useState<AdviceView | null>(null);
  const [advicePending, setAdvicePending] = useState(false);
  const adviceRequests = useRef(new ProgressiveAdviceRequests());
  const [unlockLevel, setUnlockLevel] = useState<1 | 2 | 3 | null>(null);
  const lastNudge = useRef({ hand: '', trick: 0 });
  const [modal, setModal] = useState<Modal>('pause');
  const viewport = useViewport();
  const pauseState=useGamePause({canStop:session.controlLeaseToken!=='view-only',blocked:viewport.portraitPhone||!session.access.canPlay,
    stop:async(reason)=>'setPlayback' in controller?controller.setPlayback(false,'pause',reason):true});
  const pauseRequired=pauseState.paused;
  const [pauseBusy, setPauseBusy] = useState(false);
  const [pauseNotice, setPauseNotice] = useState('');
  const [wizardStep, setWizardStep] = useState<'pace' | 'game'>('pace');
  const [wizardSpeed, setWizardSpeed] = useState<typeof gameSpeed>(gameSpeed);
  const [scenarios, setScenarios] = useState<DevScenarioView[]>([]);
  const [wizardScenario, setWizardScenario] = useState('');
  const canReplayScenario = !!session.scenario && scenarios.length > 0;
  const [toast, setToast] = useState('');
  const [showRecap, setShowRecap] = useState(true);
  const [pageVisible, setPageVisible] = useState(!document.hidden);
  const resumingPlayback = useRef(false);
  const claimingControl = useRef(false);
  useEffect(() => {
    if ('catalog' in controller) return; // Authored scenario selection belongs to the Node reference only.
    let active = true;
    void api('/api/dev/scenarios', 'DevScenariosView')
      .then((view) => {
        if (active) setScenarios(view.scenarios);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);
  const lastPlayedTurn = useRef('');
  const shellRef = useRef<HTMLDivElement>(null);
  const tableScreenRef = useRef<HTMLDivElement>(null);
  const handRef = useRef<HTMLElement>(null);
  const [coachDisplay, setCoachDisplay] = useState<CoachWindowDisplay>({open:false,pinned:false,width:0});
  const [coachReview, setCoachReview] = useState(false);
  const [coachAccess,setCoachAccess]=useState<CoachUIAccess|null>(null);
  const [replayFrame,setReplayFrame]=useState<ReviewFrame|null>(null);
  const [confirmedAction,setConfirmedAction]=useState<CoachConfirmedAction|null>(null);
  const onReplayChange=useCallback((frame:ReviewFrame|null)=>{setReplayFrame(frame);setCoachReview(!!frame);},[]);
  const handEnd = game.phase === 'hand-end' || game.phase === 'match-end';
  const dialogOpen = !!modal || pauseRequired || (handEnd && showRecap);
  const paused =
    dialogOpen || coachReview ||
    viewport.portraitPhone ||
    !pageVisible ||
    !session.access.canPlay ||
    session.controlLeaseToken === 'view-only' ||
    !!controller.error ||
    ('playbackInterrupted' in controller && controller.playbackInterrupted);
  const serverPlayback = 'playbackRunning' in controller ? controller.playbackRunning : null;
  const turnKey = session.decisionId;
  const fitArea = useResponsiveTableFit({ game: game.mode === 'hearts' ? 'hearts' : 'spades', phase: game.phase === 'play' || game.phase === 'trick-end' ? 'play' : game.phase === 'bid' || game.phase === 'pass' ? game.phase : 'results', lastTrickVisible: game.phase === 'play' || game.phase === 'trick-end' });
  const playArea = useCardThrows({ deal: `${game.id}:${game.handNumber}`, turn: game.turn,
    active: !paused, speed: gameSpeed });
  const setPlayArea = useCallback((node: HTMLElement | null) => { fitArea(node); playArea.current = node; }, [fitArea, playArea]);
  const decisionRef = useRef(turnKey);
  decisionRef.current = turnKey;
  const myTurn = game.turn === 0 && (game.phase === 'play' || game.phase === 'bid');
  const canDecide = myTurn || game.phase === 'pass';
  const legal =
    game.phase === 'play'
      ? game.legalActions.flatMap((action) => (action.kind === 'play' ? [action.card] : []))
      : game.hand;
  const isHearts = game.mode === 'hearts';
  const isTeam = game.mode === 'spades-partners';
  const activeHint = canDecide && advice?.decisionId === turnKey ? hint : 0;
  const currentWinner = game.currentWinner;
  const beforeReplay=async()=>{
    setCoachReview(true);
    if ('setPlayback' in controller && !await controller.setPlayback(false,'hold')) {setCoachReview(false);return false;}
    return true;
  };
  const layers = trickLayers(game);
  const matchWinner = game.handResult?.winner;
  const winnerLabel =
    matchWinner === undefined
      ? 'Game complete'
      : isTeam
        ? matchWinner % 2 === 0
          ? 'You & Maya win'
          : 'Leo & Joe win'
        : `${names[matchWinner]} ${matchWinner === 0 ? 'win' : 'wins'}`;
  const closeModal = () => setModal(pauseRequired?'pause':null);
  const resumeGame = async () => {
    if (resumingPlayback.current || claimingControl.current) return;
    if ('setPlayback' in controller && session.controlLeaseToken === 'view-only') {
      setPauseNotice('Take control of this table before resuming.');
      return;
    }
    resumingPlayback.current = true;
    setPauseBusy(true);
    const ticket=pauseState.beginResume();
    try {
      if (controller.error) {
        if (!await controller.retry()) throw new Error('Could not reconnect.');
      } else await controller.refresh();
      if(!pauseState.canResume(ticket))return;
      if ('setPlayback' in controller && !await controller.setPlayback(true))
        throw new Error('Could not resume playback.');
      if(!pauseState.finishResume(ticket)) {
        if('setPlayback' in controller)await controller.setPlayback(false);
        return;
      }
      setPauseNotice('');
      setModal(null);
    } catch (e) {
      pauseState.setPaused(true);
      setPauseNotice(e instanceof Error ? e.message : 'Could not reconnect. Your table is paused.');
    } finally { window.setTimeout(() => { resumingPlayback.current = false; setPauseBusy(false); }, 0); }
  };
  const takeControl = async () => {
    if (claimingControl.current || resumingPlayback.current) return;
    claimingControl.current = true;
    setPauseBusy(true);
    setPauseNotice('');
    try {
      await controller.refresh();
      if (!await controller.mutate('/api/session/control'))
        throw new Error('Could not take control. Reconnect and try again.');
      // A control.changed message can remount the table. The next pause dialog
      // offers Resume after the new lease is confirmed.
    } catch (e) {
      setPauseNotice(e instanceof Error ? e.message : 'Could not take control.');
    } finally { claimingControl.current = false; setPauseBusy(false); }
  };
  const setCoachMode = (value: typeof coachMode) =>
    void controller.preferences({ coachMode: value, gameSpeed });
  const openWizard = () => {
    setWizardSpeed(gameSpeed);
    setWizardScenario('');
    setWizardStep('pace');
    setModal('games');
  };
  useEffect(() => {
    if (shellRef.current) {
      if (dialogOpen || viewport.portraitPhone) shellRef.current.setAttribute('inert', '');
      else shellRef.current.removeAttribute('inert');
    }
  }, [dialogOpen, viewport.portraitPhone]);
  useEffect(() => {
    if(viewport.portraitPhone)void pauseState.pause('layout_unavailable');
    if (viewport.portraitPhone && modal && modal!=='pause') setModal(null);
  },[viewport.portraitPhone]);
  useEffect(() => {
    if (modal !== 'games') return;
    document.querySelector<HTMLElement>('.wizard-content h1')?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        void closeModal();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [modal, wizardStep]);
  useEffect(() => {
    document.title = `${modeNames[game.mode]} — CardFord`;
  }, [game.mode]);
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) setPageVisible(false);
    };
    const disconnect = webPlatform.onForeground(() => {
      void controller.refresh().then(() => setPageVisible(true))
        .catch(() => { setPageVisible(false); setToast('Reconnect to resume.'); });
    });
    document.addEventListener('visibilitychange', onVisibility);
    return () => { disconnect(); document.removeEventListener('visibilitychange', onVisibility); };
  }, [controller.refresh]);
  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(''), 4200);
    return () => clearTimeout(timeout);
  }, [toast]);
  useEffect(() => {
    setSelected((cards) =>
      game.phase === 'play' || game.phase === 'trick-end'
        ? cards.filter((card) => game.hand.includes(card) && (!myTurn || legal.includes(card)))
        : [],
    );
    setHint(0);
    setAdvice(null);
    setAdvicePending(false);
    setUnlockLevel(null);
  }, [turnKey]);
  useEffect(() => {
    if ('playbackInterrupted' in controller && controller.playbackInterrupted) {
      pauseState.setPaused(true,controller.interruptionReason);setModal('pause');
    }
  }, ['playbackInterrupted' in controller ? controller.playbackInterrupted : false]);
  useEffect(() => {
    if (!('setPlayback' in controller)||session.controlLeaseToken==='view-only'||resumingPlayback.current)return;
    const phase=controller.lifecycle?.phase;
    const interrupted=pauseRequired||viewport.portraitPhone||!pageVisible||!session.access.canPlay||!!controller.error||controller.playbackInterrupted;
    if(interrupted){if(serverPlayback||phase==='held')void controller.setPlayback(false,'pause',pauseState.reason);return;}
    if(paused){if(phase!=='held')void controller.setPlayback(false,'hold');}
    else if(phase==='held')void controller.setPlayback(true,'release_hold');
  }, [paused, serverPlayback, session.access.canPlay, session.controlLeaseToken]);
  useEffect(() => {
    if ('catalog' in controller) return; // Native Go owns bot and automatic progression.
    if (paused || handEnd || game.phase === 'pass' || myTurn || controller.busy || controller.error) return;
    let cancelled = false;
    const preparation = new AbortController();
    let timer: number | undefined;
    void controller
      .refresh()
      .then((fresh) => {
        if (cancelled || fresh.decisionId !== turnKey) return;
        timer = window.setTimeout(
          () => {
            if (game.phase === 'trick-end') {
              void controller.advanceAutomatic();
              return;
            }
            void controller.prepareBot(preparation.signal)
              .then((prepared) => {
                if (!cancelled && decisionRef.current === turnKey)
                  return controller.mutate('/api/session/advance', {
                    kind: 'bot',
                    preparedDecisionId: prepared.preparedDecisionId,
                  });
              })
              .catch((e) => {
                if (!cancelled) {
                  setModal('pause');
                  setToast(e instanceof Error ? e.message : 'Could not prepare the next turn.');
                }
              });
          },
          game.phase === 'trick-end' ? completedTrickDelay(gameSpeed) : playbackDelay('turn', gameSpeed),
        );
      })
      .catch(() => {
        if (!cancelled) setToast('Reconnect to resume play.');
      });
    return () => {
      cancelled = true;
      preparation.abort();
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [turnKey, paused, gameSpeed, controller.busy, controller.error]);
  useEffect(() => {
    if (
      backend === 'go' ||
      coachMode !== 'nudges' ||
      paused ||
      !canDecide ||
      game.phase !== 'play' ||
      legal.length <= 1 ||
      !session.access.handUnlocked ||
      !session.access.canCoach ||
      hint > 0 ||
      advicePending
    )
      return;
    const handKey = `${game.id}:${game.handNumber}`;
    const previousTrick = lastNudge.current.hand === handKey ? lastNudge.current.trick : 0;
    if (game.history.length - previousTrick < 3) return;
    const timer = window.setTimeout(() => {
      lastNudge.current = { hand: handKey, trick: game.history.length };
      void showHint(1);
    }, 700);
    return () => clearTimeout(timer);
  }, [turnKey, coachMode, paused, session.access.handUnlocked, session.access.canCoach, hint, advicePending]);
  async function showHint(level: HintLevel, unlock = false) {
    if (!level) {
      setHint(0);
      return;
    }
    if (adviceRequests.current.pending || controller.busy) return;
    if (!session.access.handUnlocked && session.access.remainingHands !== null && !unlock) {
      setUnlockLevel(level);
      return;
    }
    const decision = turnKey;
    setAdvicePending(true);
    try {
      await adviceRequests.current.request(decision,level,
        () => unlock ? controller.unlock(level) : controller.advice(level),
        async (result) => {
          if (decisionRef.current !== decision) return;
          setAdvice(result);
          setHint(result.requestedLevel);
          setUnlockLevel(null);
          await controller.exposure(level, decision).catch(() => undefined);
        });
    } catch (e) {
      if (decisionRef.current === decision) {
        setHint(0);
        setToast(e instanceof Error ? e.message : 'Suggestions unavailable. You can keep playing.');
      }
    } finally {
      if (decisionRef.current === decision) setAdvicePending(false);
    }
  }
  async function commit() {
    if (paused || controller.busy) return;
    const action:GameAction|null =
      game.phase === 'pass' && selected.length === 3
        ? { kind: 'pass', cards: selected }
        : game.phase === 'bid' && myTurn
          ? { kind: 'bid', bid }
          : null;
    if (!action) return;
    const ok = await submitAction(action);
    if (ok) setSelected([]);
  }
  async function submitAction(action:GameAction) {
    if ('candidateAction' in controller) return controller.action(action,receipt=>setConfirmedAction({...receipt,decisionId:turnKey,action}));
    return controller.action(action);
  }
  async function playChosenCard(card: Card) {
    if (
      paused ||
      controller.busy ||
      game.phase !== 'play' ||
      !myTurn ||
      !legal.includes(card) ||
      lastPlayedTurn.current === turnKey
    )
      return;
    lastPlayedTurn.current = turnKey;
    if (await submitAction({ kind: 'play', card })) {
      setSelected([]);
      } else lastPlayedTurn.current = '';
  }
  function chooseCard(card: Card, keepSelected = false) {
    if (paused || !game.hand.includes(card) || !['pass', 'play', 'trick-end'].includes(game.phase)) return;
    if (myTurn && !legal.includes(card)) return;
    if (game.phase === 'pass')
      setSelected((cards) =>
        cards.includes(card)
          ? keepSelected
            ? cards
            : cards.filter((c) => c !== card)
          : cards.length < 3
            ? [...cards, card]
            : cards,
      );
    else setSelected((cards) => (!keepSelected && cards[0] === card ? [] : [card]));
  }
  async function startGame(
    mode: Mode,
    selection: Pick<NewSessionRequest, 'scenarioId' | 'replayScenario'> = {},
  ) {
    if (await controller.newGame(mode, selection)) {
      setSelected([]);
      setHint(0);
      setShowRecap(true);
      pauseState.setPaused(true);setModal('pause');
    }
  }
  async function startWizardGame(mode: Mode) {
    if (wizardSpeed !== gameSpeed && !(await controller.preferences({ coachMode, gameSpeed: wizardSpeed }))) {
      setToast('Could not save game speed. Try again.');
      return;
    }
    await startGame(mode, wizardScenario ? { scenarioId: wizardScenario } : {});
  }
  async function continueHand() {
    if (await controller.mutate('/api/session/next-hand')) {
      setShowRecap(true);
      setHint(0);
    }
  }
  async function playAgain() {
    if (canReplayScenario) await startGame(game.mode, { replayScenario: true });
    else if (game.phase === 'match-end') await startGame(game.mode);
    else await continueHand();
  }
  const taskText =
    game.phase === 'pass'
      ? `Pass three ${game.passDirection}`
      : game.phase === 'bid'
        ? myTurn
          ? 'What’s your bid?'
          : `${names[game.turn ?? 0]} is bidding`
        : game.phase === 'trick-end'
          ? `${names[currentWinner ?? 0]} ${currentWinner === 0 ? 'take' : 'takes'} the trick`
          : handEnd
            ? game.phase === 'match-end'
              ? 'Game complete'
              : 'Hand complete'
            : myTurn
              ? 'Your turn'
              : `${names[game.turn ?? 0]} is playing`;
  const commitLabel =
    game.phase === 'pass' ? `Pass ${selected.length} of 3` : bid === 0 ? 'Bid Nil' : `Bid ${bid}`;
  const commitEnabled = !controller.busy && (game.phase === 'pass' ? selected.length === 3 : myTurn);
  return (
    <>
      {viewport.portraitPhone && <RotationGate />}
      {pauseState.idleWarning&&!viewport.portraitPhone&&<div className="rally-idle-notice" role="status">Still playing? Pausing in 30 seconds without activity.</div>}
        <div className="app-shell rally-app" data-game={isHearts?'hearts':'spades'} data-phase={game.phase} ref={shellRef} hidden={viewport.portraitPhone} aria-hidden={dialogOpen || viewport.portraitPhone ? true : undefined}>
          <RallyHeader game={modeNames[game.mode]} variant={isTeam?'Partners':'Solo'}
            scores={(isTeam?[0,1]:[0,1,2,3]).map(seat=>({label:isTeam?(seat===0?'You & Maya':'Leo & Joe'):names[seat],total:game.scores[seat]}))}
            onGame={openWizard} onScores={()=>setModal('scores')} onPause={()=>{void pauseState.pause();setModal('pause');}} onMenu={()=>setModal('menu')}
            status={session.scenario ? 'Selected practice deal' : 'streamStatus' in controller && controller.streamStatus!=='live' ? 'Reconnecting…' : undefined} />
          <div className="rally-table-screen" ref={tableScreenRef} data-coach-pinned={coachDisplay.pinned} style={{'--rally-coach-space':coachDisplay.width+'px'} as CSSProperties}>
          <main id="game-table" className="game-shell rally-game-shell" ref={setPlayArea} inert={coachReview} hidden={!!replayFrame}>

            <div className="play-space">
              <div className="table-stage">
                <section className="table-zone" aria-label="Card table">
                  <div className="table-felt">
                    <div className="table-line" />
                    <span className="table-brand">CardFord</span>
                  </div>
                  <ScoreTotals direction={isHearts ? 'lower' : 'higher'} scores={
                    (isTeam ? [[0, 2], [1, 3]] : [[0], [1], [2], [3]]).map(seats => ({
                      id: seats.join('-'), seats: seats as Seat[], total: game.scores[seats[0]],
                    }))
                  } />
                  {([1, 2, 3] as Seat[]).map((seat) => (
                    <Player
                      key={seat}
                      seat={seat}
                      game={game}
                      active={
                        !handEnd && game.phase !== 'pass' && game.turn === seat && game.phase !== 'trick-end'
                      }
                    />
                  ))}
                  <Player seat={0} game={game} active={canDecide} />
                  <div
                    className={`trick-area ${activeHint > 0 && advice?.highlightSuit ? 'evidence-active' : ''}`}
                  >
                    {game.phase === 'pass' ? (
                      <div className="table-prompt passing-prompt">
                        <div className="pass-illustration">
                          <span>♥</span>
                          <ArrowRight size={26} />
                          <span>♠</span>
                        </div>
                        <h2>Pass three cards {game.passDirection}</h2>
                        <button className="primary-button play-button" disabled={!commitEnabled} onClick={commit}>
                          {commitLabel}
                          <ArrowRight size={16} />
                        </button>
                      </div>
                    ) : game.phase === 'bid' ? (
                      <div className="table-prompt bidding-prompt">
                        <span className="prompt-icon">
                          <Flag size={23} />
                        </span>
                        <h2>{myTurn ? 'Your bid' : 'Bidding'}</h2>
                        {myTurn && <>
                          <div className="bid-selector" aria-label="Choose your bid">
                            <button
                              className="bid-step"
                              disabled={bid === 0}
                              onClick={() => setBid((b) => b - 1)}
                              aria-label="Decrease bid"
                            >
                              −
                            </button>
                            <output aria-live="polite">{bid === 0 ? 'Nil' : bid}</output>
                            <button
                              className="bid-step"
                              disabled={bid === 13}
                              onClick={() => setBid((b) => b + 1)}
                              aria-label="Increase bid"
                            >
                              +
                            </button>
                          </div>
                          <div className="phase-prompt-actions">
                            <button className={`nil-button ${bid === 0 ? 'active' : ''}`} onClick={() => setBid(0)}>
                              Nil
                            </button>
                            <button className="primary-button play-button" disabled={!commitEnabled} onClick={commit}>
                              {commitLabel}
                              <ArrowRight size={16} />
                            </button>
                          </div>
                        </>}
                      </div>
                    ) : handEnd ? (
                      <div className="table-prompt hand-complete-prompt">
                        <span className="prompt-icon">
                          <Flag size={26} />
                        </span>
                        <h2>{game.phase === 'match-end' ? 'Game complete' : 'Hand complete'}</h2>
                        <div className="phase-prompt-actions">
                          <button className="table-continue" onClick={() => setShowRecap(true)}>
                            View hand recap <ArrowUpRight size={16} />
                          </button>
                          <button className="primary-button" disabled={controller.busy} onClick={() => void playAgain()}>
                            {canReplayScenario ? 'Replay this deal' : 'Play again'}
                            <RotateCcw size={16} />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <TrickCards plays={game.trick} winner={currentWinner} layers={layers}
                          cueSeats={activeHint > 0 ? [isTeam && currentWinner === 2 ? 2 : game.trick[0]?.seat].filter((seat): seat is Seat => seat !== undefined) : []} />
                      </>
                    )}
                  </div>
                </section>
              </div>

              {(game.phase==='play'||game.phase==='trick-end') && <div className="rally-last" aria-label="Last trick"><LastTrickCards last={game.history[game.history.length-(game.phase==='trick-end'?2:1)]} /></div>}
            </div>

            <section ref={handRef} className="hand-section" aria-label="Your hand">
              <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
                {taskText}
              </div>
              <HandCards cards={game.hand} selected={selected} decisionId={turnKey}
                queueKey={`${game.id}:${game.handNumber}`} playMode={game.phase === 'play' || game.phase === 'trick-end'} selectionOnly={game.phase === 'pass'}
                blocked={paused || !!controller.error || handEnd || game.phase === 'bid'}
                disabled={paused || controller.busy || !!controller.error || handEnd || game.phase === 'bid'} myTurn={myTurn} canPlay={myTurn && game.phase === 'play'}
                isLegal={card => legal.includes(card)} onSelect={chooseCard} onPlay={playChosenCard}
                label={card => {
                  const received = isHearts && game.received.includes(card) && game.history.length === 0 && !game.trick.some(play => play.seat === 0);
                  const playable = !myTurn || game.phase === 'bid' || legal.includes(card);
                  const recommended = activeHint === 3 && (advice?.card === card || advice?.pass?.includes(card));
                  return `${cardLabel(card)}${received ? ', received in pass' : ''}${!playable ? ', unavailable this turn' : ''}${recommended ? ', coach suggestion' : ''}`;
                }}
                extraClass={card => `${activeHint === 3 && (advice?.card === card || advice?.pass?.includes(card)) ? 'recommended' : ''} ${isHearts && game.received.includes(card) && game.history.length === 0 && !game.trick.some(play => play.seat === 0) ? 'received-card' : ''}`}
                decoration={card => <>
                  {activeHint === 3 && (advice?.card === card || advice?.pass?.includes(card)) && <span className="recommendation-mark"><Sparkles size={11} /></span>}
                  {isHearts && game.received.includes(card) && game.history.length === 0 && !game.trick.some(play => play.seat === 0) && <span className="received-mark">New</span>}
                </>} />
              <span id="card-controls" className="sr-only">
                Hold to lift and drag a card on your turn. Release toward the table to play, or near your hand to return it.
                Double-click or double-tap to play or queue a card for your turn, if legal. Repeat to cancel a queue.
                Keyboard: Enter or Space plays or queues; Escape cancels. Hold or double-tap to select passing cards; confirm the pass separately.
              </span>
            </section>
          </main>
          {replayFrame && <RallyReplayTable frame={replayFrame}/>}
          <CoachWindow decisionId={turnKey} phase={game.phase}
            allowance={backend==='go'?{canCoach:coachAccess?.canRequest ?? false,remainingHands:coachAccess?coachAccess.remaining:0,resetsAt:coachAccess?.resetAt ?? null,handUnlocked:false}:session.access}
            allowanceLabel={backend==='go'?(coachAccess?coachSessionLabel(coachAccess):'Loading coaching access…'):undefined}
            availableAreaRef={tableScreenRef} handRef={handRef}
            hidden={viewport.portraitPhone||dialogOpen} disabled={(paused&&!coachReview)||!canDecide||controller.busy||coachMode==='after'} onDisplayChange={setCoachDisplay} onReviewChange={backend==='go'?undefined:setCoachReview}
            review={backend==='go'?undefined:<ReviewPanel session={session} envelope={controller.envelope} onOwnerChanged={controller.invalidateOwner} />} reviewAvailable={stats.decisions>0}>
            {backend==='go'?<CoachExperience session={{gameId:game.id,decisionId:turnKey,revision:session.revision,controlLeaseToken:session.controlLeaseToken}}
              selectedCards={selected} confirmedAction={confirmedAction} getEnvelope={controller.envelope}
              visible={coachDisplay.open&&!viewport.portraitPhone&&!dialogOpen} disabled={dialogOpen||viewport.portraitPhone||!pageVisible||!session.access.canPlay||session.controlLeaseToken==='view-only'||!!controller.error||controller.busy||('playbackInterrupted' in controller&&controller.playbackInterrupted)}
              cueAvailable={canDecide&&coachMode!=='after'} timing={coachMode} onBeforeReplay={beforeReplay} onReplayChange={onReplayChange} onAccessChange={setCoachAccess}
              onAccount={()=>{location.hash='#account';}}/>:<>
            {game.phase==='pass'&&selected.length>0&&<p className="rally-selection-note">Selected: {selected.map(cardLabel).join(', ')}. Confirm to pass.</p>}
                  <div className="coach-content" aria-live="polite">
                    {advicePending && <p>Considering the position…</p>}
                    {unlockLevel && (
                      <div>
                        <p>Unlock all help for this hand.</p>
                        <button className="hint-button" disabled={advicePending || controller.busy} onClick={() => void showHint(unlockLevel, true)}>
                          Use coached hand
                        </button>
                        <button className="subtle-button" onClick={() => setUnlockLevel(null)}>
                          Not now
                        </button>
                      </div>
                    )}
                    {activeHint > 0 && advice ? (
                      <>
                        <div className="hint-stage">
                          {activeHint === 1 ? (
                            <Focus size={14} />
                          ) : activeHint === 2 ? (
                            <Eye size={14} />
                          ) : (
                            <Lightbulb size={14} />
                          )}
                          {activeHint === 1 ? 'Notice' : activeHint === 2 ? 'Consider' : 'A suggestion'}
                          <button className="hint-dismiss" onClick={() => setHint(0)} aria-label="Dismiss hint">
                            <X size={15} />
                          </button>
                        </div>
                        <small>
                          {advice.source === 'jev'
                            ? 'Jev suggestion'
                            : advice.source === 'forced'
                              ? 'Forced move'
                              : 'Local suggestion'}
                        </small>
                        <h3>{advice.focus}</h3>
                        <p>
                          {activeHint === 1
                            ? advice.notice
                            : activeHint === 2
                              ? advice.reason
                              : advice.suggestion}
                        </p>
                        {activeHint === 3 && advice.card && (
                          <span className="suggested-chip">{cardLabel(advice.card)}</span>
                        )}
                      </>
                    ) : null}
                  </div>
                  <div className="coach-buttons">
                    {canDecide && coachMode !== 'after' ? (
                      activeHint === 0 ? (
                        <button className="hint-button" disabled={advicePending || controller.busy} onClick={() => showHint(1)}>
                          <Focus size={17} />
                          Give me a cue
                          <ArrowUpRight size={16} />
                        </button>
                      ) : (
                        <>
                          <button
                            className="hint-button"
                            onClick={() => showHint(activeHint === 1 ? 2 : 3)}
                            disabled={activeHint === 3 || advicePending || controller.busy}
                          >
                            {activeHint === 1
                              ? 'More context'
                              : activeHint === 2
                                ? 'Suggest a move'
                                : 'Suggestion shown'}
                            {activeHint < 3 && <ChevronRight size={15} />}
                          </button>
                          {activeHint === 1 && (
                            <button className="subtle-button" disabled={advicePending || controller.busy} onClick={() => showHint(3)}>
                              Suggest a move
                            </button>
                          )}
                        </>
                      )
                    ) : null}
                  </div>

            </>}
          </CoachWindow>
          </div>
          {session.access.localMock && <div className="runtime-label">Local test access · no payment</div>}
          {session.controlLeaseToken === 'view-only' && (
            <div className="storage-warning">
              This table is controlled in another tab.{' '}
              <button onClick={() => void controller.mutate('/api/session/control')}>Take control</button>
            </div>
          )}
          {!session.access.canPlay && (
            <div className="storage-warning">
              Your table is saved. <a href="#account">Manage access</a>
            </div>
          )}
        </div>

      {!viewport.portraitPhone && modal === 'games' && (
        <main className="new-game-wizard" aria-label="New game setup">
          <header className="wizard-header">
            <img src="/brand/cardford-symbol.svg" alt="" />
            <span>New game</span>
            <button className="icon-button" onClick={closeModal} aria-label="Close new game setup">
              <X size={20} />
            </button>
          </header>
          <div className="wizard-content">
            <p className="wizard-progress">{wizardStep === 'pace' ? '1 / 2' : '2 / 2'}</p>
            {wizardStep === 'pace' ? (
              <>
                <h1 tabIndex={-1}>Set the pace</h1>
                <p className="wizard-lead">Game speed</p>
                <div className="wizard-speed-options">
                  {([1, 1.2, 1.4] as const).map((speed) => (
                    <button
                      key={speed}
                      className={wizardSpeed === speed ? 'chosen' : ''}
                      aria-pressed={wizardSpeed === speed}
                      onClick={() => setWizardSpeed(speed)}
                    >
                      {speed}×
                    </button>
                  ))}
                </div>
                <button
                  className="primary-button wizard-next"
                  disabled={controller.busy}
                  onClick={() => setWizardStep('game')}
                >
                  Choose game <ArrowRight size={17} />
                </button>
              </>
            ) : (
              <>
                <h1 tabIndex={-1}>Choose a game</h1>
                <p className="wizard-lead">You and three computer players.</p>
                {scenarios.length > 0 && (
                  <label className="scenario-picker">
                    Practice deal
                    <select
                      value={wizardScenario}
                      onChange={(event) => setWizardScenario(event.target.value)}
                    >
                      <option value="">Random deal</option>
                      {scenarios.map((scenario) => (
                        <option key={scenario.id} value={scenario.id}>
                          {modeNames[scenario.mode]}{' '}
                          {scenario.mode === 'spades-partners' ? 'Partners' : 'Solo'} — {scenario.label}
                        </option>
                      ))}
                    </select>
                    <small>Selected cards for one practice hand.</small>
                  </label>
                )}
                <div className="game-options">
                  {(['hearts', 'spades-solo', 'spades-partners'] as Mode[]).map((mode) => (
                    <button
                      key={mode}
                      className="game-option"
                      disabled={
                        controller.busy ||
                        (!!wizardScenario &&
                          scenarios.find((item) => item.id === wizardScenario)?.mode !== mode)
                      }
                      onClick={() => void startWizardGame(mode)}
                    >
                      <div className={`game-art game-art-${mode}`}>
                        <span>{mode === 'hearts' ? '♥' : '♠'}</span>
                        {mode === 'spades-partners' && <span>♠</span>}
                      </div>
                      <h3>{modeNames[mode]}</h3>
                      <span className="mode-label">{mode === 'spades-partners' ? 'Partners' : 'Solo'}</span>
                      <span className="option-check">
                        <ArrowUpRight size={16} />
                      </span>
                    </button>
                  ))}
                  {'catalog' in controller && controller.catalog.filter(entry => entry.mode.startsWith('trix-')).map(entry => (
                    <button key={entry.mode} className="game-option" disabled={controller.busy || !entry.start.allowed || !!wizardScenario}
                      onClick={() => void (async()=>{
                        if (wizardSpeed!==gameSpeed && !await controller.preferences({coachMode,gameSpeed:wizardSpeed})) {setToast('Could not save game speed. Try again.');return;}
                        const opened=await controller.startRegistered(entry.mode); if(opened) {pauseState.setPaused(true);setModal('pause');}
                      })()}>
                      <div className="game-art"><span>♔</span></div>
                      <h3>Trix</h3><span className="mode-label">{variantLabel(entry.mode.slice(5))}</span>
                      {!entry.start.allowed && <small>Unavailable for this account</small>}
                      <span className="option-check"><ArrowUpRight size={16}/></span>
                    </button>
                  ))}
                </div>
                <button className="text-button wizard-back" onClick={() => setWizardStep('pace')}>
                  Back to game speed
                </button>
              </>
            )}
          </div>
        </main>
      )}
      {!viewport.portraitPhone && modal==='menu' && <Dialog title="Game menu" onClose={closeModal}>
        <nav className="rally-menu" aria-label="Game menu">
          <button onClick={()=>setModal('scores')}><Trophy size={20}/>Scores</button>
          <button onClick={()=>setModal('review')}><RotateCcw size={20}/>Review your play</button>
          <button onClick={()=>setModal('settings')}><Settings2 size={20}/>Preferences</button>
          <a href="#account"><UserRound size={20}/>Account</a>
          <button onClick={openWizard}><Play size={20}/>New game</button>
        </nav>
      </Dialog>}
      {!viewport.portraitPhone && modal==='scores' && <Dialog title="Scores" onClose={closeModal}>
        <table className="rally-score-sheet"><caption>Hand {game.handNumber} · {isHearts?'Lowest score wins':'Highest score wins'}</caption><thead><tr><th>Player</th><th>Tricks</th><th>Total</th></tr></thead><tbody>
          {(isTeam?[0,1]:[0,1,2,3]).map(seat=><tr key={seat}><th>{isTeam?(seat===0?'You & Maya':'Leo & Joe'):names[seat]}</th><td>{isTeam?game.tricks[seat]+game.tricks[seat+2]:game.tricks[seat]}</td><td>{game.scores[seat]}</td></tr>)}
        </tbody></table>
        <button className="text-button" onClick={()=>setModal('review')}><RotateCcw size={18}/>Review play</button>
      </Dialog>}
      {!viewport.portraitPhone && modal === 'settings' && (
        <Dialog title="Settings" onClose={closeModal}>
          <ThemePicker />
          <h3 className="settings-label">Coaching</h3>
          <div className="setting-options">
            {(
              [
                {
                  value: 'asked',
                  title: 'When I ask',
                  icon: <Focus size={20} />,
                },
                {
                  value: 'nudges',
                  title: 'Occasional cues',
                  icon: <Sparkles size={20} />,
                },
                {
                  value: 'after',
                  title: 'After the hand',
                  icon: <Flag size={20} />,
                },
              ] as const
            ).map((option) => (
              <button
                key={option.value}
                className={`setting-option ${coachMode === option.value ? 'chosen' : ''}`}
                onClick={() => {
                  setCoachMode(option.value);
                  setHint(0);
                }}
                aria-pressed={coachMode === option.value}
              >
                {option.icon}
                <span>
                  <b>{option.title}</b>
                </span>
                <span className="radio-mark">{coachMode === option.value && <span />}</span>
              </button>
            ))}
          </div>

          <button className="primary-button full-button" onClick={closeModal}>
            Done
          </button>
        </Dialog>
      )}
      {!viewport.portraitPhone && (modal==='pause'||(pauseRequired&&!modal)) &&
        <PauseDialog busy={pauseBusy||controller.busy} viewOnly={session.controlLeaseToken==='view-only'}
          reason={pauseState.reason} status={'streamStatus' in controller?controller.streamStatus:'live'} lifecycle={'lifecycle' in controller?controller.lifecycle:null}
          notice={pauseNotice||controller.error} onResume={()=>{void resumeGame();}} onTakeControl={()=>{void takeControl();}}
          onSettings={()=>setModal('settings')} onChooseGame={openWizard}/>}

      {!viewport.portraitPhone && !modal && !pauseRequired && handEnd && showRecap && (
        <Dialog
          title={game.phase === 'match-end' ? `${winnerLabel}.` : `Hand ${game.handNumber} results`}
          onClose={() => setShowRecap(false)}
          wide
        >
          <div className="recap-layout">
            <div className="recap-score">
              <span>{isTeam ? 'You & Maya' : 'Your score'}</span>
              <strong>{game.scores[0]}</strong>
              <span>
                {(game.handResult?.points[0] || 0) >= 0 ? '+' : ''}
                {game.handResult?.points[0] || 0} this hand
              </span>
              <div className="recap-standings">
                {(isTeam ? [1] : [1, 2, 3]).map((seat) => (
                  <span key={seat}>
                    {isTeam ? 'Leo & Joe' : names[seat]}
                    <b>{game.scores[seat]}</b>
                  </span>
                ))}
              </div>
            </div>
            <div className="recap-reflection">
              <h3>Help used</h3>
              <div className="decision-summary">
                <div>
                  <b>{stats.decisions - stats.helped}</b>
                  <span>No help opened</span>
                </div>
                <div>
                  <b>{stats.helped}</b>
                  <span>Help opened</span>
                </div>
              </div>
              <details className="recap-details">
                <summary>What counts?</summary>
                <p>Turns with coaching help opened. No skill rating.</p>
              </details>
            </div>
          </div>
          {game.phase === 'match-end' && (
            <details className="recap-details">
              <summary>Final hand: trick winners</summary>
              <ol>
                {game.history.map((trick, index) => (
                  <li key={index}>
                    Trick {index + 1}: {names[trick.winner]} —{' '}
                    {trick.plays.map((play) => cardLabel(play.card)).join(', ')}
                  </li>
                ))}
              </ol>
              <p>
                {names
                  .map(
                    (name, seat) =>
                      `${name}: ${game.tricks[seat]} tricks${isHearts ? '' : `, bid ${game.bids[seat] === 0 ? 'Nil' : game.bids[seat]}`}`,
                  )
                  .join(' · ')}
              </p>
            </details>
          )}
          <div className="dialog-bottom">
            <button className="text-button" onClick={() => setShowRecap(false)}>
              <Eye size={16} />
              Back to table
            </button>
            <button className="primary-button" disabled={controller.busy} onClick={() => void playAgain()}>
              {canReplayScenario ? 'Replay this deal' : 'Play again'}
              <RotateCcw size={16} />
            </button>
          </div>
        </Dialog>
      )}
      {!viewport.portraitPhone && modal === 'review' && (
        <Dialog title="Review current game" onClose={closeModal} wide>
          <ReviewPanel
            session={session}
            envelope={controller.envelope}
            onOwnerChanged={controller.invalidateOwner}
          />
        </Dialog>
      )}
      {controller.error && (
        <div className="storage-warning" role="alert">
          {controller.error} <button onClick={() => void controller.retry()}>Retry</button>
        </div>
      )}
      {toast && !viewport.portraitPhone && (
        <div className="toast" role="status">
          <Check size={16} />
          {toast}
        </div>
      )}
    </>
  );
}
