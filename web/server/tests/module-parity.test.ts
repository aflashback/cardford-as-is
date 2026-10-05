import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { heartsModule } from '../games/hearts/module.ts';
import { spadesModuleFor } from '../games/spades/module.ts';
import { actionId, fullDeck, type GameAction, type Seat, type PrivateGame } from '../game/legacy/v1.ts';
import { parseV1Game, readLegacyGame } from '../game/legacy/reader.ts';
import { canonical, json, object } from '../game/kernel/codec.ts';
import { createRegistry } from '../game/kernel/registry.ts';
import { providerEligibility } from '../game/kernel/session.ts';
import { parseDocumentEnvelope } from '../records/game-document.ts';
import { installedHandlers, installedRegistrations, createRegisteredSession, decodeRegisteredDocument } from '../games/registrations.ts';
import { analyzeDecision } from '../strategy/index.ts';
import { chooseBaselineAction } from '../strategy/baseline.ts';
import { analyzeFrozenSpades } from '../games/spades/reasoning/frozen/spades-tactics-2.1.0/index.ts';
import { historicalDeck, sequenceHash, type GoldenCorpus } from '../games/spades/reasoning/frozen/golden.ts';
import { applySavedCommand, harness, hashState, replayThroughModule, replayV1, savedCorpus, type SavedParityCase, type SavedCommand } from './support/module-parity.ts';

test('MG-02: current games install native V2 modules', () => {
  assert.equal(heartsModule.pin.moduleVersion, '2.0.0');
  assert.equal(spadesModuleFor('solo').pin.moduleVersion, '2.0.0');
  assert.equal(spadesModuleFor('partners').pin.moduleVersion, '2.0.0');
});

for (const saved of savedCorpus.cases) {
  test(`MG-02/MG-09: saved ${saved.config.mode} legal logs preserve frozen V1 states, events, observations, candidates and original analyses`, () => {
    const original = replayV1(saved);
    assert.equal(hashState(original.steps.at(-1)!.state), saved.finalSha256, `Frozen final state changed for seed ${saved.seed}`);
    for (const sample of saved.samples)
      assert.deepEqual(original.steps[sample.commandIndex].samples, [sample.analysis], `Original default analysis changed at seed ${saved.seed}/command ${sample.commandIndex}`);
    const boundaries = original.steps.filter(step => step.state.phase === 'hand-end' || step.state.phase === 'match-end');
    assert.equal(boundaries.length, saved.rounds.length);
    boundaries.forEach((step, index) => assert.equal(hashState(step.state), saved.rounds[index].stateSha256));
    assert.deepEqual(replayThroughModule(saved), original);
    const final = original.steps.at(-1)!;
    assert.equal(final.collections, 13 * saved.rounds.length, 'Collection is a separate revision from fourth-card resolution.');
    assert.equal(final.revision, final.accepted + final.collections + final.deals);
    if (saved.config.mode === 'hearts') assert.deepEqual(saved.rounds.map(round => round.passDirection), ['left', 'right', 'across', 'hold']);
    else {
      assert.ok(saved.rounds.some(round => round.points[0] < 0), 'The legal log exercises a failed Nil.');
      assert.ok(saved.rounds.slice(1).some((round, index) => round.bags.some((bags, seat) => bags < saved.rounds[index].bags[seat])), 'The legal log crosses a bag penalty.');
      if (saved.config.mode === 'spades-solo') assert.ok(saved.rounds.some(round => round.points[0] === 100), 'The legal log also exercises a successful Nil.');
      if (saved.config.mode === 'spades-partners') for (const round of saved.rounds) {
        assert.equal(round.scores[0], round.scores[2]);
        assert.equal(round.scores[1], round.scores[3]);
      }
    }
  });
}

