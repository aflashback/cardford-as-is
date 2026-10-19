import type { ReactNode } from 'react';
import { ChevronDown, Layers, Menu, Pause, Trophy } from 'lucide-react';

export type RallyHeaderProps = {
  game: string;
  variant: string;
  scores: readonly { label: string; total: number }[];
  onGame: () => void;
  onScores: () => void;
  onPause: () => void;
  onMenu: () => void;
  status?: ReactNode;
};

export function RallyHeader({ game, variant, scores, onGame, onScores, onPause, onMenu, status }: RallyHeaderProps) {
  return <header className="topbar rally-header">
    <button className="rally-logo icon-button" onClick={onGame} aria-label="CardFord · choose game" title="Choose game">
      <img src="/brand/cardford-symbol.svg" alt="" />
    </button>
    <button className="game-switch rally-game-switch" onClick={onGame} aria-label={`Choose game: ${game} ${variant}`} title={`${game} · ${variant}`}>
      <Layers className="rally-compact-icon" size={22} />
      <span className="rally-game-title"><b>{game}</b><small>{variant}</small></span>
      <ChevronDown className="rally-game-chevron" size={16} />
    </button>
    <button className="rally-score-button" onClick={onScores} aria-label={`Scores: ${scores.map(score => `${score.label} ${score.total}`).join(', ')}`} title="Scores">
      <Trophy className="rally-compact-icon" size={22} />
      <span className="rally-score-summary">{scores.map(score => <span className="rally-score" key={score.label}><b>{score.total}</b><small>{score.label}</small></span>)}</span>
    </button>
    <nav className="top-actions" aria-label="Table controls">
      <button className="icon-button" onClick={onPause} aria-label="Pause game" title="Pause"><Pause size={20} /></button>
      <button className="icon-button rally-menu-button" onClick={onMenu} aria-label="Game menu" title="Menu"><Menu size={22} /></button>
    </nav>
    {status && <div className="rally-connection-status" role="status">{status}</div>}
  </header>;
}
