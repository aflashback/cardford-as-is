import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import {coachAttention, coachDimensions, coachDisplay, coachUIReducer, initialCoachUI} from '../src/rally/coachPresentation.ts';

test('presentation preferences accept only booleans and cannot contain coaching grants', () => {
  const state = initialCoachUI({open: true, pinPreferred: true, remainingFreeSessions: 900, unlimited: true});
  assert.deepEqual(state, {open: true, pinPreferred: true, view: 'cue', acknowledgedDecision: null});
  assert.equal(initialCoachUI({open: 'true', pinPreferred: 1}).open, false);
});
test('pin boundary, close and portrait retain the preference without reserving a hidden lane', () => {
  let state = coachUIReducer(initialCoachUI(), {kind: 'toggle', decision: 'd1'});
  assert.strictEqual(coachUIReducer(state, {kind: 'pin', allowed: false}), state);
  state = coachUIReducer(state, {kind: 'pin', allowed: true});
  for (const width of [759, 760, 761, 759, 760]) assert.equal(coachDisplay(state, false, width).pinned, width >= 760);
  assert.deepEqual(coachDisplay(state, true, 844), {open: false, pinned: false, review: false});
  const closed = coachUIReducer(state, {kind: 'close', decision: 'd1'});
  assert.equal(closed.pinPreferred, true); assert.equal(coachDisplay(closed, false, 844).pinned, false);
  assert.equal(coachDisplay(coachUIReducer(closed, {kind: 'toggle', decision: 'd1'}), false, 844).pinned, true);
});
test('attention acknowledges one decision and retires when the decision, permission or phase changes', () => {
  const closed = initialCoachUI();
  for (const phase of ['bid', 'pass', 'declare-doubles']) assert(coachAttention(closed, 'd1', phase, false, true));
  for (const phase of ['play', 'request', 'layout']) assert.equal(coachAttention(closed, 'd1', phase, false, true), false);
  const acknowledged = coachUIReducer(closed, {kind: 'close', decision: 'd1'});
  assert.equal(coachAttention(acknowledged, 'd1', 'pass', false, true), false);
  assert(coachAttention(acknowledged, 'd2', 'pass', false, true));
  assert.equal(coachAttention(acknowledged, 'd2', 'pass', true, true), false);
  assert.equal(coachAttention(acknowledged, 'd2', 'pass', false, false), false);
});
test('review hide/restore retains its view and exits only on an explicit close or back', () => {
  const review = coachUIReducer(initialCoachUI({pinPreferred: true}), {kind: 'review', decision: 'd1'});
  assert.equal(coachDisplay(review, false, 800).review, true);
  assert.equal(coachDisplay(review, true, 800).review, false); assert.equal(review.view, 'review');
  assert.equal(coachDisplay(review, false, 800).review, true);
  assert.equal(coachUIReducer(review, {kind: 'back', decision: 'd1'}).view, 'cue');
  assert.equal(coachUIReducer(review, {kind: 'close', decision: 'd1'}).open, false);
});
test('reserved lane includes both edges and overlay clearance follows the measured hand', () => {
  const compact = coachDimensions(844, 390, 390, 142);
  assert.equal(compact.laneWidth, 220); assert.equal(compact.bottom, 142);
  assert.equal(compact.overlayHeight, 240); assert.equal(compact.sticker, 52);
  const desktop = coachDimensions(1920, 1080, 1024, 285);
  assert.equal(desktop.laneWidth, 344); assert.equal(desktop.bottom, 285); assert.equal(desktop.overlayHeight, 560);
});

test('large Coach uses the approved viewport height cap and still clears the hand', () => {
  const desktop = coachDimensions(1280, 720, 664, 142);
  assert.ok(Math.abs(desktop.overlayHeight - 504) < 1e-9);
  assert.ok(Math.abs(desktop.pinnedHeight - 504) < 1e-9);
  const observed = coachDimensions(1440, 900, 844, 268);
  assert.equal(observed.bottom, 268);
  assert.equal(observed.overlayHeight, 560);
  assert.ok(844 - observed.bottom <= 580, 'The overlay ends above the measured hand');
});

test('safe bottom inset protects the sticker and pinned window without double counting hand clearance', () => {
  const compact = coachDimensions(844, 390, 390, 142, 21);
  assert.equal(compact.bottom, 142);
  assert.equal(compact.pinnedBottom, 89);
  assert.equal(compact.pinnedHeight, 293);
  const emptyHand = coachDimensions(844, 390, 390, 0, 21);
  assert.equal(emptyHand.bottom, 89);
  assert.equal(emptyHand.overlayHeight, 293);
});

