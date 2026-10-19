import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

// Execute the actual integration closures without mounting React or a renderer.
// Controller behavior is supplied explicitly; card/engine implementations are not mocked.
const text = readFileSync(new URL('../src/games/trix/Table.tsx', import.meta.url), 'utf8');
const source = ts.createSourceFile('Table.tsx', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const table = source.statements.find((node): node is ts.FunctionDeclaration =>
  ts.isFunctionDeclaration(node) && node.name?.text === 'TrixTable');
assert.ok(table?.body, 'TrixTable must exist');
const statements = table.body.statements;
function implementation(name: string, from: ts.NodeArray<ts.Statement> = statements, file = source): string {
  for (const statement of from) {
    if (ts.isFunctionDeclaration(statement) && statement.name?.text === name) return statement.getText(file);
    if (!ts.isVariableStatement(statement)) continue;
    const declaration = statement.declarationList.declarations.find(node => node.name.getText(file) === name);
    if (declaration) return `const ${declaration.getText(file)};`;
  }
  throw new Error(`Integration closure missing: ${name}`);
}
function execute<T>(scope: Record<string, unknown>, input: string): T {
  const output = ts.transpileModule(input, {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React },
  }).outputText;
  const context = { ...scope, exports: { result: undefined as T | undefined }, Error };
  runInNewContext(output, context);
  assert.ok(context.exports.result);
  return context.exports.result;
}
function load<T>(scope: Record<string, unknown>, names: string[]): T {
  return execute<T>(scope, names.map(name => implementation(name)).join('\n') + `\nexports.result = {${names.join(',')}};`);
}
type Receipt = { gameId: string; revision: number };
type Action = { kind: 'play'; card: string };
type Confirmed = Receipt & { decisionId: string; action: Action };
type ConfirmAPI = { confirmationFor(action: Action): (receipt: Receipt) => void };

test('Why blocks the live table before awaiting authoritative playback stop', async () => {
  const flags: boolean[] = [];
  let release!: (confirmed: boolean) => void;
  const api = load<{ beforeReplay(): Promise<boolean> }>({
    controller: { setPlayback: (running: boolean) => {
      assert.equal(running, false);
      return new Promise<boolean>(resolve => { release = resolve; });
    } },
    setCoachReviewOpen: (value: boolean) => flags.push(value),
    setNotice: () => assert.fail('Successful pause must not report an error'),
  }, ['beforeReplay']);
  let settled = false;
  const pending = api.beforeReplay().then(value => { settled = true; return value; });
  assert.deepEqual(flags, [true]);
  await Promise.resolve();
  assert.equal(settled, false, 'A saved frame must wait for the server acknowledgment');
  release(true);
  assert.equal(await pending, true);
  assert.deepEqual(flags, [true]);
});

for (const throws of [false, true]) {
  test(`Why releases its input block when playback ${throws ? 'throws' : 'is not confirmed'}`, async () => {
    const flags: boolean[] = [], notices: string[] = [];
    const api = load<{ beforeReplay(): Promise<boolean> }>({
      controller: { setPlayback: async () => { if (throws) throw new Error('Offline'); return false; } },
      setCoachReviewOpen: (value: boolean) => flags.push(value),
      setNotice: (value: string) => notices.push(value),
    }, ['beforeReplay']);
    assert.equal(await api.beforeReplay(), false);
    assert.deepEqual(flags, [true, false]);
    assert.deepEqual(notices, throws ? ['Offline'] : []);
  });
}

test('post-play binds the original decision to the exact receipt and rejects other games', () => {
  const saved: Confirmed[] = [];
  const session = { game: { id: 'game-a' }, decisionId: 'before', revision: 10 };
  const currentGame = { current: 'game-a' };
  const api = load<ConfirmAPI>({ session, currentGame, backend: 'go',
    setConfirmedAction: (value: Confirmed) => saved.push(value) }, ['confirmationFor']);
  const action: Action = { kind: 'play', card: 'DK' };
  const receive = api.confirmationFor(action);
  session.decisionId = 'after'; session.revision = 999;
  receive({ gameId: 'game-a', revision: 42 });
  assert.equal(saved.length, 1);
  assert.equal(saved[0].decisionId, 'before');
  assert.equal(saved[0].revision, 42);
  assert.equal(saved[0].action, action);
  receive({ gameId: 'other', revision: 43 });
  currentGame.current = 'new-game';
  receive({ gameId: 'game-a', revision: 44 });
  assert.equal(saved.length, 1);
  const legacy = load<ConfirmAPI>({ session, currentGame: { current: 'game-a' }, backend: 'node',
    setConfirmedAction: () => assert.fail('Legacy actions must not enter native Coach') }, ['confirmationFor']);
  legacy.confirmationFor(action)({ gameId: 'game-a', revision: 45 });
});

