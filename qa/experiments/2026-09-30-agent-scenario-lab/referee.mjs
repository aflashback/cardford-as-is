// Offline research only. Production reducers remain the authority; no model/network invocation here.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { createGame, apply, collectTrick, legalActions, actionId } from '../../../web/server/game/index.ts';
import { observe } from '../../../web/server/observations/index.ts';
import { analyzeDecision } from '../../../web/server/strategy/index.ts';
const dir = fileURLToPath(new URL('.', import.meta.url));
const config = JSON.parse(readFileSync(dir + 'deals.json', 'utf8'));
const rules = readFileSync(dir + 'templates/spades-rules.md', 'utf8');
const player = readFileSync(dir + 'templates/player.md', 'utf8');
const hash = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
const get = id => { const e = config.episodes.find(e => e.id === id); if (!e) throw Error('Unknown episode'); return e; };
function start(e) {
  if (e.hands.length !== 4 || e.hands.some(h => h.length !== 13)) throw Error('Need four hands of thirteen');
  const first = (e.dealer + 1) % 4;
  const deck = Array.from({length: 52}, (_, i) => e.hands[(first + i) % 4][Math.floor(i / 4)]);
  const s = createGame({id: e.id, mode: e.mode, dealer: e.dealer}, deck);
  s.scores = [...e.scores]; s.bags = [...e.bags];
  return s;
}
const path = id => dir + 'records/' + id + '.json';
function load(id) {
  const episode = get(id);
  const rec = existsSync(path(id)) ? JSON.parse(readFileSync(path(id), 'utf8')) : {schemaVersion:'agent-lab-record-1.0.0', episodeId:id, sourceCommit:'94a59cb', dealHash:hash(episode), promptHash:hash(player + rules), provider:'frontier-subagent-research', observedProviderModel:'not exposed by collaboration tool', jevCalls:0, decisions:[], rejections:[]};
  if (rec.dealHash !== hash(episode) || rec.promptHash !== hash(player + rules)) throw Error('Frozen inputs changed');
  let state = start(episode);
  for (const d of rec.decisions) { state = apply(state, d.action); if (state.phase === 'trick-end') state = collectTrick(state); }
  return {episode,rec,state};
}
function safePacket(s) {
  const o = observe(s, s.turn);
  return { game:s.mode, ruleProfile:s.ruleProfileId, name:config.names[s.turn], seat:s.turn, names:config.names, dealer:s.dealer, competition:s.mode === 'spades-partners' ? [[0,2],[1,3]] : [[0],[1],[2],[3]], phase:s.phase, hand:o.hand, bids:o.bids, tricks:o.tricks, scores:o.scores, bags:o.bags, completedTricks:o.history, currentTrick:o.trick, spadesBroken:s.spadesBroken, legalActions:legalActions(s,s.turn).map(actionId).sort() };
}
function prompt(s) {
  const packet = safePacket(s);
  return player.replaceAll('{{NAME}}',packet.name).replaceAll('{{SEAT}}',String(packet.seat)).replaceAll('{{GAME}}',s.mode).replace('{{RULES}}',rules).replace('{{SEAT_PACKET}}',JSON.stringify(packet));
}
function compact(s) {
  return {phase:s.phase, turn:s.turn, bids:s.bids, tricks:s.tricks, scores:s.scores, bags:s.bags, history:s.history, handResult:s.handResult};
}
function save(id,rec) { mkdirSync(dir+'records',{recursive:true}); writeFileSync(path(id),JSON.stringify(rec,null,2)+'\n'); }
function accept(id,raw,agent) {
  const {rec,state} = load(id);
  const seq = rec.decisions.length + 1;
  const text = raw.trim();
  const match = /^(BID: (?:[0-9]|1[0-3])|PLAY: [CDHS](?:[2-9JQKA]|10))\r?\n\r?\n([^\r\n]+)$/.exec(text);
  const words = match?.[2].trim().split(/\s+/).length ?? 0;
  const fail = reason => {rec.rejections.push({seq,agent,raw,responseHash:hash(raw),reason}); save(id,rec); return {accepted:false,reason};};
  if (!match || words < 15 || words > 100 || /```/.test(text)) return fail('Response must be one action, blank line and one 15-100 word paragraph');
  const action = match[1].startsWith('BID:') ? {kind:'bid',seat:state.turn,bid:Number(match[1].slice(5))} : {kind:'play',seat:state.turn,card:match[1].slice(6)};
  if (!legalActions(state,state.turn).some(a => actionId(a) === actionId(action))) return fail('Action is not in the complete legal set');
  const packet = safePacket(state);
  const next = apply(state,action);
  const after = next.phase === 'trick-end' ? collectTrick(next) : next;
  rec.decisions.push({seq,agent,seat:state.turn,name:config.names[state.turn],packet,packetHash:hash(packet),rawResponse:raw,responseHash:hash(raw),justification:match[2],action,forced:packet.legalActions.length===1});
  rec.result=compact(after);
  save(id,rec);
  return {accepted:true,seq,next:['bid','play'].includes(after.phase)?safePacket(after):compact(after)};
}
function audit(id) {
  const {episode,rec,state} = load(id);
  let s = start(episode); let boundaryChecks=0;
  const comparisons=[];
  for (const d of rec.decisions) {
    const packet=safePacket(s);
    if (hash(packet)!==d.packetHash || JSON.stringify(packet)!==JSON.stringify(d.packet)) throw Error('Packet replay mismatch');
    const hidden=structuredClone(s); const others=[0,1,2,3].filter(x=>x!==s.turn);
    [hidden.hands[others[0]],hidden.hands[others[1]]] = [hidden.hands[others[1]],hidden.hands[others[0]]];
    // Canonical packet excludes other holdings; this checks structural projection, not feasible-deal calibration.
    if(hash(safePacket(hidden))!==hash(packet)) throw Error('Other hands affected packet');
    boundaryChecks++;
    const observation=observe(s,s.turn);
    const d0=analyzeDecision(observation,'spades-tactics-2.1.0');
    const d1=analyzeDecision(observation,'spades-plan-3.4.0');
    comparisons.push({seq:d.seq,seat:d.seat,agent:actionId(d.action),forced:d.forced,d0:actionId(d0.action),d1:actionId(d1.action),d1SelectedBy:d1.decision?.selectedBy,scenarioIds:d1.scenarioIds,agreementIsNotCorrectness:true});
    s=apply(s,d.action); if(s.phase==='trick-end') s=collectTrick(s);
  }
  const report={episodeId:id,complete:['hand-end','match-end'].includes(state.phase),accepted:rec.decisions.length,rejected:rec.rejections.length,boundaryChecks,tricks:state.history.length,uniquePlayed:new Set(state.history.flatMap(t=>t.plays.map(p=>p.card))).size,comparisons,result:compact(state)};
  writeFileSync(dir+'records/'+id+'.audit.json',JSON.stringify(report,null,2)+'\n');
  return {...report,comparisons:undefined,disagreementsWithD0:comparisons.filter(x=>x.agent!==x.d0).length,disagreementsWithD1:comparisons.filter(x=>x.agent!==x.d1).length};
}
const [command,id,agent]=process.argv.slice(2);
if(command==='list') console.log(JSON.stringify(config.episodes.map(e=>({id:e.id,mode:e.mode,intendedCoverage:e.intendedCoverage})),null,2));
else if(command==='validate') {for(const e of config.episodes) start(e); console.log('Both authored deals contain exactly the standard 52 cards, thirteen per seat.');}
else if(command==='prompt') {const {state}=load(id); if(!['bid','play'].includes(state.phase)) console.log('COMPLETE'); else console.log(prompt(state));}
else if(command==='packet') console.log(JSON.stringify(safePacket(load(id).state)));
else if(command==='accept') console.log(JSON.stringify(accept(id,readFileSync(0,'utf8'),agent)));
else if(command==='status') {const {rec,state}=load(id); console.log(JSON.stringify({decisions:rec.decisions.length,rejections:rec.rejections.length,...compact(state)}));}
else if(command==='audit') console.log(JSON.stringify(audit(id)));
else throw Error('Commands: list, validate, prompt ID, packet ID, accept ID AGENT (response on stdin), status ID, audit ID');
