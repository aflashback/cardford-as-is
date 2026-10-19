import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';

const here=new URL('.',import.meta.url);
const events=JSON.parse(await readFile(new URL('events.json',here),'utf8'));
const cases=JSON.parse(await readFile(new URL('cases.json',here),'utf8'));
const find=(label,predicate)=>{
  const value=events.find(item=>item.label===label&&predicate(item));
  assert.ok(value,`Missing evidence for ${label}`);return value;
};
const initialSocket=find('reload-paused',item=>item.event==='Network.webSocketCreated');
const manual=find('manual-pause',item=>item.state?.running===false);
const pushed=find('paused-idle',item=>item.message?.playback?.generation===manual.state.generation);
assert.equal(pushed.requestId,initialSocket.requestId,'Pause retains the original WebSocket');
assert.equal(cases.cases.find(item=>item.case==='paused-idle').socketClosed,false);
const resumed=find('resume-before-network-loss',item=>item.state?.running===true);
assert.ok(events.some(item=>item.label==='network-offline'&&item.failed&&item.path==='/api/identity'));
assert.ok(!events.some(item=>item.label==='network-offline'&&item.playbackRequest),'No pause POST reached the HTTP transport');
const returned=find('network-return',item=>item.state?.playback?.running===true);
const stillRunning=find('explicit-recovery-resume',item=>item.state?.playback?.running===true);
assert.equal(returned.state.playback.generation,resumed.state.generation);
assert.equal(stillRunning.state.playback.generation,resumed.state.generation);
assert.ok(stillRunning.timestamp-returned.timestamp>=60,'The server run remained enabled after the failed pause');
find('native-blur',item=>item.state?.running===false);
find('portrait',item=>item.state?.running===false);
assert.ok(cases.cases.filter(item=>'explicitResumeStillRequired' in item).every(item=>item.explicitResumeStillRequired));
const revisions=events.flatMap(item=>[item.state?.revision,item.message?.revision]).filter(value=>value!==undefined);
assert.ok(revisions.length>0&&revisions.every(value=>value===120),'Testing preserved the current request and hand');
assert.equal(cases.restored.serverRunning,false);
const health=await (await fetch('http://127.0.0.1:4174/api/health')).json();
assert.equal(health.status,'ready');assert.equal(health.identity,'local-test');assert.equal(health.provider,'off');
const verified={verifiedAt:new Date().toISOString(),health,
  transport:'HTTP playback command; receive-only WebSocket retained during confirmed pause',
  reproducedGap:{frontend:'Paused; change unconfirmed',serverRunning:true,
    unchangedPlaybackGeneration:resumed.state.generation,
    secondsBetweenRunningSnapshots:stillRunning.timestamp-returned.timestamp,
    cause:'The identity preflight failed before a pause POST. Reconnection refreshed the server view but did not enforce the paused intent.'},
  sourceTests:{passed:50,command:'node --test --test-isolation=none web/tests/pause-lifecycle.test.ts web/tests/realtime-stream.test.ts web/tests/trick-playback.test.ts'},
  scope:cases.scope,finalState:cases.restored,
  limitations:['Not a real iOS/Android suspension or force-kill test.','No bot move was advanced during the network gap: the current game awaited the human request choice.','No load benchmark or production capacity result.','No app code changed.']};
await writeFile(new URL('verified.json',here),JSON.stringify(verified,null,2)+'\n');
console.log(JSON.stringify(verified,null,2));
