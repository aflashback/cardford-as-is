// Offline reference-only fixture authoring. The runtime never imports these deals.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { partnerFixture, PARTNER_FIXTURES } from '../../../../web/server/evaluation/partner-cases/fixtures.ts';
import { observe } from '../../../../web/server/observations/index.ts';
import { buildFacts } from '../../../../web/server/strategy/facts.ts';
import { assessPartnerResources } from '../../../../web/server/games/spades/partner-resource/proofs.ts';
const sources = ['web/server/evaluation/partner-cases/fixtures.ts','web/server/games/spades/partner-resource/proofs.ts'];
const rows = [];
for (const id of PARTNER_FIXTURES) for (let offset=0;offset<4;offset++) {
  const original = partnerFixture(id,offset), hidden = partnerFixture(id,offset,true);
  const observation = observe(original,original.turn!);
  const changedHidden = observe(hidden,hidden.turn!);
  rows.push({id,offset,observation,changedHidden,expected:assessPartnerResources(observation,buildFacts(observation))});
}
mkdirSync('server/internal/games/spades/reasoning/testdata',{recursive:true});
writeFileSync('server/internal/games/spades/reasoning/testdata/partner-resources.json',JSON.stringify({schemaVersion:'partner-resource-go-fixtures-1.0.0',sourceHashes:sources.map(path=>({path,sha256:createHash('sha256').update(readFileSync(path)).digest('hex')})),independentHumanLabels:false,rows})+'\n');
console.log(JSON.stringify({rows:rows.length,source:'retained reachable TypeScript fixtures; exact predicate expectations, no human labels'}));
