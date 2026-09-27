import assert from 'node:assert/strict';
import test from 'node:test';
import { validateContract, assertContract } from '../../shared/validation.ts';
import type { ActionsRequest, GameView } from '../../shared/contracts.ts';

const actionBody: ActionsRequest = { commandId: 'cmd-1', gameId: 'game-1', expectedRevision: 1, controlLeaseToken: 'lease-1', action: { kind: 'play', card: 'C2' } };
const game: GameView = { id: 'game-1', mode: 'hearts', phase: 'pass', hand: ['C2', 'H3', 'SA'], handCounts: [3,3,3,3], bids: [null,null,null,null], tricks: [0,0,0,0], scores: [0,0,0,0], bags: [0,0,0,0], trick: [], history: [], turn: null, dealer: 0, handNumber: 1, heartsBroken: false, spadesBroken: false, passDirection: 'left', received: [], outgoing: [], handResult: null, currentWinner: null, legalActions: [{kind:'pass',cards:['C2','H3','SA']}] };

test('strict command boundary accepts intent and rejects sensitive or coerced inputs', () => {
  assert.equal(validateContract('ActionsRequest', actionBody), true);
  for (const field of ['seed','ownerId','plan','otherHands']) assert.equal(validateContract('ActionsRequest', {...actionBody,[field]:73}), false);
  assert.equal(validateContract('ActionsRequest', {...actionBody,expectedRevision:'1'}), false);
  assert.equal(validateContract('ActionsRequest', {...actionBody,action:{kind:'play',card:'C2',otherHands:[['SA']]}}), false);
  assert.equal(validateContract('ActionsRequest', {...actionBody,action:{kind:'bid',bid:'3'}}), false);
  assert.equal(validateContract('ActionsRequest', {...actionBody,action:{kind:'pass',cards:['C2','C2','SA']}}), false);
  assert.equal(validateContract('ActionsRequest', {...actionBody,action:{kind:'play',card:'CA',bid:3}}), false);
  assert.equal(validateContract('ActionsRequest', {...actionBody,controlLeaseToken:undefined}), false);
});

test('safe view requires explicit nullable fields and rejects private aggregate fields recursively', () => {
  assert.equal(validateContract('GameView',game),true);
  assert.equal(validateContract('GameView',{...game,hands:[['C2']]}),false);
  assert.equal(validateContract('GameView',{...game,turn:undefined}),false);
  assert.equal(validateContract('GameView',{...game,handCounts:[13,13,13]}),false);
  assert.equal(validateContract('GameView',{...game,trick:[{seat:1,card:'D2',seed:1}]}),false);
  assert.equal(validateContract('GameView',{...game,history:[{plays:[{seat:0,card:'C2'},{seat:1,card:'C3'},{seat:2,card:'C4'},{seat:3,card:'C5'}],winner:3,otherHands:[]}]}),false);
});

test('validation never strips unexpected properties or coerces caller values', () => {
  const value = {...actionBody,seed:17,expectedRevision:'1'};
  const original = structuredClone(value);
  assert.equal(validateContract('ActionsRequest',value),false);
  assert.deepEqual(value,original);
  assert.throws(() => assertContract('ActionsRequest',value), /Invalid ActionsRequest/);
});

test('review trials only allow safe frames and explicit simulated labels', () => {
  const trial={trialId:'trial-1',decisionId:'decision-1',label:'Possible continuation',liveRevision:1,frames:[{game,action:null,decisionId:'decision-1',notes:[]}]};
  assert.equal(validateContract('ReviewTrial',trial),true);
  assert.equal(validateContract('ReviewTrial',{...trial,label:'Original'}),false);
  assert.equal(validateContract('ReviewTrial',{...trial,frames:[{...trial.frames[0],game:{...game,seed:10}}]}),false);
});

test('public accounts cannot advertise unapproved prices or accept caller entitlements', () => {
  assert.equal(validateContract('OfferView',{id:'practice',name:'Practice and Learn',description:'Local fixture',price:null,currency:null}),true);
  assert.equal(validateContract('OfferView',{id:'practice',name:'Practice and Learn',description:'Local fixture',price:4.99,currency:'USD'}),false);
  assert.equal(validateContract('AccountCommand',{commandId:'cmd-1',action:'select-plan',plan:'practice'}),true);
  assert.equal(validateContract('AccountCommand',{commandId:'cmd-1',action:'select-plan'}),false);
  assert.equal(validateContract('AccountCommand',{commandId:'cmd-1',action:'cancel',canPlay:true}),false);
});

test('sealed passing cannot expose the hidden opening actor', () => {
  assert.equal(validateContract('GameView',{...game,turn:2}),false);
  assert.equal(validateContract('GameView',{...game,currentWinner:2}),false);
});

test('all public array sizes, action discriminants and numeric ranges remain runtime constraints', () => {
  assert.equal(validateContract('GameAction',{kind:'bid',bid:14}),false);
  assert.equal(validateContract('GameAction',{kind:'bid',bid:1.5}),false);
  assert.equal(validateContract('GameAction',{kind:'play',card:'S1'}),false);
  assert.equal(validateContract('GameAction',{kind:'pass',cards:['C2','D3']}),false);
  assert.equal(validateContract('GameView',{...game,mode:'poker'}),false);
  assert.equal(validateContract('GameView',{...game,hand:['C2','C2']}),false);
  assert.equal(validateContract('Preferences',{coachMode:'asked',gameSpeed:2}),false);
  assert.equal(validateContract('AdvanceRequest',{...actionBody,kind:'bot'}),false);
});

// Compile-time usage guards catch generators losing object fields behind composition keywords.
function assertTypedProjection(view: GameView): string {
  const firstCard: string | undefined = view.hand[0];
  const mode: 'hearts' | 'spades-solo' | 'spades-partners' = view.mode;
  const turn: 0 | 1 | 2 | 3 | null = view.turn;
  // @ts-expect-error Public contracts must not acquire a permissive index signature.
  const forbidden: string = view.otherHands;
  void forbidden;
  return `${mode}:${turn}:${firstCard ?? ''}`;
}
test('generated view fields retain precise compile-time types', () => {
  assert.equal(assertTypedProjection(game),'hearts:null:C2');
});
