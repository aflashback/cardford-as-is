import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

// Run the real JSX content expressions as plain element objects. This checks
// what each seat receives without a renderer, browser, geometry or game engine.
type Element = { tag: unknown; props: Record<string, unknown>; children: unknown[] };
const React = {
  Fragment: 'fragment',
  createElement: (tag: unknown, props: Record<string, unknown> | null, ...children: unknown[]): Element =>
    ({ tag, props: props ?? {}, children: children.flat(Infinity) }),
};
function parse(path: string) {
  return ts.createSourceFile(path, readFileSync(new URL(path, import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}
const liveSource = parse('../src/games/trix/Table.tsx');
const replaySource = parse('../src/rally/RallyReplayTable.tsx');
const appSource = parse('../src/App.tsx');
function namedFunction(source: ts.SourceFile, name: string) {
  const node = source.statements.find((node): node is ts.FunctionDeclaration => ts.isFunctionDeclaration(node) && node.name?.text === name);
  assert.ok(node?.body, `Missing actual component ${name}`);
  return node;
}
function declaration(source: ts.SourceFile, component: string, name: string) {
  for (const statement of namedFunction(source, component).body!.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    const node = statement.declarationList.declarations.find(node => node.name.getText(source) === name);
    if (node) return `const ${node.getText(source)};`;
  }
  throw new Error(`Missing actual content function ${component}.${name}`);
}
function execute<T>(code: string, scope: Record<string, unknown>): T {
  const context = { ...scope, React, RemainingCards: 'RemainingCards', exports: { result: undefined as T | undefined } };
  const output = ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React } }).outputText;
  runInNewContext(output, context);
  assert.notEqual(context.exports.result, undefined);
  return context.exports.result!;
}
function elements(node: unknown): Element[] {
  if (!node || typeof node !== 'object' || !('children' in node)) return [];
  const element = node as Element;
  return [element, ...element.children.flatMap(elements)];
}
function content(node: unknown): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (!node || typeof node !== 'object' || !('children' in node)) return '';
  return (node as Element).children.map(content).join('');
}
const playerNames = ['You', 'Leo', 'Maya', 'Joe'];
type Observation = { seat: number; variantId: string; request: string; phase: string; handCounts: number[]; requestSeatTotals: number[] };
const scoreValue = (view: Observation, seat: number) => view.requestSeatTotals[seat];
function live(view: Observation, setDialog: (dialog: string) => void = () => {}) {
  return execute<(seat: number) => Element | null>(
    declaration(liveSource, 'TrixTable', 'completed') + declaration(liveSource, 'TrixTable', 'score') + '\nexports.result=score;',
    { o: view, playerNames, seatRequestScore: scoreValue, setDialog });
}
function replay(view: Observation) {
  return execute<(seat: number) => Element | null>(declaration(replaySource, 'RallyReplayTable', 'playerDetail') + '\nexports.result=playerDetail;',
    { trix: view, actor: view.seat, counts: view.handCounts, seatRequestScore: scoreValue });
}

for (const variant of ['basic-solo', 'basic-partners', 'complex-solo', 'complex-partners']) {
  test(`${variant}: live and saved Jacks hide in-progress scores and only the actor count`, () => {
    for (const actor of [0, 1, 2, 3]) {
      // Nonzero awarded scores must remain hidden while later players finish.
      const view = { seat: actor, variantId: variant, request: 'trix', phase: 'layout',
        handCounts: [0, 2, 7, 13], requestSeatTotals: [200, 150, 100, 50] };
      for (const render of [live(view), replay(view)]) for (const seat of [0, 1, 2, 3]) {
        const detail = render(seat), nodes = elements(detail);
        assert.equal(content(detail), '', 'No per-seat score text during Jacks play');
        assert.equal(nodes.filter(node => node.tag === 'button').length, 0);
        const counts = nodes.filter(node => node.tag === 'RemainingCards');
        assert.equal(counts.length, seat === actor ? 0 : 1);
        if (seat === actor) assert.equal(detail, null, 'Do not leave an empty player-detail wrapper');
        else assert.equal(counts[0].props.count, view.handCounts[seat]);
      }
    }
  });
}

