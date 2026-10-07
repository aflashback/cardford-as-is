import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { TokenActorPacket, TokenPresentation } from '../shared/contracts.ts';
import { tokenDisplay, TokenConformanceTable } from '../src/api/tokenConformance.ts';
import { presentation, resolveCandidate } from '../src/api/presentation.ts';

const display: TokenPresentation = { id:'token-instance', gameId:'test-token', variantId:'neighbour-teams', seat:0,
  observation:{gameId:'test-token',variant:'neighbour-teams',seat:0,phase:'reveal',own:[1,5,9,13,17],held:[5,5,5,5],
    current:[],cycles:[],collections:[0,0,0,0],competition:[{id:'A',seats:[0,1]},{id:'B',seats:[2,3]}],turn:0,winners:[]} };
const actor:TokenActorPacket={publicSchemaVersion:'2.0.0',gameId:'test-token',variantId:'neighbour-teams',seat:0,phase:'reveal',observation:display.observation,
  candidates:display.observation.own.map(token=>({id:`reveal:${token}`,public:{kind:'reveal',token}}))};
test('test-only token UI adapter presents actual numeric actions and adjacent teams',()=>{
  assert.equal(tokenDisplay(display,actor).choices[0].id,'reveal:1');
  const html=renderToStaticMarkup(createElement(TokenConformanceTable,{presentation:display,packet:actor,busy:false,onReveal:()=>{}}));
  assert.match(html,/Reveal 17/);assert.match(html,/A: seats 0, 1/);assert.match(html,/B: seats 2, 3/);
  assert.doesNotMatch(html,/dealer|trump|spades|bid|C2|Reveal 2</i);
  const busy=renderToStaticMarkup(createElement(TokenConformanceTable,{presentation:display,packet:actor,busy:true,onReveal:()=>{}}));
  assert.equal((busy.match(/disabled=""/g)??[]).length,5);
});
test('numeric UI rejects foreign private data, mismatched candidates and card adapters',()=>{
  assert.throws(()=>tokenDisplay({...display,observation:{...display.observation,hidden:[2,6]}} as TokenPresentation,actor));
  assert.throws(()=>tokenDisplay(display,{...actor,candidates:[{id:'reveal:2',public:{kind:'reveal',token:2}}]}));
  assert.throws(()=>tokenDisplay(display,{...actor,seat:1}));
  assert.throws(()=>presentation({publicSchemaVersion:'2.0.0',gameId:'test-token',variantId:'neighbour-teams',seat:0,phase:'reveal',table:display.observation,accessUnit:null},display,actor,display.id));
  assert.throws(()=>resolveCandidate(actor,{kind:'play',card:'C2'}));
});
