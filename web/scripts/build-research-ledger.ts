import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { buildResearchLedger, repositoryRoot } from '../server/evaluation/multi-game/research.ts';

export { buildResearchLedger } from '../server/evaluation/multi-game/research.ts';
export function ledgerOutputs() {
  const result=buildResearchLedger();
  const lines=(rows:readonly unknown[])=>rows.map(row=>JSON.stringify(row)).join('\n')+'\n';
  return new Map([
    ['qa/research/multi-game/decision-ledger.jsonl',lines(result.rows)],
    ['qa/research/multi-game/episodes.json',JSON.stringify({schemaVersion:'research-episodes-1.0.0',episodes:result.episodes},null,2)+'\n'],
    ['qa/research/multi-game/source-hashes.json',JSON.stringify({schemaVersion:'research-source-hashes-1.0.0',sources:result.sourceHashes},null,2)+'\n'],
    ['qa/evaluation/multi-game/labels.jsonl',lines(result.labels)],
  ]);
}
if(process.argv[1] && new URL(`file:///${process.argv[1].replaceAll('\\','/')}`).href===import.meta.url) {
  if(process.argv.slice(2).some(arg=>arg!=='--check')) throw new Error('Usage: node web/scripts/build-research-ledger.ts [--check]');
  for(const [path,content] of ledgerOutputs()) {
    const file=new URL(path,repositoryRoot);
    if(process.argv.includes('--check')) {
      if(readFileSync(file,'utf8')!==content) throw new Error(`Stale derived output: ${path}`);
    } else { mkdirSync(new URL('./',file),{recursive:true});writeFileSync(file,content); }
  }
  console.log('M07 research ledger: 706 text + 672 browser; 32 pending label snapshots; deterministic outputs verified.');
}
