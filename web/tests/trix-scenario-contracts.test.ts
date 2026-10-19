import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { displayCard, nativeCard, projectPlayerPacket, renderPrompt, resolveResponse, validatePlayerPacket, validateCampaign } from '../../scripts/trix-scenario-collection/contracts.mjs';
import type { ModulePin, TrixActorPacket } from '../shared/contracts.ts';

const variants = ['basic-solo', 'complex-solo', 'basic-partners', 'complex-partners'] as const;
function pin(variant: typeof variants[number]): ModulePin {
  return { gameId: 'trix', variantId: variant, moduleVersion: '2.2.0', ruleProfileId: `trix-${variant}-${variant.endsWith('partners') ? '1.1.0' : '1.0.0'}`, stateSchemaVersion: '1.2.0', observationSchemaVersion: '1.2.0', publicSchemaVersion: '1.2.0', eventSchemaVersion: '1.0.0' };
}
function fixture(variant: typeof variants[number] = 'basic-solo', actor: 0|1|2|3 = 0): TrixActorPacket {
  const scores = variant.endsWith('partners') ? [{ id: 'NS', seats: [0,2] as (0|2)[], total: 0 }, { id: 'EW', seats: [1,3] as (1|3)[], total: 0 }] : [0,1,2,3].map(seat => ({ id: `seat-${seat}`, seats: [seat as 0|1|2|3], total: 0 }));
  return { publicSchemaVersion: '1.2.0', gameId: 'trix', variantId: variant, seat: actor, phase: 'playing', observation: { id: 'synthetic-shape-fixture', gameId: 'trix', variantId: variant, seat: actor, phase: 'playing', turn: actor, kingdom: 1, dealNumber: 1, owner: 3, request: variant.startsWith('complex') ? 'complex' : 'king', remainingRequests: [], hand: ['HK'], handCounts: [1,1,1,1], trick: [], tricks: [], declarations: [], board: ['C','D','H','S'].map(suit => ({ suit: suit as 'C'|'D'|'H'|'S', low: 0, high: 0 })), finishOrder: [], passes: [], ledger: [], withheldBonuses: [], lastExternalLeader: [null,null,null,null], totals: scores, requestTotals: scores, kingdomTotals: scores, winners: [], layoutHistory: { version: '1.0.0', status: 'available', turns: [] } }, candidates: [{ id: 'play:HK', public: { kind: 'play-card', card: 'HK' } }] };
}
function rules(variant: typeof variants[number]) { return { name: `Trix ${variant}`, description: 'Synthetic fixture descriptor; native rules supplied by caller in operation.', text: 'Follow suit. Higher request points are better. Native legality and scoring are authoritative.', objective: variant.endsWith('partners') ? 'combined-team-request-points' : 'own-request-points' }; }
function projected(n = fixture(), id = 'opaque-invocation') { return projectPlayerPacket(n, pin(n.variantId), 12, id, rules(n.variantId)); }

test('TSC-05 all 52 exact display/native card round trips and all seats', () => {
  for (const suit of ['S','H','D','C']) for (const rank of ['A','K','Q','J','10','9','8','7','6','5','4','3','2']) {
    const card = `${suit}${rank}`;
    assert.equal(nativeCard(displayCard(card)), card);
    const n = fixture(); n.observation.hand = [card as 'HK']; n.candidates = [{ id: `play:${card}`, public: { kind: 'play-card', card: card as 'HK' } }];
    assert.equal(resolveResponse(n, { card: displayCard(card), reasoning: 'Only legal card.', confidence: 100 }), `play:${card}`);
    for (const [seat, label] of ['S','W','N','E'].entries()) assert.equal(displayCard(card, seat), `|${label}${displayCard(card)}`);
  }
});

