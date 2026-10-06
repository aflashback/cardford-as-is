// Build a new private performance input; never rewrite original M02/M02A data.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createGame } from '../web/server/game/legacy/v1.ts';
import { args, sha256, protocol, semanticHash } from './performance-common.mjs';
import assert from 'node:assert/strict';

const options=args();
if(typeof options.out!=='string') throw new Error('--out=<new workload path> required');
const corpusPath='web/server/tests/fixtures/legacy-module-document.json';
const expectedPath='qa/implementation/multi-game/m02a/corpus/original-expectations.json';
const corpusBytes=readFileSync(corpusPath),expectedBytes=readFileSync(expectedPath);
const corpus=JSON.parse(corpusBytes.toString('utf8')),original=JSON.parse(expectedBytes.toString('utf8'));
const cases=corpus.cases.map((saved:any,index:number)=> {
  const commands=saved.config.mode==='hearts'?saved.commands.slice(0,1):saved.commands;
  const initialStateJSON=JSON.stringify(createGame(saved.config,saved.deal));
  const expected=original.cases[index].checkpoints.slice(0,commands.length+1);
  assert.equal(semanticHash(JSON.parse(initialStateJSON)),expected[0].stateSha256);
  return {mode:saved.config.mode,configJSON:JSON.stringify(saved.config),deal:saved.deal,initialStateJSON,commandJSONs:commands.map((command:any)=>JSON.stringify(command)),expected};
});
const workload={protocol,privateTestOnly:true,sources:{[corpusPath]:sha256(corpusBytes),[expectedPath]:sha256(expectedBytes)},cases};
const file=resolve(options.out);if(!file.includes('performance-windows'))throw new Error('Use the new performance-windows evidence directory');
mkdirSync(dirname(file),{recursive:true});writeFileSync(file,JSON.stringify(workload)+'\n');
console.log(JSON.stringify({file,sha256:sha256(readFileSync(file)),checkpoints:cases.reduce((n:number,c:any)=>n+c.expected.length,0),transitions:cases.reduce((n:number,c:any)=>n+c.commandJSONs.length,0)}));
