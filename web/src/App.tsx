import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
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
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  Settings2,
  Sparkles,
  X,
} from 'lucide-react';
import type { AdviceView, Card, GameView, Mode, NotesView, Seat } from '../shared/contracts';
import { cardLabel, cardRank, cardSuit } from './api/display';
import { useSession } from './api/useSession';
import { api } from './api/client';
import { AccountPage } from './features/AccountPage';
import { ReviewPanel } from './features/ReviewPanel';
import { DemoPage } from './features/DemoPage';

const names = ['You', 'Leo', 'Maya', 'Theo'];
const suitSymbols: Record<string, string> = { C: '♣', D: '♦', H: '♥', S: '♠' };
const modeNames: Record<Mode, string> = {
  hearts: 'Hearts',
  'spades-solo': 'Spades',
  'spades-partners': 'Spades',
};
type Modal = 'games' | 'notes' | 'settings' | 'pause' | 'review' | null;

type HintLevel = 0 | 1 | 2 | 3;

function useViewport() {
  const [size, setSize] = useState(() => ({ width: window.innerWidth, height: window.innerHeight }));
  useEffect(() => {
    const update = () => {
      const height = Math.min(window.innerHeight, window.visualViewport?.height ?? window.innerHeight);
      document.documentElement.style.setProperty('--app-height', `${height}px`);
      setSize({ width: window.innerWidth, height });
    };
    update();
    window.addEventListener('resize', update);
    window.visualViewport?.addEventListener('resize', update);
    return () => {
      window.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('resize', update);
    };
  }, []);
  return { ...size, portraitPhone: size.width < 700 && size.height > size.width };
}

