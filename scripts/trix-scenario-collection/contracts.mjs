import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import { validateTrixActorPacket } from '../../web/shared/validators.mjs';

const root = new URL('../../', import.meta.url);
const schemaRoot = new URL('contracts/trix-scenario-collection/', root);
const templateRoot = fileURLToPath(new URL('planning/implementation/coach-lab/trix-scenario-collection/prompts/', root));
const ajv = new Ajv2020({ allErrors: true, strict: true });
const games = new URL('web/shared/games/', root);
for (const file of readdirSync(games).filter(f => f.endsWith('.schema.json'))) ajv.addSchema(JSON.parse(readFileSync(new URL(file, games), 'utf8')));
ajv.addSchema(JSON.parse(readFileSync(new URL('web/shared/contracts.schema.json', root), 'utf8')));
const validators = new Map();
function validate(name, value) {
  let validator = validators.get(name);
  if (!validator) { validator = ajv.compile(JSON.parse(readFileSync(new URL(`${name}.schema.json`, schemaRoot), 'utf8'))); validators.set(name, validator); }
  if (!validator(value)) throw Error(`${name} schema: ${ajv.errorsText(validator.errors)}`);
  return value;
}
function requireFact(condition, message) { if (!condition) throw Error(message); }
export function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
}
export function digest(value) { return createHash('sha256').update(canonical(value)).digest('hex'); }
const labels = ['S', 'W', 'N', 'E'];
const suits = { S: '♠', H: '♥', D: '♦', C: '♣' };
const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
export function displayCard(card, seat) {
  requireFact(/^[SHDC](?:[2-9]|10|J|Q|K|A)$/.test(card), 'Invalid native card');
  if (seat !== undefined) requireFact(Number.isInteger(seat) && seat >= 0 && seat <= 3, 'Invalid native seat');
  return seat === undefined ? `|${suits[card[0]]}|${card.slice(1)}|` : `|${labels[seat]}|${suits[card[0]]}|${card.slice(1)}|`;
}
export function nativeCard(card) {
  const match = /^\|([♠♥♦♣])\|(A|K|Q|J|10|[2-9])\|$/.exec(card);
  requireFact(match, 'Invalid display card');
  return Object.keys(suits).find(k => suits[k] === match[1]) + match[2];
}
const objectiveFor = variant => variant.endsWith('-partners') ? 'combined-team-request-points' : 'own-request-points';
function checkIdentity(variant, request, pin) {
  requireFact(['basic-solo', 'complex-solo', 'basic-partners', 'complex-partners'].includes(variant), 'Unsupported Trix variant');
  requireFact((variant.startsWith('complex') ? ['complex'] : ['diamonds', 'king', 'queens', 'lutoosh']).includes(request), 'Unsupported request for variant');
  const expected = { gameId: 'trix', variantId: variant, moduleVersion: '2.2.0', ruleProfileId: `trix-${variant}-${variant.endsWith('partners') ? '1.1.0' : '1.0.0'}`, stateSchemaVersion: '1.2.0', observationSchemaVersion: '1.2.0', publicSchemaVersion: '1.2.0', eventSchemaVersion: '1.0.0' };
  requireFact(canonical(pin) === canonical(expected), 'Trix pin/profile/variant mismatch');
}
function checkNative(packet) {
  requireFact(validateTrixActorPacket(packet), `Native Trix actor packet schema: ${JSON.stringify(validateTrixActorPacket.errors)}`);
  const o = packet.observation;
  requireFact(packet.seat === o.seat && packet.phase === o.phase && packet.variantId === o.variantId && packet.gameId === o.gameId && packet.seat === o.turn, 'Native actor identity/turn mismatch');
  requireFact(packet.publicSchemaVersion === '1.2.0', 'Historical native actor packet is not a collection packet');
  requireFact(['playing', 'declare-doubles'].includes(packet.phase), 'Unsupported response phase');
  requireFact(new Set(packet.candidates.map(c => c.id)).size === packet.candidates.length, 'Duplicate native candidate ID');
  const actions = new Set();
  for (const c of packet.candidates) {
    const a = c.public;
    requireFact(a.kind === (packet.phase === 'playing' ? 'play-card' : 'declare-doubles'), 'Native candidate phase mismatch');
    const cards = a.kind === 'play-card' ? [a.card] : (a.cards ?? []);
    requireFact(new Set(cards).size === cards.length && cards.every(card => o.hand.includes(card)), 'Native legal candidate is not in own hand');
    const key = a.kind === 'play-card' ? `play:${a.card}` : `doubles:${cards.join(',')}`;
    requireFact(c.id === key, 'Native candidate ID/public action mismatch');
    const semanticKey = [...cards].sort().join(',');
    requireFact(!actions.has(semanticKey), 'Duplicate native legal action'); actions.add(semanticKey);
  }
  return packet;
}
const play = p => ({ actor: p.seat, actorLabel: labels[p.seat], card: displayCard(p.card, p.seat) });
const ledger = e => ({ ...structuredClone(e), ...(e.card === undefined ? {} : { card: displayCard(e.card) }) });
function competition(actor, variant) {
  const partners = variant.endsWith('partners');
  return { actor, actorLabel: labels[actor], mode: partners ? 'partners' : 'solo', competitors: partners ? [{ id: 'NS', seats: [0, 2], seatLabels: ['S', 'N'] }, { id: 'EW', seats: [1, 3], seatLabels: ['W', 'E'] }] : labels.map((label, seat) => ({ id: `seat-${seat}`, seats: [seat], seatLabels: [label] })), partner: partners ? (actor + 2) % 4 : null };
}
function currentTrick(o) {
  let winner = o.trick[0] ?? null;
  for (const p of o.trick) if (p.card[0] === winner.card[0] && ranks.indexOf(p.card.slice(1)) > ranks.indexOf(winner.card.slice(1))) winner = p;
  const stillToAct = [];
  if (o.phase === 'playing') {
    let seat = o.turn;
    for (let i = 0; i < 4 - o.trick.length; i++) { stillToAct.push(seat); seat = (seat + 3) % 4; }
  }
  return { plays: o.trick.map(play), winningActor: winner?.seat ?? null, winningActorLabel: winner ? labels[winner.seat] : null, stillToAct };
}
export function projectPlayerPacket(nativePacket, pin, revision, invocationId, rules) {
  const n = checkNative(nativePacket), o = n.observation;
  checkIdentity(n.variantId, o.request, pin);
  requireFact(rules && Object.keys(rules).sort().join(',') === 'description,name,objective,text', 'Rules descriptor must contain exactly name,description,text,objective');
  requireFact(rules.objective === objectiveFor(n.variantId), 'Rules objective mismatch');
  const descriptor = { gameId: 'trix', variant: n.variantId, request: o.request, pin: structuredClone(pin), name: rules.name, description: rules.description };
  const packet = {
    schemaVersion: 'trix-scenario-player-packet-1.0.0', invocationId, actor: n.seat, actorLabel: labels[n.seat], nativeRevision: revision,
    gameId: 'trix', variant: n.variantId, request: o.request, pin: structuredClone(pin),
    sharedRulesHash: digest({ descriptor, rulesAndScoring: rules.text }), sharedGameDescriptor: descriptor, rulesAndScoring: rules.text,
    seatAndCompetition: competition(n.seat, n.variantId), objective: rules.objective,
    ownHand: o.hand.map(card => displayCard(card, n.seat)), handCounts: [...o.handCounts],
    publicPhaseAndTurn: { phase: n.phase, turn: o.turn, turnLabel: labels[o.turn], kingdom: o.kingdom, dealNumber: o.dealNumber, h7Owner: o.owner, h7OwnerLabel: labels[o.owner], turnOrder: ['S', 'E', 'N', 'W'] },
    declarations: o.declarations.map(d => ({ actor: d.seat, actorLabel: labels[d.seat], cards: d.cards.map(card => displayCard(card, d.seat)), ref: d.ref })),
    completedTricks: o.tricks.map(t => ({ number: t.number, leader: t.leader, leaderLabel: labels[t.leader], winner: t.winner, winnerLabel: labels[t.winner], plays: t.plays.map(play), scoreComponents: o.ledger.filter(e => e.dealNumber === o.dealNumber && e.request === o.request && e.trick === t.number).map(ledger) })),
    currentTrick: currentTrick(o),
    publicScoresAndBonusFacts: { totals: structuredClone(o.totals), requestTotals: structuredClone(o.requestTotals), kingdomTotals: structuredClone(o.kingdomTotals), requestSeatTotals: o.requestSeatTotals ? [...o.requestSeatTotals] : null, ledger: o.ledger.map(ledger), withheldBonuses: o.withheldBonuses.map(b => ({ ...structuredClone(b), card: displayCard(b.card) })), lastExternalLeader: structuredClone(o.lastExternalLeader) },
    legalOptions: n.candidates.map(c => c.public.kind === 'play-card' ? { candidateId: c.id, kind: 'play-card', card: displayCard(c.public.card) } : { candidateId: c.id, kind: 'declare-doubles', cards: (c.public.cards ?? []).map(card => displayCard(card)) })
  };
  return validatePlayerPacket(packet);
}
export function validatePlayerPacket(packet) {
  validate('packet', packet); checkIdentity(packet.variant, packet.request, packet.pin);
  const d = packet.sharedGameDescriptor;
  requireFact(d.gameId === packet.gameId && d.variant === packet.variant && d.request === packet.request && canonical(d.pin) === canonical(packet.pin), 'Shared descriptor identity mismatch');
  requireFact(digest({ descriptor: d, rulesAndScoring: packet.rulesAndScoring }) === packet.sharedRulesHash, 'Shared rules hash mismatch');
  requireFact(packet.objective === objectiveFor(packet.variant), 'Packet objective mismatch');
  requireFact(packet.actorLabel === labels[packet.actor] && packet.publicPhaseAndTurn.turn === packet.actor && packet.publicPhaseAndTurn.turnLabel === packet.actorLabel, 'Packet actor/turn mismatch');
  requireFact(canonical(packet.seatAndCompetition) === canonical(competition(packet.actor, packet.variant)), 'Seat competition mismatch');
  requireFact(packet.ownHand.every(c => c.startsWith(`|${packet.actorLabel}|`)) && new Set(packet.ownHand).size === packet.ownHand.length && packet.handCounts[packet.actor] === packet.ownHand.length, 'Own hand/count mismatch');
  requireFact(packet.publicPhaseAndTurn.h7OwnerLabel === labels[packet.publicPhaseAndTurn.h7Owner], 'H7 owner label mismatch');
  const own = new Set(packet.ownHand.map(c => c.slice(2)));
  const ids = new Set(), actions = new Set();
  for (const option of packet.legalOptions) {
    requireFact(option.kind === (packet.publicPhaseAndTurn.phase === 'playing' ? 'play-card' : 'declare-doubles'), 'Legal option phase mismatch');
    const cards = option.kind === 'play-card' ? [option.card] : option.cards;
    requireFact(cards.every(c => own.has(c)) && new Set(cards).size === cards.length, 'Legal option not in own hand');
    const key = option.kind === 'play-card' ? `play:${nativeCard(option.card)}` : `doubles:${cards.map(nativeCard).join(',')}`;
    requireFact(option.candidateId === key && !ids.has(key), 'Legal candidate ID mismatch or duplicate'); ids.add(key);
    const action = [...cards].sort().join(','); requireFact(!actions.has(action), 'Duplicate legal option'); actions.add(action);
  }
  for (const t of packet.completedTricks) {
    requireFact(t.leaderLabel === labels[t.leader] && t.winnerLabel === labels[t.winner], 'Trick seat label mismatch');
    for (const p of t.plays) requireFact(p.actorLabel === labels[p.actor] && p.card.startsWith(`|${p.actorLabel}|`), 'Trick card seat mismatch');
  }
  requireFact(packet.completedTricks.every((t, index) => t.number === index + 1), 'Public trick chronology mismatch');
  for (const d of packet.declarations) requireFact(d.actorLabel === labels[d.actor] && d.cards.every(c => c.startsWith(`|${d.actorLabel}|`)), 'Declaration seat mismatch');
  for (const p of packet.currentTrick.plays) requireFact(p.actorLabel === labels[p.actor] && p.card.startsWith(`|${p.actorLabel}|`), 'Current trick seat mismatch');
  requireFact(packet.currentTrick.winningActorLabel === (packet.currentTrick.winningActor === null ? null : labels[packet.currentTrick.winningActor]), 'Current winner label mismatch');
  return packet;
}
export function renderPrompt(packet, phase, options = {}) {
  validatePlayerPacket(packet);
  const declared = ['declare-doubles', 'declaration'].includes(phase);
  requireFact((declared ? 'declare-doubles' : phase === 'play' ? 'playing' : phase) === packet.publicPhaseAndTurn.phase, 'Prompt phase mismatch');
  const values = { actorSeat: packet.actorLabel, sharedGameDescriptor: canonical(packet.sharedGameDescriptor), sourceBackedRulesAndScoring: packet.rulesAndScoring, sharedRulesHash: packet.sharedRulesHash, seatAndCompetition: canonical(packet.seatAndCompetition), objectiveText: packet.objective, invocationId: packet.invocationId, publicPhaseAndTurn: canonical(packet.publicPhaseAndTurn), ownHand: canonical(packet.ownHand), handCounts: canonical(packet.handCounts), declarations: canonical(packet.declarations), completedTricks: canonical(packet.completedTricks), currentTrick: canonical(packet.currentTrick), publicScoresAndBonusFacts: canonical(packet.publicScoresAndBonusFacts), legalCards: canonical(packet.legalOptions), legalDeclarationSubsets: canonical(packet.legalOptions) };
  const template = readFileSync(join(options.templateRoot ?? templateRoot, declared ? 'declaration.md' : 'player.md'), 'utf8');
  const rendered = template.replace(/\{\{([a-zA-Z]+)\}\}/g, (_, key) => { requireFact(Object.hasOwn(values, key), `Unknown prompt placeholder: ${key}`); return values[key]; });
  requireFact(!/\{\{[^}]+\}\}/.test(rendered), 'Unresolved prompt placeholder');
  const bytes = Buffer.from(rendered, 'utf8');
  return { bytes, sha256: createHash('sha256').update(bytes).digest('hex') };
}
export function resolveResponse(nativePacket, response) {
  const packet = checkNative(nativePacket);
  const declared = packet.phase === 'declare-doubles';
  validate(declared ? 'declaration-response' : 'play-response', response);
  const cards = declared ? response.cards.map(nativeCard).sort() : [nativeCard(response.card)];
  const candidate = packet.candidates.find(c => canonical(declared ? [...(c.public.cards ?? [])].sort() : [c.public.card]) === canonical(cards));
  requireFact(candidate, 'Response is not a native legal candidate');
  return candidate.id;
}
export function validateCampaign(plan) {
  validate('campaign', plan);
  for (const phase of plan.phases) {
    requireFact(phase.targetCases <= phase.maxCases && phase.maxCases <= plan.selection.maxCorpusCases, 'Phase case cap mismatch');
    requireFact(Object.values(phase.requestTargets).reduce((sum, n) => sum + n, 0) === phase.targetCases, 'Request targets must sum to phase target');
    requireFact(phase.maxRequestsPerContract <= phase.maxCompletedRequests, 'Per-request completion cap mismatch');
  }
  requireFact(plan.phases.reduce((sum, p) => sum + p.targetCases, 0) <= plan.selection.maxCorpusCases, 'Overall corpus cap mismatch');
  return plan;
}
