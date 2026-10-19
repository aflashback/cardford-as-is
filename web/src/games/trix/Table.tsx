import { useCallback, useEffect, useRef, useState } from 'react';
import { RotateCcw, Focus, ArrowUpRight, ListOrdered, Crown } from 'lucide-react';

import type { Card, Seat, TrixAdvice, TrixAction, ReviewFrame, CoachUIAccess } from '../../../shared/local-service.contracts.ts';

import type { ClientTrixSession } from '../../api/sessionModel.ts';

import type { useGoSession } from '../../api/useGoSession.ts';

import { RemainingCards, PlayerBadge, LastTrickCards, TrickCards } from '../../table/CardPrimitives';
import { HandCards } from '../../table/HandCards';
import { ScoreTotals } from '../../table/ScoreTotals';
import { useCardThrows } from '../../table/useCardThrows';
import { useResponsiveTableFit, type TablePresentationPhase } from '../../table/useResponsiveTableFit';
import { RallyHeader } from '../../rally/RallyHeader';
import { ThemePicker } from '../../rally/appearance';
import { CoachWindow, type CoachWindowDisplay } from '../../rally/CoachWindow';
import { CoachExperience } from '../../rally/CoachExperience';
import { coachSessionLabel } from '../../rally/coachCommands';
import { RallyReplayTable } from '../../rally/RallyReplayTable';
import { backend } from '../../platform/web';
import { Dialog } from '../../table/Dialog';
import { PauseDialog } from '../../table/PauseDialog';
import { useGamePause } from '../../table/useGamePause';
import { useViewport } from '../../table/useViewport';
import { RotationGate } from '../../table/RotationGate';
import { playbackDelay } from '../../table/playback';
import { usePresentedRevision } from '../../table/usePresentedRevision';
import { publicTrickLayers } from '../../api/tablePresentation';
import { useTrickPlayback } from './useTrickPlayback';
import { cardRank, cardSuit } from '../../api/display';

import { playerNames, variantLabel, cardCandidate, doubleCandidate, eligibleDoubles, seatRequestScore } from './adapter.ts';

import { RequestPicker } from './RequestPicker.tsx';

import { DoublePicker } from './DoublePicker.tsx';

import { LayoutBoard } from './LayoutBoard.tsx';
import { TwoAnnouncements } from './TwoAnnouncements.tsx';

import { ScoreSheet } from './ScoreSheet.tsx';
import { RoundHistory } from './RoundHistory.tsx';

import { TrixReview } from './Review.tsx';

import './trix.css';

export type TrixController = Pick<ReturnType<typeof useGoSession>, 'error' | 'busy' | 'refresh' |
  'mutate' | 'candidateAction' | 'registeredAdvice' | 'exposure' | 'playbackRunning' | 'playbackInterrupted' | 'streamStatus' | 'setPlayback' |
  'startRegistered' | 'preferences' | 'retry' | 'catalog' | 'envelope'> & {
    notePresented?: (revision: number) => void;
    presentationHeld?: boolean;
    lifecycle?:ReturnType<typeof useGoSession>['lifecycle'];
    interruptionReason?:ReturnType<typeof useGoSession>['interruptionReason'];
  };

