import assert from 'node:assert/strict';
import test from 'node:test';
import { observe } from '../observations/index.ts';
import { analyzeObservedSpades } from '../games/spades/cases/profile.ts';
import { spadesCaseCatalog,spadesCasePrerequisite,spadesClaimApplies } from '../games/spades/cases/catalog.ts';
import { resolveCases } from '../strategy/cases/resolve.ts';
import { actionId } from '../game/index.ts';
import { sourceState } from './support/observed-spades.ts';
import { rotateSpadesFixture } from './support/spades-fixtures.ts';
import type { CaseDefinition } from '../strategy/cases/types.ts';

test('M07 typed wrappers recognize reachable positives/opposites and all seat rotations', () => {
  for(const [fixture,id] of [['partner-resource','CASE-01'],['no-entry','CASE-02'],['sweep','CASE-03'],['unbeatable-lead','CASE-04']]) {
    for(const rotation of [0,1,2,3]) {
      const state=rotateSpadesFixture(sourceState(fixture),rotation);
      const observation=observe(state,state.turn!),analysis=analyzeObservedSpades(observation),input={observation,facts:analysis.facts};
      const result=resolveCases(input,spadesCaseCatalog,{legal:observation.legalActions.map(actionId),actionId:id=>id,
        prerequisite:spadesCasePrerequisite,selectedId:actionId(analysis.action),claimApplies:spadesClaimApplies});
      assert.ok(result.matchedIds.includes(id),`${fixture} rotation ${rotation}`);
      if(id==='CASE-01') assert.equal(result.assessments.find(entry=>entry.id===id)?.evidence,'heuristic');
    }
  }
  for(const [fixture,id] of [['partner-not-yet-void','CASE-01'],['opponent-trump-not-excluded','CASE-01'],['partner-resource-no-entry','CASE-01'],['no-entry-outside-heart','CASE-02'],['sweep-earlier','CASE-03']]) {
    const state=sourceState(fixture),observation=observe(state,state.turn!),analysis=analyzeObservedSpades(observation);
    assert.ok(!spadesCaseCatalog.find(entry=>entry.id===id)!.trigger({observation,facts:analysis.facts}),fixture);
  }
});
test('M07 absent prerequisite suppresses preference; changing selected card drops its factual reason', () => {
  const state=sourceState('partner-resource'),observation=observe(state,state.turn!),facts=analyzeObservedSpades(observation).facts;
  const result=resolveCases({observation,facts},[spadesCaseCatalog[0]],{legal:observation.legalActions.map(actionId),actionId:id=>id,prerequisite:()=>false});
  assert.equal(result.matchedIds.length,0);assert.equal(result.alternatives.length,0);assert.ok(result.exclusions.length);
  const lead=sourceState('unbeatable-lead'),obs=observe(lead,lead.turn!),analysis=analyzeObservedSpades(obs),entry=spadesCaseCatalog[3];
  const input={observation:obs,facts:analysis.facts};
  const old=resolveCases(input,[entry],{legal:obs.legalActions.map(actionId),actionId:id=>id,selectedId:'play:DK',claimApplies:spadesClaimApplies});
  assert.ok(old.selectedActionClaims.some(claim=>claim.args.actionId==='play:DK'));
  const changed=resolveCases(input,[entry],{legal:obs.legalActions.map(actionId),actionId:id=>id,selectedId:'play:D3',claimApplies:spadesClaimApplies});
  assert.ok(changed.selectedActionClaims.every(claim=>claim.args.actionId!=='play:DK'));
});
test('M07 a named objective rule can reverse reasonable alternatives without pretending exact strategy', () => {
  const make=(id:string,action:string):CaseDefinition<string,string,string>=>({id,version:'1',family:'objective-demo',variants:['test'],phases:['play'],summary:id,
    prerequisites:[],trigger:()=>true,excluded:()=>[],priority:1,conflictsWith:[],
    assess:()=>({preferred:[action],reasonable:[],evidence:'heuristic',claims:[id],limitations:['synthetic resolver test, no game-strength evidence']}),
    cue:{id,version:'1'},fixtures:[],counterexamples:[],sources:[],review:'hypothesis'});
  const cases=[make('win-now','high'),make('avoid-liability','low')];
  for(const [objective,selected] of [['take-trick','high'],['avoid-penalty','low']]) {
    const result=resolveCases(objective,cases,{legal:['high','low'],actionId:id=>id,
      rule:{id:objective,version:'1',resolve:()=>[selected]}});
    assert.deepEqual(result.alternatives,[selected]);assert.ok(result.assessments.every(entry=>entry.evidence==='heuristic'));
  }
});