function Dialog({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const element = ref.current;
    // Keep the external trigger when Strict Mode replays the focus effect.
    if (document.activeElement instanceof HTMLElement && !element?.contains(document.activeElement))
      returnFocusRef.current = document.activeElement;
    const before = returnFocusRef.current;
    element?.querySelector<HTMLElement>('button')?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeRef.current();
      }
      if (event.key !== 'Tab') return;
      const focusables = [
        ...element!.querySelectorAll<HTMLElement>(
          'button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],summary,[tabindex="0"]',
        ),
      ].filter((control) => control.getClientRects().length > 0);
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      }
      if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener('keydown', keydown);
    return () => {
      document.removeEventListener('keydown', keydown);
      // The table removes its inert attribute in the parent's effect on close.
      queueMicrotask(() => {
        if (!ref.current?.isConnected && before?.isConnected) before.focus();
      });
    };
  }, []);
  return (
    <div
      className="modal-shade"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`dialog ${wide ? 'dialog-wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        ref={ref}
      >
        <header className="dialog-header">
          <h2>{title}</h2>
          <button className="icon-button" onClick={onClose} aria-label="Close dialog">
            <X size={20} />
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}

function CardFace({
  card,
  className = '',
  children,
}: {
  card: Card;
  className?: string;
  children?: ReactNode;
}) {
  const rank = cardRank(card);
  const face = rank === 14 ? 'A' : rank === 13 ? 'K' : rank === 12 ? 'Q' : rank === 11 ? 'J' : `${rank}`;
  const suit = cardSuit(card);
  return (
    <span className={`card-face ${suit === 'H' || suit === 'D' ? 'red-card' : ''} ${className}`}>
      <span className="card-corner">
        <b>{face}</b>
        <span>{suitSymbols[suit]}</span>
      </span>
      <span className="card-pip">{suitSymbols[suit]}</span>
      <span className="card-corner card-corner-bottom">
        <b>{face}</b>
        <span>{suitSymbols[suit]}</span>
      </span>
      {children}
    </span>
  );
}

function Player({ seat, game, active }: { seat: Seat; game: GameView; active: boolean }) {
  const partner = game.mode === 'spades-partners' && seat === 2;
  return (
    <div className={`player player-${seat} ${active ? 'player-active' : ''}`}>
      <div className={`avatar avatar-${seat}`}>
        <span>{names[seat][0]}</span>
        {partner && (
          <span className="partner-dot" title="Your partner">
            <Check size={10} />
          </span>
        )}
      </div>
      <div className="player-info">
        <div className="player-name">
          {names[seat]} {partner && <span className="partner-label">Partner</span>}
        </div>
        <PlayerCount seat={seat} game={game} />
      </div>
      {active && <span className="turn-dot" aria-label="Current player" />}
    </div>
  );
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
    </span>
  );
}

function LastTrick({ game }: { game: GameView }) {
  const last = game.history[game.history.length - 1];
  if (!last) return null;
  return (
    <aside className="last-trick" aria-label="Last trick">
      <span className="last-trick-label" aria-hidden="true">
        Last trick
      </span>
      <div className="last-trick-layout">
        {last.plays.map((play) => (
          <div
            key={play.seat}
            className={`last-trick-card last-trick-seat-${play.seat} ${last.winner === play.seat ? 'last-trick-winner' : ''}`}
            role="img"
            aria-label={`${names[play.seat]}: ${cardLabel(play.card)}${last.winner === play.seat ? ', won the trick' : ''}`}
          >
            <CardFace card={play.card} />
            {last.winner === play.seat && <Check className="last-trick-check" size={10} aria-hidden="true" />}
          </div>
        ))}
      </div>
    </aside>
  );
}

export default function App() {
  const [route, setRoute] = useState(window.location.hash);
  useEffect(() => {
    const update = () => setRoute(window.location.hash);
    window.addEventListener('hashchange', update);
    return () => window.removeEventListener('hashchange', update);
  }, []);
  if (route === '#demo') return <DemoPage />;
  if (route === '#account') return <AccountPage onRefresh={() => Promise.resolve()} />;
  return <LiveTable />;
}

function LiveTable() {
  const controller = useSession();
  if (!controller.session)
    return (
      <main className="account-page">
        <h1>Tricks Coach</h1>
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
  const { coachMode, gameSpeed } = session.preferences;
  const stats = session.stats;
  const [selected, setSelected] = useState<Card[]>([]);
  const [bid, setBid] = useState(3);
  const [hint, setHint] = useState<HintLevel>(0);
  const [advice, setAdvice] = useState<AdviceView | null>(null);
  const [advicePending, setAdvicePending] = useState(false);
  const [unlockLevel, setUnlockLevel] = useState<1 | 2 | 3 | null>(null);
  const [notes, setNotes] = useState<NotesView | null>(null);
  const [notesUnlock, setNotesUnlock] = useState(false);
  const lastNudge = useRef({ hand: '', trick: 0 });
  const [modal, setModal] = useState<Modal>('pause');
  const [newMode, setNewMode] = useState<Mode | null>(null);
  const [toast, setToast] = useState('');
  const [showRecap, setShowRecap] = useState(true);
  const [pageVisible, setPageVisible] = useState(!document.hidden);
  const lastCardTap = useRef<{ card: Card; turn: string; at: number } | null>(null);
  const lastPlayedTurn = useRef('');
  const shellRef = useRef<HTMLDivElement>(null);
  const viewport = useViewport();
  const handEnd = game.phase === 'hand-end' || game.phase === 'match-end';
  const dialogOpen = !!modal || (handEnd && showRecap);
  const paused =
    dialogOpen ||
    viewport.portraitPhone ||
    !pageVisible ||
    !session.access.canPlay ||
    session.controlLeaseToken === 'view-only';
  const turnKey = session.decisionId;
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
  const matchWinner = game.handResult?.winner;
  const winnerLabel =
    matchWinner === undefined
      ? 'Game complete'
      : isTeam
        ? matchWinner % 2 === 0
          ? 'You & Maya win'
          : 'Leo & Theo win'
        : `${names[matchWinner]} ${matchWinner === 0 ? 'win' : 'wins'}`;
  const closeModal = async () => {
    try {
      await controller.refresh();
      setModal(null);
      setNewMode(null);
    } catch {
      setToast('Could not reconnect. Your table is paused.');
    }
  };
  const setCoachMode = (value: typeof coachMode) =>
    void controller.preferences({ coachMode: value, gameSpeed });
  const setGameSpeed = (value: typeof gameSpeed) =>
    void controller.preferences({ coachMode, gameSpeed: value });
  useEffect(() => {
    if (shellRef.current) {
      if (dialogOpen) shellRef.current.setAttribute('inert', '');
      else shellRef.current.removeAttribute('inert');
    }
  }, [dialogOpen, viewport.portraitPhone]);
  useEffect(() => {
    document.title = `${modeNames[game.mode]} — Tricks Coach`;
  }, [game.mode]);
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) setPageVisible(false);
      else
        void controller
          .refresh()
          .then(() => setPageVisible(true))
          .catch(() => setToast('Reconnect to resume.'));
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
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
    lastCardTap.current = null;
    setHint(0);
    setAdvice(null);
    setAdvicePending(false);
    setUnlockLevel(null);
  }, [turnKey]);
  useEffect(() => {
    if (paused || handEnd || game.phase === 'pass' || myTurn || controller.busy || controller.error) return;
    let cancelled = false;
    let timer: number | undefined;
    void controller
      .refresh()
      .then((fresh) => {
        if (cancelled || fresh.decisionId !== turnKey) return;
        timer = window.setTimeout(
          () => {
            if (game.phase === 'trick-end') {
              void controller.mutate('/api/session/advance', { kind: 'collect-trick' });
              return;
            }
            const envelope = controller.envelope();
            void api('/api/session/prepare', 'PrepareView', envelope)
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
          (game.phase === 'trick-end' ? 2100 : 900) / gameSpeed,
        );
      })
      .catch(() => {
        if (!cancelled) setToast('Reconnect to resume play.');
      });
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [turnKey, paused, gameSpeed, controller.busy, controller.error]);
  useEffect(() => {
    if (
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
    if (!session.access.handUnlocked && session.access.remainingHands !== null && !unlock) {
      setUnlockLevel(level);
      return;
    }
    const decision = turnKey;
    setAdvicePending(true);
    setHint(level);
    try {
      const result = await (unlock ? controller.unlock(level) : controller.advice(level));
      if (decisionRef.current !== decision) return;
      setAdvice(result);
      setUnlockLevel(null);
      void api('/api/session/exposures', 'AcceptedView', {
        gameId: game.id,
        decisionId: decision,
        eventId: crypto.randomUUID(),
        displayedLevel: level,
      }).catch(() => undefined);
    } catch (e) {
      if (decisionRef.current === decision) {
        setHint(0);
        setToast(e instanceof Error ? e.message : 'Suggestions unavailable. You can keep playing.');
      }
    } finally {
      if (decisionRef.current === decision) setAdvicePending(false);
    }
  }
  async function loadNotes(unlock = false) {
    try {
      if (unlock || !session.access.handUnlocked) await controller.unlock(1);
      setNotes(await api('/api/session/notes', 'NotesView', controller.envelope()));
      setNotesUnlock(false);
    } catch (e) {
      setToast(e instanceof Error ? e.message : 'Notes unavailable.');
    }
  }
  function openNotes() {
    setModal('notes');
    setNotes(null);
    const needsConfirm = !session.access.handUnlocked && session.access.remainingHands !== null;
    setNotesUnlock(needsConfirm);
    if (!needsConfirm) void loadNotes();
  }
  async function commit() {
    if (paused || controller.busy) return;
    const ok =
      game.phase === 'pass' && selected.length === 3
        ? await controller.action({ kind: 'pass', cards: selected })
        : game.phase === 'bid' && myTurn
          ? await controller.action({ kind: 'bid', bid })
          : false;
    if (ok) setSelected([]);
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
    if (await controller.action({ kind: 'play', card })) {
      setSelected([]);
      lastCardTap.current = null;
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
  function activateCard(card: Card, detail: number, at: number) {
    if (detail === 0 && myTurn && game.phase === 'play') {
      void playChosenCard(card);
      return;
    }
    const previous = lastCardTap.current;
    const double =
      detail > 0 &&
      previous?.card === card &&
      previous.turn === turnKey &&
      (detail === 2 || at - previous.at < 350);
    lastCardTap.current = detail > 0 && !double ? { card, turn: turnKey, at } : null;
    if (double && myTurn && game.phase === 'play') void playChosenCard(card);
    else chooseCard(card, double);
  }
  async function startGame(mode: Mode) {
    if (await controller.newGame(mode)) {
      setSelected([]);
      setHint(0);
      setShowRecap(true);
      setModal(null);
      setNewMode(null);
    }
  }
  async function continueHand() {
    if (await controller.mutate('/api/session/next-hand')) {
      setShowRecap(true);
      setHint(0);
    }
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
  const getMemory = () => notes?.memory ?? [];
  return (
    <>
      {viewport.portraitPhone ? (
        <div className="rotate-gate" role="alert">
          <div className="rotate-device">
            <RotateCw size={38} strokeWidth={1.4} />
          </div>
          <span className="wordmark">
            Tricks Coach<span>♠</span>
          </span>
          <h1>
            Turn your phone
            <br />
            sideways to play.
          </h1>
          <a className="text-button" href="#account">
            Account and subscription
          </a>
          <a className="text-button" href="#demo">
            Example game
          </a>
        </div>
      ) : (
        <div className="app-shell" ref={shellRef} aria-hidden={dialogOpen ? true : undefined}>
          <header className="topbar">
            <a
              className="brand"
              href="#"
              onClick={(e) => {
                e.preventDefault();
                setModal('games');
              }}
              aria-label="Tricks Coach choose game"
            >
              <span className="wordmark">
                Tricks Coach<span>♠</span>
              </span>
            </a>
            <button className="game-switch" onClick={() => setModal('games')} aria-label="Choose game">
              <span className={isHearts ? 'heart-symbol' : ''}>{isHearts ? '♥' : '♠'}</span>
              <b>{modeNames[game.mode]}</b>
              <span className="game-variant">{isTeam ? 'Partners' : 'Solo'}</span>
              <ChevronDown size={16} />
            </button>
            <nav className="top-actions" aria-label="Table controls">
              <a className="icon-button" href="#account" aria-label="Account">
                ◎
              </a>
              <button
                className="icon-button"
                aria-label="Review current game"
                onClick={() => setModal('review')}
              >
                <RotateCcw size={18} />
              </button>
              <button className="text-button notes-button" aria-label="Table notes" onClick={openNotes}>
                <Eye size={18} />
                <span>Table notes</span>
              </button>
              <button className="icon-button" aria-label="Settings" onClick={() => setModal('settings')}>
                <Settings2 size={19} />
              </button>
              <button className="icon-button" aria-label="Pause game" onClick={() => setModal('pause')}>
                <Pause size={18} />
              </button>
            </nav>
          </header>

          <main className="game-shell">
            <section className="score-strip" aria-label="Game score">
              <div className="hand-number">
                <span className="status-light" /> Hand {game.handNumber}
                <span className="hand-divider">/</span>
                <span className="trick-number">
                  Trick{' '}
                  {Math.max(1, Math.min(13, game.history.length + (game.phase === 'trick-end' ? 0 : 1)))} of
                  13
                </span>
              </div>
              <div className="scoreboard">
                {(isTeam ? [0, 1] : [0, 1, 2, 3]).map((seat) => (
                  <div className={`score-item ${seat === 0 ? 'your-score' : ''}`} key={seat}>
                    <span>{isTeam ? (seat === 0 ? 'You & Maya' : 'Leo & Theo') : names[seat]}</span>
                    <b>{game.scores[seat]}</b>
                    {!isHearts && <small className="bag-count">{game.bags[seat]} bags</small>}
                  </div>
                ))}
                <span className="target-score">{isHearts ? 'Low score wins' : 'Play to 500'}</span>
              </div>
            </section>

            <div className="play-space">
              <section className="table-zone" aria-label="Card table">
                <div className="table-felt">
                  <div className="table-line" />
                  <span className="table-brand">Tricks Coach</span>
                </div>
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
                <div
                  className={`trick-area ${activeHint > 0 && advice?.highlightSuit ? 'evidence-active' : ''}`}
                >
                  {game.phase === 'pass' ? (
                    <div className="table-prompt">
                      <div className="pass-illustration">
                        <span>♥</span>
                        <ArrowRight size={26} />
                        <span>♠</span>
                      </div>
                      <h2>Pass three cards {game.passDirection}</h2>
                    </div>
                  ) : game.phase === 'bid' ? (
                    <div className="table-prompt bidding-prompt">
                      <span className="prompt-icon">
                        <Flag size={23} />
                      </span>
                      <h2>{myTurn ? 'Your bid' : 'Bidding'}</h2>
                      {myTurn && (
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
                          <button
                            className={`nil-button ${bid === 0 ? 'active' : ''}`}
                            onClick={() => setBid(0)}
                          >
                            Nil
                          </button>
                        </div>
                      )}
                    </div>
                  ) : handEnd ? (
                    <div className="table-prompt">
                      <span className="prompt-icon">
                        <Flag size={26} />
                      </span>
                      <h2>{game.phase === 'match-end' ? 'Game complete' : 'Hand complete'}</h2>
                      <button className="table-continue" onClick={() => setShowRecap(true)}>
                        View hand recap <ArrowUpRight size={16} />
                      </button>
                    </div>
                  ) : (
                    <>
                      {([2, 1, 3, 0] as Seat[]).map((seat) => {
                        const played = game.trick.find((item) => item.seat === seat);
                        const relevant =
                          activeHint > 0 &&
                          (isTeam && currentWinner === 2 ? seat === 2 : seat === game.trick[0]?.seat);
                        return (
                          <div
                            key={seat}
                            className={`trick-slot trick-slot-${seat} ${played && currentWinner === seat ? 'winning-card' : ''} ${relevant ? 'cue-card' : ''}`}
                          >
                            {played ? (
                              <>
                                <CardFace card={played.card} />
                                <span className="played-by">
                                  {names[seat]}
                                  {currentWinner === seat && (
                                    <span className="winner-mark" title="Currently winning">
                                      ●
                                    </span>
                                  )}
                                </span>
                              </>
                            ) : (
                              <span className="empty-card" />
                            )}
                          </div>
                        );
                      })}
                    </>
                  )}
                </div>
                <LastTrick game={game} />
              </section>

              <aside className={`coach-panel ${activeHint > 0 ? 'coach-open' : ''}`} aria-label="Your coach">
                <div className="coach-heading">
                  <div className="coach-mark">
                    <Sparkles size={20} />
                  </div>
                  <div>
                    <h2>Coach</h2>
                  </div>
                  <button
                    className="icon-button coach-settings"
                    aria-label="Adjust coach"
                    onClick={() => setModal('settings')}
                  >
                    <Settings2 size={16} />
                  </button>
                </div>
                <div className="coach-content" aria-live="polite">
                  {advicePending && <p>Considering the position…</p>}
                  {unlockLevel && (
                    <div>
                      <p>Unlock all help for this hand.</p>
                      <button className="hint-button" onClick={() => void showHint(unlockLevel, true)}>
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
                      <button className="hint-button" onClick={() => showHint(1)}>
                        <Focus size={17} />
                        Give me a cue
                        <ArrowUpRight size={16} />
                      </button>
                    ) : (
                      <>
                        <button
                          className="hint-button"
                          onClick={() => showHint(activeHint === 1 ? 2 : 3)}
                          disabled={activeHint === 3}
                        >
                          {activeHint === 1
                            ? 'More context'
                            : activeHint === 2
                              ? 'Suggest a move'
                              : 'Suggestion shown'}
                          {activeHint < 3 && <ChevronRight size={15} />}
                        </button>
                        {activeHint === 1 && (
                          <button className="subtle-button" onClick={() => showHint(3)}>
                            Suggest a move
                          </button>
                        )}
                      </>
                    )
                  ) : null}
                </div>
              </aside>
            </div>

            <section className="hand-section" aria-label="Your hand">
              <div className="hand-toolbar">
                <div className={`you-label ${canDecide ? 'you-active' : ''}`}>
                  <span className="you-avatar">Y</span>
                  <b>You</b>
                  <PlayerCount seat={0} game={game} />
                  {canDecide && <span className="your-turn-mark" aria-hidden="true" />}
                </div>
                <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
                  {taskText}
                </div>
                <div className="hand-action">
                  {handEnd ? (
                    <button
                      className="primary-button"
                      disabled={controller.busy}
                      onClick={() => (game.phase === 'match-end' ? startGame(game.mode) : continueHand())}
                    >
                      Play again
                      <RotateCcw size={16} />
                    </button>
                  ) : game.phase === 'pass' || game.phase === 'bid' ? (
                    <button className="primary-button play-button" disabled={!commitEnabled} onClick={commit}>
                      {commitLabel}
                      <ArrowRight size={16} />
                    </button>
                  ) : null}
                </div>
              </div>
              <div className="hand-cards" style={{ '--cards': game.hand.length } as CSSProperties}>
                {game.hand.map((card, index) => {
                  const playable = !myTurn || game.phase === 'bid' || legal.includes(card);
                  const received =
                    isHearts &&
                    game.received.includes(card) &&
                    game.history.length === 0 &&
                    !game.trick.some((play) => play.seat === 0);
                  const recommended =
                    activeHint === 3 && (advice?.card === card || advice?.pass?.includes(card));
                  return (
                    <button
                      key={card}
                      className={`hand-card ${selected.includes(card) ? 'selected' : ''} ${!playable ? 'unplayable' : ''} ${recommended ? 'recommended' : ''} ${received ? 'received-card' : ''} ${index > 0 && cardSuit(card) !== cardSuit(game.hand[index - 1]) ? 'suit-start' : ''}`}
                      disabled={paused || handEnd || game.phase === 'bid' || !playable}
                      aria-disabled={!playable || undefined}
                      aria-label={`${cardLabel(card)}${received ? ', received in pass' : ''}${!playable ? ', unavailable this turn' : ''}${recommended ? ', coach suggestion' : ''}`}
                      aria-pressed={selected.includes(card)}
                      aria-describedby="card-controls"
                      aria-keyshortcuts="Enter"
                      onClick={(event) => activateCard(card, event.detail, event.timeStamp)}
                      onKeyDown={(event) => {
                        if (event.key === ' ') {
                          event.preventDefault();
                          if (!event.repeat) chooseCard(card);
                        }
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          if (!event.repeat) {
                            if (myTurn && game.phase === 'play') playChosenCard(card);
                            else chooseCard(card, true);
                          }
                        }
                      }}
                    >
                      <CardFace card={card} />
                      {!playable && <LockKeyhole className="unavailable-mark" size={12} aria-hidden="true" />}
                      {selected.includes(card) && (
                        <span className="selection-mark">
                          <Check size={12} />
                        </span>
                      )}
                      {recommended && (
                        <span className="recommendation-mark">
                          <Sparkles size={11} />
                        </span>
                      )}
                      {received && <span className="received-mark">New</span>}
                    </button>
                  );
                })}
              </div>
              <span id="card-controls" className="sr-only">
                Double-click or double-tap to play on your turn, or prepare a card while waiting. A prepared
                card never plays automatically. Keyboard: Space selects, Enter plays. Confirm three-card
                passes separately.
              </span>
            </section>
          </main>
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
      )}

      {!viewport.portraitPhone && modal === 'games' && (
        <Dialog title="Choose game" onClose={closeModal} wide>
          <p className="dialog-intro">You and three computer players.</p>
          <div className="game-options">
            {(['hearts', 'spades-solo', 'spades-partners'] as Mode[]).map((mode) => (
              <button
                key={mode}
                className={`game-option ${newMode === mode ? 'chosen' : ''}`}
                onClick={() => setNewMode(mode)}
              >
                <div className={`game-art game-art-${mode}`}>
                  <span>{mode === 'hearts' ? '♥' : '♠'}</span>
                  {mode === 'spades-partners' && <span>♠</span>}
                </div>
                <h3>{modeNames[mode]}</h3>
                <span className="mode-label">{mode === 'spades-partners' ? 'Partners' : 'Solo'}</span>
                <span className="option-check">
                  {newMode === mode ? <Check size={16} /> : <ArrowUpRight size={16} />}
                </span>
              </button>
            ))}
          </div>
          <div className="dialog-bottom">
            <p>{newMode ? 'Replaces your current game.' : ''}</p>
            <button
              className="primary-button"
              disabled={!newMode}
              onClick={() => newMode && startGame(newMode)}
            >
              Start game <ArrowRight size={16} />
            </button>
          </div>
        </Dialog>
      )}
      {!viewport.portraitPhone && modal === 'settings' && (
        <Dialog title="Settings" onClose={closeModal}>
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
          <fieldset className="speed-settings">
            <legend>Game speed</legend>
            <div className="speed-options">
              {([1, 1.2, 1.4] as const).map((speed) => (
                <button
                  key={speed}
                  className={gameSpeed === speed ? 'chosen' : ''}
                  aria-pressed={gameSpeed === speed}
                  onClick={() => setGameSpeed(speed)}
                >
                  {speed}×
                </button>
              ))}
            </div>
          </fieldset>
          <button className="primary-button full-button" onClick={closeModal}>
            Done
          </button>
        </Dialog>
      )}
      {!viewport.portraitPhone && modal === 'notes' && (
        <Dialog title="Table notes" onClose={closeModal} wide>
          <>
            {notesUnlock && (
              <div className="fixture-notice">
                <p>Unlock notes and all help for this hand.</p>
                <button className="hint-button" onClick={() => void loadNotes(true)}>
                  Use coached hand
                </button>
                <button className="text-button" onClick={closeModal}>
                  Not now
                </button>
              </div>
            )}
            <div className="notes-layout">
              <section>
                <h3>Public cards played</h3>
                <div className="suit-memory">
                  {getMemory().map((row) => (
                    <div className="suit-memory-row" key={row.suit}>
                      <span
                        className={`memory-suit ${row.suit === 'H' || row.suit === 'D' ? 'heart-symbol' : ''}`}
                      >
                        {suitSymbols[row.suit]}
                      </span>
                      <div className="suit-track">
                        <span style={{ width: `${(row.played / 13) * 100}%` }} />
                      </div>
                      <b>
                        {row.played}
                        <span> / 13</span>
                      </b>
                      <small>{row.remaining} unplayed</small>
                    </div>
                  ))}
                </div>
                <details>
                  <summary>Played cards</summary>
                  {getMemory().map((row) => (
                    <p key={row.suit}>
                      {row.playedCards?.map(cardLabel).join(', ') ||
                        `${row.played} cards played in ${row.suit}`}
                    </p>
                  ))}
                </details>
              </section>
              <section>
                <h3 className="notes-subtitle">Known voids</h3>
                <div className="void-list">
                  {getMemory().some((row) => row.voidSeats.length) ? (
                    getMemory()
                      .filter((row) => row.voidSeats.length)
                      .map((row) => (
                        <span key={row.suit}>
                          {row.voidSeats.map((seat) => names[seat]).join(', ')}{' '}
                          <b>no {suitSymbols[row.suit]}</b>
                        </span>
                      ))
                  ) : (
                    <p className="small-copy">None revealed yet.</p>
                  )}
                </div>
                {isHearts && (
                  <details className="notes-details">
                    <summary>Your pass · private</summary>
                    <p className="small-copy">
                      Sent: {notes?.outgoing.map(cardLabel).join(', ') || 'None'}
                      <br />
                      Received: {notes?.received.map(cardLabel).join(', ') || 'None'}
                    </p>
                  </details>
                )}
                <details className="table-rules">
                  <summary>Table rules</summary>
                  <p>
                    {isHearts
                      ? 'Pass left, right, across, then hold. Hearts: 1 point. Queen of spades: 13. Shoot the moon: 26 to everyone else. Game ends at 100.'
                      : `${isTeam ? 'You and Maya share a contract. ' : 'Each player has their own contract. '}Nil: ±100. Ten bags cost 100 points. No blind Nil. Play to 500.`}
                  </p>
                </details>
              </section>
            </div>
          </>
        </Dialog>
      )}
      {!viewport.portraitPhone && modal === 'pause' && (
        <Dialog title="Paused" onClose={closeModal}>
          <div className="pause-art">
            <Pause size={34} />
          </div>
          <button className="primary-button full-button" onClick={closeModal}>
            <Play size={17} />
            Resume
          </button>
          <button className="text-button full-button" onClick={() => setModal('games')}>
            <RotateCcw size={17} />
            Choose another game
          </button>
        </Dialog>
      )}

      {!viewport.portraitPhone && !modal && handEnd && showRecap && (
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
                    {isTeam ? 'Leo & Theo' : names[seat]}
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
                <p>Turns with cues or table notes open. No skill rating.</p>
              </details>
            </div>
          </div>
          <div className="dialog-bottom">
            <button className="text-button" onClick={() => setShowRecap(false)}>
              <Eye size={16} />
              Back to table
            </button>
            <button
              className="primary-button"
              disabled={controller.busy}
              onClick={() => (game.phase === 'match-end' ? startGame(game.mode) : continueHand())}
            >
              Play again
              <RotateCcw size={16} />
            </button>
          </div>
        </Dialog>
      )}
      {modal === 'review' && (
        <Dialog title="Review current game" onClose={closeModal} wide>
          <ReviewPanel session={session} envelope={controller.envelope} />
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
