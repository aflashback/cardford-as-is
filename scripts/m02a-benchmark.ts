// The current optimized native modules are the comparator, never the legacy reducer.
import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { hashState } from '../web/server/tests/support/module-parity.ts';
import {
  createGame,
  apply,
  collectTrick,
  nextHand,
  legalActions,
  actionId,
} from '../web/server/game/index.ts';
import { observe } from '../web/server/observations/index.ts';
import { validateStoredGameState } from '../web/server/records/state-validation.ts';
import { observationView } from '../web/server/http/views.ts';
const run = () => {
  const corpus = JSON.parse(readFileSync('web/server/tests/fixtures/legacy-module-document.json', 'utf8'));
  const c = {
    checkpoints: 0,
    transitions: 0,
    stateBytes: 0,
    viewBytes: 0,
    frameBytes: 0,
    finalDigests: [] as string[],
  };
  for (const saved of corpus.cases) {
    let state = createGame(saved.config, saved.deal);
    const commands = saved.config.mode === 'hearts' ? saved.commands.slice(0, 1) : saved.commands;
    const capture = (index: number) => {
      validateStoredGameState({ id: state.id, revision: index + 1, document: { state } });
      const observations = [0, 1, 2, 3].map((seat) => observe(state, seat));
      const views = observations.map((o) => observationView(state.id, o));
      const candidateIds = [0, 1, 2, 3].map((seat) => legalActions(state, seat).map(actionId));
      const frame = { commandIndex: index, state, observations, views, candidateIds };
      const bytes = Buffer.byteLength(JSON.stringify(frame));
      if (bytes > 512 * 1024) throw new Error('frame budget');
      const stateBytes = Buffer.byteLength(JSON.stringify(state));
      if (stateBytes > 256 * 1024) throw new Error('state budget');
      c.checkpoints++;
      c.frameBytes += bytes;
      c.stateBytes += stateBytes;
      c.viewBytes += views.reduce((n, v) => n + Buffer.byteLength(JSON.stringify(v)), 0);
    };
    if (commands.length > 256) throw new Error('command budget');
    capture(-1);
    for (const [i, cmd] of commands.entries()) {
      state =
        cmd.type === 'action'
          ? apply(state, cmd.action)
          : cmd.type === 'collect-trick'
            ? collectTrick(state)
            : nextHand(state, cmd.deal);
      capture(i);
      c.transitions++;
    }
    c.finalDigests.push(hashState(state));
  }
  return c;
};
run();
const samples = [];
let work;
for (let i = 0; i < 5; i++) {
  const before = process.cpuUsage();
  const start = performance.now();
  work = run();
  const wallMs = performance.now() - start;
  const cpu = process.cpuUsage(before);
  samples.push({
    wallMs,
    cpuUserMs: cpu.user / 1000,
    cpuSystemMs: cpu.system / 1000,
    processPeakRSSKiB: process.resourceUsage().maxRSS,
  });
}
console.log(
  JSON.stringify({
    runtime: process.version,
    platform: process.platform,
    arch: process.arch,
    warmups: 1,
    samples,
    work,
  }),
);
