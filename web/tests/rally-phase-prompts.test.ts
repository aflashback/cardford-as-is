import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import postcss from 'postcss';
import { fitRallyTrick, rallyFrameMetrics } from '../src/table/responsiveGeometry.ts';

// Offline source/handler checks only: no browser or rendering claims.
const text = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const source = ts.createSourceFile('App.tsx', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function elements(node: ts.Node): ts.JsxElement[] {
  const found: ts.JsxElement[] = [];
  function visit(child: ts.Node) {
    if (ts.isJsxElement(child)) found.push(child);
    ts.forEachChild(child, visit);
  }
  visit(node);
  return found;
}
function attribute(node: ts.JsxElement, name: string) {
  const value = node.openingElement.attributes.properties.find(item =>
    ts.isJsxAttribute(item) && item.name.getText(source) === name);
  return value && ts.isJsxAttribute(value) ? value.initializer : undefined;
}
function withClass(name: string) {
  return elements(source).find(node => {
    const value = attribute(node, 'className');
    return value && ts.isStringLiteral(value) && value.text.split(' ').includes(name);
  });
}
function commitButtons(node: ts.Node) {
  return elements(node).filter(element => element.openingElement.tagName.getText(source) === 'button' &&
    attribute(element, 'onClick')?.getText(source) === '{commit}');
}

test('pass and bid confirmations live under their center cue, never over the South hand badge', () => {
  for (const name of ['passing-prompt', 'bidding-prompt']) {
    const prompt = withClass(name);
    assert.ok(prompt, `${name} must have a table prompt`);
    const button = commitButtons(prompt);
    assert.equal(button.length, 1, `${name} must have exactly one real confirmation`);
    assert.equal(attribute(button[0], 'disabled')?.getText(source), '{!commitEnabled}');
    assert.ok(elements(prompt).some(node => node.openingElement.tagName.getText(source) === 'h2' && node.pos < button[0].pos),
      'Confirmation belongs below its phase cue');
    let ancestor = prompt.parent;
    while (ancestor && !(ts.isJsxElement(ancestor) && attribute(ancestor, 'aria-label')?.getText(source) === '"Card table"')) ancestor = ancestor.parent;
    assert.ok(ancestor, 'Prompt must be inside the card table');
  }
  const hand = withClass('hand-section');
  assert.ok(hand);
  assert.equal(commitButtons(hand).length, 0, 'The floating hand toolbar must not duplicate a phase action');
  assert.equal(commitButtons(source).length, 2, 'One action per exclusive phase branch');
});

test('hand completion keeps recap and the existing next-hand action together on the table', () => {
  const prompt = withClass('hand-complete-prompt');
  assert.ok(prompt, 'Hand completion must use the center prompt');
  const buttons = elements(prompt).filter(node => node.openingElement.tagName.getText(source) === 'button');
  assert.equal(buttons.length, 2);
  const next = buttons.find(node => attribute(node, 'onClick')?.getText(source) === '{() => void playAgain()}');
  assert.ok(next, 'Keep the actual next-hand handler');
  assert.equal(attribute(next, 'disabled')?.getText(source), '{controller.busy}');
  assert.ok(buttons.some(node => attribute(node, 'onClick')?.getText(source) === '{() => setShowRecap(true)}'));
  const hand = withClass('hand-section');
  assert.ok(hand);
  assert.equal(elements(hand).filter(node => node.openingElement.tagName.getText(source) === 'button').length, 0,
    'No remaining action may float over the South badge');
});

test('bid row cancels the legacy out-of-flow Nil control while keeping its touch target', () => {
  // Read both actual stylesheets in load order. This specifically guards the
  // legacy absolute/left:100% collision; browser geometry checks cover pixels.
  const cascade = new Map<string, string>();
  const applyNilRules = (path: string) => {
    postcss.parse(readFileSync(new URL(path, import.meta.url), 'utf8')).walkRules(rule => {
      if (!rule.selectors.some(selector => /(?:^|\s)\.nil-button$/.test(selector))) return;
      rule.walkDecls(declaration => { cascade.set(declaration.prop, declaration.value); });
    });
  };
  applyNilRules('../src/styles.css');
  assert.equal(cascade.get('position'), 'absolute', 'The regression fixture includes the actual legacy rule');
  assert.equal(cascade.get('left'), '100%');
  applyNilRules('../src/table/rally-table.css');
  assert.equal(cascade.get('position'), 'static', 'Nil must participate in its existing flex action row');
  assert.equal(cascade.get('inset'), 'auto', 'Do not leave a legacy outside offset on the relocated control');
  assert.ok(parseFloat(cascade.get('min-width') ?? '0') >= 44);
  assert.ok(parseFloat(cascade.get('min-height') ?? '0') >= 44);
  const row = withClass('phase-prompt-actions');
  assert.ok(row && elements(row).some(node => attribute(node, 'className')?.getText(source).includes('nil-button')),
    'The reset applies to the real Nil action beside confirmation');
});

test('the enabled doubling Pass label uses readable text in each actual Rally theme', () => {
  const button = new Map<string, string>();
  for (const [path, selector] of [
    ['../src/styles.css', '.subtle-button'],
    ['../src/table/rally-table.css', '.rally-game-shell .trix-double-picker .subtle-button'],
  ]) postcss.parse(readFileSync(new URL(path, import.meta.url), 'utf8')).walkRules(rule => {
    if (rule.selector === selector) rule.walkDecls(declaration => { button.set(declaration.prop, declaration.value); });
  });
  const themes = postcss.parse(readFileSync(new URL('../src/rally/rally-pages.css', import.meta.url), 'utf8'));
  const luminance = (hex: string) => {
    const color = hex.replace('#', '');
    assert.match(color, /^[a-f0-9]{6}$/i, 'Resolve the actual opaque text/surface colors');
    const channels = [0, 2, 4].map(offset => parseInt(color.slice(offset, offset + 2), 16) / 255)
      .map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
    return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
  };
  for (const theme of ['light', 'dark', 'warm']) {
    const tokens = new Map<string, string>();
    themes.walkRules(rule => {
      if (rule.selectors.includes(`html[data-theme=${theme}]`)) rule.walkDecls(declaration => { tokens.set(declaration.prop, declaration.value); });
    });
    const color = button.get('color')!;
    const foreground = color.startsWith('var(') ? tokens.get(color.slice(4, -1))! : color;
    const values = [luminance(foreground), luminance(tokens.get('--surface')!)].sort((a, b) => a - b);
    const contrast = (values[1] + .05) / (values[0] + .05);
    assert.ok(contrast >= 4.5, `${theme}: enabled Pass text needs 4.5:1 contrast, got ${contrast.toFixed(2)}:1`);
  }
  assert.ok(parseFloat(button.get('font-size') ?? '0') >= 12, 'Do not retain the legacy 8–10px secondary label');
});

test('passing selections retain their lift without painting over the next card index', () => {
  // hearts-pass-three-iphone12.jpg: raised AH covered the following 3S index.
  // The actual base CSS lifts selected cards above later siblings. Resolve the
  // loaded phase rules so the regression includes that original stacking cause.
  function selectedStyle(phase: string, rally: boolean) {
    const result = new Map<string, string>();
    for (const path of ['../src/styles.css', ...(rally ? ['../src/table/rally-table.css'] : [])]) {
      postcss.parse(readFileSync(new URL(path, import.meta.url), 'utf8')).walkRules(rule => {
        const matches = rule.selectors.some(selector => {
          const target = selector.endsWith('.card-face') ? ' .card-face' : '';
          return selector === `.hand-card.selected${target}` ||
            selector === `.rally-game-shell[data-rally-phase=${phase}] .hand-card.selected${target}`;
        });
        if (matches) rule.walkDecls(declaration => { result.set(declaration.prop, declaration.value); });
      });
    }
    return result;
  }
  const legacy = selectedStyle('pass', false), pass = selectedStyle('pass', true);
  assert.equal(legacy.get('z-index'), '6', 'Keep the captured regression cause in the cascade fixture');
  assert.equal(pass.get('z-index'), 'auto', 'Later hand siblings must paint above a selected predecessor');
  assert.equal(pass.get('transform'), legacy.get('transform'), 'Keep canonical passing lift and tilt');
  assert.equal(selectedStyle('play', true).get('z-index'), legacy.get('z-index'), 'Do not change ordinary play stacking');
  assert.equal(selectedStyle('double', true).get('z-index'), 'auto', 'Retain the existing doubling treatment');
});

test('request and trick containers have separate React identities so fitted pile coordinates cannot leak into a picker', () => {
  // The observed picker retained the previous trick's imperative left/top and
  // visibility styles when React reused the same unkeyed div between phases.
  const table = ts.createSourceFile('Table.tsx', readFileSync(new URL('../src/games/trix/Table.tsx', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const keys = new Map<string, string>();
  function visit(node: ts.Node) {
    if (ts.isJsxElement(node)) {
      const props = node.openingElement.attributes.properties.filter(ts.isJsxAttribute);
      const name = props.find(item => item.name.getText(table) === 'className')?.initializer;
      if (name && ts.isStringLiteral(name) && ['trick-area', 'trix-center'].includes(name.text)) {
        const key = props.find(item => item.name.getText(table) === 'key')?.initializer;
        assert.ok(key && ts.isStringLiteral(key), `${name.text} needs its own phase identity`);
        keys.set(name.text, key.text);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(table);
  assert.equal(keys.size, 2);
  assert.notEqual(keys.get('trick-area'), keys.get('trix-center'), 'A prompt must not inherit the fitted trick DOM node');
});

test('Trix requests use table-centered, unclipped choices above and below the compact-height breakpoint', () => {
  const css = postcss.parse(readFileSync(new URL('../src/table/rally-table.css', import.meta.url), 'utf8'));
  const base = '.rally-game-shell[data-rally-phase=request]';
  for (const compact of [false, true]) {
    const styles = new Map<string, Map<string, string>>();
    css.walkRules(rule => {
      if (rule.parent?.type === 'atrule') return;
      for (const selector of rule.selectors) {
        const prefix = selector.startsWith(base) ? base : compact && selector.startsWith('.rally-game-shell[data-rally-compact=true][data-rally-phase=request]')
          ? '.rally-game-shell[data-rally-compact=true][data-rally-phase=request]' : null;
        if (!prefix) continue;
        const target = selector.slice(prefix.length).trim();
        const declarations = styles.get(target) ?? new Map<string, string>();
        rule.walkDecls(declaration => { declarations.set(declaration.prop, declaration.value); });
        styles.set(target, declarations);
      }
    });
    const center = styles.get('.trix-center'), picker = styles.get('.trix-request-picker');
    assert.equal(center?.get('inset'), 'auto', `compact=${compact}: cancel legacy asymmetric insets`);
    assert.equal(center?.get('left'), '50%');
    assert.equal(center?.get('top'), compact ? 'calc(50% + 3px)' : 'calc(50% + 5px)', 'Match the center of the decorative felt');
    assert.equal(center?.get('transform'), 'translate(-50%,-50%)');
    assert.equal(picker?.get('max-height'), 'none', 'All choices remain visible without an internal scrolling panel');
    assert.equal(picker?.get('overflow'), 'visible');
    assert.match(styles.get('.trix-request-options')?.get('grid-template-columns') ?? '', /^repeat\(2,/);
  }
});

test('compact Trix requests fit all five choices between badges and above the hand', () => {
  // Regression evidence: trix-basic-solo-request-se1.jpg had its fifth choice
  // at y289–333, while the hand started y217. Model the authored CSS allocation
  // against the actual frame helper; browser captures still verify glyphs.
  const css = postcss.parse(readFileSync(new URL('../src/table/rally-table.css', import.meta.url), 'utf8'));
  const phase = '.rally-game-shell[data-rally-compact=true][data-rally-phase=request]';
  function rule(suffix: string) {
    const declarations = new Map<string, string>();
    css.walkRules(item => {
      if (![`${phase} ${suffix}`, `.rally-game-shell[data-rally-phase=request] ${suffix}`].includes(item.selector) || item.parent?.type === 'atrule') return;
      item.walkDecls(declaration => { declarations.set(declaration.prop, declaration.value); });
    });
    assert.ok(declarations.size, `Missing compact request allocation: ${suffix}`);
    return declarations;
  }
  const center = rule('.trix-center'), picker = rule('.trix-request-picker');
  const heading = rule('.trix-request-picker h2'), options = rule('.trix-request-options');
  const five = rule('.trix-request-options:has(> button:nth-child(3))');
  const buttons = rule('.trix-request-options button');
  const width = center.get('width')?.match(/^min\((\d+)px,calc\(100% - (\d+)px\)\)$/);
  assert.ok(width, 'Center width must reserve badge lanes');
  assert.equal(center.get('top'), 'calc(50% + 3px)');
  assert.equal(center.get('transform'), 'translate(-50%,-50%)');
  assert.equal(picker.get('max-height'), 'none', 'Do not clip the final request row');
  assert.equal(picker.get('overflow'), 'visible');
  assert.equal(rule('.table-zone .player-2').get('left'), '0');
  assert.equal(rule('.table-zone .player-0').get('right'), '0');
  const fullColumns = Number(five.get('grid-template-columns')?.match(/repeat\((\d+),/)?.[1]);
  const fewColumns = Number(options.get('grid-template-columns')?.match(/repeat\((\d+),/)?.[1]);
  assert.ok(fullColumns > 1, 'Five requests must not fall back to the legacy clipped single column');
  let narrowBreakpoint = 0, narrowColumns = 0;
  css.walkAtRules('container', container => {
    const breakpoint = container.params.match(/max-width:\s*(\d+)px/);
    container.walkRules(item => {
      if (item.selector !== '.rally-game-shell[data-rally-phase=request] .trix-request-options:has(> button:nth-child(3))') return;
      narrowBreakpoint = Number(breakpoint?.[1]);
      item.walkDecls('grid-template-columns', declaration => { narrowColumns = Number(declaration.value.match(/repeat\((\d+),/)?.[1]); });
    });
  });
  assert.ok(narrowBreakpoint && narrowColumns, 'A narrow pinned table needs its own column allocation');
  for (const [name, mainWidth, mainHeight] of [['SE1',516,320],['SE2',615,375],['iPhone12',792,390],['Pinned',572,390],['Narrow pin',348,390]] as const) {
    const frame = rallyFrameMetrics({width:mainWidth,height:mainHeight});
    const panelWidth = Math.min(Number(width[1]),frame.preferredWidth-Number(width[2]));
    const left = (frame.preferredWidth-panelWidth)/2;
    for (const count of [2,5]) {
      const columns = count <= 2 ? fewColumns : frame.contentWidth <= narrowBreakpoint ? narrowColumns : fullColumns;
      const padding = parseFloat(picker.get('padding')!);
      const gap = parseFloat(options.get('gap')!);
      const target = parseFloat(buttons.get('min-height')!);
      assert.ok(target >= 44);
      const rows = Math.ceil(count/columns);
      const panelHeight = padding*2+parseFloat(heading.get('line-height')!)+parseFloat(picker.get('gap')!)+rows*target+(rows-1)*gap;
      const top = (frame.tableHeight-panelHeight)/2+3;
      assert.ok((panelWidth-padding*2-(columns-1)*gap)/columns >= 44, `${name}: each request keeps a 44px target`);
      assert.ok(top >= 0 && top+panelHeight <= frame.tableHeight, `${name}: all choices stay above the hand`);
      assert.ok(left >= 84 && frame.preferredWidth-(left+panelWidth) >= 84, `${name}: prompt clears the measured badge envelope`);
    }
  }
});

test('five confirmed South doubles stay inside the compact viewport and leave a usable trick area', () => {
  // Actual SE1 geometry from trix-complex-solo-play-dark-se1.json: the unchanged
  // five-card row ended at x587.85 in a 568px viewport. Apply the real loaded
  // positioning rules to that measured badge/row, then run the production fitter.
  const placement = new Map<string, string>();
  for (const [path, selector] of [
    ['../src/table/table-layout.css', '.player-0 .announced-cards'],
    ['../src/table/rally-table.css', '.rally-game-shell[data-rally-compact=true] .player-0 .announced-cards'],
  ]) {
    postcss.parse(readFileSync(new URL(path, import.meta.url), 'utf8')).walkRules(rule => {
      if (rule.selector === selector) rule.walkDecls(declaration => { placement.set(declaration.prop, declaration.value); });
    });
  }
  const south = { left: 366.439, right: 439.915, top: 160.833, bottom: 215.195 };
  const rowWidth = 139.935, rowHeight = 37.760;
  const rightInset = placement.get('right')?.match(/^calc\(100% \+ (\d+)px\)$/);
  const leftInset = placement.get('left')?.match(/^calc\(100% \+ (\d+)px\)$/);
  const left = rightInset && placement.get('left') === 'auto'
    ? south.left - Number(rightInset[1]) - rowWidth
    : south.right + Number(leftInset?.[1] ?? 0);
  const bottom = south.bottom - parseFloat(placement.get('bottom') ?? '0');
  const announcement = { left, right: left + rowWidth, top: bottom - rowHeight, bottom };
  assert.ok(announcement.left >= 52 && announcement.right <= 568,
    `All five doubled faces must fit the game viewport, got ${announcement.left}–${announcement.right}`);
  assert.ok(announcement.bottom < 217.1875, 'Keep the captured hand/lift area clear');
  const players = [south,
    { left: 63.984, right: 123.984, top: 65.801, bottom: 149.147 },
    { left: 108.620, right: 188.932, top: 3.997, bottom: 58.359 },
    { left: 427.982, right: 487.982, top: 65.801, bottom: 149.147 }];
  const separate = (a: typeof south, b: typeof south) => a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom;
  for (const player of players) assert.ok(separate(announcement, player), 'Declaration clears every measured player badge');
  const fit = fitRallyTrick({ bounds: { left: 106.984, right: 444.982, top: 25.987, bottom: 199.195 },
    obstacles: [...players, announcement], center: { x: 275.983, y: 109.596 }, maxCardWidth: 48 });
  assert.ok(fit && fit.cardWidth >= 30, 'The relocated row leaves a useful canonical trick-card fit');
  assert.ok(separate(announcement, fit), 'The trick fitter respects the relocated declaration');
});

test('relocated pass uses the existing commit guard, exact selected cards and successful-clear behavior', async () => {
  let commit: ts.FunctionDeclaration | undefined;
  function find(node: ts.Node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === 'commit') commit = node;
    ts.forEachChild(node, find);
  }
  find(source);
  assert.ok(commit);
  const implementation = ts.transpileModule(`${commit.getText(source)}; exports.commit = commit;`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  for (const state of [
    { selected: ['HQ', 'HK'], paused: false, busy: false, accepted: true, expected: 0 },
    { selected: ['HQ', 'HK', 'SA'], paused: true, busy: false, accepted: true, expected: 0 },
    { selected: ['HQ', 'HK', 'SA'], paused: false, busy: true, accepted: true, expected: 0 },
    { selected: ['HQ', 'HK', 'SA'], paused: false, busy: false, accepted: false, expected: 1 },
    { selected: ['HQ', 'HK', 'SA'], paused: false, busy: false, accepted: true, expected: 1 },
  ]) {
    const submissions: { kind: string; cards: string[] }[] = [], cleared: string[][] = [];
    const scope = { exports: {} as { commit: () => Promise<void> }, game: { phase: 'pass' },
      selected: state.selected, paused: state.paused, controller: { busy: state.busy },
      submitAction: async (action: { kind: string; cards: string[] }) => { submissions.push(action); return state.accepted; },
      setSelected: (cards: string[]) => cleared.push(cards), myTurn: true, bid: 3 };
    runInNewContext(implementation, scope);
    await scope.exports.commit();
    assert.equal(submissions.length, state.expected);
    if (state.expected) {
      assert.equal(submissions[0].kind, 'pass');
      assert.equal(submissions[0].cards, state.selected, 'Preserve actual actor selection');
    }
    assert.equal(cleared.length, state.expected && state.accepted ? 1 : 0);
    if (cleared.length) assert.equal(cleared[0].length, 0);
  }
});