test('MG-02: complete Hearts pass space stays atomic, ordered and code-only at 286 choices', () => {
  const saved = savedCorpus.cases[0];
  const game = harness('hearts');
  const session = game.create(saved.config, saved.deal);
  const node = session.node();
  assert.equal(node.kind, 'sealed');
  if (node.kind !== 'sealed') throw new Error('No sealed pass.');
  for (const seat of [0, 1, 2, 3] as Seat[]) {
    const packet = session.packet(seat);
    const candidates = game.candidates(session, seat);
    assert.equal(candidates.length, 286);
    assert.equal(new Set(candidates.map(candidate => candidate.id)).size, 286);
    assert.deepEqual(packet.candidates.map(candidate => candidate.id), candidates.map(candidate => candidate.id));
    assert.deepEqual(providerEligibility(packet), { kind: 'unsupported-action-space', candidateCount: 286 });
    const ownHand = game.legacy(session).hands[seat];
    for (const candidate of candidates) {
      assert.equal(candidate.action.kind, 'pass');
      if (candidate.action.kind !== 'pass') throw new Error('Wrong pass candidate.');
      assert.equal(candidate.action.cards.length, 3);
      assert.equal(new Set(candidate.action.cards).size, 3);
      assert.ok(candidate.action.cards.every(card => ownHand.includes(card)));
      assert.equal(candidate.id, actionId(candidate.action));
    }
  }
  const before = session.serializePrivate();
  const choices = node.actors.map(seat => ({ seat, candidateId: session.packet(seat).candidates[0].id }));
  assert.throws(() => session.commit(0, choices[0].candidateId));
  assert.throws(() => session.commitSealed(node.windowId, choices.slice(0, 3)));
  assert.throws(() => session.commitSealed(node.windowId, [choices[0], choices[0], choices[2], choices[3]]));
  assert.throws(() => session.commitSealed(node.windowId, choices.map((choice, index) => index === 3 ? { ...choice, candidateId: 'pass:secret-canary' } : choice)));
  assert.deepEqual(session.serializePrivate(), before);
  const committed = session.commitSealed(node.windowId, choices).next;
  assert.equal(committed.node().kind, 'actor');
  assert.throws(() => committed.commitSealed(node.windowId, choices), 'A stale sealed window cannot be reused.');
  for (const seat of node.actors) {
    const safe = game.safe(committed, seat);
    assert.deepEqual(safe.pass, game.legacy(committed).passes[seat]);
    assert.deepEqual(safe.knownHoldings, safe.pass.outgoing.map(card => ({ seat: safe.pass.to, card })));
    const encoded = canonical(game.observe(committed, seat));
    for (const canary of ['"hands"', '"passes"', saved.config.id]) assert.equal(encoded.includes(canary), false);
  }
});

test('MG-09: exact V1 snapshots keep original pins and scores; missing or unknown pins are read-only', () => {
  for (const saved of savedCorpus.cases) {
    const original = replayV1(saved);
    for (const state of [original.initial.state, original.steps.at(-1)!.state]) {
      assert.deepEqual(parseV1Game(state), state);
      assert.deepEqual(readLegacyGame(state), { kind: 'playable', mode: state.mode, state });
      const game = harness(state.mode);
      assert.deepEqual(game.legacy(game.withLegacy(game.create(saved.config, saved.deal), state)), state);
      const unknown = { ...state, moduleVersion: 'future-engine-version' };
      const before = canonical(unknown);
      assert.deepEqual(readLegacyGame(unknown), { kind: 'read-only', reason: 'unsupported-version' });
      assert.throws(() => parseV1Game(unknown));
      assert.equal(canonical(unknown), before);
      const { moduleVersion: _version, ...missing } = state;
      assert.deepEqual(readLegacyGame(missing), { kind: 'read-only', reason: 'missing-version' });
      assert.throws(() => parseV1Game({ ...state, hiddenHands: state.hands }));
      assert.throws(() => parseV1Game({ ...state, scores: [0, 0, 0] }));
      assert.throws(() => parseV1Game({ ...state, hands: [['C2', 'C2'], [], [], []] }));
    }
  }
});

function permuteHidden(state: PrivateGame, actor: Seat): PrivateGame {
  const alternate = structuredClone(state);
  const others = ([0, 1, 2, 3] as Seat[]).filter(seat => seat !== actor);
  // Only unseen opponent cards change; public history and the actor's own holdings stay fixed.
  const pool = others.flatMap(seat => state.hands[seat]).reverse();
  let offset = 0;
  for (const seat of others) {
    alternate.hands[seat] = pool.slice(offset, offset + state.hands[seat].length);
    offset += state.hands[seat].length;
  }
  assert.notDeepEqual(alternate.hands, state.hands);
  return alternate;
}

