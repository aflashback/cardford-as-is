import type { ClientSession, ClientTrixSession } from './sessionModel.ts';
import { completedTrickDelay, playbackDelay } from '../table/playback.ts';

type Model = ClientSession | ClientTrixSession;
type Frame = { model: Model; completed: boolean; synthetic: boolean };
export type PresentationClock = {
  now(): number;
  setTimeout(callback: () => void, ms: number): ReturnType<typeof setTimeout>;
  clearTimeout(timer: ReturnType<typeof setTimeout>): void;
};
const browserClock: PresentationClock = {
  now: () => performance.now(), setTimeout: (callback, ms) => setTimeout(callback, ms),
  clearTimeout: timer => clearTimeout(timer),
};

/** A missing push can be recovered from public completed-trick history. These
 * display-only frames never replace the authoritative session or its commands. */
function framesBetween(before: Model, next: Model): Frame[] {
  const frames: Frame[] = [];
  if ('gameId' in before.game && 'gameId' in next.game &&
      before.game.observation.dealNumber === next.game.observation.dealNumber) {
    const previous = before.game.observation.tricks[before.game.observation.tricks.length - 1]?.number ?? 0;
    const observation = next.game.observation;
    const unseen = observation.tricks.filter(trick => trick.number > previous);
    for (const trick of unseen) {
      const exact = trick === observation.tricks[observation.tricks.length - 1] && observation.trick.length === 0;
      if (exact) frames.push({model: next, completed: true, synthetic: false});
      else frames.push({completed: true, synthetic: true, model: {...next,
        candidates: [], game: {...next.game, observation: {...observation,
          phase: 'playing', turn: trick.winner, trick: [],
          tricks: observation.tricks.filter(item => item.number <= trick.number),
        }},
      } as ClientTrixSession});
    }
  } else if (!('gameId' in before.game) && !('gameId' in next.game) &&
      before.game.handNumber === next.game.handNumber) {
    for (let index = before.game.history.length; index < next.game.history.length; index++) {
      const trick = next.game.history[index];
      const exact = index === next.game.history.length - 1 && next.game.phase === 'trick-end';
      frames.push(exact ? {model: next, completed: true, synthetic: false} : {
        completed: true, synthetic: true, model: {...next, game: {...next.game,
          phase: 'trick-end', trick: trick.plays, history: next.game.history.slice(0, index + 1),
          currentWinner: trick.winner, turn: trick.winner, legalActions: [], handResult: null,
        }} as ClientSession,
      });
    }
  }
  if (!frames.some(frame => frame.model === next)) frames.push({model: next, completed: false, synthetic: false});
  return frames;
}

/** Dwell belongs to the outgoing, painted frame. Network updates, snapshots and
 * receipts may advance authoritative state, but cannot skip a completion here. */
export class PresentationQueue {
  private latest: Model | null = null;
  private active: Frame | null = null;
  private pending: Frame[] = [];
  private running = false;
  private acknowledged = false;
  private remaining = 0;
  private started = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private show: (model: Model | null) => void;
  private clock: PresentationClock;
  private holding = false;
  private onHolding: (holding: boolean) => void;
  constructor(show: (model: Model | null) => void, clock: PresentationClock = browserClock,
    onHolding: (holding: boolean) => void = () => undefined) {
    this.show = show; this.clock = clock; this.onHolding = onHolding;
  }

  reset(model: Model | null) {
    this.stopTimer(); this.pending = []; this.latest = model;
    this.active = null; this.acknowledged = false; this.remaining = 0;
    this.setHolding(false);
    // Initial Trix history is a baseline, not an instruction to replay old tricks.
    if (model) this.present({model, completed: !('gameId' in model.game) && model.game.phase === 'trick-end', synthetic: false});
    else this.show(null);
  }
  accept(model: Model, reset = false) {
    if (reset || !this.latest || this.latest.game.id !== model.game.id) {this.reset(model); return;}
    if (model.revision < this.latest.revision) return;
    if (model.revision === this.latest.revision && model.decisionId === this.latest.decisionId) {
      this.latest = model;
      const tail = this.pending[this.pending.length - 1];
      if (tail && !tail.synthetic && tail.model.revision === model.revision) tail.model = model;
      else if (this.active && !this.active.synthetic && this.active.model.revision === model.revision) {
        this.active.model = model; this.show(model);
      }
      return;
    }
    this.pending.push(...framesBetween(this.latest, model)); this.latest = model;
    // Bound ordinary catch-up traffic without ever discarding a four-card frame.
    if (this.pending.length > 32) this.pending = this.pending.filter((frame, index) => frame.completed || index === this.pending.length - 1);
    this.drain();
  }
  notePresented(revision: number) {
    if (!this.active || this.active.model.revision !== revision || this.acknowledged) return;
    this.acknowledged = true; this.drain();
  }
  isHolding() { return this.holding; }
  setRunning(running: boolean) {
    if (this.running === running) return;
    this.stopTimer(); this.running = running; this.drain();
  }
  /** Accepted human moves may skip ordinary lag, never a completed-trick barrier. */
  expedite(revision: number) {
    if (this.active?.completed && (!this.acknowledged || this.remaining > 0)) return;
    const target = this.pending.findIndex(frame => frame.completed || frame.model.revision >= revision);
    if (target < 0) return;
    const next = this.pending[target]; this.pending.splice(0, target + 1); this.present(next);
  }
  dispose() {this.stopTimer();}
  private present(frame: Frame) {
    this.stopTimer(); this.active = frame; this.acknowledged = false;
    this.remaining = frame.completed ? completedTrickDelay(frame.model.preferences.gameSpeed) : playbackDelay('turn', frame.model.preferences.gameSpeed);
    this.setHolding(frame.completed);
    this.show(frame.model);
  }
  private setHolding(holding: boolean) {
    if (this.holding === holding) return;
    this.holding = holding; this.onHolding(holding);
  }
  private stopTimer() {
    if (this.timer === null) return;
    this.clock.clearTimeout(this.timer); this.timer = null;
    this.remaining = Math.max(0, this.remaining - (this.clock.now() - this.started));
  }
  private drain() {
    if (!this.running || !this.active || !this.acknowledged || this.timer !== null) return;
    if (this.remaining <= 0) {
      this.setHolding(false);
      const next = this.pending.shift(); if (next) this.present(next);
      return;
    }
    this.started = this.clock.now();
    this.timer = this.clock.setTimeout(() => {
      this.timer = null; this.remaining = 0; this.drain();
    }, this.remaining);
  }
}
