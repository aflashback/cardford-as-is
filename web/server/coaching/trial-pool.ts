import { Worker } from 'node:worker_threads';
import { randomUUID } from 'node:crypto';
import type { SeatObservation } from '../observations/index.ts';
import type { GameAction } from '../game/index.ts';
import type { TrialResult } from './trials.ts';
interface Pending {
  id: string;
  observation: SeatObservation;
  alternative: GameAction;
  seed: number;
  policyVersion?: string;
  resolve: (result: TrialResult) => void;
  timer: NodeJS.Timeout;
}
interface Slot {
  worker: Worker;
  pending: Pending | null;
}
export class TrialPool {
  private slots: Slot[] = [];
  private queue: Pending[] = [];
  private closed = false;
  run(
    observation: SeatObservation,
    alternative: GameAction,
    seed: number,
    policyVersion?: string,
  ): Promise<TrialResult> {
    if (this.closed || this.queue.length >= 6)
      return Promise.resolve({
        status: 'unavailable',
        reason: 'Review capacity is busy. Try again shortly.',
      });
    if (!this.slots.length) for (let i = 0; i < 2; i++) this.slots.push(this.createSlot());
    return new Promise((resolve) => {
      const request: Pending = {
        id: randomUUID(),
        observation,
        alternative,
        seed,
        ...(policyVersion ? { policyVersion } : {}),
        resolve,
        timer: setTimeout(() => {
          this.queue = this.queue.filter((item) => item !== request);
          const slot = this.slots.find((s) => s.pending === request);
          if (slot) {
            slot.pending = null;
            void slot.worker.terminate();
            this.slots[this.slots.indexOf(slot)] = this.createSlot();
          }
          resolve({ status: 'unavailable', reason: 'The review time limit was reached.' });
          this.dispatch();
        }, 8000),
      };
      this.queue.push(request);
      this.dispatch();
    });
  }
  private createSlot(): Slot {
    const slot: Slot = { worker: new Worker(new URL('./trial-worker.ts', import.meta.url)), pending: null };
    slot.worker.on('message', (message: { id: string; result: TrialResult }) => {
      const item = slot.pending;
      if (!item || item.id !== message.id) return;
      clearTimeout(item.timer);
      slot.pending = null;
      item.resolve(message.result);
      slot.worker.unref();
      this.dispatch();
    });
    slot.worker.on('error', () => {
      const item = slot.pending;
      if (item) {
        clearTimeout(item.timer);
        slot.pending = null;
        item.resolve({ status: 'unavailable', reason: 'The review worker stopped. Retry the review.' });
      }
      if (!this.closed) {
        const index = this.slots.indexOf(slot);
        if (index >= 0) this.slots[index] = this.createSlot();
        this.dispatch();
      }
    });
    slot.worker.unref();
    return slot;
  }
  private dispatch() {
    if (this.closed) return;
    for (const slot of this.slots) {
      if (slot.pending || !this.queue.length) continue;
      const item = this.queue.shift()!;
      slot.pending = item;
      slot.worker.ref();
      slot.worker.postMessage({
        id: item.id,
        observation: item.observation,
        alternative: item.alternative,
        seed: item.seed,
        ...(item.policyVersion ? { policyVersion: item.policyVersion } : {}),
      });
    }
  }
  async close() {
    this.closed = true;
    for (const item of this.queue) {
      clearTimeout(item.timer);
      item.resolve({ status: 'unavailable', reason: 'Server stopped.' });
    }
    this.queue = [];
    await Promise.all(
      this.slots.map((slot) => {
        if (slot.pending) {
          clearTimeout(slot.pending.timer);
          slot.pending.resolve({ status: 'unavailable', reason: 'Server stopped.' });
        }
        return slot.worker.terminate();
      }),
    );
  }
}
