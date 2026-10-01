// OFFLINE research only: no runtime edits, network calls, model calls, or fallback player.
// CR-EXP-008: owner-authorized eight authored proposals, fresh stateless decision transport.
// Player/rule templates belong to the prior experiment and are read-only here.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync } from 'node:fs';
import { dirname, join, resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { createGame, apply, collectTrick, legalActions, actionId, trickWinner } from '../../../web/server/game/index.ts';
import { observe } from '../../../web/server/observations/index.ts';

const directory = dirname(fileURLToPath(import.meta.url));
const root = resolve(directory, '../../..');
const oldDirectory = resolve(directory, '../2026-09-30-two-suit-batch');
// Owner changed remaining player turns to Luna; historical Sol decisions retain their provenance.
const model = 'gpt-6-luna', effort = 'xhigh';
const allowedModels = ['gpt-6.1-sol', 'gpt-6-luna'];
const schemaVersion = 'expanded-agent-lab-record-2.0.0';
const transportMode = 'fresh-stateless-per-decision';
const hash = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
const read = path => readFileSync(path, 'utf8');
const config = JSON.parse(read(join(directory, 'deals.json')));
const player = read(join(oldDirectory, 'templates/player.md'));
const rules = read(join(oldDirectory, 'templates/spades-rules.md'));
const pendingRejections = new Map();
const sourcePaths = [
  'qa/experiments/2026-09-30-expanded-batch/referee.mjs',
  'qa/experiments/2026-09-30-expanded-batch/deals.json',
  ...['player.md', 'spades-rules.md', 'invocation.txt'].map(name => 'qa/experiments/2026-09-30-two-suit-batch/templates/' + name),
  ...['materialize-next-batch.mjs', 'next-batch-proposal.json', 'deals.json'].map(name => 'qa/experiments/2026-09-30-two-suit-batch/' + name),
  ...['index.ts', 'cards.ts', 'rules.ts', 'kernel/types.ts', 'spades/score.ts', 'hearts/score.ts'].map(name => 'web/server/game/' + name),
  ...['index.ts', 'types.ts'].map(name => 'web/server/observations/' + name),
];
const frozenInputs = Object.fromEntries(sourcePaths.map(path => [path, hash(read(join(root, path)))]));
const refereeSourcePath = sourcePaths[0];
const historicalRefereeHash = hash(read(join(directory, 'provenance/sol-referee-v1.mjs.txt')));
function currentHead() {
  let gitDirectory = join(root, '.git');
  try { const pointer = read(gitDirectory); gitDirectory = resolve(root, pointer.trim().replace(/^gitdir: /, '')); } catch { /* Normal checkout: .git is a directory. */ }
  const head = read(join(gitDirectory, 'HEAD')).trim();
  if (/^[a-f0-9]{40}$/.test(head)) return head;
  assert.ok(head.startsWith('ref: '), 'Unsupported Git HEAD');
  const ref = head.slice(5), common = existsSync(join(gitDirectory, 'commondir'))
    ? resolve(gitDirectory, read(join(gitDirectory, 'commondir')).trim()) : gitDirectory;
  for (const base of [gitDirectory, common]) if (existsSync(join(base, ref))) return read(join(base, ref)).trim();
  const packed = read(join(common, 'packed-refs')).split(/\r?\n/).find(line => line.endsWith(' ' + ref));
  assert.ok(packed, 'Cannot resolve current Git HEAD'); return packed.split(' ')[0];
}
const sourceCommit = currentHead();
const recordPath = id => join(directory, 'records', id + '.json');
const actionable = state => ['bid', 'play'].includes(state.phase);
const complete = state => ['hand-end', 'match-end'].includes(state.phase);

function episodeFor(id) {
  const episode = config.episodes.find(entry => entry.id === id);
  if (!episode) throw Error('Unknown episode');
  if (!/^[a-z0-9-]+$/.test(id)) throw Error('Unsafe episode ID');
  return episode;
}
function start(episode) {
  assert.equal(episode.hands.length, 4);
  assert.ok(episode.hands.every(hand => hand.length === 13));
  assert.ok(['spades-solo', 'spades-partners'].includes(episode.mode));
  assert.ok([0, 1, 2, 3].includes(episode.dealer));
  for (const values of [episode.scores, episode.bags]) {
    assert.equal(values.length, 4); assert.ok(values.every(Number.isSafeInteger));
  }
  assert.ok(episode.bags.every(value => value >= 0 && value <= 9));
  if (episode.mode === 'spades-partners') {
    for (const values of [episode.scores, episode.bags]) { assert.equal(values[0], values[2]); assert.equal(values[1], values[3]); }
  }
  const first = (episode.dealer + 1) % 4;
  const deck = Array.from({ length: 52 }, (_, index) => episode.hands[(first + index) % 4][Math.floor(index / 4)]);
  const state = createGame({ id: episode.id, mode: episode.mode, dealer: episode.dealer }, deck);
  state.scores = [...episode.scores]; state.bags = [...episode.bags];
  return state;
}
function packetFor(state) {
  if (!actionable(state)) throw Error('No player decision remains');
  const observation = observe(state, state.turn);
  // Closed allowlist: aggregate ID, all other hands, fixture labels, explanations and reference choices never enter this object.
  return {
    game: observation.mode, ruleProfile: observation.ruleProfileId,
    moduleVersion: observation.moduleVersion, observationSchemaVersion: observation.observationSchemaVersion,
    featureVersion: observation.featureVersion, promptVersion: 'expanded-stateless-player-1.0.0',
    name: config.names[observation.seat], seat: observation.seat, turn: observation.turn, names: [...config.names],
    dealer: observation.dealer,
    competition: observation.mode === 'spades-partners' ? [[0, 2], [1, 3]] : [[0], [1], [2], [3]],
    phase: observation.phase, hand: observation.hand, handSizes: observation.handSizes,
    bids: observation.bids, tricks: observation.tricks, scores: observation.scores, bags: observation.bags,
    completedTricks: observation.history, currentTrick: observation.trick, spadesBroken: observation.spadesBroken,
    legalActions: legalActions(state, state.turn).map(actionId),
  };
}
function promptForState(state) {
  const packet = packetFor(state);
  return 'This is a fresh, stateless invocation for exactly one decision. Your complete current hand and all public history appear below.\n\n' +
    player.replaceAll('{{NAME}}', packet.name).replaceAll('{{SEAT}}', String(packet.seat))
      .replaceAll('{{GAME}}', packet.game).replace('{{RULES}}', rules).replace('{{SEAT_PACKET}}', JSON.stringify(packet));
}
function compact(state) {
  return { phase: state.phase, turn: state.turn, bids: state.bids, tricks: state.tricks,
    scores: state.scores, bags: state.bags, history: state.history, handResult: state.handResult ?? null };
}
function parse(raw, state) {
  if (typeof raw !== 'string') throw Error('Response must be text');
  const match = /^(BID: (?:[0-9]|1[0-3])|PLAY: [CDHS](?:[2-9JQKA]|10))\r?\n\r?\n([^\r\n]+)$/.exec(raw.trim());
  const words = match?.[2].trim().split(/\s+/).length ?? 0;
  if (!match || words < 15 || words > 100 || /```/.test(raw)) throw Error('Response must be one action, blank line and one 15-100 word paragraph');
  const action = match[1].startsWith('BID:')
    ? { kind: 'bid', seat: state.turn, bid: Number(match[1].slice(5)) }
    : { kind: 'play', seat: state.turn, card: match[1].slice(6) };
  if (!legalActions(state, state.turn).some(candidate => actionId(candidate) === actionId(action))) throw Error('Action is not in the complete legal set');
  return { action, justification: match[2] };
}
function afterAction(state, action) {
  const next = apply(state, action);
  return next.phase === 'trick-end' ? collectTrick(next) : next;
}
function noHiddenThought(value) {
  if (!value || typeof value !== 'object') return;
  for (const [key, item] of Object.entries(value)) {
    if (/^(analysis|reasoning|thoughts?|chainOfThought|hiddenThought|hiddenReasoning)$/i.test(key)) throw Error('Hidden thought text is forbidden in transport metadata');
    noHiddenThought(item);
  }
}
function metadataFor(supplied, prompt, raw, id, seq) {
  if (supplied === null || typeof supplied !== 'object' || Array.isArray(supplied)) throw Error('Transport metadata must be an object');
  const metadata = structuredClone(supplied);
  noHiddenThought(metadata);
  assert.ok(allowedModels.includes(metadata.configuredModel), 'Unapproved configured model');
  if (metadata.reasoningEffort !== undefined) assert.equal(metadata.reasoningEffort, effort, 'Configured effort mismatch');
  assert.equal(metadata.deliveredPromptHash, hash(prompt), 'Exact delivered prompt hash required; stale or changed prompt');
  if (metadata.toolEvents !== undefined) assert.deepEqual(metadata.toolEvents, [], 'Player used tools');
  if (metadata.failures !== undefined) assert.deepEqual(metadata.failures, [], 'Transport reported failures');
  if (metadata.exitCode !== undefined) assert.equal(metadata.exitCode, 0, 'Transport failed');
  if (metadata.timedOut !== undefined) assert.equal(metadata.timedOut, false, 'Transport timed out');
  if (metadata.evidenceFile !== undefined) {
    assert.equal(typeof metadata.evidenceFile, 'string');
    const path = resolve(directory, metadata.evidenceFile);
    const inside = relative(join(directory, 'transport'), path);
    assert.ok(inside && !inside.startsWith('..') && !isAbsolute(inside), 'Transport evidence must be inside this batch');
    const evidenceText = read(path), evidence = JSON.parse(evidenceText);
    noHiddenThought(evidence);
    assert.equal(evidence.episodeId, id); assert.equal(evidence.seq, seq);
    assert.equal(evidence.prompt, prompt); assert.equal(evidence.promptHash, hash(prompt));
    assert.equal(evidence.deliveredPromptHash, hash(prompt));
    assert.equal(evidence.response, raw); assert.equal(evidence.responseHash, hash(raw));
    assert.equal(evidence.configuredModel, metadata.configuredModel); assert.equal(evidence.reasoningEffort, effort);
    assert.equal(evidence.validTransport, true);
    for (const [key, value] of Object.entries(supplied)) {
      if (key !== 'evidenceFile' && key !== 'evidenceHash') assert.deepEqual(evidence[key], value, 'Transport evidence/metadata mismatch: ' + key);
    }
    if (metadata.evidenceHash !== undefined) assert.equal(metadata.evidenceHash, hash(evidenceText), 'Transport evidence changed');
    metadata.evidenceHash = hash(evidenceText);
  }
  return metadata;
}
function assertConservation(state) {
  const played = [...state.history.flatMap(trick => trick.plays.map(play => play.card)), ...state.trick.map(play => play.card)];
  const cards = [...state.hands.flat(), ...played];
  assert.equal(cards.length, 52); assert.equal(new Set(cards).size, 52);
  assert.equal(state.tricks.reduce((sum, count) => sum + count, 0), state.history.length);
  for (const trick of state.history) {
    assert.equal(trick.plays.length, 4); assert.equal(trick.winner, trickWinner(trick.plays, state.mode));
    trick.plays.forEach((play, index) => assert.equal(play.seat, (trick.plays[0].seat + index) % 4));
  }
  for (let seat = 0; seat < 4; seat++) assert.equal(state.hands[seat].length, 13 -
    [...state.history.flatMap(trick => trick.plays), ...state.trick].filter(play => play.seat === seat).length);
}
function assertBoundary(state, packet) {
  assert.deepEqual(packet.hand, state.hands[state.turn]);
  assert.equal(packet.completedTricks.length, state.history.length);
  assert.deepEqual(packet.legalActions, legalActions(state, state.turn).map(actionId));
  const others = [0, 1, 2, 3].filter(seat => seat !== state.turn);
  // Swapping unseen cards preserves publicly known hand counts, unlike swapping unequal whole hands.
  for (let left = 0; left < others.length; left++) for (let right = left + 1; right < others.length; right++) {
    const hidden = structuredClone(state), a = others[left], b = others[right];
    if (hidden.hands[a].length && hidden.hands[b].length) [hidden.hands[a][0], hidden.hands[b][0]] = [hidden.hands[b][0], hidden.hands[a][0]];
    hidden.id = 'hidden-id-not-visible';
    assert.deepEqual(packetFor(hidden), packet, 'Unseen holdings or aggregate ID affected player packet');
    assert.equal(promptForState(hidden), promptForState(state), 'Unseen holdings affected prompt');
  }
}
function assertScoring(episode, state) {
  if (!complete(state)) return;
  const groups = state.mode === 'spades-partners' ? [[0, 2], [1, 3]] : [[0], [1], [2], [3]];
  for (const group of groups) {
    const positive = group.filter(seat => state.bids[seat] > 0), nil = group.filter(seat => state.bids[seat] === 0);
    const bid = positive.reduce((sum, seat) => sum + state.bids[seat], 0);
    const credit = positive.reduce((sum, seat) => sum + state.tricks[seat], 0);
    const over = Math.max(0, credit - bid), failedNil = nil.reduce((sum, seat) => sum + state.tricks[seat], 0);
    const totalBags = episode.bags[group[0]] + over + failedNil;
    const delta = (credit >= bid ? 10 : -10) * bid + over +
      nil.reduce((sum, seat) => sum + (state.tricks[seat] === 0 ? 100 : -100), 0) - 100 * Math.floor(totalBags / 10);
    for (const seat of group) {
      assert.equal(state.scores[seat], episode.scores[seat] + delta); assert.equal(state.bags[seat], totalBags % 10);
      assert.equal(state.handResult.points[seat], delta);
    }
  }
}
function newRecord(id) {
  return { schemaVersion, episodeId: id, sourceCommit, frozenInputs, frozenInputsHash: hash(frozenInputs),
    dealHash: hash(episodeFor(id)), configurationHash: hash(config), promptTemplateHash: hash(player), rulesTemplateHash: hash(rules),
    provider: 'offline-codex-cli-research', configuredModel: model, reasoningEffort: effort,
    observedModel: 'not independently attested; inspect supplied transport metadata', transportMode,
    jevCalls: 0, decisions: [], rejections: [] };
}
function save(id, record) {
  const { recordHash: omitted, ...body } = record;
  record.recordHash = hash(body);
  mkdirSync(join(directory, 'records'), { recursive: true });
  const temporary = recordPath(id) + '.tmp';
  writeFileSync(temporary, JSON.stringify(record, null, 2) + '\n'); renameSync(temporary, recordPath(id));
}

/** Referee-only inventory; never send episode metadata to players. */
export function listEpisodes() { return structuredClone(config.episodes.map(({ id, mode, dealer, origin, intendedCoverage }) => ({ id, mode, dealer, origin, intendedCoverage }))); }

/** Replay fails closed if the frozen deal, source, templates, record or decision changed. */
export function load(id) {
  const episode = episodeFor(id), stored = existsSync(recordPath(id));
  const rec = stored ? JSON.parse(read(recordPath(id))) : newRecord(id);
  if (stored) {
    const { recordHash, ...body } = rec; assert.equal(recordHash, hash(body), 'Record hash mismatch');
    assert.equal(rec.schemaVersion, schemaVersion); assert.equal(rec.episodeId, id); assert.match(rec.sourceCommit, /^[a-f0-9]{40}$/);
    const expectedInputs = { ...frozenInputs };
    if (rec.frozenInputs[refereeSourcePath] === historicalRefereeHash) expectedInputs[refereeSourcePath] = historicalRefereeHash;
    assert.deepEqual(rec.frozenInputs, expectedInputs, 'Frozen source inputs changed'); assert.equal(rec.frozenInputsHash, hash(rec.frozenInputs));
    assert.equal(rec.dealHash, hash(episode)); assert.equal(rec.configurationHash, hash(config));
    assert.equal(rec.promptTemplateHash, hash(player)); assert.equal(rec.rulesTemplateHash, hash(rules));
    assert.ok(allowedModels.includes(rec.configuredModel)); assert.equal(rec.reasoningEffort, effort); assert.equal(rec.transportMode, transportMode); assert.equal(rec.jevCalls, 0);
  }
  let state = start(episode);
  assertConservation(state);
  for (const [index, decision] of rec.decisions.entries()) {
    assert.equal(decision.seq, index + 1); assert.equal(decision.seat, state.turn);
    const packet = packetFor(state), prompt = promptForState(state);
    assert.deepEqual(decision.packet, packet); assert.equal(decision.packetHash, hash(packet));
    assert.equal(decision.deliveredPrompt, prompt); assert.equal(decision.deliveredPromptHash, hash(prompt));
    assert.equal(decision.rawResponseHash, hash(decision.rawResponse)); assert.equal(decision.agentIdHash, hash(decision.agentId));
    assert.equal(decision.actionHash, hash(decision.action)); assert.equal(decision.beforeStateHash, hash(state));
    assert.ok(allowedModels.includes(decision.configuredModel)); assert.equal(decision.configuredModel, decision.transportMetadata.configuredModel);
    if (decision.configuredModel === model) assert.equal(decision.refereeSourceHash, frozenInputs[refereeSourcePath]);
    assert.equal(decision.reasoningEffort, effort); assert.equal(decision.transportMode, transportMode);
    assert.equal(decision.transportMetadataHash, hash(decision.transportMetadata));
    assert.deepEqual(metadataFor(decision.transportMetadata, prompt, decision.rawResponse, id, decision.seq), decision.transportMetadata);
    const parsed = parse(decision.rawResponse, state);
    assert.deepEqual(parsed.action, decision.action); assert.equal(parsed.justification, decision.justification);
    assert.equal(decision.forced, packet.legalActions.length === 1);
    state = afterAction(state, decision.action);
    assert.equal(decision.afterStateHash, hash(state)); assertConservation(state);
  }
  if (rec.decisions.length) { assert.deepEqual(rec.result, compact(state)); assert.equal(rec.resultHash, hash(rec.result)); assertScoring(episode, state); }
  return { episode: structuredClone(episode), rec, state };
}

/** Deliver this string verbatim in a new invocation for every decision. */
export function promptFor(id) { return promptForState(load(id).state); }

/** Invalid replies never advance state. Before the first acceptance, transport retains rejection evidence. */
export function accept(id, raw, agentId, transportMetadata = {}) {
  const { rec, state } = load(id);
  if (!actionable(state)) throw Error('Episode already complete');
  if (typeof agentId !== 'string' || !agentId.trim()) throw Error('Agent ID required');
  assert.equal(transportMetadata.configuredModel, model, 'Only the current owner-selected player model may add decisions');
  const seq = rec.decisions.length + 1, packet = packetFor(state), prompt = promptForState(state);
  const metadata = metadataFor(transportMetadata, prompt, raw, id, seq);
  let parsed;
  try { parsed = parse(raw, state); } catch (error) {
    const rejection = { seq, seat: state.turn, agentId, agentIdHash: hash(agentId), reason: error.message,
      rawResponse: raw, rawResponseHash: hash(raw), deliveredPrompt: prompt, deliveredPromptHash: hash(prompt),
      packet, packetHash: hash(packet), transportMetadata: metadata, transportMetadataHash: hash(metadata) };
    if (existsSync(recordPath(id))) { rec.rejections.push(rejection); save(id, rec); }
    else pendingRejections.set(id, [...(pendingRejections.get(id) ?? []), rejection]);
    return { accepted: false, reason: error.message, seq };
  }
  const next = afterAction(state, parsed.action);
  assertBoundary(state, packet); assertConservation(next);
  rec.rejections.push(...(pendingRejections.get(id) ?? [])); pendingRejections.delete(id);
  rec.decisions.push({ seq, agentId, agentIdHash: hash(agentId), seat: state.turn, name: packet.name,
    packet, packetHash: hash(packet), deliveredPrompt: prompt, deliveredPromptHash: hash(prompt),
    rawResponse: raw, rawResponseHash: hash(raw), justification: parsed.justification,
    action: parsed.action, actionHash: hash(parsed.action), forced: packet.legalActions.length === 1,
    configuredModel: model, reasoningEffort: effort, transportMode, refereeSourceHash: frozenInputs[refereeSourcePath],
    transportMetadata: metadata, transportMetadataHash: hash(metadata), beforeStateHash: hash(state), afterStateHash: hash(next) });
  rec.result = compact(next); rec.resultHash = hash(rec.result);
  save(id, rec);
  return { accepted: true, seq, next: actionable(next) ? packetFor(next) : compact(next) };
}

/** Read-only audit: verifies every accepted/rejected transcript and every engine transition. */
export function audit(id) {
  const { episode, rec, state } = load(id);
  let replay = start(episode), boundaryChecks = 0;
  const states = [replay];
  for (const decision of rec.decisions) {
    assertBoundary(replay, packetFor(replay)); boundaryChecks++;
    replay = afterAction(replay, decision.action); states.push(replay);
  }
  for (const rejection of rec.rejections) {
    const previous = states[rejection.seq - 1]; assert.ok(previous && actionable(previous));
    assert.equal(rejection.seat, previous.turn); assert.equal(rejection.agentIdHash, hash(rejection.agentId));
    assert.equal(rejection.rawResponseHash, hash(rejection.rawResponse));
    assert.equal(rejection.deliveredPrompt, promptForState(previous)); assert.equal(rejection.deliveredPromptHash, hash(rejection.deliveredPrompt));
    assert.deepEqual(rejection.packet, packetFor(previous)); assert.equal(rejection.packetHash, hash(rejection.packet));
    assert.equal(rejection.transportMetadataHash, hash(rejection.transportMetadata));
    assert.deepEqual(metadataFor(rejection.transportMetadata, rejection.deliveredPrompt, rejection.rawResponse, id, rejection.seq), rejection.transportMetadata);
    assert.throws(() => parse(rejection.rawResponse, previous));
  }
  assert.deepEqual(replay, state); assertScoring(episode, state);
  if (complete(state)) { assert.equal(rec.decisions.length, 56); assert.equal(state.history.length, 13); assert.equal(state.hands.flat().length, 0); }
  const report = { episodeId: id, status: complete(state) ? 'complete' : rec.decisions.length ? 'partial' : 'not-run',
    complete: complete(state), accepted: rec.decisions.length, rejected: rec.rejections.length,
    forced: rec.decisions.filter(decision => decision.forced).length, boundaryChecks,
    decisionsWithTransportEvidence: rec.decisions.filter(decision => decision.transportMetadata.evidenceFile).length,
    tricks: state.history.length, uniquePlayed: new Set(state.history.flatMap(trick => trick.plays.map(play => play.card))).size,
    result: compact(state), sourceCommit: rec.sourceCommit,
    configuredModel: new Set(rec.decisions.map(decision => decision.configuredModel)).size > 1 ? 'mixed-per-decision' : rec.decisions[0]?.configuredModel ?? model,
    modelCounts: Object.fromEntries(allowedModels.map(name => [name, rec.decisions.filter(decision => decision.configuredModel === name).length])),
    reasoningEffort: effort, transportMode, jevCalls: 0,
    scope: 'Transcript integrity, legal replay, card conservation, trick resolution, score arithmetic and own-information projection. No claim of model quality or exact backend snapshot.' };
  if (rec.decisions.length) writeFileSync(join(directory, 'records', id + '.audit.json'), JSON.stringify(report, null, 2) + '\n');
  return report;
}
function validate() {
  const proposal = JSON.parse(read(join(oldDirectory, 'next-batch-proposal.json'))), base = JSON.parse(read(join(oldDirectory, proposal.baseFile)));
  const expected = { schemaVersion: 'agent-lab-deals-1.0.0', names: proposal.names, episodes: proposal.proposals.map(entry => {
    const source = base.episodes.find(episode => episode.id === entry.baseEpisodeId); assert.equal(source.mode, entry.mode);
    const hands = structuredClone(source.hands);
    for (const transform of entry.transforms) {
      const [a, b] = transform.seats;
      if (transform.type === 'swapHands') [hands[a], hands[b]] = [hands[b], hands[a]];
      else if (transform.type === 'swapCards') {
        const [ca, cb] = transform.cards, ia = hands[a].indexOf(ca), ib = hands[b].indexOf(cb);
        assert.ok(ia >= 0 && ib >= 0); hands[a][ia] = cb; hands[b][ib] = ca;
      } else throw Error('Unsupported materialization transform');
    }
    return { id: entry.id, mode: entry.mode, dealer: entry.dealer, scores: entry.scores, bags: entry.bags,
      origin: 'planned authored stress fixture; not a played or reachable match-prefix claim', intendedCoverage: entry.intendedCoverage, hands };
  }) };
  assert.deepEqual(config, expected, 'Deals must be exactly the eight materialized proposals');
  assert.equal(config.episodes.length, 8); assert.equal(new Set(config.episodes.map(episode => episode.id)).size, 8);
  assert.deepEqual(config.names, ['Maya', 'Leo', 'Jason', 'Sarah']);
  for (const episode of config.episodes) {
    const state = start(episode); assertConservation(state); assertBoundary(state, packetFor(state));
    const prompt = promptForState(state);
    assert.ok(!prompt.includes(episode.id)); assert.ok(!prompt.includes(episode.origin));
    assert.ok(!/\{\{[^}]+\}\}/.test(prompt));
  }
  return { validated: 8, sourceCommit, productionEngine: true, exactMaterializedProposals: true, startingBoundaryChecks: 8, recordsCreated: false };
}
function verify() {
  const episodes = listEpisodes().map(episode => audit(episode.id));
  return { status: episodes.every(episode => episode.complete) ? 'complete' : 'incomplete', planned: 8,
    completeHands: episodes.filter(episode => episode.complete).length, partialHands: episodes.filter(episode => episode.status === 'partial').length,
    notRunHands: episodes.filter(episode => episode.status === 'not-run').length,
    decisions: episodes.reduce((sum, episode) => sum + episode.accepted, 0), rejected: episodes.reduce((sum, episode) => sum + episode.rejected, 0),
    forced: episodes.reduce((sum, episode) => sum + episode.forced, 0), jevCalls: 0,
    episodes: episodes.map(({ episodeId, status, accepted, rejected, forced, boundaryChecks, tricks, result }) => ({ episodeId, status, decisions: accepted, rejected, forced, boundaryChecks,
      completedTricks: tricks, bids: result.bids, tricks: result.tricks, scores: result.scores, bags: result.bags })),
    scope: 'Observed transcript and deterministic state integrity only; no model-quality estimate.' };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, id, agentId, metadataFile] = process.argv.slice(2);
  let output;
  if (command === 'list') output = listEpisodes();
  else if (command === 'validate') output = validate();
  else if (command === 'verify') output = verify();
  else if (command === 'prompt') { const { state } = load(id); console.log(actionable(state) ? promptForState(state) : 'COMPLETE'); }
  else if (command === 'packet') output = packetFor(load(id).state);
  else if (command === 'status') { const { rec, state } = load(id); output = { decisions: rec.decisions.length, rejections: rec.rejections.length, ...compact(state) }; }
  else if (command === 'audit') output = audit(id);
  else if (command === 'accept') output = accept(id, readFileSync(0, 'utf8'), agentId, metadataFile ? JSON.parse(read(resolve(metadataFile))) : {});
  else throw Error('Commands: list, validate, verify, prompt ID, packet ID, status ID, audit ID, accept ID AGENT [TRANSPORT_JSON_FILE] (response on stdin)');
  if (output !== undefined) console.log(JSON.stringify(output, null, 2));
}