test('completed Jacks restores real per-seat scores and live score access without the actor count', () => {
  const opened: string[] = [];
  for (const phase of ['round-complete', 'session-complete']) {
    const view = { seat: 2, variantId: 'basic-partners', request: 'trix', phase,
      handCounts: [0, 0, 0, 0], requestSeatTotals: [200, 150, 100, 50] };
    const liveRender = live(view, dialog => opened.push(dialog)), savedRender = replay(view);
    for (const seat of [0, 1, 2, 3]) {
      for (const detail of [liveRender(seat), savedRender(seat)]) {
        assert.equal(content(detail), String(view.requestSeatTotals[seat]));
        assert.equal(elements(detail).filter(node => node.tag === 'RemainingCards').length, seat === view.seat ? 0 : 1);
      }
      const score = elements(liveRender(seat)).find(node => node.tag === 'button');
      assert.ok(score);
      (score.props.onClick as () => void)();
      assert.equal(elements(savedRender(seat)).filter(node => node.tag === 'button').length, 0, 'Saved content stays read-only');
    }
  }
  assert.deepEqual(opened, Array(8).fill('scores'));
});

test('other Trix requests retain their in-progress scores in live and saved views', () => {
  for (const request of ['diamonds', 'lutoosh', 'queens', 'king', 'complex']) {
    const view = { seat: 0, variantId: 'complex-solo', request, phase: 'playing',
      handCounts: [3, 4, 5, 6], requestSeatTotals: [-10, -25, -75, -125] };
    for (const render of [live(view), replay(view)]) for (const seat of [0, 1, 2, 3]) {
      const detail = render(seat);
      assert.equal(content(detail), String(view.requestSeatTotals[seat]));
      assert.equal(elements(detail).filter(node => node.tag === 'RemainingCards').length, seat === 0 ? 0 : 1);
    }
  }
});

test('live and saved Hearts/Spades remove only the human count and retain trick/bid content', () => {
  const PlayerCount = execute<(props: { seat: number; game: object }) => Element>(
    namedFunction(appSource, 'PlayerCount').getText(appSource) + '\nexports.result=PlayerCount;', {});
  for (const mode of ['hearts', 'spades-solo', 'spades-partners']) {
    const game = { mode, bids: [0, null, 2, 3], tricks: [1, 2, 3, 4], handCounts: [9, 8, 7, 6] };
    const saved = execute<(seat: number) => Element>(declaration(replaySource, 'RallyReplayTable', 'playerDetail') + '\nexports.result=playerDetail;',
      { trix: undefined, legacy: game, actor: 0, counts: game.handCounts, game: mode === 'hearts' ? 'hearts' : 'spades' });
    for (const seat of [0, 1, 2, 3]) {
      const expected = String(game.tricks[seat]) + (mode === 'hearts' ? '' : ` / ${game.bids[seat] === null ? '—' : game.bids[seat] === 0 ? 'Nil' : game.bids[seat]}`);
      const current = PlayerCount({ seat, game });
      const visibleScore = elements(current).find(node => node.props['aria-hidden'] === 'true');
      assert.equal(content(visibleScore), expected);
      assert.equal(content(saved(seat)), expected);
      for (const detail of [current, saved(seat)]) {
        const counts = elements(detail).filter(node => node.tag === 'RemainingCards');
        assert.equal(counts.length, seat === 0 ? 0 : 1);
        if (seat !== 0) assert.equal(counts[0].props.count, game.handCounts[seat]);
      }
    }
  }
});

test('Jacks still exposes unchanged authoritative header totals and Scores access', () => {
  let header: ts.JsxSelfClosingElement | undefined;
  const find = (node: ts.Node) => {
    if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(liveSource) === 'RallyHeader') header = node;
    ts.forEachChild(node, find);
  };
  find(namedFunction(liveSource, 'TrixTable')); assert.ok(header);
  const opened: string[] = [];
  const rendered = execute<Element>(`exports.result=(${header.getText(liveSource)});`, {
    RallyHeader: 'RallyHeader', o: { variantId: 'basic-partners', totals: [{ seats: [0, 2], total: 570 }, { seats: [1, 3], total: -145 }] },
    playerNames, variantLabel: () => 'Basic · Partners', controller: { streamStatus: 'live' }, setDialog: (value: string) => opened.push(value),
  });
  assert.equal(JSON.stringify(rendered.props.scores), JSON.stringify([{ label: 'You & Maya', total: 570 }, { label: 'Leo & Joe', total: -145 }]));
  (rendered.props.onScores as () => void)();
  assert.deepEqual(opened, ['scores']);
});