test('late ancestor attachment and table layout events refresh live and replay hand clearance', () => {
  // Execute the actual measurement effect with rectangle sources; no DOM renderer.
  const text = readFileSync(new URL('../src/rally/CoachWindow.tsx', import.meta.url), 'utf8');
  const source = ts.createSourceFile('CoachWindow.tsx', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let effect: ts.ArrowFunction | undefined;
  function visit(node: ts.Node) {
    if (ts.isCallExpression(node) && node.expression.getText(source) === 'useLayoutEffect') {
      const callback = node.arguments[0];
      if (callback && ts.isArrowFunction(callback)) {
        let measures = false;
        const scan = (child: ts.Node) => { if (ts.isIdentifier(child) && child.text === 'measuredHand') measures = true; ts.forEachChild(child, scan); };
        scan(callback); if (measures) effect = callback;
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source); assert.ok(effect);
  const events = new Map<string, () => void>();
  const observed = new Set<object>();
  let liveTop = 700, replay: {getBoundingClientRect(): object} | null = null;
  const hand = {getBoundingClientRect: () => ({width:1392,height:190,top:liveTop,bottom:liveTop+190})};
  const area = {clientWidth:1440,clientHeight:844,querySelector:() => replay,
    getBoundingClientRect:() => ({bottom:900}),
    addEventListener:(event:string,callback:()=>void,capture:boolean) => {assert.equal(capture,true);events.set(event,callback);},
    removeEventListener:(event:string) => events.delete(event)};
  let geometry: Record<string, number> = {};
  class Observer { observe(target:object) {observed.add(target);} unobserve(target:object) {observed.delete(target);} disconnect() {} }
  let nextFrame: (()=>void) | undefined;
  const areaRef: {current: typeof area | null} = {current:null};
  const context = {availableAreaRef:areaRef,handRef:{current:hand},measureRef:{current:()=>{}},
    ResizeObserver:Observer,MutationObserver:Observer,
    requestAnimationFrame:(callback:()=>void) => {nextFrame = callback; return 1;}, cancelAnimationFrame() {},
    window:{innerWidth:1440,innerHeight:900,addEventListener() {},removeEventListener() {}},
    getComputedStyle:()=>({getPropertyValue:()=> '0px'}),
    setGeometry:(update:(previous:Record<string,number>)=>Record<string,number>) => { geometry = update(geometry); },
    exports:{effect:undefined as (() => (()=>void)) | undefined}};
  const js = ts.transpileModule(`exports.effect = ${effect.getText(source)};`,{compilerOptions:{target:ts.ScriptTarget.ES2020}}).outputText;
  runInNewContext(js,context); const cleanup = context.exports.effect!();
  assert.equal(geometry.handClearance,0);
  areaRef.current = area; assert.ok(nextFrame); nextFrame();
  assert.equal(geometry.handClearance,204);
  assert.ok(observed.has(area) && observed.has(hand));
  liveTop = 650;
  assert.ok(events.has('rally-fit'), 'A fitted hand can move without resizing its box');
  events.get('rally-fit')!(); assert.equal(geometry.handClearance,254);
  replay = {getBoundingClientRect:()=>({width:1392,height:254,top:636,bottom:890})};
  events.get('rally-fit')!(); assert.equal(geometry.handClearance,268);
  assert.ok(observed.has(replay) && !observed.has(hand), 'Replay resize observation replaces the live hand');
  const unchanged = geometry;
  events.get('rally-fit')!(); assert.strictEqual(geometry,unchanged,'Unchanged measurements do not trigger another render');
  const oldReplay = replay;
  replay = null; liveTop = 680;
  events.get('rally-fit')!(); assert.equal(geometry.handClearance,224);
  assert.ok(observed.has(hand) && !observed.has(oldReplay), 'Returning live restores hand observation');
  replay = {getBoundingClientRect:()=>({width:0,height:0,top:0,bottom:0})};
  events.get('rally-fit')!(); assert.equal(geometry.handClearance,0,'A hidden replay cannot create viewport-sized clearance');
  replay = {getBoundingClientRect:()=>({width:1392,height:254,top:636,bottom:890})};
  events.get('rally-fit')!(); assert.equal(geometry.handClearance,268,'Showing replay recovers its actual rectangle');
  cleanup(); assert.equal(events.has('rally-fit'),false);
});
test('window has no grant/advice/network side effects and persists only presentation keys', () => {
  const source = readFileSync(new URL('../src/rally/CoachWindow.tsx', import.meta.url), 'utf8');
  assert(!/\bfetch\s*\(|XMLHttpRequest|\.unlock\s*\(|\.advice\s*\(|\.exposure\s*\(/.test(source));
  assert(source.includes('JSON.stringify({open: ui.open, pinPreferred: ui.pinPreferred})'));
  assert(source.includes("ui.view === 'review'"), 'Review children stay mounted when portrait hides the window');
});

test('launcher is removed from layout and keyboard access while Coach is open, then regains focus on close', () => {
  const source = readFileSync(new URL('../src/rally/CoachWindow.tsx', import.meta.url), 'utf8');
  const styles = readFileSync(new URL('../src/rally/rally-coach.css', import.meta.url), 'utf8');
  assert.match(source, /className="rally-coach-launcher"[^>]*hidden=\{display\.open\}/);
  assert.match(styles, /\.rally-coach-launcher\[hidden\]\s*\{\s*display:\s*none\s*\}/);
  assert.match(source, /function close\(\)\s*\{dispatch\(\{kind: 'close', decision\}\); requestAnimationFrame\(\(\) => launcher\.current\?\.focus\(\)\);\}/);
});
