import type { CaseDefinition } from './types.ts';

/** Pure offline resolver. No priority silently upgrades a heuristic into a proof. */
export function resolveCases<O, A, Claim>(input: O, cases: readonly CaseDefinition<O,A,Claim>[], options: {
  legal: readonly A[]; actionId(action: A): string; selectedId?: string;
  prerequisite?: (name: string, input: O) => boolean;
  claimApplies?: (claim: Claim, selectedId: string) => boolean;
  rule?: { id: string; version: string; resolve(matches: readonly { id: string; preferred: readonly string[]; evidence: string }[]): readonly string[] };
}) {
  const ids = new Set<string>();
  const legal = new Set(options.legal.map(options.actionId));
  const exclusions: { id: string; reasons: string[] }[] = [];
  const matches: { id: string; preferred: string[]; reasonable: string[]; evidence: string; claims: readonly Claim[]; limitations: readonly string[]; priority: number; conflictsWith: readonly string[] }[] = [];
  for (const definition of [...cases].sort((a,b) => a.id.localeCompare(b.id))) {
    if (ids.has(definition.id)) throw new Error(`Duplicate case ${definition.id}`); ids.add(definition.id);
    const absent = definition.prerequisites.filter(name => !options.prerequisite?.(name, input));
    const reasons = [...absent.map(name => `missing prerequisite: ${name}`), ...definition.excluded(input)];
    if (reasons.length) { exclusions.push({ id: definition.id, reasons }); continue; }
    if (!definition.trigger(input)) continue;
    const assessment = definition.assess(input);
    const preferred = [...new Set(assessment.preferred.map(options.actionId))].sort();
    const reasonable = [...new Set(assessment.reasonable.map(options.actionId))].sort();
    if ([...preferred,...reasonable].some(id => !legal.has(id))) throw new Error(`Case ${definition.id} assessed an illegal action`);
    matches.push({ id: definition.id, preferred, reasonable, evidence: assessment.evidence,
      claims: assessment.claims, limitations: assessment.limitations, priority: definition.priority, conflictsWith: definition.conflictsWith });
  }
  const conflicts: { ids: string[]; priorities: number[]; reason: string }[] = [];
  for (let i=0;i<matches.length;i++) for (let j=i+1;j<matches.length;j++) {
    const a=matches[i], b=matches[j];
    if (a.conflictsWith.includes(b.id) || b.conflictsWith.includes(a.id) ||
      (a.preferred.length > 0 && b.preferred.length > 0 && !a.preferred.some(id => b.preferred.includes(id))))
      conflicts.push({ ids: [a.id,b.id], priorities: [a.priority,b.priority], reason: 'Preferences conflict; priority alone does not resolve them.' });
  }
  let alternatives = [...new Set(matches.flatMap(match => [...match.preferred,...match.reasonable]))].sort();
  let appliedRule: string | null = null;
  if (conflicts.length && options.rule) {
    if (!options.rule.id.trim() || !options.rule.version.trim()) throw new Error('Conflict rule needs ID and version');
    const resolved = [...new Set(options.rule.resolve(matches))].sort();
    if (!resolved.length || resolved.some(id => !alternatives.includes(id))) throw new Error('Conflict rule returned unknown/illegal alternatives');
    alternatives = resolved; appliedRule = `${options.rule.id}@${options.rule.version}`;
  }
  const selectedActionClaims = options.selectedId && legal.has(options.selectedId) && alternatives.includes(options.selectedId)
    ? matches.filter(match => [...match.preferred,...match.reasonable].includes(options.selectedId!)).flatMap(match => match.claims)
      .filter(claim => options.claimApplies?.(claim,options.selectedId!) ?? true) : [];
  return { matchedIds: matches.map(match => match.id), exclusions, alternatives, conflicts, appliedRule, selectedActionClaims,
    assessments: matches.map(({ conflictsWith: _conflicts, priority: _priority, ...match }) => match) };
}
