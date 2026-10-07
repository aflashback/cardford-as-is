import { actionId } from '../../../game/rules.ts';
import { cardRank,cardSuit } from '../../../game/cards.ts';
import type { SeatObservation } from '../../../observations/index.ts';
import type { DecisionFacts, ReasonClaim } from '../../../strategy/types.ts';
import type { CaseDefinition } from '../../../strategy/cases/types.ts';
import { assessObservedCases, unbeatableLeadCue } from './proofs.ts';

export type SpadesCaseInput = { observation: SeatObservation; facts: DecisionFacts };
export type MaintainedSpadesCase = CaseDefinition<SpadesCaseInput,string,ReasonClaim> & {
  triggerDescription: string; effect: string; predicates: readonly string[];
  proofStatus: string; actionStatus: string; policyVersions: readonly string[];
};
const shared = {
  version: 'spades-cases-1.0.0', phases: ['play'], review: 'hypothesis' as const,
  sources: ['web/server/games/spades/cases/catalog.ts','web/server/games/spades/cases/proofs.ts','web/server/games/spades/cases/profile.ts',
    'web/server/games/spades/cases/cues.ts','web/server/games/spades/evaluation/claims/check.ts'],
  policyVersions: ['spades-cases-4.0.0'], cue: { id: 'spades-observed-cases', version: 'spades-cases-cues-1.0.0' },
  excluded: (input: SpadesCaseInput) => input.observation.phase !== 'play' ? ['not play phase'] :
    !input.facts.knowledgeComplete ? ['incomplete public history'] : [],
};
export const spadesCaseCatalog: readonly MaintainedSpadesCase[] = [
  {
    ...shared, id: 'CASE-01', family: 'resources', variants: ['spades-partners'], priority: 200,
    summary: 'Offer partner a ruff while keeping an unbeatable trump entry.',
    prerequisites: ['positive-bids','unmet-team-contract','single-side-suit','partner-void','opponent-trump-excluded','own-master-entry'],
    triggerDescription: 'Lead with one side suit, a master spade, positive bids and an unmet team contract; public exclusions locate all outside spades at a partner void in that side suit.',
    trigger: input => assessObservedCases(input.observation,input.facts).partnerResource !== null,
    assess: input => { const value=assessObservedCases(input.observation,input.facts).partnerResource;
      const eligible=value !== null && input.observation.legalActions.length > 1;
      return { preferred: eligible ? value.actionIds : [], reasonable: [], evidence: 'heuristic',
        claims: eligible ? [{ predicate: 'case-partner-resource', args: { partner:value.partner,suit:value.suit,entry:value.entry } }] : [],
        limitations: ['Conditional preference; exact premises do not establish strength.','A forced action has no preference effect.'] }; },
    conflictsWith: ['CASE-03'], effect: 'Retained TS 4.0 profile adds ordering weight 200 to eligible side-suit leads; no probability or runtime promotion.',
    predicates: ['case-partner-resource'], proofStatus: 'Exact public prerequisites; heuristic action preference.', actionStatus: 'Opt-in retained TS 4.0; Go experimental 5.0 adapter is separate; default remains tactics 2.1.',
    fixtures: ['partner-resource','partner-resource-last-entry'],
    counterexamples: ['partner-not-yet-void','opponent-trump-not-excluded','partner-resource-no-entry','Solo','Nil','fulfilled contract'],
  },
  {
    ...shared,id:'CASE-02',family:'resources',variants:['spades-solo','spades-partners'],priority:0,prerequisites:[],conflictsWith:[],
    summary:'No remaining route to the lead.', triggerDescription:'Actor holds only a side suit, owns every outstanding card in it and is currently following another suit.',
    trigger: input => assessObservedCases(input.observation,input.facts).noEntry !== null,
    assess: input => { const value=assessObservedCases(input.observation,input.facts).noEntry; return {
      preferred:[],reasonable:value ? input.observation.legalActions.map(actionId) : [],evidence:'exact',
      claims:value ? [{predicate:'case-no-entry',args:{suit:value.suit}}] : [], limitations:['Proves actor cannot regain lead; does not prove all other seats have equivalent outcomes.'] }; },
    effect:'Fact only; zero ordering delta and unsupported future-control plan suppressed.',predicates:['case-no-entry'],
    proofStatus:'Independent exact checker retained.',actionStatus:'No preferred discard asserted.',
    fixtures:['no-entry'],counterexamples:['missing monopoly','remaining trump','incomplete history'],
  },
  {
    ...shared,id:'CASE-03',family:'resources',variants:['spades-solo','spades-partners'],priority:0,prerequisites:[],conflictsWith:['CASE-01'],
    summary:'Publicly proved remaining suit sweep.',triggerDescription:'Every legal candidate yields the same next leader; public card domains and capacity force a side-suit monopoly at that leader, with no trump remaining after any candidate.',
    trigger: input => assessObservedCases(input.observation,input.facts).sweep !== null,
    assess: input => { const value=assessObservedCases(input.observation,input.facts).sweep;return {
      preferred:[],reasonable:value ? value.actionIds : [],evidence:'exact',
      claims:value ? [{predicate:'case-public-sweep',args:{winner:value.winner,suit:value.suit}}] : [],
      limitations:['Recognition fixture is not browser occurrence or strategic strength.'] }; },
    effect:'Outcome-equivalent legal discards, zero ordering delta; facts-only cue.',predicates:['case-public-sweep'],
    proofStatus:'Independent exact checker retained.',actionStatus:'Every legal defender discard has the proved same remaining result.',
    fixtures:['sweep','sweep-forced'],counterexamples:['sweep-earlier','remaining trump','ambiguous winner','non-monopoly','absent capacity proof'],
  },
  {
    ...shared,id:'CASE-04',family:'resources',variants:['spades-solo','spades-partners'],priority:0,prerequisites:[],conflictsWith:[],
    summary:'Unbeatable selected lead.',triggerDescription:'Unforced lead; no live own/partner Nil; exact legal-response check guarantees actor wins the selected card.',
    trigger: input => input.observation.legalActions.some(action => unbeatableLeadCue(input.observation,input.facts,actionId(action))),
    assess: input => { const ids=input.observation.legalActions.map(actionId).filter(id=>unbeatableLeadCue(input.observation,input.facts,id));return {
      preferred:[],reasonable:ids,evidence:'exact',claims:ids.map(id=>({predicate:'guaranteed-winner',args:{actionId:id,winner:input.observation.seat}})),
      limitations:['Selected action must match its claim; a master side-suit rank can still lose to trump.'] }; },
    effect:'Selected-action factual cue, zero ordering delta; live Nil takes precedence.',predicates:['guaranteed-winner'],
    proofStatus:'Exact legal-response checker retained.',actionStatus:'Factual win of this trick; no match-strength claim.',
    fixtures:['unbeatable-lead'],counterexamples:['live own Nil','live partner Nil','forced card','opponent trump possible'],
  },
];
/** Named guards expose why recognition fails; the frozen proof remains authoritative. */
export function spadesCasePrerequisite(name:string,input:SpadesCaseInput):boolean {
  const {observation:obs,facts}=input;
  const sideSuits=[...new Set(obs.hand.map(cardSuit).filter(suit=>suit!=='S'))];
  switch(name) {
    case 'positive-bids': return obs.bids.every(bid=>bid!==null&&bid>0);
    case 'unmet-team-contract': return obs.mode==='spades-partners'&&(facts.contractNeeded??0)>0;
    case 'single-side-suit': return sideSuits.length===1;
    case 'partner-void': return facts.partner!==null&&sideSuits.length===1&&facts.voids[sideSuits[0]].includes(facts.partner);
    case 'opponent-trump-excluded': {
      const held=new Set(obs.hand),outside=facts.possibleOwners.filter(entry=>cardSuit(entry.card)==='S'&&!held.has(entry.card));
      return facts.partner!==null&&outside.length>0&&outside.every(entry=>entry.seats.length===1&&entry.seats[0]===facts.partner);
    }
    case 'own-master-entry': return obs.hand.some(card=>cardSuit(card)==='S'&&!facts.outstandingCards.some(other=>cardSuit(other)==='S'&&cardRank(other)>cardRank(card)));
    default: throw new Error(`Unknown Spades prerequisite ${name}`);
  }
}
export const spadesClaimApplies=(claim:ReasonClaim,selectedId:string):boolean =>
  typeof claim.args.actionId!=='string'||claim.args.actionId===selectedId;
export function validateCaseCatalog(cases: readonly MaintainedSpadesCase[]) {
  const knownPredicates=new Set(['case-partner-resource','case-no-entry','case-public-sweep','guaranteed-winner']);
  const seen=new Set<string>();
  for(const entry of cases) {
    if(seen.has(entry.id)) throw new Error(`Duplicate case ID ${entry.id}`);seen.add(entry.id);
    if(entry.cue.id!=='spades-observed-cases'||entry.cue.version!=='spades-cases-cues-1.0.0') throw new Error(`Unknown cue ${entry.cue.id}`);
    if(entry.predicates.some(id=>!knownPredicates.has(id))) throw new Error(`Unknown predicate in ${entry.id}`);
    if(!entry.fixtures.length||!entry.sources.length||!Number.isFinite(entry.priority)) throw new Error(`Incomplete case ${entry.id}`);
  }
}