test('TSC-03 paired hidden allocations produce identical packet and prompt bytes', () => {
  // The actor projection seam accepts only the already scoped native packet.
  const allocations = [{ seed: 'PRIVATE_SEED_A', hands: [['HK'],['SA'],['D2'],['C3']], family: 'PRIVATE_FAMILY_A', rationales: ['own','SECRET_RATIONALE_A'] }, { seed: 'PRIVATE_SEED_B', hands: [['HK'],['C3'],['SA'],['D2']], family: 'PRIVATE_FAMILY_B', rationales: ['own','SECRET_RATIONALE_B'] }];
  const packets = allocations.map(state => { const n = fixture(); n.observation.hand = state.hands[0] as ['HK']; return projected(n); });
  assert.deepEqual(packets[0], packets[1]);
  assert.deepEqual(renderPrompt(packets[0], 'playing'), renderPrompt(packets[1], 'playing'));
  const text = renderPrompt(packets[0], 'playing').bytes.toString('utf8');
  assert.doesNotMatch(text, /PRIVATE_|SECRET_|\{\{/);
  const bad = { ...fixture(), seed: 'private' }; assert.throws(() => projected(bad), /schema/);
  assert.throws(() => projected({ ...fixture(), observation: { ...fixture().observation, hiddenHands: [['SA']] } } as TrixActorPacket), /schema/);
});

test('TSC-04 shared rules and descriptor are identical across seats for each variant', () => {
  for (const variant of variants) {
    const packets = [0,1,2,3].map(seat => projected(fixture(variant, seat as 0|1|2|3)));
    for (const p of packets) {
      assert.equal(p.sharedRulesHash, packets[0].sharedRulesHash);
      assert.deepEqual(p.sharedGameDescriptor, packets[0].sharedGameDescriptor);
      assert.equal(p.rulesAndScoring, packets[0].rulesAndScoring);
      assert.deepEqual(p.publicPhaseAndTurn.turnOrder, ['S','E','N','W']);
      assert.equal(p.seatAndCompetition.competitors.length, variant.endsWith('partners') ? 2 : 4);
      assert.equal(p.seatAndCompetition.partner, variant.endsWith('partners') ? (p.actor + 2) % 4 : null);
      assert.equal(p.publicPhaseAndTurn.h7OwnerLabel, 'E');
    }
    assert.throws(() => projectPlayerPacket(fixture(variant), { ...pin(variant), ruleProfileId: 'wrong' }, 1, 'opaque', rules(variant)), /pin/);
    assert.throws(() => projectPlayerPacket(fixture(variant), pin(variant), 1, 'opaque', { ...rules(variant), objective: 'wrong' }), /objective/);
    const changed = structuredClone(packets[0]); changed.sharedGameDescriptor.request = 'diamonds'; assert.throws(() => validatePlayerPacket(changed), /mismatch/);
    const hash = structuredClone(packets[0]); hash.rulesAndScoring += 'changed'; assert.throws(() => validatePlayerPacket(hash), /hash/);
  }
});

test('TSC-04 competition IDs join native Solo and Partners score entries', () => {
  // Matches native score.go scores(): Solo uses seat-N; Partners uses NS/EW.
  for (const variant of variants) for (const actor of [0,1,2,3] as const) {
    const p = projected(fixture(variant, actor));
    const competitors = p.seatAndCompetition.competitors;
    assert.deepEqual(competitors.map(c => c.id), variant.endsWith('partners') ? ['NS','EW'] : ['seat-0','seat-1','seat-2','seat-3']);
    for (const scores of [p.publicScoresAndBonusFacts.totals, p.publicScoresAndBonusFacts.requestTotals, p.publicScoresAndBonusFacts.kingdomTotals]) {
      assert.deepEqual(scores.map(s => s.id), competitors.map(c => c.id));
      for (const score of scores) assert.deepEqual(score.seats, competitors.find(c => c.id === score.id)?.seats);
    }
    const oldLabels = structuredClone(p); oldLabels.seatAndCompetition.competitors[0].id = 'S';
    assert.throws(() => validatePlayerPacket(oldLabels), /competition/);
  }
});

test('TSC-03 chronological history, doubled components and bonus provenance remain complete', () => {
  const n = fixture('complex-solo');
  n.observation.declarations = [{ seat: 3, cards: ['DQ'], ref: 'declaration-1' }, { seat: 2, cards: [], ref: 'declaration-2' }];
  n.observation.tricks = [{ number: 1, leader: 0, winner: 3, plays: [{ seat: 0, card: 'D2' }, { seat: 3, card: 'DQ' }, { seat: 2, card: 'D3' }, { seat: 1, card: 'D4' }] }];
  n.observation.ledger = [{ dealNumber: 1, kingdom: 1, request: 'complex', trick: 1, finish: 0, recipient: { kind: 'seat', seat: 3 }, component: 'queen', card: 'DQ', delta: -50, declarationRef: 'declaration-1' }, { dealNumber: 1, kingdom: 1, request: 'complex', trick: 1, finish: 0, recipient: { kind: 'seat', seat: 0 }, component: 'double-bonus', card: 'DQ', delta: 25, declarationRef: 'declaration-1', leadSourceRef: 'lead-0' }];
  n.observation.lastExternalLeader = [null, { seat: 3, trick: 1 }, null, { seat: 0, trick: 1 }];
  n.observation.withheldBonuses = [{ dealNumber: 1, trick: 1, card: 'HK', bonusValue: 75, reason: 'no_previous_external_leader', declarationRef: 'declaration-3' }];
  const p = projected(n), prompt = renderPrompt(p, 'playing').bytes.toString();
  assert.deepEqual(p.declarations.map(d => d.ref), ['declaration-1','declaration-2']);
  assert.equal(p.completedTricks[0].winnerLabel, 'E'); assert.equal(p.completedTricks[0].plays[1].card, '|E|♦|Q|');
  assert.deepEqual(p.completedTricks[0].scoreComponents, p.publicScoresAndBonusFacts.ledger);
  assert.deepEqual(p.publicScoresAndBonusFacts.lastExternalLeader, n.observation.lastExternalLeader);
  assert.match(prompt, /lead-0/); assert.match(prompt, /no_previous_external_leader/); assert.match(prompt, /"h7OwnerLabel":"E"/);
});

test('TSC-06 strict response syntax rejects illegal cards, extra keys and blank rationale', () => {
  const n = fixture();
  for (const response of [
    { card: '|♥|A|', reasoning: 'Alternative.', confidence: 70 },
    { card: '|♥|K|', reasoning: ' \t\n', confidence: 70 },
    { card: '|♥|K|', reasoning: 'Only card.', confidence: 70, scratchpad: 'extra' },
    { card: '|♥️|K|', reasoning: 'Only card.', confidence: 70 },
    { card: '|♥|K| ', reasoning: 'Only card.', confidence: 70 },
    { card: '|♥|K|', reasoning: 'Only card.', confidence: 0.5 },
    { card: '|♥|K|', reasoning: 'Only card.', confidence: 101 },
    { cards: ['|♥|K|'], reasoning: 'Only card.', confidence: 70 }
  ]) assert.throws(() => resolveResponse(n, response), /schema|legal/);
  const falseCandidate = fixture(); falseCandidate.candidates = [{ id: 'play:HK', public: { kind: 'play-card', card: 'HA' } }];
  assert.throws(() => resolveResponse(falseCandidate, { card: '|♥|A|', reasoning: 'Listed.', confidence: 70 }), /candidate/);
  const extra = projected(); (extra as unknown as Record<string,unknown>).seed = 'private'; assert.throws(() => validatePlayerPacket(extra), /schema/);
});

test('TSC-06 declarations resolve as sets to canonical native ID with duplicates rejected', () => {
  const n = fixture('complex-partners'); n.phase = n.observation.phase = 'declare-doubles';
  n.observation.hand = ['CQ','DQ','HK']; n.observation.handCounts[0] = 3;
  n.candidates = [{ id: 'doubles:', public: { kind: 'declare-doubles' } }, { id: 'doubles:CQ,DQ,HK', public: { kind: 'declare-doubles', cards: ['CQ','DQ','HK'] } }];
  assert.equal(resolveResponse(n, { cards: ['|♥|K|','|♦|Q|','|♣|Q|'], reasoning: 'Declare the listed subset.', confidence: 50 }), 'doubles:CQ,DQ,HK');
  assert.equal(resolveResponse(n, { cards: [], reasoning: 'Decline.', confidence: 50 }), 'doubles:');
  assert.throws(() => resolveResponse(n, { cards: ['|♥|K|','|♥|K|'], reasoning: 'Duplicate.', confidence: 50 }), /schema/);
  assert.throws(() => resolveResponse(n, { cards: ['|♥|K|'], reasoning: 'Unlisted subset.', confidence: 50 }), /legal/);
  const rendered = renderPrompt(projected(n), 'declaration');
  assert.doesNotMatch(rendered.bytes.toString(), /\{\{/); assert.match(rendered.bytes.toString(), /Exact legal declaration subsets/);
});

test('TSC-03/06 native omitted declaration cards become an explicit empty decline subset', () => {
  // Native Action.Cards has json omitempty; an empty legal candidate omits cards.
  const n = fixture('complex-solo'); n.phase = n.observation.phase = 'declare-doubles';
  n.candidates = [{ id: 'doubles:', public: { kind: 'declare-doubles' } }];
  const p = projected(n), rendered = renderPrompt(p, 'declaration').bytes.toString('utf8');
  assert.deepEqual(p.legalOptions, [{ candidateId: 'doubles:', kind: 'declare-doubles', cards: [] }]);
  assert.match(rendered, /"cards":\[\],"kind":"declare-doubles"/);
  assert.match(rendered, /empty subset means decline/);
  assert.equal(resolveResponse(n, { cards: [], reasoning: 'Decline is the only legal subset.', confidence: 100 }), 'doubles:');
  assert.throws(() => resolveResponse(n, { reasoning: 'Decline.', confidence: 100 }), /schema/);
  const missingPublicCards = structuredClone(p); delete (missingPublicCards.legalOptions[0] as unknown as Record<string,unknown>).cards;
  assert.throws(() => validatePlayerPacket(missingPublicCards), /schema/);
});

test('TSC-02/03 prompt bytes preserve Unicode, hashes and complete fields without requesting tools or scratchpad', () => {
  for (const variant of variants) {
    const p = projected(fixture(variant));
    const rendered = renderPrompt(p, 'playing'); const text = rendered.bytes.toString('utf8');
    assert.ok(text.includes('|S|♥|K|')); assert.ok(text.includes('|♥|K|'));
    assert.equal(rendered.sha256, createHash('sha256').update(rendered.bytes).digest('hex'));
    assert.match(text, /Do not use tools/); assert.match(text, /Do not provide a private scratchpad/);
    assert.doesNotMatch(text, /\{\{|PRIVATE_|SECRET_/);
    assert.throws(() => renderPrompt(p, 'declaration'), /phase/);
  }
});

test('TSC-01/10 campaign limits, phase order and per-variant requests are strict', () => {
  const plan = JSON.parse(readFileSync(new URL('../../planning/implementation/coach-lab/trix-scenario-collection/campaign.plan.json', import.meta.url), 'utf8'));
  assert.equal(validateCampaign(plan), plan);
  const mutations = [
    (p: typeof plan) => p.phases[1].requests.push('diamonds'),
    (p: typeof plan) => p.phases[0].requests.push('trix'),
    (p: typeof plan) => p.phases[3].maxCases = 401,
    (p: typeof plan) => p.selection.maxCorpusCases = 1001,
    (p: typeof plan) => p.selection.maxCasesPerPhysicalDealFamily = 9,
    (p: typeof plan) => p.execution.maxConcurrentPlayerInvocations = 2,
    (p: typeof plan) => p.model.requested = 'gpt-6-sol',
    (p: typeof plan) => p.phases.reverse(),
    (p: typeof plan) => p.phases[0].targetCases = 199,
    (p: typeof plan) => p.workCaps.maxPlayerAttemptsPerDecision = 3,
    (p: typeof plan) => p.unexpected = true
  ];
  for (const mutate of mutations) { const bad = structuredClone(plan); mutate(bad); assert.throws(() => validateCampaign(bad), /schema|cap|target/); }
});
