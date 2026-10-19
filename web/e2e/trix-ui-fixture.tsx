// Public-observation UI fixture. No server, concealed hands, rule reducer or production entry.
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/dm-sans';
import '@fontsource-variable/manrope';
import '../src/styles.css';
import { TrixTable, type TrixController } from '../src/games/trix/Table';
import '../src/table/table-layout.css';
import type { ClientTrixSession } from '../src/api/sessionModel';
import type { TrixCandidate } from '../src/games/trix/adapter';
import type { TrixObservation, Card } from '../shared/local-service.contracts';

export type FixtureCommand = { kind: string; candidateId?: string; path?: string; cards?: readonly Card[] };
export type TrixUIFixture = {
  commands: FixtureCommand[];
  update: (patch: Partial<TrixObservation>, candidates?: TrixCandidate[]) => void;
  speed: (speed: ClientTrixSession['preferences']['gameSpeed']) => void;
  slowRefresh: (slow: boolean) => void;
  slowPreparation: (slow: boolean) => void;
  deferAction: (defer: boolean) => void;
  finishAction: (accepted: boolean) => void;
  busy: (busy: boolean) => void;
};
declare global { interface Window { trixFixture: TrixUIFixture } }

const params = new URLSearchParams(location.search);
const variants = ['basic-solo', 'basic-partners', 'complex-solo', 'complex-partners'] as const;
const variant = variants.find(v => v === params.get('variant')) ?? 'basic-solo';
const phase = params.get('phase') === 'layout' ? 'layout' : params.get('phase') === 'declare-doubles' ? 'declare-doubles' : 'playing';
const request = phase === 'layout' ? 'trix' : params.get('request') === 'king' ? 'king' : variant.startsWith('complex') ? 'complex' : 'queens';
const hand: Card[] = ['C2', 'C6', 'CJ', 'CQ', 'D5', 'DJ', 'DQ', 'H2', 'HQ', 'HK', 'HA', 'S7', 'SQ'];
const totals: TrixObservation['totals'] = variant.endsWith('partners')
  ? [{ id: 'even', seats: [0, 2], total: 25 }, { id: 'odd', seats: [1, 3], total: -25 }]
  : [0, 1, 2, 3].map((seat, index) => ({ id: `seat-${seat}`, seats: [index as 0 | 1 | 2 | 3], total: index * 25 }));