test('MG-04: every native game keeps equal-knowledge hidden permutations out of packets, views, facts and analysis', async () => {
  for (const saved of savedCorpus.cases) {
    const game = harness(saved.config.mode);
    const session = game.create(saved.config, saved.deal);
    for (const actor of [0, 1, 2, 3] as Seat[]) {
      const alternate = game.withLegacy(session, permuteHidden(game.legacy(session), actor));
      assert.deepEqual(game.observe(session, actor), game.observe(alternate, actor));
      assert.deepEqual(game.safe(session, actor), game.safe(alternate, actor));
      assert.deepEqual(session.view(actor), alternate.view(actor));
      const node = session.node();
      if ((node.kind === 'actor' && node.seat === actor) || (node.kind === 'sealed' && node.actors.includes(actor))) {
        assert.deepEqual(session.packet(actor), alternate.packet(actor));
        const policy = analyzeDecision(game.safe(session, actor)).policyVersion;
        const prepared = await session.prepare(actor, policy);
        assert.equal(prepared.candidateId, actionId(analyzeDecision(game.safe(session, actor)).action));
        assert.deepEqual(prepared, await alternate.prepare(actor, policy));
      }
    }
  }
});

test('MG-09: installed native documents reject unknown/mixed pins, corrupt payloads and unavailable handlers', () => {
  for (const saved of savedCorpus.cases) {
    const game = harness(saved.config.mode);
    const session = game.create(saved.config, saved.deal);
    const document = parseDocumentEnvelope(session.serializePrivate());
    assert.deepEqual(decodeRegisteredDocument(document).serializePrivate(), document);
    for (const key of ['moduleVersion', 'stateSchemaVersion', 'observationSchemaVersion', 'publicSchemaVersion', 'eventSchemaVersion', 'ruleProfileId'] as const)
      assert.throws(() => decodeRegisteredDocument({ ...document, pin: { ...document.pin, [key]: 'unsupported-version' } }));
    assert.throws(() => createRegisteredSession({ gameId: game.pin.gameId, variantId: game.pin.variantId, moduleVersion: 'missing', ruleProfileId: game.pin.ruleProfileId }, { id: 'unknown', dealer: 0 }, { kind: 'deal', deck: fullDeck() }));
    const payload = document.payload;
    object(payload, Object.keys(payload as object));
    assert.throws(() => decodeRegisteredDocument({ ...document, payload: json({ ...payload, secret: 'unknown-private-field' }) }));
    assert.throws(() => decodeRegisteredDocument({ ...document, payload: json({ ...payload, hands: [['C2', 'C2'], [], [], []] }) }));
    assert.throws(() => decodeRegisteredDocument({ ...document, payload: json({ ...payload, mode: saved.config.mode === 'hearts' ? 'spades-solo' : 'hearts' }) }));
    const unchanged = session.serializePrivate();
    assert.throws(() => session.advance('stale-collection'));
    assert.throws(() => session.supplyChance('stale-deal', { kind: 'deal', deck: fullDeck() }));
    assert.throws(() => session.continueRound());
    assert.throws(() => session.commit(0, 'play:private-canary'));
    assert.deepEqual(session.serializePrivate(), unchanged);
  }
  assert.throws(() => createRegistry(installedRegistrations, { ...installedHandlers, engine: [] }));
  assert.throws(() => createRegistry(installedRegistrations, { ...installedHandlers, schemas: [] }));
  const withoutUI = createRegistry(installedRegistrations, { ...installedHandlers, ui: [] });
  assert.deepEqual(withoutUI.catalog(installedHandlers.engine, installedHandlers.ui), []);
  for (const saved of savedCorpus.cases) {
    const session = harness(saved.config.mode).create(saved.config, saved.deal);
    assert.throws(() => withoutUI.decodeDocument(session.serializePrivate()));
  }
});

