import type { CSSProperties } from 'react';
import { Crown } from 'lucide-react';
import type { ReviewFrame, TrixReviewFrame, Seat } from '../../shared/contracts';
import { CardFace, PlayerBadge, RemainingCards, TrickCards, LastTrickCards, playerNames } from '../table/CardPrimitives';
import { useResponsiveTableFit, type TablePresentationPhase } from '../table/useResponsiveTableFit';
import { LayoutBoard } from '../games/trix/LayoutBoard';
import { TwoAnnouncements } from '../games/trix/TwoAnnouncements';
import { seatRequestScore, requestLabel } from '../games/trix/adapter';
import { cardLabel, cardSuit } from '../api/display';
import { publicTrickLayers } from '../api/tablePresentation';
import './rally-replay.css';

const isTrixFrame = (frame: ReviewFrame): frame is TrixReviewFrame => 'gameId' in frame.game && frame.game.gameId === 'trix';
const seats: readonly Seat[] = [0, 1, 2, 3];

/** A supplied saved observation only. No session, transport, gestures or animation.
 * The parent owns seek/play controls and pauses the still-mounted live table. */
export function RallyReplayTable({ frame, caption }: { frame: ReviewFrame; caption?: string }) {
  const trix = isTrixFrame(frame) ? frame.game.observation : undefined;
  const legacy = !isTrixFrame(frame) ? frame.game : undefined;
  const game = trix ? 'trix' : legacy!.mode === 'hearts' ? 'hearts' : 'spades';
  const phase: TablePresentationPhase = trix
    ? trix.phase === 'layout' || (trix.phase === 'round-complete' && trix.request === 'trix') ? 'jacks'
      : trix.phase === 'playing' ? 'play' : trix.phase === 'declare-doubles' ? 'double'
        : trix.phase === 'choose-request' ? 'request' : 'results'
    : legacy!.phase === 'play' || legacy!.phase === 'trick-end' ? 'play'
      : legacy!.phase === 'bid' ? 'bid' : legacy!.phase === 'pass' ? 'pass' : 'results';
  const tableRef = useResponsiveTableFit({ game, phase, lastTrickVisible: phase === 'play' });
  const hand = trix?.hand ?? legacy!.hand, counts = trix?.handCounts ?? legacy!.handCounts;
  const turn = trix ? trix.turn : legacy!.turn;
  const actor = trix?.seat ?? 0;
  const partners = trix ? trix.variantId.endsWith('partners') : legacy!.mode === 'spades-partners';
  const plays = trix?.trick ?? legacy!.trick;
  const last = trix ? trix.tricks[trix.tricks.length - 1] : legacy!.history[legacy!.history.length - 1];
  // Trix has no currentWinner in this contract. Only the completed public last
  // trick supplies its winner; do not manufacture a confirmed winner for a frame.
  const winner = legacy?.currentWinner ?? null;
  const layers = publicTrickLayers(plays, winner, game === 'spades' ? 'S' : undefined);
  const selection = frame.action && (frame.action.kind === 'pass' || frame.action.kind === 'declare-doubles')
    ? (frame.action.cards ?? []).filter(card => hand.includes(card)) : [];
  const played = new Set(trix ? [...trix.tricks.flatMap(trick => trick.plays), ...trix.trick].map(play => play.card) : []);
  const announcement = (seat: Seat) => trix?.declarations.filter(item => item.seat === seat)
    .flatMap(item => item.cards).filter(card => !played.has(card));
  const label = phase === 'pass' ? `Pass ${legacy?.passDirection ?? ''}` : phase === 'bid' ? 'Bidding'
    : phase === 'double' ? 'Doubling' : phase === 'request' ? 'Request choice'
      : phase === 'results' ? 'Completed' : trix ? requestLabel(trix.request) : 'Saved trick';
  const playerDetail = (seat: Seat) => {
    const showScore = !trix || trix.request !== 'trix' || trix.phase === 'round-complete' || trix.phase === 'session-complete';
    if (!showScore && seat === actor) return null;
    return <span className="player-detail">
      {showScore && (trix ? seatRequestScore(trix, seat) : <>{legacy!.tricks[seat]}{game === 'spades' ? ` / ${legacy!.bids[seat] === null ? '—' : legacy!.bids[seat] === 0 ? 'Nil' : legacy!.bids[seat]}` : ''}</>)}
      {seat !== actor && <RemainingCards count={counts[seat]} />}
    </span>;
  };
  return <main className="game-shell rally-game-shell rally-replay-table" ref={tableRef}
    data-game={game} data-rally-phase={phase} aria-label="Saved decision table">
    <div className="play-space">
      <div className="table-stage">
        <section className="table-zone" aria-label="Saved four-player table">
          <div className="table-felt"><div className="table-line" /></div>
          {seats.map(seat => <PlayerBadge key={seat} seat={seat} active={turn === seat}
            partner={partners && seat === (actor + 2) % 4} cards={announcement(seat)}
            announcement={trix?.owner === seat ? <span className="trix-kingdom-owner" role="img" aria-label={`${playerNames[seat]}: kingdom owner`}><Crown size={13} aria-hidden="true" /></span> : undefined}
            cardAnnouncements={trix?.request === 'trix' && partners && trix.twoAnnouncements ? <TwoAnnouncements observation={trix} seat={seat} /> : undefined}>
            {playerDetail(seat)}
          </PlayerBadge>)}
          {phase === 'jacks' && trix ? <LayoutBoard board={trix.board} partners={partners} /> : phase === 'play'
            ? <div className="trick-area" aria-label="Saved public trick"><TrickCards plays={plays} winner={winner} layers={layers} /></div>
            : <div className="rally-replay-phase">{label}</div>}
        </section>
      </div>
      <div className="rally-last" hidden={phase !== 'play'}><LastTrickCards last={last} /></div>
    </div>
    <section className="hand-section" aria-label={`${actor === 0 ? 'Your' : playerNames[actor] + '’s'} saved hand`}>
      <div className="hand-cards" style={{ '--cards': hand.length } as CSSProperties}>
        {hand.map((card, index) => <span key={card} className={`hand-card ${selection.includes(card) ? 'selected' : ''} ${index > 0 && cardSuit(card) !== cardSuit(hand[index - 1]) ? 'suit-start' : ''}`}
          role="img" aria-label={`${cardLabel(card)}${selection.includes(card) ? ', selected in saved decision' : ''}`}>
          <CardFace card={card} />
        </span>)}
      </div>
    </section>
    <p className="sr-only" role="status" aria-live="polite">{caption ?? label}</p>
  </main>;
}