const initial: TrixObservation = {
  id: 'trix-ui', gameId: 'trix', variantId: variant, seat: 0, phase, turn: 0,
  kingdom: 1, dealNumber: 1, owner: 0, request, remainingRequests: ['trix'],
  hand, handCounts: [13, 13, 13, 13], trick: [], tricks: [], declarations: [],
  board: ['C', 'D', 'H', 'S'].map(suit => ({ suit: suit as 'C' | 'D' | 'H' | 'S', low: 0, high: 0 })),
  finishOrder: [], passes: [], ledger: [], withheldBonuses: [], lastExternalLeader: [null, null, null, null],
  totals, requestTotals: totals.map(s => ({ ...s, total: 0 })), kingdomTotals: totals, winners: [],
};
const eligible = (['CQ', 'DQ', 'HQ', 'SQ', 'HK'] as const).filter(card => request === 'complex' || (request === 'king' ? card === 'HK' : card !== 'HK'));
function candidates(observation: TrixObservation): TrixCandidate[] {
  if (observation.turn !== 0) return [];
  if (observation.phase === 'declare-doubles') return Array.from({ length: 2 ** eligible.length }, (_, mask) => ({
    id: `double-${mask}`, public: { kind: 'declare-doubles', cards: eligible.filter((_, i) => mask & (1 << i)) },
  }));
  if (observation.phase === 'playing' || observation.phase === 'layout') return observation.hand.map(card => ({
    id: `card-${card}`, public: { kind: observation.phase === 'layout' ? 'layout-card' : 'play-card', card },
  }));
  return [];
}
const commands: FixtureCommand[] = [];
let slowRefresh = false, slowPreparation = false, deferAction = false;
let finishAction: ((accepted: boolean) => void) | undefined;
function Fixture() {
  const [busy, setBusy] = useState(false);
  const [session, setSession] = useState<ClientTrixSession>({
    game: { id: initial.id, gameId: 'trix', variantId: variant, seat: 0, observation: initial },
    candidates: candidates(initial), node: { kind: 'actor', actor: 0, phase },
    revision: 1, decisionId: 'fixture-1', preferences: { coachMode: 'asked', gameSpeed: 1 },
    access: { canPlay: true, canCoach: true, remainingHands: null, resetsAt: null, handUnlocked: true, canStartWork: true, localMock: true },
    source: 'code', controlLeaseToken: 'fixture-lease', stats: { decisions: 0, helped: 0, suggestions: 0 },
  });
  function update(patch: Partial<TrixObservation>, choices?: TrixCandidate[]) {
    setSession(previous => {
      const observation = { ...previous.game.observation, ...patch };
      return { ...previous, game: { ...previous.game, observation }, candidates: choices ?? candidates(observation),
        revision: previous.revision + 1, decisionId: `fixture-${previous.revision + 1}` };
    });
  }
  window.trixFixture = { commands, update, busy: setBusy,
    speed: speed => setSession(previous => ({ ...previous, preferences: { ...previous.preferences, gameSpeed: speed } })),
    slowRefresh: slow => { slowRefresh = slow; }, slowPreparation: slow => { slowPreparation = slow; },
    deferAction: defer => { deferAction = defer; }, finishAction: accepted => finishAction?.(accepted),
  };
  const controller: TrixController = {
    error: '', busy, catalog: [],
    refresh: async () => { if (slowRefresh) await new Promise(done => setTimeout(done, 10_000)); return session; },
    prepareBot: async signal => {
      commands.push({ kind: 'prepare' });
      if (slowPreparation) await new Promise<void>((resolve, reject) => {
        const aborted = () => { commands.push({ kind: 'abort' }); reject(new DOMException('Aborted', 'AbortError')); };
        if (signal?.aborted) aborted();
        else signal?.addEventListener('abort', aborted, { once: true });
      });
      return { preparedDecisionId: 'fixture-prepared', decisionId: session.decisionId, revision: session.revision, source: 'code' };
    },
    mutate: async path => { commands.push({ kind: 'mutate', path }); return true; },
    advanceAutomatic: async () => { commands.push({ kind: 'automatic' }); return true; },
    candidateAction: async candidateId => {
      const candidate = session.candidates.find(c => c.id === candidateId);
      if (!candidate) return false;
      commands.push({ kind: 'candidate', candidateId, ...(candidate.public.kind === 'declare-doubles' ? { cards: candidate.public.cards } : {}) });
      setBusy(true);
      if (deferAction && !await new Promise<boolean>(resolve => { finishAction = resolve; })) {
        setBusy(false); return false;
      }
      const action = candidate.public, o = session.game.observation;
      if (action.kind === 'declare-doubles') update({ turn: 1, declarations: [...o.declarations, { seat: 0, cards: action.cards ?? [], ref: 'public-double-0' }] });
      if (action.kind === 'play-card') update({ turn: 1, hand: o.hand.filter(c => c !== action.card),
        handCounts: [o.handCounts[0] - 1, ...o.handCounts.slice(1)], trick: [...o.trick, { seat: 0, card: action.card }] });
      if (action.kind === 'layout-card') update({ turn: 1, hand: o.hand.filter(c => c !== action.card),
        handCounts: [o.handCounts[0] - 1, ...o.handCounts.slice(1)],
        board: o.board.map(row => row.suit === action.card[0] ? { ...row, low: 11, high: 11 } : row) });
      if (action.kind === 'layout-pass') update({ turn: 1, passes: [...o.passes, { seat: 0, board: o.board, ref: 'public-pass-0' }] });
      setBusy(false);
      return true;
    },
    registeredAdvice: async () => { throw new Error('Not exercised by this visual fixture'); },
    exposure: async () => ({ accepted: true }),
    startRegistered: async () => false,
    preferences: async preferences => { setSession(previous => ({ ...previous, preferences })); return true; },
    retry: async () => true,
  };
  return <TrixTable session={session} controller={controller} />;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><Fixture /></React.StrictMode>);
