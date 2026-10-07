export type ProviderFieldCategory = 'envelope'|'model'|'answer-set'|'choice'|'distribution-keys'|'probability'|'distribution-total'|'choice-ranking'|'confidence'|'usage'|'cost'|'metadata';
const record=(value:unknown):value is Record<string,unknown>=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const finite=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value);
/** Known field categories only. Never retain response text, arbitrary keys, model IDs or error values. */
export function responseFieldCategories(body:unknown,candidateIds:readonly string[],approvedModels:readonly string[]):ProviderFieldCategory[] {
  const categories=new Set<ProviderFieldCategory>();
  if(!record(body))return ['envelope'];
  if(typeof body.model!=='string'||!approvedModels.includes(body.model))categories.add('model');
  if(!record(body.answers)||Object.keys(body.answers).length!==1||!record(body.answers.move))categories.add('answer-set');
  if(record(body.answers)&&record(body.answers.move)) {
    const answer=body.answers.move;
    if(answer.type!=='choice'||typeof answer.choice!=='string'||!candidateIds.includes(answer.choice))categories.add('choice');
    if(!finite(answer.confidence)||answer.confidence<0||answer.confidence>1)categories.add('confidence');
    if(!record(answer.probabilities))categories.add('distribution-keys');
    else {
      const keys=Object.keys(answer.probabilities).sort();
      if(JSON.stringify(keys)!==JSON.stringify([...candidateIds].sort()))categories.add('distribution-keys');
      const values=Object.values(answer.probabilities);
      if(values.some(value=>!finite(value)||value<0||value>1))categories.add('probability');
      if(values.every(finite)) {
        if(Math.abs(values.reduce((sum,value)=>sum+value,0)-1)>0.02+Number.EPSILON)categories.add('distribution-total');
        const chosenProbability=typeof answer.choice==='string'?answer.probabilities[answer.choice]:undefined;
        if(finite(chosenProbability)&&chosenProbability+1e-6<Math.max(...values))categories.add('choice-ranking');
      }
    }
  }
  if(body.usage!==undefined) {
    if(!record(body.usage))categories.add('usage');
    else {
      for(const key of ['input_tokens','output_tokens']) {
        const value=body.usage[key];if(value!==undefined&&(!Number.isSafeInteger(value)||typeof value!=='number'||value<0))categories.add('usage');
      }
      if(body.usage.cost!==undefined&&(!finite(body.usage.cost)||body.usage.cost<0))categories.add('cost');
    }
  }
  for(const key of ['id','provider'])if(body[key]!==undefined&&(typeof body[key]!=='string'||body[key].length>256))categories.add('metadata');
  return [...categories].sort();
}
