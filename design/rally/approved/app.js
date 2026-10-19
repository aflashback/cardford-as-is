(function () {
  'use strict';
  const $ = selector => document.querySelector(selector);
  const paths = {
    chevron:'<path d="m8 10 4 4 4-4"/>',
    arrow:'<path d="M4 12h16m-6-6 6 6-6 6"/>',
    back:'<path d="M20 12H4m6-6-6 6 6 6"/>',
    close:'<path d="m6 6 12 12M6 18 18 6"/>',
    pause:'<path d="M8 5v14M16 5v14"/>',
    play:'<path d="m8 5 11 7-11 7Z"/>',
    coach:'<path d="m12 3 2.7 6.3L21 12l-6.3 2.7L12 21l-2.7-6.3L3 12l6.3-2.7Z"/>',
    menu:'<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
    pin:'<path d="M8 3h8l-1 6 4 4v2H5v-2l4-4-1-6ZM12 15v6"/>',
    demo:'<path d="M9 3h6m-5 0v6l-6 10a1.3 1.3 0 0 0 1 2h14a1.3 1.3 0 0 0 1-2L14 9V3M7 15h10"/><path d="M10 18h.1"/>',
    scores:'<path d="M4 20h17M7 16V9m5 7V4m5 12v-5"/>',
    history:'<path d="M4 7v5h5"/><path d="M4 12a8 8 0 1 1 2 6M12 7v5l3 2"/>',
    settings:'<path d="M4 6h16M4 12h16M4 18h16M8 3v6m8 0v6M9 15v6"/>',
    account:'<circle cx="12" cy="7" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
    games:'<rect x="3" y="4" width="13" height="16" rx="2"/><path d="m18 5 3 2-2 14H9M7 8h5m-5 4h3"/>',
    check:'<path d="m5 12 4 4L19 6"/>',
    sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
    moon:'<path d="M20 14A8.5 8.5 0 0 1 10 4a8.5 8.5 0 1 0 10 10Z"/>',
    warm:'<path d="M12 3c2 4-2 6 1 9 1-1 2-2 2-4 4 3 5 6 3 9a7 7 0 0 1-12 0c-2-4 0-7 3-10 0 2 1 3 2 3 2-2-1-4 1-7Z"/>',
    volume:'<path d="m10 5-5 4H2v6h3l5 4Z"/><path d="m16 8 6 8m0-8-6 8"/>',
    download:'<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
    family:'<circle cx="9" cy="7" r="3"/><path d="M2 21v-2a7 7 0 0 1 14 0v2M16 4a3 3 0 0 1 0 6m2 3a6 6 0 0 1 4 6v2"/>',
    shield:'<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6Z"/><path d="m8 12 3 3 5-6"/>',
    controls:'<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M6 9h.1M10 9h.1M14 9h.1M18 9h.1M7 15h10"/>'
  };
  const icon = name => `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.menu}</svg>`;
  const esc = value => String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const iconButton = (action,name,label,cls='') => `<button class="icon-button ${cls}" data-action="${action}" aria-label="${label}" title="${label}">${icon(name)}</button>`;
  const modes = [
    {id:'hearts-solo',game:'hearts',title:'Hearts',variant:'solo',label:'Solo',complex:false},
    {id:'spades-solo',game:'spades',title:'Spades',variant:'solo',label:'Solo',complex:false},
    {id:'spades-partners',game:'spades',title:'Spades',variant:'partners',label:'Partners',complex:false},
    {id:'trix-basic-solo',game:'trix',title:'Trix',variant:'solo',label:'Basic · Solo',complex:false},
    {id:'trix-basic-partners',game:'trix',title:'Trix',variant:'partners',label:'Basic · Partners',complex:false},
    {id:'trix-complex-solo',game:'trix',title:'Trix',variant:'solo',label:'Complex · Solo',complex:true},
    {id:'trix-complex-partners',game:'trix',title:'Trix',variant:'partners',label:'Complex · Partners',complex:true}
  ];
  const gameNames={spades:'Spades',hearts:'Hearts',trix:'Trix'};
  const themes={light:'Light',dark:'Dark',warm:'Warm'};
  const coachModes={asked:'When I ask',nudges:'Occasional cues',after:'After the hand'};
  let pref={};
  try{pref=JSON.parse(localStorage.getItem('cardford-rally-v2')||'{}');}catch{}
  const state={
    mode:'spades-partners',draftMode:'spades-partners',draftGame:'spades',
    phase:'play',beforePause:'play',request:'Diamonds',played:0,lastTrick:false,
    theme:themes[pref.theme]?pref.theme:'light',speed:[1,1.2,1.4].includes(pref.speed)?pref.speed:1,
    coachMode:coachModes[pref.coachMode]?pref.coachMode:'asked',
    modal:null,explain:false,filter:'all',reviewMode:'spades-partners',decision:0,
    plan:'Individual',member:'Sam',allowance:30,inviteEmail:'',inviteName:'',invited:false,cleared:false
  };
  const mode = id => modes.find(m=>m.id===(id||state.mode))||modes[2];
  const route = () => location.hash.slice(1).replace(/^\//,'').split('?')[0]||'play';
  const frame=$('#game-board');
  let coaching;
  let toastTimer,lastOrientation;
  function post(data){frame.contentWindow?.postMessage(data,location.origin==='null'?'*':location.origin);}
  function sendBoard(values={}){post({type:'cardford-design',...values});}
  function syncBoard(reset=false){const m=mode();sendBoard({concept:'studio',game:m.game,variant:m.variant,complex:m.complex,phase:state.phase,theme:state.theme,speed:state.speed,reset});}
  function orientation(force=false){
    const blocked=window.innerWidth<700&&window.innerHeight>window.innerWidth;
    const gate=blocked&&document.body.dataset.view==='play';
    coaching?.onOrientation(blocked);
    if(gate&&blocked!==lastOrientation)closeDialog();
    frame.inert=blocked;
    frame.setAttribute('aria-hidden',String(blocked));
    document.body.classList.toggle('portrait-table',gate);
    $('#rotation-gate').hidden=!gate;
    if(force||blocked!==lastOrientation){post({type:'cardford-orientation',blocked});lastOrientation=blocked;}
  }
  function save(){try{localStorage.setItem('cardford-rally-v2',JSON.stringify({theme:state.theme,speed:state.speed,coachMode:state.coachMode}));}catch{toast('Preference applied for this visit.');}}
  function applyTheme(){document.documentElement.dataset.theme=state.theme;sendBoard({theme:state.theme});}
  function toast(text){clearTimeout(toastTimer);$('#toast').textContent=text;$('#toast').classList.add('visible');toastTimer=setTimeout(()=>$('#toast').classList.remove('visible'),2600);}
  function closeDialog(){if($('#dialog').open)$('#dialog').close();state.modal=null;}
  function go(view){closeDialog();if(route()===view)render();else location.hash=view;}
  function totals(id=state.mode){
    const m=mode(id);
    return m.game==='hearts'?[12,28,18,36]:m.game==='trix'?(m.variant==='partners'?[-40,-85,-40,-85]:[-175,-200,-150,-225]):m.variant==='partners'?[142,118,142,118]:[68,42,56,34];
  }
  function competitors(id=state.mode){
    const m=mode(id),s=totals(id);
    return m.variant==='partners'?[['You + Maya',s[0]],['Leo + Theo',s[1]]]:['You','Leo','Maya','Theo'].map((name,i)=>[name,s[i]]);
  }
  function leaderIndex(id=state.mode){const entries=competitors(id),values=entries.map(e=>e[1]);return values.indexOf(mode(id).game==='hearts'?Math.min(...values):Math.max(...values));}
  function hud(){
    const isPlay=document.body.dataset.view==='play',m=mode();
    const logo=`<button class="logo-button" data-action="home" aria-label="Choose a game" title="Choose a game"><img src="./shared/assets/cardford-symbol.svg" alt="CardFord"></button>`;
    if(!isPlay){$('#hud').innerHTML=`<div class="hud-left">${logo}<a class="wordmark" href="#home">CardFord<small>RALLY</small></a></div><span class="hud-title">${route()==='home'?'':route()==='setup'?'New game':route()==='review'?'Saved':route()==='coaching'?'Coach':'Account'}</span><div class="hud-right">${iconButton('coaching','coach','Coach overview')}${iconButton('demo','demo','Demo scenarios','demo-button')}${iconButton('play','close','Return to table')}</div>`;return;}
    const all=competitors(),entries=m.variant==='partners'?all:[all[0],all[2]];
    const values=entries.map(e=>e[1]),lead=values.indexOf(m.game==='hearts'?Math.min(...values):Math.max(...values));
    $('#hud').innerHTML=`<div class="hud-left">${logo}<button class="game-switch table-control" data-action="setup" title="Change game" aria-label="Change game: ${m.title}, ${m.label}"><span class="compact-hud-icon" aria-hidden="true">${icon('games')}</span><span>${m.title}<small>${m.label}</small></span>${icon('chevron')}</button></div><button class="hud-score" data-action="scores" aria-label="View all scores" title="View all scores"><span class="compact-hud-icon" aria-hidden="true">${icon('scores')}</span>${entries.map(([name,total],i)=>`${i?'<i></i>':''}<div class="side ${i===lead?'leading':''}"><b>${total}</b><span>${name}</span></div>`).join('')}</button><div class="hud-right">${iconButton('coach','coach','Coach','table-control accent')}${iconButton('pause',state.phase==='paused'?'play':'pause',state.phase==='paused'?'Resume':'Pause',`table-control ${state.phase==='paused'?'pressed':''}`)}${iconButton('menu','menu','Table menu')}${iconButton('demo','demo','Demo scenarios','demo-button')}</div>`;
  }
  function home(){
    return `<div class="page-title"><h1>Pick a game.</h1><span class="tag">Rally / 02</span></div><div class="game-index">${[['spades','♠','Solo · Partners'],['hearts','♥','Solo'],['trix','♔','Basic · Complex']].map(([game,suit,meta],i)=>`<button class="game-tile ${game}" data-action="pick-game" data-game="${game}"><span class="game-index-number">0${i+1}</span><div><strong>${gameNames[game]}</strong><small>${meta}</small></div><span class="suit" aria-hidden="true">${suit}</span></button>`).join('')}</div><div class="arrival-actions"><button class="quiet-button" data-action="play">${icon('play')} Resume table</button><div><button class="quiet-button" data-action="review">${icon('history')} Saved</button><button class="quiet-button" data-action="account">${icon('account')} Account</button></div></div>`;
  }
  function setup(){
    const chosen=mode(state.draftMode);
    return `<div class="setup-page"><div class="page-title"><h1>New game.</h1><span class="tag">You + 3 players</span></div><div class="section-label">Pace</div><div class="segments" role="group" aria-label="Game speed">${[1,1.2,1.4].map(speed=>`<button data-action="speed" data-value="${speed}" class="${state.speed===speed?'selected':''}" aria-pressed="${state.speed===speed}">${speed}×</button>`).join('')}</div><div class="section-label">Game</div><div class="segments" role="group" aria-label="Game">${Object.entries(gameNames).map(([game,name])=>`<button class="${state.draftGame===game?'selected':''}" data-action="draft-game" data-game="${game}" aria-pressed="${state.draftGame===game}">${name}</button>`).join('')}</div><div class="section-label">Mode</div><div class="mode-grid" role="group" aria-label="Game mode">${modes.filter(m=>m.game===state.draftGame).map(m=>`<button class="mode-button ${m.id===state.draftMode?'selected':''}" data-action="draft-mode" data-value="${m.id}" aria-pressed="${m.id===state.draftMode}"><span>${m.game==='trix'?(m.complex?'Complex':'Basic'):m.label}${m.game==='trix'?`<small>${m.variant==='partners'?'Partners':'Solo'}</small>`:''}</span><span class="tick">${m.id===state.draftMode?icon('check'):''}</span></button>`).join('')}</div><div class="setup-summary"><div><strong>${chosen.title} · ${chosen.label}</strong><small>Computer players · no turn timer</small></div><button class="primary-button" data-action="start">Play ${icon('arrow')}</button></div></div>`;
  }
  const history=[
    {mode:'spades-partners',label:'Today · Hand 3',score:'142 : 118'},
    {mode:'hearts-solo',label:'Yesterday · Hand 2',score:'12'},
    {mode:'trix-basic-partners',label:'Yesterday · Diamonds',score:'−40 : −85'},
    {mode:'trix-complex-solo',label:'October 8 · Kingdom 1',score:'−175'}
  ];
  function review(){
    const rows=state.cleared?[]:history.filter(h=>state.filter==='all'||mode(h.mode).game===state.filter);
    return `<div class="page-title"><h1>Saved.</h1><span class="tag">Demo history</span></div><div class="filters" role="group" aria-label="Filter saved games">${[['all','All'],...Object.entries(gameNames)].map(([value,label])=>`<button data-action="filter" data-value="${value}" class="${state.filter===value?'selected':''}" aria-pressed="${state.filter===value}">${label}</button>`).join('')}</div>${rows.length?`<div class="list">${rows.map(h=>`<button class="list-row" data-action="review-item" data-value="${h.mode}"><div><strong>${mode(h.mode).title}</strong><small>${mode(h.mode).label} · ${h.label}</small></div><span class="row-value">${h.score}</span>${icon('arrow')}</button>`).join('')}</div>`:`<div class="empty"><h2>No saved games.</h2><button class="quiet-button" data-action="restore">Restore demo history</button></div>`}`;
  }
  function account(){
    return `<div class="page-title"><div class="account-profile"><div class="avatar">A</div><div><h1>Alex.</h1><small>alex@example.com</small></div></div><span class="tag">Demo account</span></div><div class="list account-list">${[['plan','shield','Plan',state.plan],['family','family','Family',state.invited?'Invitation ready':`${state.member} · ${state.allowance} min/day`],['settings','settings','Preferences',`${themes[state.theme]} · ${state.speed}×`],['data','download','Your data','Export or clear demo history']].map(([action,ico,title,meta])=>`<button class="list-row" data-action="${action}"><span class="row-icon">${icon(ico)}</span><span class="grow"><strong>${title}</strong><small>${esc(meta)}</small></span>${icon('arrow')}</button>`).join('')}</div>`;
  }
  function render(){
    const r=route(),page=['home','setup','review','account','coaching'].includes(r)?r:'play';
    document.body.dataset.view=page;
    $('#table-screen').hidden=page!=='play';
    $('#page-screen').hidden=page==='play';
    coaching?.onRoute(page);
    if(page!=='play')$('#page-screen').innerHTML=({home,setup,review,account,coaching:()=>coaching.gallery()})[page]();
    hud();orientation(true);
    document.title=`CardFord — Rally${page==='play'?' · '+mode().title:''}`;
    if(r==='results')open('results');
    if(r==='review-detail')open('decision');
  }
  function shell(title,body){return `<div class="dialog-head"><h2 id="dialog-title">${title}</h2>${iconButton('close','close','Close')}</div><div class="dialog-body">${body}</div>`;}
  function scoreTable(id=state.mode,detail=false){
    const m=mode(id),list=competitors(id),leader=leaderIndex(id);
    return `<p class="meta">${m.title} · ${m.label}</p><table class="score-table ${detail?'compact':''}"><thead><tr><th>${m.variant==='partners'?'Team':'Player'}</th>${detail&&m.game==='trix'?'<th>Current</th><th>Kingdom</th>':''}<th>Total</th></tr></thead><tbody>${list.map(([name,total],i)=>`<tr class="${i===leader?'leading':''}"><td>${name}</td>${detail&&m.game==='trix'?`<td>0</td><td>${total}</td>`:''}<td>${total}</td></tr>`).join('')}</tbody></table>${detail&&m.game==='trix'?'<p class="score-caption">Kingdom and Total are cumulative, not added together.</p>':''}`;
  }
  function content(name){
    if(name==='menu')return shell('At your table.',`<div class="menu-grid">${[['coaching','coach','Coach'],['scores','scores','Scores'],['review','history','Saved'],['settings','settings','Settings'],['setup','games','New game'],['account','account','Account']].map(([action,ico,label])=>`<button class="menu-option" data-action="${action}">${icon(ico)}${label}</button>`).join('')}</div><div class="menu-foot"><button data-action="controls">Controls</button><button data-action="demo" style="min-height:44px;margin:-10px 0">Demo scenarios</button></div>`);
    if(name==='settings')return shell('Settings.',`<div class="section-label">Appearance</div><div class="segments" role="group" aria-label="Appearance">${Object.entries(themes).map(([value,label])=>`<button class="${state.theme===value?'selected':''}" data-action="theme" data-value="${value}" aria-pressed="${state.theme===value}">${icon(value==='light'?'sun':value==='dark'?'moon':'warm')}${label}</button>`).join('')}</div><div class="section-label">Pace</div><div class="segments" role="group" aria-label="Game speed">${[1,1.2,1.4].map(speed=>`<button class="${state.speed===speed?'selected':''}" data-action="speed" data-value="${speed}" aria-pressed="${state.speed===speed}">${speed}×</button>`).join('')}</div><div class="section-label">Coach</div>${Object.entries(coachModes).map(([value,label])=>`<button class="setting-choice ${state.coachMode===value?'selected':''}" data-action="coach-mode" data-value="${value}" aria-pressed="${state.coachMode===value}">${label}${state.coachMode===value?icon('check'):''}</button>`).join('')}<div class="future-option"><button disabled>${icon('volume')} Audio</button><small>Future option</small></div>`);
    if(name==='scores')return shell('Scores.',`${scoreTable(state.mode,true)}<div class="button-row"><button class="secondary-button" data-action="history">History ${icon('history')}</button><button class="primary-button" data-action="close">Done</button></div>`);
    if(name==='history')return shell('Score history.',`<p class="meta">Latest completed example</p>${scoreTable(state.mode,true)}<div class="notice">${mode().game==='trix'?'Diamonds · request complete':'Hand 3 · complete'}<br><span class="meta">Demo record</span></div><button class="secondary-button wide" data-action="review">Saved decisions ${icon('arrow')}</button>`);
    if(name==='decision'){
      const m=mode(state.reviewMode),choices=m.game==='trix'?['Request','Doubling','Score']:m.game==='hearts'?['Pass','Follow suit','Score']:['Follow suit','Bid','Score'];
      const notes=m.game==='trix'?['You chose an available request. Your own hand was visible; other hands were hidden.','Selection was separate from confirmation. Only eligible cards could be doubled.',`Recorded total: ${totals(state.reviewMode)[0]}.`]:m.game==='hearts'?['Three selected cards were passed after confirmation.','You held the led suit and had to follow it.','Your recorded total was 12. Lower totals lead in Hearts.']:['Diamonds were led. Your 3, 7 and king were legal choices.','Your bid was a commitment to a number of tricks.',`Recorded total: ${totals(state.reviewMode)[0]}.`];
      return shell('Saved decision.',`<p class="meta">${m.title} · ${m.label} · demo record</p><div class="decision-nav">${choices.map((label,i)=>`<button class="${state.decision===i?'selected':''}" data-action="decision" data-value="${i}" aria-pressed="${state.decision===i}">${label}</button>`).join('')}</div><h3>${choices[state.decision]}</h3><div class="decision-note">${notes[state.decision]}</div><p class="meta">Information available at that decision.</p><button class="secondary-button wide" data-action="review-score">Score history ${icon('arrow')}</button>`);
    }
    if(name==='review-score')return shell('Recorded scores.',scoreTable(state.reviewMode,true));
    if(name==='results'||name==='request-results')return shell(name==='results'?'Game complete.':'Request complete.',`<p class="score-label">${mode().variant==='partners'?'You + Maya':'Your total'} · demo result</p><div class="big-score">${totals()[0]}</div>${scoreTable()}<div class="button-row"><button class="secondary-button" data-action="result-review">Review</button><button class="primary-button" data-action="${name==='results'?'setup':'next-request'}">${name==='results'?'New game':'Next request'} ${icon('arrow')}</button></div>`);
    if(name==='plan')return shell('Plan.',`<p class="meta">Demo only · no payment</p>${['Practice','Individual','Family'].map(plan=>`<button class="setting-choice ${state.plan===plan?'selected':''}" data-action="plan-choice" data-value="${plan}">${plan}${state.plan===plan?icon('check'):''}</button>`).join('')}`);
    if(name==='family')return shell('Family.',`<div class="list"><div class="list-row"><span><strong>${esc(state.member)}</strong><small>${state.allowance} minutes / day</small></span><button class="quiet-button" data-action="allowance">Edit</button></div></div><form id="invite-form"><label class="field">Name<input id="invite-name" autocomplete="off" placeholder="Jamie" maxlength="40" required></label><label class="field">Email<input id="invite-email" type="email" autocomplete="off" placeholder="jamie@example.com" required></label><button class="primary-button wide" type="submit">Preview invitation ${icon('arrow')}</button></form><p class="meta" style="margin:13px 0 0">Demo · nothing is sent</p>`);
    if(name==='invite-ready')return shell('Invitation ready.',`<p>${esc(state.inviteName)}<br>${esc(state.inviteEmail)}</p><div class="notice">Preview only. No invitation sent.</div><button class="primary-button wide" data-action="close">Done</button>`);
    if(name==='allowance')return shell('Daily allowance.',`<div class="segments" role="group" aria-label="Daily allowance">${[15,30,45,60].map(value=>`<button class="${state.allowance===value?'selected':''}" data-action="allowance-value" data-value="${value}" aria-pressed="${state.allowance===value}">${value}m</button>`).join('')}</div><p class="meta" style="margin:16px 0 20px">Demo family setting</p><button class="primary-button wide" data-action="family">Done</button>`);
    if(name==='data')return shell('Your data.',`<div class="menu-grid"><button class="menu-option" data-action="export">${icon('download')}Export demo data</button><button class="menu-option" data-action="clear-history">${icon('history')}Clear demo history</button></div><p class="meta" style="margin:17px 0 0">This preview has no live account connection.</p>`);
    if(name==='clear-history')return shell('Clear demo history?',`<p>Only this preview’s sample records. Restore them from Saved.</p><div class="button-row"><button class="secondary-button" data-action="close">Keep</button><button class="primary-button" data-action="confirm-clear">Clear</button></div>`);
    if(name==='controls')return shell('Your move.',`<div class="section-label">Mouse / touch</div><p>Hold and drag toward the table.<br>Or double-click / double-tap.</p><div class="section-label">Keyboard</div><p>Arrows to move. Enter / Space to play.<br>Escape cancels a queue.</p><div class="section-label">Pass / double</div><p>Select first. Confirm separately.</p>`);
    if(name==='demo')return shell('Demo scenarios.',`<p class="meta">Sample cards and data · no live services</p><div class="demo-grid"><label class="field">Mode<select id="demo-mode">${modes.map(m=>`<option value="${m.id}" ${m.id===state.mode?'selected':''}>${m.title} · ${m.label}</option>`).join('')}</select></label><label class="field">State<select id="demo-phase">${[['play','Playing'],['bid','Spades bid'],['pass','Hearts pass'],['request','Trix request'],['double','Trix double'],['jacks','Trix Jacks'],['paused','Paused'],['reconnect','Reconnecting'],['readonly','View only'],['request-results','Request result'],['results','Game result'],['loading','Loading'],['unavailable','Unavailable'],['storage','Save unavailable']].map(([value,label])=>`<option value="${value}" ${state.phase===value?'selected':''}>${label}</option>`).join('')}</select></label></div><div class="button-row"><button class="primary-button" data-action="demo-go">Open ${icon('arrow')}</button></div><div class="demo-routes">${[['home','Games'],['setup','Setup'],['review','Saved'],['account','Account'],['play','Table']].map(([action,label])=>`<button data-action="${action}">${label}</button>`).join('')}</div><div class="menu-foot"><span>RALLY / 1.0</span><a href="../index.html">Rally guide ↗</a></div>`);
    return shell('Rally.',`<button class="primary-button wide" data-action="close">Done</button>`);
  }
  function open(name){
    if(name==='coach'){coaching.toggle();return;}
    coaching?.onDialog();
    state.modal=name;
    $('#dialog-content').innerHTML=content(name);
    if(!$('#dialog').open)$('#dialog').showModal();
  }
  function refreshModal(action,value){
    if(state.modal){const current=state.modal;open(current);$(`#dialog [data-action="${action}"][data-value="${value}"]`)?.focus();}
    else if(route()!=='play')render();
  }
  function start(){
    coaching?.reset();
    state.mode=state.draftMode;state.phase=mode().game==='spades'?'bid':mode().game==='hearts'?'pass':'request';
    state.beforePause=state.phase;state.played=0;state.lastTrick=false;state.explain=false;
    syncBoard(true);go('play');
  }
  function showDemo(){
    coaching?.reset();
    let nextMode=$('#demo-mode').value,phase=$('#demo-phase').value;
    const game=mode(nextMode).game;
    if(phase==='bid'&&game!=='spades')nextMode='spades-partners';
    if(phase==='pass')nextMode='hearts-solo';
    if(['request','double','jacks','request-results'].includes(phase)&&game!=='trix')nextMode='trix-basic-partners';
    state.mode=nextMode;state.draftMode=nextMode;state.draftGame=mode().game;
    state.phase=phase==='request-results'?'play':phase;state.beforePause='play';
    state.played=0;state.lastTrick=false;state.explain=false;syncBoard(true);go('play');
    if(phase==='results'||phase==='request-results')setTimeout(()=>open(phase),60);
  }
  document.addEventListener('click',event=>{
    const b=event.target.closest('[data-action]');if(!b||b.disabled)return;
    const action=b.dataset.action,value=b.dataset.value;
    if(['home','play','review','account','coaching'].includes(action)){go(action);return;}
    if(action==='setup'){state.draftMode=state.mode;state.draftGame=mode().game;go('setup');}
    else if(action==='pick-game'||action==='draft-game'){state.draftGame=b.dataset.game;state.draftMode=state.draftGame==='hearts'?'hearts-solo':state.draftGame==='spades'?'spades-partners':'trix-basic-partners';if(action==='pick-game')go('setup');else render();}
    else if(action==='draft-mode'){state.draftMode=value;render();}
    else if(action==='start')start();
    else if(action==='close')closeDialog();
    else if(['menu','settings','scores','history','coach','plan','family','allowance','data','clear-history','controls','demo'].includes(action)){if(action==='coach')state.explain=false;open(action);}
    else if(action==='theme'){state.theme=value;applyTheme();save();refreshModal(action,value);}
    else if(action==='speed'){state.speed=Number(value);sendBoard({speed:state.speed});save();refreshModal(action,value);}
    else if(action==='coach-mode'){state.coachMode=value;save();coaching.onPreference();refreshModal(action,value);}
    else if(action==='pause'){
      if(state.phase==='paused')state.phase=state.beforePause;
      else{state.beforePause=state.phase;state.phase='paused';}
      sendBoard({phase:state.phase});hud();orientation();
    }
    else if(action==='filter'){state.filter=value;render();}
    else if(action==='review-item'){state.reviewMode=value;state.decision=0;open('decision');}
    else if(action==='decision'){state.decision=Number(value);open('decision');}
    else if(action==='review-score')open('review-score');
    else if(action==='result-review'){closeDialog();coaching.request('review');}
    else if(action==='next-request'){coaching?.reset();closeDialog();state.phase='request';state.played=0;state.lastTrick=false;syncBoard(true);hud();}
    else if(action==='plan-choice'){state.plan=value;open('plan');if(route()==='account')$('#page-screen').innerHTML=account();toast('Demo plan updated. No charge.');}
    else if(action==='allowance-value'){state.allowance=Number(value);open('allowance');if(route()==='account')$('#page-screen').innerHTML=account();}
    else if(action==='confirm-clear'){state.cleared=true;closeDialog();toast('Demo history cleared.');if(route()==='review')render();}
    else if(action==='restore'){state.cleared=false;render();}
    else if(action==='export'){
      const data={demo:true,concept:'CardFord Rally V2',preferences:{theme:state.theme,speed:state.speed,coach:state.coachMode},history:state.cleared?[]:history,coachingFeedback:coaching.exportFeedback(),coachingAllowance:coaching.exportAccess()};
      const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
      const a=document.createElement('a');a.href=url;a.download='cardford-rally-demo.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('Demo data downloaded.');
    }
    else if(action==='demo-go')showDemo();
  });
  document.addEventListener('submit',event=>{
    if(event.target.id!=='invite-form')return;
    event.preventDefault();state.inviteName=$('#invite-name').value.trim();state.inviteEmail=$('#invite-email').value.trim();state.invited=true;
    open('invite-ready');if(route()==='account')$('#page-screen').innerHTML=account();
  });
  $('#dialog').addEventListener('close',()=>{state.modal=null;if(route()==='account')$('#page-screen').innerHTML=account();});
  $('#dialog').addEventListener('click',event=>{
    if(event.target!==$('#dialog'))return;const r=$('#dialog').getBoundingClientRect();
    if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)closeDialog();
  });
  frame.addEventListener('load',()=>{syncBoard();orientation(true);});
  window.addEventListener('resize',()=>{orientation();reviewState();});
  window.addEventListener('orientationchange',()=>{orientation(true);requestAnimationFrame(()=>orientation(true));});
  window.addEventListener('hashchange',()=>{closeDialog();render();window.scrollTo(0,0);});
  window.addEventListener('message',event=>{
    // The same-origin design workbench can choose examples. This never talks
    // to a game service, and viewport resizing does not reset the mounted hand.
    if(event.source===window.parent&&window.parent!==window&&event.origin===location.origin&&event.data?.type==='cardford-review'){
      const d=event.data;
      if(d.action==='inspect'){reviewState();return;}
      if(d.action==='theme'&&Object.keys(themes).includes(d.theme)){state.theme=d.theme;applyTheme();reviewState();return;}
      if(d.action==='coach'&&['closed','overlay','pinned'].includes(d.display)){coaching.reviewDisplay(d.display);reviewState();return;}
      if(d.action==='scenario'){
        const next=modes.find(m=>m.id===d.mode),allowed={hearts:['play','pass'],spades:['play','bid'],trix:['play','jacks','double','request']};
        if(!next||!allowed[next.game].includes(d.phase))return;
        closeDialog();coaching.reset();state.mode=next.id;state.draftMode=next.id;state.draftGame=next.game;
        state.phase=d.phase;state.beforePause=d.phase;state.played=0;state.lastTrick=false;state.explain=false;
        state.request=d.phase==='jacks'?'Trix Jacks':d.phase==='double'?'All combined':'Diamonds';
        syncBoard(true);go('play');reviewState();return;
      }
      return;
    }
    if(event.source!==frame.contentWindow||event.origin!==location.origin||event.data?.type!=='cardford-board-event')return;
    const d=event.data;
    if(d.action==='layout'&&Number.isFinite(d.handClearance)){
      $('#table-screen').style.setProperty('--coach-hand-clearance',`${Math.max(72,Math.min(innerHeight*.65,d.handClearance))}px`);
      reviewState();return;
    }
    coaching.receive(d);
    if(d.action==='ready'){syncBoard();orientation(true);}
    if(d.action==='played'){state.played++;state.lastTrick=false;}
    if(d.action==='trick-complete')state.lastTrick=true;
    if(d.action==='confirmed'){
      if(d.phase==='request')state.request=d.choice;
      state.phase=d.nextPhase||(d.phase==='request'?(d.choice==='Trix Jacks'?'jacks':['Queens','The King','All combined'].includes(d.choice)?'double':'play'):'play');
      state.explain=false;hud();orientation();
    }
    if(d.action==='resume'){if(state.phase==='results'){state.played=0;state.lastTrick=false;}state.phase=d.phase||state.beforePause||'play';hud();orientation();}
    reviewState();
  });
  function reviewState(){
    if(window.parent!==window)window.parent.postMessage({type:'cardford-review-state',ready:true,mode:state.mode,phase:state.phase,theme:state.theme,coachDisplay:coaching?.display()||'closed'},location.origin);
  }
  // Report after all shell/Coach click handlers, including close and pin.
  document.addEventListener('click',()=>queueMicrotask(reviewState));
  coaching=window.createRallyCoach({$,esc,icon,iconButton,post,state,mode,route,go,closeDialog,hud,render,toast});
  applyTheme();render();orientation(true);reviewState();
})();
