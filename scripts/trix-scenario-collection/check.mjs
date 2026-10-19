// Reproducible fixture-only gate; never starts a model or a collected episode.
import assert from 'node:assert/strict';
import { mkdirSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runBoundedNative } from '../bounded-native-run.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
const directory=resolve(root,'.local/evaluation/trix-scenarios/native');mkdirSync(directory,{recursive:true});
const steps=[
  ['native-tests',['scripts/windows-env.mjs','go','test','./server/internal/evaluation/trixcollection','./server/cmd/trixcollection']],
  ['native-build',['scripts/windows-env.mjs','go','build','-trimpath','-o',resolve(directory,process.platform==='win32'?'trixcollection.exe':'trixcollection'),'./server/cmd/trixcollection']],
  ['schema-drift',['scripts/trix-scenario-collection/generate.mjs','--check']],
  ['operator-tests',['--test','--test-isolation=none',...readdirSync(resolve(root,'web/tests')).filter(n=>n.startsWith('trix-scenario-')&&n.endsWith('.test.ts')).sort().map(n=>'web/tests/'+n)]],
];
for(const[name,args]of steps){
  const result=await runBoundedNative(process.execPath,args,{cwd:root,milliseconds:120000});
  process.stdout.write(`${name}: ${result.status}\n${result.output??''}\n`);
  assert.equal(result.status,'passed',`${name} did not pass`);
}
