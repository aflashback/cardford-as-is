import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import ts from 'typescript';

const file = new URL('../src/rally/RallyReplayTable.tsx', import.meta.url);
const source = existsSync(file) ? readFileSync(file,'utf8') : '';
const parsed = ts.createSourceFile('RallyReplayTable.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);

test('saved-frame table exists and exposes no live-action or motion dependencies', () => {
  assert.match(source,/export function RallyReplayTable\(/);
  const imports = parsed.statements.filter(ts.isImportDeclaration).map(node => node.moduleSpecifier.getText(parsed));
  assert.ok(imports.some(path => path.includes('CardPrimitives')));
  assert.ok(imports.some(path => path.includes('useResponsiveTableFit')));
  for (const path of imports) assert.doesNotMatch(path,/client|Session|HandCards|useHandGestures|useCardThrows|playback|engine/);
});

test('saved-frame table cannot submit actions through rendered controls or event handlers', () => {
  const errors:string[]=[];
  function visit(node:ts.Node) {
    if(ts.isJsxAttribute(node) && /^on[A-Z]/.test(node.name.getText(parsed))) errors.push(node.name.getText(parsed));
    if((ts.isJsxOpeningElement(node)||ts.isJsxSelfClosingElement(node)) && /^(button|input|select|form)$/.test(node.tagName.getText(parsed))) errors.push(node.tagName.getText(parsed));
    if(ts.isCallExpression(node) && /^(fetch|setTimeout|setInterval|requestAnimationFrame)$/.test(node.expression.getText(parsed))) errors.push(node.expression.getText(parsed));
    ts.forEachChild(node,visit);
  }
  visit(parsed);
  assert.deepEqual(errors,[]);
});
