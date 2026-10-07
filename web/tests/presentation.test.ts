import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveCandidate, reviewCandidate } from '../src/api/presentation.ts';
import type { RegisteredActorPacket, GameView } from '../shared/contracts.ts';

const actor: RegisteredActorPacket = {
  publicSchemaVersion: '2.0.0', gameId: 'hearts', variantId: 'solo', seat: 0, phase: 'pass',
  observation: { hand: ['C2', 'C3', 'C4', 'D2'], handCounts: [4, 4, 4, 4], scores: [0, 0, 0, 0],
    turn: null, dealer: 0, roundNumber: 1, trick: [], history: [], heartsBroken: false,
    passDirection: 'left', pass: { outgoing: [], incoming: [], to: 1, from: 3 } },
  candidates: [{ id: 'server-pass-id', public: {kind: 'pass', cards: ['C2', 'C3', 'C4']} }],
};
test('candidate resolution uses only the complete server set and supports selection order', () => {
  assert.equal(resolveCandidate(actor, {kind:'pass', cards:['C4', 'C2', 'C3']}), 'server-pass-id');
  assert.throws(() => resolveCandidate(actor, {kind:'pass', cards:['C2', 'C3', 'D2']}));
  assert.throws(() => resolveCandidate(actor, {kind:'pass', cards:['C2', 'C2', 'C3']}));
  assert.throws(() => resolveCandidate(null, {kind:'play', card:'C2'}));
});
test('review adapters preserve frozen registered play IDs and reject cards absent from the source legal set', () => {
  for (const mode of ['hearts','spades-solo','spades-partners'] as const) {
    const source = {mode,legalActions:[{kind:'play',card:'C2'}]} as GameView;
    assert.equal(reviewCandidate(source,'C2'),'play:C2');
    assert.throws(()=>reviewCandidate(source,'SA'));
  }
});