test('submit uses only the offered server candidate and preserves its receipt', async () => {
  const saved: Confirmed[] = [], calls: string[] = [];
  const sending = { current: false };
  const candidate = { id: 'server-dk', public: { kind: 'play', card: 'DK' } };
  const base = { session: { game: { id: 'game-a' }, decisionId: 'original', candidates: [candidate] },
    sending, backend: 'go', currentGame: { current: 'game-a' },
    setConfirmedAction: (value: Confirmed) => saved.push(value),
    controller: { candidateAction: async (id: string, receive: (receipt: Receipt) => void) => {
      assert.equal(sending.current, true); calls.push(id);
      receive({ gameId: 'game-a', revision: 71 }); return true;
    } },
  };
  const api = load<{ submit(id: string): Promise<boolean> }>({ ...base, disabled: false, myTurn: true }, ['confirmationFor', 'submit']);
  assert.equal(await api.submit(candidate.id), true);
  assert.equal(saved[0].revision, 71);
  assert.equal(saved[0].action, candidate.public);
  assert.equal(sending.current, false);
  assert.equal(await api.submit('invented'), false);
  for (const guard of [{ disabled: true, myTurn: true }, { disabled: false, myTurn: false }]) {
    const guarded = load<{ submit(id: string): Promise<boolean> }>({ ...base, ...guard }, ['confirmationFor', 'submit']);
    assert.equal(await guarded.submit(candidate.id), false);
  }
  sending.current = true;
  assert.equal(await api.submit(candidate.id), false);
  assert.deepEqual(calls, [candidate.id]);
});

test('a rejected candidate releases the submission guard without inventing a confirmation', async () => {
  const sending = { current: false };
  const api = load<{ submit(id: string): Promise<boolean> }>({
    session: { candidates: [{ id: 'server-dk', public: { kind: 'play', card: 'DK' } }] },
    sending, disabled: false, myTurn: true,
    confirmationFor: () => () => assert.fail('Rejected action cannot produce coaching confirmation'),
    controller: { candidateAction: async () => { throw new Error('rejected'); } },
  }, ['submit']);
  await assert.rejects(api.submit('server-dk'), /rejected/);
  assert.equal(sending.current, false);
});

for (const pace of [1, 1.2, 1.4]) {
  test(`Trix setup saves pace ${pace} and keeps the selected game paused until Resume`, async () => {
    const calls: string[] = [], pending = { current: false };
    const session = { preferences: { gameSpeed: 1, coachMode: 'asked' } };
    const api = load<{ start(mode: string, speed: number): Promise<void> }>({
      session, gameStartPending: pending,
      controller: { busy: false,
        preferences: async (preferences: { gameSpeed: number; coachMode: string }) => {
          assert.equal(preferences.gameSpeed, pace); assert.equal(preferences.coachMode, 'asked');
          calls.push('save'); return true;
        },
        startRegistered: async (mode: string) => { assert.equal(mode, 'trix-basic-solo'); calls.push('start'); return true; },
      },
      setStartingGame: (busy: boolean) => calls.push(busy ? 'busy' : 'idle'), setNotice: () => {},
      setDialog: (value: unknown) => { assert.equal(value, null); calls.push('close'); },
      setPaused: (value: boolean) => { assert.equal(value, true); calls.push('paused'); },
    }, ['start']);
    await api.start('trix-basic-solo', pace);
    assert.deepEqual(calls, ['busy', ...(pace === 1 ? [] : ['save']), 'start', 'close', 'paused', 'idle']);
    assert.equal(pending.current, false);
  });
}

