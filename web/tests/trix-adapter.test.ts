import assert from 'node:assert/strict';
import test from 'node:test';
import {
  doubleCandidate,
  eligibleDoubles,
  cardCandidate,
  requestLabel,
  boardCards,
  bindTrixPresentation,
  seatTwoAnnouncements,
  seatRequestScore,
} from '../src/games/trix/adapter.ts';
import type { TrixObservation, TrixPresentation } from '../shared/local-service.contracts.ts';

test('doubling resolves the exact server subset without inventing candidate IDs', () => {
  const candidates = [
    { id: 'decline-confirmed', public: { kind: 'declare-doubles' as const, cards: [] } },
    { id: 'queen-confirmed', public: { kind: 'declare-doubles' as const, cards: ['HQ'] } },
    { id: 'both-confirmed', public: { kind: 'declare-doubles' as const, cards: ['HQ', 'HK'] } },
  ];
  assert.deepEqual(eligibleDoubles(candidates), ['HQ', 'HK']);
  assert.equal(doubleCandidate(candidates, ['HK', 'HQ'])?.id, 'both-confirmed');
  assert.equal(doubleCandidate(candidates, [])?.id, 'decline-confirmed');
  assert.equal(doubleCandidate(candidates, ['HK']), undefined);
  assert.equal(doubleCandidate(candidates, ['HQ', 'HQ']), undefined);
});

test('player request scores use only current-deal seat entries, keeping team bonuses in totals', () => {
  const entry = { dealNumber: 2, kingdom: 1, request: 'complex' as const, trick: 1, finish: 0,
    recipient: { kind: 'seat' as const, seat: 0 as const }, component: 'queen' as const, delta: -50 };
  const observation: Pick<TrixObservation, 'dealNumber' | 'ledger'> = { dealNumber: 2, ledger: [
    entry,
    { ...entry, component: 'trick', delta: -15 },
    { ...entry, recipient: { kind: 'seat', seat: 2 }, delta: -25 },
    { ...entry, component: 'double-bonus', recipient: { kind: 'competitor', competitor: 'NS' }, delta: 25 },
    { ...entry, dealNumber: 1, delta: -75 },
  ] };
  assert.deepEqual([0, 1, 2, 3].map(seat => seatRequestScore(observation, seat)), [-65, 0, -25, 0]);
  assert.equal(seatRequestScore({ ...observation, dealNumber: 3 }, 0), 0);
  assert.equal(seatRequestScore({ ...observation, ledger: [], requestSeatTotals: [-65, 0, -25, 0] }, 0), -65);
  assert.equal(seatRequestScore({ ...observation, ledger: [
    { ...entry, request: 'trix', component: 'layout-finish', finish: 1, trick: 0, delta: 200 },
  ] }, 0), 200);
});
test('play and layout candidates are distinct and passing never follows from client inference', () => {
  const candidates = [{ id: 'server-layout', public: { kind: 'layout-card' as const, card: 'CJ' } }];
  assert.equal(cardCandidate(candidates, 'CJ')?.id, 'server-layout');
  assert.equal(cardCandidate(candidates, 'CA'), undefined);
  assert.equal(cardCandidate([...candidates, { ...candidates[0], id: 'duplicate-action' }], 'CJ'), undefined);
  assert.equal(doubleCandidate(candidates, []), undefined);
});
test('Jack board has only the projected contiguous cards and plain request labels', () => {
  assert.deepEqual(boardCards({ suit: 'H', low: 10, high: 12 }), ['H10', 'HJ', 'HQ']);
  assert.deepEqual(boardCards({ suit: 'C', low: 0, high: 0 }), []);
  assert.equal(requestLabel('complex'), 'All combined');
  assert.equal(requestLabel('king'), 'The King');
  assert.equal(requestLabel('trix'), 'Trix Jacks');
});
test('registered Trix projection binds instance, variant, human seat, phase and source observation', () => {
  const o: TrixObservation = {
    id: 'trix-instance',
    gameId: 'trix',
    variantId: 'basic-solo',
    seat: 0,
    phase: 'choose-request',
    turn: 0,
    kingdom: 1,
    dealNumber: 1,
    owner: 0,
    request: null,
    remainingRequests: ['diamonds', 'lutoosh', 'queens', 'king', 'trix'],
    hand: ['H7'],
    handCounts: [1, 1, 1, 1],
    trick: [],
    tricks: [],
    declarations: [],
    board: [],
    finishOrder: [],
    passes: [],
    ledger: [],
    withheldBonuses: [],
    lastExternalLeader: [null, null, null, null],
    totals: [],
    requestTotals: [],
    kingdomTotals: [],
    winners: [],
  };
  const view: TrixPresentation = {
    id: o.id,
    gameId: 'trix',
    variantId: o.variantId,
    seat: 0,
    observation: o,
  };
  assert.equal(bindTrixPresentation(view, o.id, o.variantId, 0, o.phase, o), view);
  assert.throws(() => bindTrixPresentation(view, 'another-table', o.variantId, 0, o.phase, o));
  assert.throws(() => bindTrixPresentation(view, o.id, 'complex-solo', 0, o.phase, o));
  assert.throws(() => bindTrixPresentation(view, o.id, o.variantId, 1, o.phase, o));
  assert.throws(() => bindTrixPresentation(view, o.id, o.variantId, 0, 'playing', o));
  assert.throws(() => bindTrixPresentation(view, o.id, o.variantId, 0, o.phase, { ...o, hand: ['HA'] }));
  const partners = {
    ...o,
    variantId: 'basic-partners' as const,
    request: 'trix' as const,
    phase: 'layout' as const,
  };
  const hidden = { ...partners, twoAnnouncements: { status: 'hidden' as const, counts: [0, 1, 3, 0] } };
  assert.deepEqual(seatTwoAnnouncements(hidden, 2), { status: 'hidden', count: 3 });
  assert.deepEqual(seatTwoAnnouncements(hidden, 0), { status: 'hidden', count: 0 });
  assert.equal(seatTwoAnnouncements(partners, 1), null);
  assert.equal(seatTwoAnnouncements({ ...hidden, variantId: 'basic-solo' }, 1), null);
  assert.equal(seatTwoAnnouncements({ ...hidden, request: 'queens' }, 1), null);
  const revealed: TrixObservation = {
    ...partners,
    twoAnnouncements: {
      status: 'revealed',
      cards: [
        { seat: 0, card: 'C2' },
        { seat: 1, card: 'D2' },
        { seat: 2, card: 'H2' },
        { seat: 3, card: 'S2' },
      ],
    },
  };
  assert.deepEqual(seatTwoAnnouncements(revealed, 0), { status: 'revealed', cards: ['C2'] });
  const played = { ...revealed, board: [{ suit: 'C' as const, low: 2, high: 11 }] };
  assert.deepEqual(seatTwoAnnouncements(played, 0), { status: 'revealed', cards: [] });
  assert.equal(revealed.twoAnnouncements?.status === 'revealed' && revealed.twoAnnouncements.cards.length, 4);
  assert.deepEqual(revealed.hand, o.hand);
  assert.deepEqual(revealed.handCounts, o.handCounts);
});