export function TrixTable({ session, controller }: { session: ClientTrixSession; controller: TrixController }) {
  usePresentedRevision(session, controller.notePresented);
  const o = session.game.observation,
    myTurn = o.turn === 0,
    completed = o.phase === 'round-complete' || o.phase === 'session-complete';

  const viewport=useViewport();
  const pauseState=useGamePause({canStop:session.controlLeaseToken!=='view-only',blocked:viewport.portraitPhone||!session.access.canPlay,
    stop:reason=>controller.setPlayback(false,'pause',reason)});
  const {paused,setPaused}=pauseState;
  const [selected, setSelected] = useState<Card[]>([]),
    [pauseBusy, setPauseBusy] = useState(false),
    [dialog, setDialog] = useState<'games' | 'scores' | 'history' | 'review' | 'settings' | null>(null);

  const [online, setOnline] = useState(navigator.onLine),
    [advice, setAdvice] = useState<TrixAdvice | null>(null),
    [hintBusy, setHintBusy] = useState(false),
    [notice, setNotice] = useState('');
  const [coachReviewOpen, setCoachReviewOpen] = useState(false);
  const [setupPace, setSetupPace] = useState(session.preferences.gameSpeed);
  const [startingGame, setStartingGame] = useState(false);
  const gameStartPending = useRef(false);
  const [replayFrame, setReplayFrame] = useState<ReviewFrame | null>(null);
  const [coachAccess, setCoachAccess] = useState<CoachUIAccess>();
  const [confirmedAction, setConfirmedAction] = useState<{ gameId: string; decisionId: string; action: TrixAction; revision: number }>();
  const [coachDisplay, setCoachDisplay] = useState<CoachWindowDisplay>({ open: false, pinned: false, width: 0 });
  const tableScreenRef = useRef<HTMLDivElement>(null), handRef = useRef<HTMLElement>(null);
  const onCoachDisplay = useCallback((display: CoachWindowDisplay) => {
    const { pinned, width } = display;
    setCoachDisplay(previous => previous.open === display.open && previous.pinned === pinned && previous.width === width ? previous : display);
    const screen = tableScreenRef.current;
    if (!screen) return;
    screen.dataset.coachPinned = String(pinned);
    screen.style.setProperty('--rally-coach-space', `${pinned ? width : 0}px`);
  }, []);
  const onReplayChange = useCallback((frame: ReviewFrame | null) => {
    setReplayFrame(frame);
    if (!frame) setCoachReviewOpen(false);
  }, []);
  const beforeReplay = async () => {
    setCoachReviewOpen(true);
    try {
      const stopped = await controller.setPlayback(false,'hold');
      if (!stopped) setCoachReviewOpen(false);
      return stopped;
    } catch (error) {
      setCoachReviewOpen(false);
      setNotice(error instanceof Error ? error.message : 'Could not pause the table for review.');
      return false;
    }
  };

  const decision = useRef(session.decisionId),
    currentGame = useRef(session.game.id),
    sending = useRef(false),
    nudged = useRef(''),
    playedDecision = useRef(''),
    continuedDecision = useRef(''),
    resumingPlayback = useRef(false),
    claimingControl = useRef(false);

  decision.current = session.decisionId;
  currentGame.current = session.game.id;

  const blocked = paused || !!dialog || coachReviewOpen || !!replayFrame || viewport.portraitPhone || !online || !session.access.canPlay ||
    session.controlLeaseToken === 'view-only' || !!controller.error || controller.playbackInterrupted;
  useEffect(() => {
    if (controller.playbackInterrupted) setPaused(true,controller.interruptionReason??controller.lifecycle?.pauseReason??(controller.streamStatus==='recovering'?'connection_lost':'lease_expired'));
  }, [controller.playbackInterrupted]);
  useEffect(() => {
    if(session.controlLeaseToken==='view-only'||resumingPlayback.current)return;
    const phase=controller.lifecycle?.phase;
    const interrupted=paused||viewport.portraitPhone||!online||!session.access.canPlay||!!controller.error||controller.playbackInterrupted;
    if(interrupted){if(controller.playbackRunning||phase==='held')void controller.setPlayback(false,'pause',pauseState.reason);return;}
    if(blocked){if(phase!=='held')void controller.setPlayback(false,'hold');}
    else if(phase==='held')void controller.setPlayback(true,'release_hold');
  }, [blocked, controller.playbackRunning, session.access.canPlay, session.controlLeaseToken]);
  const heldTrick = useTrickPlayback(o, blocked, session.preferences.gameSpeed, controller.presentationHeld);
  const lastTrickVisible = !!heldTrick || o.phase === 'playing';
  const presentationPhase: TablePresentationPhase = lastTrickVisible ? 'play' :
    o.phase === 'layout' || (o.phase === 'round-complete' && o.request === 'trix') ? 'jacks' :
      o.phase === 'declare-doubles' ? 'double' : o.phase === 'choose-request' ? 'request' : completed ? 'results' : 'waiting';
  const fitArea = useResponsiveTableFit({ game: 'trix', phase: presentationPhase, lastTrickVisible });
  const playArea = useCardThrows({ deal: `${o.id}:${o.dealNumber}`, turn: o.turn,
    active: !blocked, speed: session.preferences.gameSpeed });
  const tableRef = useCallback((element: HTMLElement | null) => {
    fitArea(element); playArea.current = element;
  }, [fitArea, playArea]);
  const disabled = blocked || controller.busy || !!heldTrick;
  const doubleCards = eligibleDoubles(session.candidates);
  const doublingOpen = !blocked && myTurn && o.phase === 'declare-doubles' && doubleCards.length > 0;

  // Only pass automatically when the server offers no doubling choice.
  const pass = o.phase === 'declare-doubles' && doubleCards.length === 0
    ? doubleCandidate(session.candidates, [])
    : o.phase === 'layout' ? session.candidates.find((c) => c.public.kind === 'layout-pass') : undefined;

  useEffect(() => {
    setSelected(cards => cards.filter(card => o.hand.includes(card) && (!myTurn || !!cardCandidate(session.candidates, card))));
    setAdvice(null);
    setHintBusy(false);
    setNotice('');
  }, [session.decisionId]);
  useEffect(() => { setSelected([]); }, [o.phase]);
  useEffect(() => { setReplayFrame(null); setCoachReviewOpen(false); setConfirmedAction(undefined); }, [session.game.id]);
  useEffect(() => { if (viewport.portraitPhone) {void pauseState.pause('layout_unavailable');setDialog(null);} }, [viewport.portraitPhone]);

  useEffect(() => {
    document.title = `Trix ${variantLabel(o.variantId)} — CardFord`;
  }, [o.variantId]);

  useEffect(() => {
    const changed = () => {
      setOnline(navigator.onLine);
      if(!navigator.onLine)setPaused(true,'connection_lost');
      if (navigator.onLine&&!document.hidden) void controller.refresh().catch(() => undefined);
    };

    const foreground = () => {
      if (document.hidden) return; // The shared lifecycle pauses every game.
      void controller.refresh().catch(() => undefined);
    };

    window.addEventListener('online', changed);
    window.addEventListener('offline', changed);
    window.addEventListener('focus', foreground);
    document.addEventListener('visibilitychange', foreground);

    return () => {
      window.removeEventListener('online', changed);
      window.removeEventListener('offline', changed);
      window.removeEventListener('focus', foreground);
      document.removeEventListener('visibilitychange', foreground);
    };
  }, [controller.refresh]);

  useEffect(() => {
    if (disabled || !myTurn || !pass || completed || document.hidden) return;
    const key = session.decisionId;
    const timer = window.setTimeout(() => {
      if (decision.current === key) void submit(pass.id);
    }, o.phase === 'declare-doubles' ? 0 : playbackDelay('turn', session.preferences.gameSpeed));
    return () => window.clearTimeout(timer);
  }, [session.decisionId, disabled, myTurn, completed, o.phase, session.preferences.gameSpeed, pass?.id]);

  useEffect(() => {
    if (disabled || !['round-complete', 'chance'].includes(o.phase) || document.hidden) return;
    const key = session.decisionId;
    const timer = window.setTimeout(() => {
      if (sending.current || continuedDecision.current === key || decision.current !== key || document.hidden) return;
      continuedDecision.current = key;
      sending.current = true;
      void controller.mutate('/api/session/next-hand').then(ok => {
        if (!ok) setPaused(true);
      }).catch(e => {
        setPaused(true); setNotice(e instanceof Error ? e.message : 'Reconnect to continue.');
      }).finally(() => { sending.current = false; });
    }, playbackDelay(o.phase === 'round-complete' && o.request === 'trix' ? 'trick' : 'turn', session.preferences.gameSpeed));
    return () => window.clearTimeout(timer);
  }, [session.decisionId, disabled, o.phase, session.preferences.gameSpeed]);

  async function submit(id: string) {
    if (disabled || !myTurn || sending.current) return false;
    const candidate = session.candidates.find(item => item.id === id);
    if (!candidate) return false;

    sending.current = true;

    try {
      return await controller.candidateAction(id, confirmationFor(candidate.public));
    } finally {
      sending.current = false;
    }
  }

  function confirmationFor(action: TrixAction) {
    const gameId = session.game.id, decisionId = session.decisionId;
    return (receipt: { gameId: string; revision: number }) => {
      if (backend === 'go' && receipt.gameId === gameId && currentGame.current === gameId)
        setConfirmedAction({ gameId, decisionId, action, revision: receipt.revision });
    };
  }

  async function hint(level: 1 | 2 | 3) {
    if (backend === 'go' || hintBusy || disabled || !myTurn || !session.access.canCoach) return;

    setHintBusy(true);
    const key = session.decisionId;

    try {
      const result = await controller.registeredAdvice(level);

      if (decision.current !== key) return;

      if (result.decisionId !== key || result.level !== level)
        throw new Error('The hint does not match this decision.');

      setAdvice(result);
      await controller.exposure(level, key).catch(() => undefined);
    } catch (e) {
      if (decision.current === key) setNotice(e instanceof Error ? e.message : 'Coaching unavailable.');
    } finally {
      if (decision.current === key) setHintBusy(false);
    }
  }

  useEffect(() => {
    if (
      backend !== 'go' &&
      session.preferences.coachMode === 'nudges' &&
      session.access.handUnlocked &&
      myTurn &&
      !disabled &&
      nudged.current !== session.decisionId
    ) {
      nudged.current = session.decisionId;
      void hint(1);
    }
  }, [session.decisionId, disabled, myTurn, session.preferences.coachMode]);

  async function start(mode: string, gameSpeed = session.preferences.gameSpeed) {
    if (controller.busy || gameStartPending.current) return;
    gameStartPending.current = true;
    setStartingGame(true);
    setNotice('');
    try {
      if (gameSpeed !== session.preferences.gameSpeed &&
        !await controller.preferences({ ...session.preferences, gameSpeed })) {
        setNotice('Could not save game speed. Try again.');
        return;
      }
      if (await controller.startRegistered(mode)) {
        setDialog(null);
        setPaused(true);
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not open this game. Try again.');
    } finally {
      gameStartPending.current = false;
      setStartingGame(false);
    }
  }

  const turnText = completed
    ? o.phase === 'session-complete'
      ? 'Game complete'
      : 'Request complete'
    : o.phase === 'chance'
      ? 'Ready for the next deal'
      : myTurn
        ? 'Your turn'
        : `${playerNames[o.turn ?? o.owner]}’s turn`;

  const latest = o.tricks[o.tricks.length - 1];
  const plays = heldTrick?.plays ?? o.trick;
  // Interim depth uses public led-suit ranks only; a completed winner is server supplied.
  const lead = plays[0] && cardSuit(plays[0].card);
  const winner = heldTrick?.winner ?? plays.filter(p => cardSuit(p.card) === lead)
    .reduce<Seat | null>((best, p) => best === null || cardRank(p.card) > cardRank(plays.find(c => c.seat === best)!.card) ? p.seat : best, null);
  const layers = publicTrickLayers(plays, winner);
  const boardKey = (board: typeof o.board) => board.map(row => `${row.suit}:${row.low}:${row.high}`).join('|');
  const passed = new Set(o.phase === 'layout' ? o.passes.filter(p => boardKey(p.board) === boardKey(o.board)).map(p => p.seat) : []);
  const played = new Set([...o.tricks.flatMap(t => t.plays), ...o.trick].map(p => p.card));
  const announced = (seat: Seat) => o.declarations.filter(d => d.seat === seat).flatMap(d => d.cards).filter(card => !played.has(card));
  const score = (seat: Seat) => {
    const showScore = o.request !== 'trix' || completed;
    if (!showScore && seat === o.seat) return null;
    return <span className="player-detail">
      {showScore && <button className="trix-seat-score" title="Scores" aria-label={`${playerNames[seat]} current score ${seatRequestScore(o, seat)}; show scores`}
        onClick={() => setDialog('scores')}>{seatRequestScore(o, seat)}</button>}
      {seat !== o.seat && <RemainingCards count={o.handCounts[seat]} />}
    </span>;
  };
  const mark = (seat: Seat) => <>
    {o.owner === seat && <span className="trix-kingdom-owner" role="img" aria-label={`${playerNames[seat]}: kingdom owner`} title="Kingdom owner">
      <Crown size={13} aria-hidden="true" />
    </span>}
    {passed.has(seat) && <span className="player-pass" role="status">Pass</span>}
  </>;
  function selectCard(card: Card, keep = false) {
    if (!disabled && myTurn && o.phase === 'declare-doubles' && doubleCards.includes(card)) {
      setSelected(cards => keep ? [...new Set([...cards, card])]
        : cards.includes(card) ? cards.filter(c => c !== card) : [...cards, card]);
      return;
    }
    if (disabled || !['playing', 'layout'].includes(o.phase) || (myTurn && !cardCandidate(session.candidates, card))) return;
    setSelected(cards => !keep && cards[0] === card ? [] : [card]);
  }
  async function playCard(card: Card) {
    const candidate = cardCandidate(session.candidates, card);
    if (disabled || !myTurn || !candidate || playedDecision.current === session.decisionId) return;
    playedDecision.current = session.decisionId;
    const key = session.decisionId;
    if (!(await controller.candidateAction(candidate.id, confirmationFor(candidate.public))) && decision.current === key) playedDecision.current = '';
  }
  function resumeGame() {
    if (resumingPlayback.current || claimingControl.current) return;
    if (session.controlLeaseToken === 'view-only') {
      setNotice('Take control of this table before resuming.');
      return;
    }
    resumingPlayback.current = true;
    setPauseBusy(true);
    const ticket=pauseState.beginResume();
    void (async () => {
      try {
        if (controller.error) {
          if (!await controller.retry()) throw new Error('Could not reconnect.');
        } else await controller.refresh();
        if(!pauseState.canResume(ticket))return;
        if (!await controller.setPlayback(true)) throw new Error('Could not resume playback.');
        if(!pauseState.finishResume(ticket)){await controller.setPlayback(false);return;}
        setNotice('');
      } catch (e) {
        setPaused(true); setNotice(e instanceof Error ? e.message : 'Reconnect to continue.');
      } finally { window.setTimeout(() => { resumingPlayback.current = false; setPauseBusy(false); }, 0); }
    })();
  }
  function takeControl() {
    if (claimingControl.current || resumingPlayback.current) return;
    claimingControl.current = true;
    setPauseBusy(true);
    setNotice('');
    void (async () => {
      try {
        await controller.refresh();
        if (!await controller.mutate('/api/session/control'))
          throw new Error('Could not take control. Reconnect and try again.');
        // A control.changed message can remount this table. The fresh pause
        // dialog then offers Resume, keeping takeover and playback distinct.
      } catch (e) {
        setNotice(e instanceof Error ? e.message : 'Could not take control.');
      } finally { claimingControl.current = false; setPauseBusy(false); }
    })();
  }

  return <>
    {viewport.portraitPhone && <RotationGate />}
    {pauseState.idleWarning&&!viewport.portraitPhone&&<div className="rally-idle-notice" role="status">Still playing? Pausing in 30 seconds without activity.</div>}
    <div className="app-shell trix-app rally-app" data-game="trix" data-phase={presentationPhase}
      hidden={viewport.portraitPhone} inert={paused || dialog !== null || viewport.portraitPhone}>
      <RallyHeader game="Trix" variant={variantLabel(o.variantId)}
        scores={o.totals.map(total => ({ label: total.seats.map(seat => playerNames[seat]).join(' & '), total: total.total }))}
        onGame={() => { setSetupPace(session.preferences.gameSpeed); setNotice(''); setDialog('games'); }} onScores={() => setDialog('scores')}
        onPause={() => {void pauseState.pause();}} onMenu={() => setDialog('settings')}
        status={controller.streamStatus !== 'live' && <span role="status">
          {controller.streamStatus === 'http' ? 'Updating by connection' : 'Reconnecting…'}
        </span>} />
      <div className="rally-table-screen" ref={tableScreenRef}>
      <main className="game-shell rally-game-shell" ref={tableRef} data-game="trix" data-rally-phase={presentationPhase}
        hidden={!!replayFrame} inert={coachReviewOpen || !!replayFrame}>
        <div className="play-space">
          <div className="table-stage">
            <section className="table-zone" aria-label="Trix four player table">
              <div className="table-felt"><div className="table-line" /><span className="table-brand">CardFord</span></div>
              <ScoreTotals scores={o.totals} direction="higher" />
              {([0, 1, 2, 3] as Seat[]).map(seat => <PlayerBadge key={seat} seat={seat}
                partner={o.variantId.endsWith('partners') && seat === 2} active={!heldTrick && !completed && o.turn === seat}
                announcement={mark(seat)} cards={announced(seat)}
                cardAnnouncements={o.request === 'trix' && o.variantId.endsWith('partners') && o.twoAnnouncements
                  ? <TwoAnnouncements observation={o} seat={seat} /> : undefined}>{score(seat)}</PlayerBadge>)}
              {doublingOpen && <div className="rally-double-control"><DoublePicker candidates={session.candidates} selected={selected}
                disabled={disabled} onConfirm={id => void submit(id).then(ok => { if (ok) setSelected([]); })} /></div>}
              {heldTrick || o.phase === 'playing' ? <div key="trick" className="trick-area" aria-label="Current trick">
                <TrickCards plays={plays} winner={winner} layers={layers} />
              </div> : o.phase === 'layout' || (o.phase === 'round-complete' && o.request === 'trix') ? <LayoutBoard board={o.board} partners={o.variantId.endsWith('partners')} /> :
                <div key="request-or-result" className="trix-center">
                  {o.phase === 'session-complete' ? <div className="trix-game-complete"><p>Game complete</p>
                    <button className="primary-button" disabled={disabled} onClick={() => void start(`trix-${o.variantId}`)}>Play again</button></div> :
                      o.phase === 'choose-request' && myTurn ? <RequestPicker candidates={session.candidates} disabled={disabled} onChoose={id => void submit(id)} /> : null}
                </div>}
            </section>
          </div>
          <div className="rally-last" hidden={!lastTrickVisible}><LastTrickCards last={heldTrick ? o.tricks.filter(trick => trick.number < heldTrick.number).slice(-1)[0] : latest} /></div>
        </div>
        <section className="hand-section" aria-label="Your hand" ref={handRef}>
          <div className="hand-toolbar">
            <span className="sr-only" role="status">{heldTrick ? `${playerNames[heldTrick.winner]} took the trick` : turnText}</span>
          </div>
          <HandCards cards={o.hand} selected={['playing', 'layout', 'declare-doubles'].includes(o.phase) ? selected : []} decisionId={session.decisionId}
            queueKey={`${o.id}:${o.dealNumber}`} playMode={['playing', 'layout'].includes(o.phase)} selectionOnly={o.phase === 'declare-doubles'}
            blocked={blocked || !['playing', 'layout', 'declare-doubles'].includes(o.phase)}
            disabled={disabled || !['playing', 'layout', 'declare-doubles'].includes(o.phase)} myTurn={myTurn} canPlay={myTurn && !disabled && ['playing', 'layout'].includes(o.phase)}
            isReadOnly={card => o.phase === 'declare-doubles' && (!myTurn || !doubleCards.includes(card))}
            isLegal={card => o.phase === 'declare-doubles' ? doubleCards.includes(card) : !['playing', 'layout'].includes(o.phase) || !!cardCandidate(session.candidates, card)} onSelect={selectCard} onPlay={playCard}
            extraClass={card => advice && cardCandidate(session.candidates, card)?.id === advice.recommendedCandidateId ? 'recommended' : ''} />
          <span className="sr-only" id="card-controls">Hold to lift and drag on your turn. Release toward the table to play, or near your hand to return. Double-click or double-tap to play or queue for your turn, if legal. Repeat to cancel a queue. Enter or Space plays or queues; Escape cancels. Hold or double-tap to select doubling cards, then confirm separately.</span>
        </section>
      </main>
      {replayFrame && <RallyReplayTable frame={replayFrame} />}
      <CoachWindow decisionId={session.decisionId} phase={presentationPhase}
        allowance={backend === 'go' ? { canCoach: coachAccess?.canRequest ?? false, remainingHands: coachAccess ? coachAccess.remaining : 0,
          resetsAt: coachAccess?.resetAt ?? null, handUnlocked: false } : session.access}
        allowanceLabel={backend === 'go' ? coachAccess ? coachSessionLabel(coachAccess) : 'Loading coaching access…' : undefined}
        availableAreaRef={tableScreenRef} handRef={handRef} onDisplayChange={onCoachDisplay}
        onReviewChange={backend === 'go' ? undefined : setCoachReviewOpen} review={backend === 'go' ? undefined : <TrixReview />} reviewAvailable
        disabled={disabled || !myTurn || completed || session.preferences.coachMode === 'after'}
        hidden={paused || dialog !== null || viewport.portraitPhone}>
        {backend === 'go' ? <CoachExperience session={{ gameId: session.game.id, decisionId: session.decisionId,
          revision: session.revision, controlLeaseToken: session.controlLeaseToken }} getEnvelope={controller.envelope}
          selectedCards={selected.filter(card => o.hand.includes(card))} confirmedAction={confirmedAction}
          visible={!paused&&coachDisplay.open && !viewport.portraitPhone && !dialog}
          timing={session.preferences.coachMode}
          cueAvailable={myTurn && !completed && !heldTrick && session.preferences.coachMode !== 'after' &&
            ['choose-request', 'declare-doubles', 'playing', 'layout'].includes(o.phase)}
          disabled={controller.busy || paused || !!dialog || viewport.portraitPhone || !online ||
            session.controlLeaseToken === 'view-only' || !session.access.canPlay || !!controller.error || controller.playbackInterrupted}
          onBeforeReplay={beforeReplay} onReplayChange={onReplayChange} onAccessChange={setCoachAccess}
          onAccount={() => { location.hash = '#account'; }} /> : <>
        <div className="coach-content" aria-live="polite">
          {hintBusy ? <p>Considering the position…</p> : advice ? <><small>{advice.origin === 'forced' ? 'Forced move' : 'Saved code hint'}</small><p>{advice.text}</p></> : null}
        </div>
        <div className="coach-buttons">
          {!completed && session.preferences.coachMode !== 'after' && <button className="hint-button"
            disabled={disabled || !myTurn || !session.access.canCoach || hintBusy} onClick={() => void hint(advice ? Math.min(3, advice.level + 1) as 1 | 2 | 3 : 1)}>
            <Focus size={17} />{advice?.level === 3 ? 'Suggestion shown' : advice ? 'More context' : 'Give me a cue'}<ArrowUpRight size={16} />
          </button>}
          {advice && <button className="subtle-button" onClick={() => setAdvice(null)}>Hide cue</button>}
        </div>
        </>}
      </CoachWindow>
      </div>
      {(controller.error || notice || !online) && <div className="trix-error" role="alert">
        <span>{!online ? 'Offline · reconnect to make a move' : controller.error || notice}</span>
        <button className="text-button" onClick={() => void controller.retry().then(ok => { if (ok) setNotice(''); })}>Reconnect</button>
      </div>}
      {session.controlLeaseToken === 'view-only' && <div className="trix-error"><span>This table is open elsewhere.</span>
        <button className="text-button" onClick={() => void controller.mutate('/api/session/control')}>Take control</button></div>}
      {session.access.localMock && <div className="runtime-label">Local test access · deterministic code players</div>}
    </div>
    {!viewport.portraitPhone && <>
    {paused && !dialog && <PauseDialog busy={pauseBusy||controller.busy} viewOnly={session.controlLeaseToken==='view-only'}
      reason={pauseState.reason} status={controller.streamStatus} lifecycle={controller.lifecycle}
      notice={notice||controller.error} onResume={resumeGame} onTakeControl={takeControl}
      onSettings={()=>setDialog('settings')}
      onChooseGame={()=>{setSetupPace(session.preferences.gameSpeed);setNotice('');setDialog('games');}}/>}
    {dialog === 'review' && <Dialog title="Saved Trix decisions" onClose={() => setDialog(null)} wide><TrixReview /></Dialog>}
    {dialog === 'scores' && <Dialog title="Scores" onClose={() => setDialog(null)} wide><ScoreSheet observation={o} /></Dialog>}
    {dialog === 'history' && <Dialog title="Score history" onClose={() => setDialog(null)} wide><RoundHistory gameId={session.game.id} /></Dialog>}
    {dialog === 'settings' && <Dialog title="Settings" onClose={() => setDialog(null)}>
      <ThemePicker />
      <div className="rally-menu">
        <button onClick={() => setDialog('review')}><RotateCcw size={18} />Review</button>
        <button disabled={o.dealNumber === 1 && !completed} onClick={() => setDialog('history')}><ListOrdered size={18} />Score history</button>
        <a href="#account">Account</a>
      </div>
      <label className="trix-coach-setting">Pace<select aria-label="Game pace" value={session.preferences.gameSpeed} disabled={controller.busy}
        onChange={e => { const gameSpeed = Number(e.target.value); if (gameSpeed === 1 || gameSpeed === 1.2 || gameSpeed === 1.4) void controller.preferences({ ...session.preferences, gameSpeed }); }}>
        <option value={1}>1×</option><option value={1.2}>1.2×</option><option value={1.4}>1.4×</option>
      </select></label>
      <label className="trix-coach-setting">Coaching<select aria-label="Coaching" value={session.preferences.coachMode} disabled={controller.busy}
        onChange={e => { const coachMode = e.target.value; if (coachMode === 'asked' || coachMode === 'nudges' || coachMode === 'after') void controller.preferences({ ...session.preferences, coachMode }); }}>
        <option value="asked">When I ask</option><option value="nudges">Occasional cues</option><option value="after">After the hand</option>
      </select></label>
    </Dialog>}
    {dialog === 'games' && <Dialog title="Choose a game" onClose={() => { if (!startingGame) setDialog(null); }} compact>
      <label className="trix-coach-setting">Pace<select aria-label="New game pace" value={setupPace} disabled={controller.busy || startingGame}
        onChange={event => { const pace = Number(event.target.value); if (pace === 1 || pace === 1.2 || pace === 1.4) setSetupPace(pace); }}>
        <option value={1}>1×</option><option value={1.2}>1.2×</option><option value={1.4}>1.4×</option>
      </select></label>
      {(notice || controller.error) && <p role="alert">{notice || controller.error}</p>}
      <div className="trix-catalog">
      {controller.catalog.map(entry => <button key={entry.mode} disabled={controller.busy || startingGame || !entry.start.allowed} onClick={() => void start(entry.mode, setupPace)}>
        <strong>{entry.mode.startsWith('trix') ? 'Trix' : entry.mode === 'hearts' ? 'Hearts' : 'Spades'}</strong>
        <span>{entry.mode.startsWith('trix') ? variantLabel(entry.mode.slice(5)) : entry.mode === 'spades-partners' ? 'Partners' : 'Solo'}</span>
      </button>)}
    </div></Dialog>}
    </>}
  </>;
}
