// Readable retrospective evidence; this report never supplies player input.
import assert from 'node:assert/strict';
import { getBlob, safePath, withRunLock, writeImmutable } from './journal.mjs';

const seats=['S','W','N','E'];
const suits={C:'♣',D:'♦',H:'♥',S:'♠'};
const cell=value=>String(value).replaceAll('|','\\|');

export function writeCompletedTranscripts(collector){return withRunLock(collector.root,()=>{
  const state=collector.state(),reports=[];
  for(const completed of state.outcomes){
    assert.match(completed.episodeId,/^[a-z0-9-]+$/);
    const outcome=getBlob(collector.root,completed.outcomeRef);
    const commits=state.commits.filter(c=>c.episodeId===completed.episodeId&&c.phase==='playing');
    assert.equal(outcome.completedTricks,13);assert.equal(outcome.acceptedPlays,52);assert.equal(commits.length,52);
    const lines=[`# ${completed.episodeId} — completed game transcript`,'',
      'Retrospective public play record. Original actor prompts and exact model responses remain separately frozen. Review status and selected-case counts belong to the run report; this transcript does not qualify coaching cases.','',
      `Variant: ${completed.variant}. Request: ${completed.request}. Native terminal phase: ${outcome.nativeTerminalPhase}.`,'',
      '| Competitor | Native request score |','|---|---:|',
      ...outcome.scoreTotals.map(score=>`| ${score.seats.map(s=>seats[s]).join(' + ')} | ${score.total} |`),'',
      '| Trick | Lead | Cards in actual turn order | Winner |','|---:|---|---|---|',
      ...outcome.tricks.map(trick=>`| ${trick.number} | ${seats[trick.leader]} | ${trick.plays.map(p=>cell(`\`|${seats[p.seat]}|${suits[p.card[0]]}|${p.card.slice(1)}|\``)).join(' → ')} | ${seats[trick.winner]} |`),'',
      '## Original decision records','',
      '| Move | Actor | Card | Input prompt | Exact response |','|---:|---|---|---|---|',
      ...commits.map((commit,index)=>{
        const saved=getBlob(collector.root,commit.savedRef);
        const prompt=safePath(collector.root,`outbox/${saved.job.jobId}.prompt.txt`).replaceAll('\\','/');
        const raw=safePath(collector.root,saved.rawRef.path).replaceAll('\\','/');
        return `| ${index+1} | ${seats[commit.actor]} | ${cell(saved.response.card)} | [Prompt](<${prompt}>) | [Response](<${raw}>) |`;
      }),'',`Native outcome blob: ${completed.outcomeRef.sha256}. Original source: ${collector.manifest.build.sourceDigest}.`,''];
    const path=`reports/completed-${completed.episodeId}.md`;
    writeImmutable(safePath(collector.root,path),Buffer.from(lines.join('\n')));reports.push(path);
  }
  return {completedTranscripts:reports};
});}