test('MG-02/MG-09: actor, collection and deal handlers reject stale operations without mutating checkpoints', () => {
  for (const saved of savedCorpus.cases) {
    const game = harness(saved.config.mode);
    let session = game.create(saved.config, saved.deal);
    let checkedActor = false;
    let previousCollection: string | null = null;
    for (const command of saved.commands) {
      if (command.type === 'next-hand') break;
      const node = session.node();
      if (command.type === 'collect-trick' && node.kind === 'automatic') {
        if (previousCollection !== null) {
          const before = session.serializePrivate();
          assert.throws(() => session.advance(previousCollection!), 'An old trick collection ID is rejected at the next trick.');
          assert.deepEqual(session.serializePrivate(), before);
        }
        previousCollection = node.transitionId;
      }
      session = applySavedCommand(session, command).next;
      if (!checkedActor && command.type === 'action' && command.action.kind === 'play') {
        const before = session.serializePrivate();
        const action = command.action;
        assert.throws(() => session.commit(action.seat, actionId(action)));
        assert.deepEqual(session.serializePrivate(), before);
        checkedActor = true;
      }
    }
    assert.ok(checkedActor);
    assert.equal(session.node().kind, 'round-complete');
    const original = game.legacy(session);
    const pending = session.continueRound().next;
    const restored = decodeRegisteredDocument(pending.serializePrivate());
    assert.deepEqual(game.legacy(restored), original, 'Confirmation retains the finished round until a valid deal arrives.');
    const node = restored.node();
    assert.equal(node.kind, 'chance');
    if (node.kind !== 'chance') throw new Error('Missing deal request.');
    const unchanged = restored.serializePrivate();
    assert.throws(() => restored.continueRound());
    assert.throws(() => restored.supplyChance('stale-request', { kind: 'deal', deck: fullDeck() }));
    assert.throws(() => restored.supplyChance(node.requestId, { kind: 'deal', deck: Array(52).fill('C2') }));
    assert.throws(() => restored.supplyChance(node.requestId, { kind: 'deal', deck: fullDeck(), hands: original.hands }));
    assert.deepEqual(restored.serializePrivate(), unchanged);
    const nextDeal = saved.commands.find(command => command.type === 'next-hand');
    if (!nextDeal || nextDeal.type !== 'next-hand') throw new Error('Fixture has no second round.');
    const next = restored.supplyChance(node.requestId, { kind: 'deal', deck: nextDeal.deal }).next;
    assert.equal(game.legacy(next).handNumber, 2);
    assert.throws(() => next.supplyChance(node.requestId, { kind: 'deal', deck: nextDeal.deal }));
  }
});

for (const [file, choose] of [
  ['spades-tactics-2.1.0/golden.json', (input: Parameters<typeof analyzeFrozenSpades>[0]) => analyzeFrozenSpades(input).action],
  ['local-baseline-1.0.0.golden.json', chooseBaselineAction],
] as const) {
  const corpus = JSON.parse(readFileSync(new URL(`../games/spades/reasoning/frozen/${file}`, import.meta.url), 'utf8')) as GoldenCorpus;
  for (const sample of corpus.samples) test(`MG-02: native ${sample.mode} replays original ${corpus.policyVersion} frozen golden seed ${sample.seed}`, () => {
    const game = harness(sample.mode);
    const config = { id: `golden-${sample.seed}`, mode: sample.mode, dealer: (sample.seed % 4) as Seat };
    const deal = historicalDeck(sample.seed);
    let session = game.create(config, deal);
    const commands: SavedCommand[] = [];
    for (const recorded of sample.actions) {
      let node = session.node();
      if (node.kind === 'automatic') {
        commands.push({ type: 'collect-trick' });
        session = session.advance(node.transitionId).next;
        node = session.node();
      }
      assert.equal(node.kind, 'actor');
      if (node.kind !== 'actor') throw new Error('Golden trace missing actor.');
      const [seatText, kind, value] = recorded.split(':');
      assert.equal(node.seat, Number(seatText));
      const action: GameAction = kind === 'bid' ? { kind, seat: node.seat, bid: Number(value) } : { kind: 'play', seat: node.seat, card: value };
      assert.equal(actionId(choose(game.safe(session, node.seat))), actionId(action), 'Original pinned safe-policy action changed.');
      const command: SavedCommand = { type: 'action', action };
      commands.push(command);
      session = applySavedCommand(session, command).next;
    }
    const finalNode = session.node();
    assert.equal(finalNode.kind, 'automatic');
    commands.push({ type: 'collect-trick' });
    const saved: SavedParityCase = { config, seed: sample.seed, deal, commands, samples: [], rounds: [], finalSha256: '' };
    assert.equal(sample.actions.length, 56);
    assert.equal(sequenceHash(sample.actions), corpus.hands.find(hand => hand.mode === sample.mode && hand.seed === sample.seed)!.sha256);
    assert.deepEqual(replayThroughModule(saved), replayV1(saved));
  });
}