test('a failed pace save keeps setup open and never starts the new game', async () => {
  const pending = { current: false }, notices: string[] = [], busy: boolean[] = [];
  const api = load<{ start(mode: string, speed: number): Promise<void> }>({
    session: { preferences: { gameSpeed: 1, coachMode: 'asked' } }, gameStartPending: pending,
    controller: { busy: false, preferences: async () => false,
      startRegistered: () => assert.fail('A failed preferences command must not start another game') },
    setStartingGame: (value: boolean) => busy.push(value), setNotice: (value: string) => notices.push(value),
    setDialog: () => assert.fail('Setup must stay open'), setPaused: () => assert.fail('Do not resume on failure'),
  }, ['start']);
  await api.start('trix-basic-solo', 1.4);
  assert.deepEqual(busy, [true, false]);
  assert.equal(pending.current, false);
  assert.deepEqual(notices, ['', 'Could not save game speed. Try again.']);
});

const coachText = readFileSync(new URL('../src/rally/CoachExperience.tsx', import.meta.url), 'utf8');
const coachSource = ts.createSourceFile('CoachExperience.tsx', coachText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const coachComponent = coachSource.statements.find((node): node is ts.FunctionDeclaration =>
  ts.isFunctionDeclaration(node) && node.name?.text === 'CoachExperience');
assert.ok(coachComponent?.body);
const coachStatements = coachComponent.body.statements;
function loadCoach<T>(scope: Record<string, unknown>, names: string[]): T {
  return execute<T>(scope, names.map(name => implementation(name, coachStatements, coachSource)).join('\n') +
    `\nexports.result = {${names.join(',')}};`);
}
test('Why discards its result if Coach closes while the saved replay request is pending', async () => {
  const frames: unknown[] = [], saved: unknown[] = [];
  let release!: (view: { frames: object[] }) => void;
  let entered!: () => void;
  const reading = new Promise<void>(resolve => { entered = resolve; });
  const latest = { current: { visible: true, onBeforeReplay: async () => true,
    onReplayChange: (frame: unknown) => frames.push(frame) } };
  const api = loadCoach<{ why(item: object): Promise<void>; stopReplay(): void }>({
    latest, replayGeneration: { current: 0 }, useCallback: (callback: unknown) => callback,
    coach: { readReplay: () => new Promise(resolve => { release = resolve; entered(); }) },
    setPlaying: () => {}, setReplay: (value: unknown) => saved.push(value), setReplayBusy: () => {},
    setFrameIndex: () => assert.fail('A closed replay must not advance frames'), setFeedback: () => {}, setHistory: () => {}, setNotice: () => {}, focusPanel: () => {},
  }, ['stopReplay', 'why']);
  const pending = api.why({ itemId: 'saved-item' });
  await reading;
  latest.current.visible = false; api.stopReplay();
  release({ frames: [{ decisionId: 'saved-frame' }] });
  await pending;
  assert.ok(frames.length > 0 && frames.every(frame => frame === null));
  assert.ok(saved.every(view => view === null));
});

test('Why does not fetch a saved replay before pause acknowledgment or after close during pause', async () => {
  let release!: (ok: boolean) => void;
  const latest = { current: { visible: true,
    onBeforeReplay: () => new Promise<boolean>(resolve => { release = resolve; }),
    onReplayChange: (frame: unknown) => assert.equal(frame, null) } };
  const api = loadCoach<{ why(item: object): Promise<void>; stopReplay(): void }>({
    latest, replayGeneration: { current: 0 }, useCallback: (callback: unknown) => callback,
    coach: { readReplay: () => assert.fail('Closed or unpaused Coach cannot fetch replay') },
    setPlaying: () => {}, setReplay: () => {}, setReplayBusy: () => {}, setFrameIndex: () => {},
    setFeedback: () => {}, setHistory: () => {}, setNotice: () => {}, focusPanel: () => {},
  }, ['stopReplay', 'why']);
  const pending = api.why({ itemId: 'saved-item' });
  await Promise.resolve();
  latest.current.visible = false; api.stopReplay(); release(true);
  await pending;
});

for (const name of ['selectionComment', 'confirmedComment']) {
  test(`a stale envelope becomes a notice and leaves ${name} retryable`, async () => {
    const notices: string[] = [];
    const guard = { current: '' };
    const scope = {
      visible: true, disabled: false, canCommentSelection: true, canCommentConfirmed: true, selectedCards: ['DK'],
      selectionToken: 'selection', confirmationToken: 'confirmation',
      attemptedSelection: { current: '' }, attemptedConfirmation: { current: '' },
      coach: { busy: false, uncertain: false, saved: { kind: 'cue', sessionId: 'coaching', gameId: 'game-a', decisionId: 'before' },
        write: () => assert.fail('No command can be sent without its valid envelope') },
      session: { gameId: 'game-a', decisionId: 'before', revision: 42 },
      confirmedAction: { gameId: 'game-a', decisionId: 'before', revision: 42, action: { kind: 'play', card: 'DK' } },
      sentSelection: guard, sentConfirmation: guard,
      envelope: () => { throw new Error('Wait for the latest table'); },
      setNotice: (value: string) => notices.push(value),
    };
    const api = loadCoach<Record<string, () => Promise<void>>>(scope, [name]);
    await assert.doesNotReject(api[name]);
    assert.deepEqual(notices, ['Wait for the latest table']);
    assert.equal(guard.current, '');
  });
}

test('explicit Coach navigation resets only its scroll body and focuses without scrolling the page', () => {
  const body = {scrollTop:180};
  let frame: (()=>void) | undefined, focused=0;
  const latest = {current:{visible:true}};
  const api = loadCoach<{focusPanel():void}>({latest,
    panel:{current:{closest:(selector:string)=>{assert.equal(selector,'.rally-coach-body');return body;},
      focus:(options:{preventScroll:boolean})=>{assert.equal(options.preventScroll,true);focused++;}}},
    requestAnimationFrame:(callback:()=>void)=>{frame=callback;},
  },['focusPanel']);
  api.focusPanel(); assert.equal(body.scrollTop,180,'Wait until the new view has committed');
  assert.ok(frame);frame();assert.equal(body.scrollTop,0);assert.equal(focused,1);
  body.scrollTop=95;api.focusPanel();latest.current.visible=false;frame();
  assert.equal(body.scrollTop,95,'Closing Coach before the frame cancels navigation focus');assert.equal(focused,1);
});

type FeedbackEffect={run:()=>void;deps:unknown[]};
function feedbackEffect(scope:Record<string,unknown>):FeedbackEffect {
  const effect=coachStatements.find((statement):statement is ts.ExpressionStatement=>
    ts.isExpressionStatement(statement) && ts.isCallExpression(statement.expression) &&
    ts.isIdentifier(statement.expression.expression) && statement.expression.expression.text==='useLayoutEffect');
  assert.ok(effect,'The feedback editor must reveal itself after its DOM commits');
  let captured:FeedbackEffect|undefined;
  execute({...scope,useLayoutEffect:(run:()=>void,deps:unknown[])=>{captured={run,deps};}},
    `${effect.getText(coachSource)}\nexports.result=true;`);
  assert.ok(captured);
  return captured;
}

test('opening feedback focuses Reason and reveals its form inside only the Coach scroll body',()=>{
  const body={scrollTop:100,getBoundingClientRect:()=>({top:63})};
  let focused=0;
  const reason={focus:(options:{preventScroll:boolean})=>{assert.equal(options.preventScroll,true);focused++;}};
  const form={
    closest:(selector:string)=>{assert.equal(selector,'.rally-coach-body');return body;},
    querySelector:(selector:string)=>{assert.equal(selector,'select');return reason;},
    getBoundingClientRect:()=>({top:208}),
  };
  const scope={visible:true,feedback:{item:{itemId:'item-a'},reason:'',text:''},feedbackForm:{current:form},
    getComputedStyle:(element:unknown)=>{assert.equal(element,body);return {paddingTop:'10px'};}};
  feedbackEffect(scope).run();
  assert.equal(focused,1);assert.equal(body.scrollTop,235,'Align the editor with the Coach body inset');
  body.scrollTop=87;
  feedbackEffect({...scope,visible:false}).run();
  feedbackEffect({...scope,feedback:null}).run();
  feedbackEffect({...scope,feedbackForm:{current:null}}).run();
  assert.equal(focused,1);assert.equal(body.scrollTop,87,'Hidden or unmounted editors cannot move focus or scrolling');
});

test('feedback draft edits preserve focus and scrolling until a different item opens',()=>{
  let focused=0;
  const body={scrollTop:100,getBoundingClientRect:()=>({top:63})};
  const scope={visible:true,feedback:{item:{itemId:'item-a'},reason:'',text:''},
    feedbackForm:{current:{closest:()=>body,querySelector:()=>({focus:()=>{focused++;}}),getBoundingClientRect:()=>({top:208})}},
    getComputedStyle:()=>({paddingTop:'10px'})};
  const opened=feedbackEffect(scope);opened.run();
  body.scrollTop=180; // The user scrolls to Note and starts typing.
  const edited=feedbackEffect({...scope,feedback:{item:{itemId:'item-a'},reason:'unclear',text:'My note'}});
  assert.equal(edited.deps.length,opened.deps.length);
  assert.ok(edited.deps.every((value,index)=>Object.is(value,opened.deps[index])),
    'React must not rerun the editor focus effect for reason, note, or automatic item-content changes');
  assert.equal(focused,1);assert.equal(body.scrollTop,180);
  const another=feedbackEffect({...scope,feedback:{item:{itemId:'item-b'},reason:'',text:''}});
  assert.ok(another.deps.some((value,index)=>!Object.is(value,edited.deps[index])));
  another.run();assert.equal(focused,2);
});

for (const name of ['selectionComment','confirmedComment']) test(`successful automatic ${name} preserves the reading position`,async()=>{
  let writes=0;
  const guard={current:''};
  const api=loadCoach<Record<string,()=>Promise<void>>>({
    disabled:false,canCommentSelection:true,canCommentConfirmed:true,selectedCards:['DK'],selectionToken:'selection',confirmationToken:'confirmation',
    attemptedSelection:{current:''},attemptedConfirmation:{current:''},sentSelection:guard,sentConfirmation:guard,
    coach:{busy:false,uncertain:false,saved:{sessionId:'session-a'},write:async()=>{writes++;return true;}},
    session:{decisionId:'decision-a'},confirmedAction:{decisionId:'decision-a',action:{kind:'play',card:'DK'}},
    envelope:()=>({gameId:'game-a',expectedRevision:1}),setNotice:()=>assert.fail('No error expected'),
    focusPanel:()=>assert.fail('An automatic comment must not reset scrolling or focus'),
  },[name]);
  await api[name]();assert.equal(writes,1);assert.notEqual(guard.current,'');
});

test('the actual Why view omits general tools and places Back and playback before the explanation',()=>{
  const returned=coachStatements.find((statement):statement is ts.ReturnStatement=>ts.isReturnStatement(statement));
  assert.ok(returned?.expression);
  type Element={tag:unknown;props:Record<string,unknown>;children:unknown[]};
  const elements=(node:unknown):Element[]=>{
    if(!node || typeof node!=='object' || !('children' in node))return [];
    const element=node as Element;
    return [element,...element.children.flatMap(elements)];
  };
  for(const state of ['session','opening','replay']){
    const replay=state==='replay'?{explanation:'Saved explanation',itemId:'item-a',frames:[{decisionId:'decision-a',notes:[]}]}:null;
    const icons=Object.fromEntries(['ArrowLeft','ChevronLeft','ChevronRight','History','Lightbulb','MessageSquare','Pause','Play','RotateCcw','ThumbsDown','ThumbsUp','Trophy','X'].map(name=>[name,name]));
    const scope={...icons,React:{Fragment:'fragment',createElement:(tag:unknown,props:Record<string,unknown>|null,...children:unknown[])=>({tag,props:props??{},children:children.flat(Infinity)})},
      panel:{current:null},history:false,replay,replayBusy:state==='opening',feedback:null,notice:'',items:[],
      coach:{status:null,error:'',uncertain:false,busy:false,loading:false},blocked:false,cueAvailable:true,canCommentSelection:false,canCommentConfirmed:false,
      frameIndex:0,playing:false,coachFrameLabel:()=> 'Hand 1 · Bidding',onAccount:()=>{},
    };
    // Evaluate the real JSX branches into plain objects. No DOM, React renderer,
    // browser layout, timers or backend is involved in this navigation check.
    const render=execute<()=>Element>(scope,implementation('replayMode',coachStatements,coachSource)+
      `\nexports.result=()=>(${returned.expression.getText(coachSource)});`);
    const nodes=elements(render());
    const tools=nodes.filter(node=>node.tag==='nav'&&node.props['aria-label']==='Coach tools');
    assert.equal(tools.length,state==='session'?1:0);
    const back=nodes.find(node=>String(node.props.className).includes('rally-replay-back'));
    assert.equal(!!back,state!=='session');
    if(state==='replay'){
      const controls=nodes.findIndex(node=>node.props.className==='rally-replay-controls');
      const explanation=nodes.findIndex(node=>node.tag==='p'&&node.children.includes('Saved explanation'));
      assert.ok(nodes.indexOf(back!)<controls && controls<explanation,'Small screens show exit and playback before prose');
    }
  }
});
