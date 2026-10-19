(function () {
  'use strict';
  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const tokens = window.RALLY_TOKENS;
  const esc = text => String(text).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]);
  const names = { bg:'Background', surface:'Surface', ink:'Ink', muted:'Muted', line:'Line', accent:'Accent', 'accent-ink':'Accent text', tint:'Tint', felt:'Felt', 'board-bg':'Background', 'board-ink':'Ink', 'board-muted':'Muted', 'board-line':'Line', 'board-accent':'Accent', 'board-felt':'Felt', badge:'Badge', 'badge-ink':'Badge text' };
  function luminance(hex) {
    const full = hex.length === 4 ? '#' + [...hex.slice(1)].map(c => c + c).join('') : hex;
    const channels = [1,3,5].map(n => parseInt(full.slice(n,n+2),16)/255).map(c => c <= .04045 ? c/12.92 : ((c+.055)/1.055)**2.4);
    return channels[0]*.2126 + channels[1]*.7152 + channels[2]*.0722;
  }
  function contrast(a,b) { const x=luminance(a), y=luminance(b); return ((Math.max(x,y)+.05)/(Math.min(x,y)+.05)).toFixed(2); }
  function theme(name) {
    if (!tokens.themes[name]) return;
    document.documentElement.dataset.theme = name;
    $$('[data-theme-choice]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.themeChoice === name)));
    const scopes = tokens.themes[name];
    for (const scope of ['shell','board']) {
      $(`#${scope}-swatches`).innerHTML = Object.entries(scopes[scope]).filter(([,entry]) => entry.$type === 'color').map(([key,entry]) => `<div class="swatch"><div class="swatch-color" style="background:${esc(entry.$value)}" aria-hidden="true"></div><b>${esc(names[key]||key)}</b><small>${esc(entry.$value.toUpperCase())}</small></div>`).join('');
    }
    $('#token-rows').innerHTML = Object.entries(scopes).flatMap(([scope,entries]) => Object.entries(entries).map(([name,entry]) => `<tr><td>${scope} / ${esc(name)}</td><td><code>${esc(entry.$value)}</code></td><td><a href="${esc(entry.source.file)}">${esc(entry.source.file)}:${entry.source.line}</a><br><code>${esc(entry.source.selector)} → ${esc(entry.source.property)}</code></td></tr>`)).join('');
    const s=scopes.shell,b=scopes.board;
    $('#contrast-values').innerHTML = [
      ['Shell ink / background',s.ink.$value,s.bg.$value], ['Shell muted / surface',s.muted.$value,s.surface.$value],
      ['Board ink / felt',b['board-ink'].$value,b['board-felt'].$value], ['Shell action text',s['accent-ink'].$value,s.accent.$value]
    ].map(([label,a,b]) => `<span>${label}<b>${contrast(a,b)}:1</b></span>`).join('');
  }
  $$('[data-theme-choice]').forEach(button => button.addEventListener('click',()=>theme(button.dataset.themeChoice)));
  $$('[data-demo-action]').forEach(button => button.addEventListener('click',()=>{$('#control-response').textContent=`${button.dataset.demoAction} activated in the reference. No game action was sent.`;}));
  $$('[data-pace]').forEach(button=>button.addEventListener('click',()=>{
    $$('[data-pace]').forEach(item=>item.setAttribute('aria-pressed',String(item===button)));
    $('#control-response').textContent=`${button.dataset.pace}× selected in this specimen. The game preference is unchanged.`;
  }));

  const icon = name => `<svg viewBox="0 0 24 24" aria-hidden="true">${({check:'<path d="m5 12 4 4L19 6"/>',close:'<path d="m6 6 12 12M18 6 6 18"/>',back:'<path d="m15 5-7 7 7 7"/>',next:'<path d="m9 5 7 7-7 7"/>',play:'<path d="m8 5 11 7-11 7V5Z"/>',pause:'<path d="M8 5v14M16 5v14"/>'})[name]}</svg>`;
  const contracts = {
    welcome:'Opening the window does not request advice or use the daily allowance. A deliberate request starts one session.',
    closed:'The waiting sticker remains on the left. Closing dismisses the window and acknowledges the current decision; it does not revoke the saved session or pin preference. Actual pinning requires 760px of table-screen width.',
    attention:'Whistle attention is available for Trix doubling, Spades bidding and Hearts passing. Only a new unacknowledged decision with fresh access can signal. No auto-open, charge or sound.',
    cue:'A cue precedes selection. If the live context no longer matches, the mock labels the material as a saved opening example instead of claiming live insight.',
    selection:'Real selection events come from Hearts passing or Trix doubling. The comment names those exact cards. Ordinary play has no added confirmation step.',
    confirmed:'Confirmation retires pending-selection wording even with When I ask selected or the window closed. It records a fact without starting a new session.',
    played:'After a card is played, a prior cue becomes saved. Optional post-play comments use the Played label and do not claim the move was optimal.',
    review:'Two compact sample recommendations: Strength and Next practice. Each owns its Why playback and item-specific feedback.',
    rating:'Fictional peers are explicitly demo data. The illustrative 1,240 value and rank do not represent a real population or measured skill.',
    playback:'Why opens history at the game view while the live board remains mounted and frozen. Here only the control specimen changes; open the mock for actual historical cards.',
    history:'Seek across two sample rounds. Use the phase moment, such as Pass left or Doubling, when supplied instead of calling every moment a trick.',
    feedback:'Helpful / Not helpful, optional reason and note belong to the exact recommendation. The mock stores them on this device only; this reference keeps nothing.',
    saved:'Reloaded or outdated advice carries a Saved label. Earlier text cannot silently become a claim about the current hand.',
    locked:'Two free sessions are used. A current session remains readable, including Why and feedback. A new request is blocked; Demo Unlock has no purchase flow.',
    unlocked:'Unlocked is a local demo entitlement, not a payment result. Requests remain explicit and advice does not appear just because the panel opens.',
    portrait:'Below 700px wide when height exceeds width, game input is inert, the hand is paused and Coach is hidden. Resume the same hand in landscape.'
  };
  let state='welcome', previous='welcome', pinned=false, replayIndex=0, playing=false, timer;
  const frames=[
    ['Round 1 · Trick 1','The diamond lead.','A saved follow-suit example begins with a public diamond lead.'],
    ['Round 1 · Trick 1','Read your hand.','The example hand contains diamonds. The reply must follow suit.'],
    ['Round 1 · Trick 1','An available reply.','The 3 of diamonds follows the led suit.'],
    ['Round 1 · Trick 1','The completed trick.','Review the public result separately from the earlier decision.'],
    ['Round 2 · Trick 1','A different lead.','The second example starts with clubs.'],
    ['Round 2 · Trick 1','No clubs held.','In this saved hand, no card can follow the led suit.'],
    ['Round 2 · Trick 1','Review the options.','Any held card is legal here. Legality does not establish the best choice.'],
    ['Round 2 · Trick 1','Keep the practice point.','Check whether you hold the led suit before choosing a reply.']
  ];
  const actions=()=>`<div class="actions"><button class="button primary" data-coach-ref="why">Why ${icon('play')}</button><button class="vote" data-coach-ref="vote" data-vote="helpful" aria-label="Helpful" title="Helpful" aria-pressed="false">${icon('check')}</button><button class="vote" data-coach-ref="vote" data-vote="not-helpful" aria-label="Not helpful" title="Not helpful" aria-pressed="false">${icon('close')}</button></div>`;
  const recommendation=(kicker,title,note)=>`<article><p class="kicker">${kicker}</p><h3>${title}</h3><p>${note}</p>${actions()}</article>`;
  function pause() { clearTimeout(timer); playing=false; if(state==='playback')updateReplay(); }
  function setState(next,focus=false) {
    pause(); state=next; $('#coach-state').value=state;
    $('#coach-contract').textContent=contracts[state];
    const closed=['closed','attention'].includes(state),portrait=state==='portrait';
    $('#coach-stage').classList.toggle('is-pinned',pinned&&!closed&&!portrait);
    $('#coach-specimen').hidden=closed||portrait;$('#coach-sticker').hidden=portrait;$('#portrait-specimen').hidden=!portrait;
    $('#coach-allowance').textContent=state==='locked'?'0 free today':state==='unlocked'?'Unlocked · demo':['welcome','closed','attention','portrait'].includes(state)?'2 free today':'1 free today';
    $('#coach-sticker').setAttribute('aria-expanded',String(!closed&&!portrait));
    const stickerLabel=closed?'Open coach specimen':'Close coach specimen';
    $('#coach-sticker').setAttribute('aria-label',stickerLabel);$('#coach-sticker').title=stickerLabel;
    $('#coach-sticker').dataset.state=state==='attention'?'attention':'waiting';
    const image=$('#coach-sticker-image');image.src=`../assets/stickers/png/regular-${state==='attention'?'whistle-v3':'waiting-v2'}.png`;image.alt=state==='attention'?'Coach signals a decision':'Coach waiting';
    $('#coach-reference-status').textContent=state==='attention'?'Coach is available for this example decision.':portrait?'Portrait reference: game and coach paused.':'';
    const body=$('#coach-content');
    if (state==='welcome'||state==='unlocked') body.innerHTML=`<h3>A second look?</h3><p>Choose a coaching moment.</p>${[['cue','Get a cue'],['selection','Check my selection'],['review','Review the play'],['rating','Sample player rating']].map(([value,label])=>`<button class="setting-choice" data-coach-ref="state" data-state="${value}">${label}<span aria-hidden="true">→</span></button>`).join('')}`;
    else if(state==='cue')body.innerHTML=recommendation('Before selection · demo cue','Follow the diamonds.','Diamonds were led. The 3, 7 and king in your hand can follow suit.');
    else if(state==='selection')body.innerHTML=recommendation('Your current selection · demo','Three selected. Still your call.','Queen of hearts, King of hearts, Ace of spades. Review the group before confirming the pass.');
    else if(state==='confirmed')body.innerHTML=recommendation('Confirmed · demo','Your pass is confirmed.','Queen of hearts, King of hearts, Ace of spades. These cards were passed. The selection is no longer pending.');
    else if(state==='played')body.innerHTML=recommendation('Played · demo hand','King of diamonds played.','Confirmed. Replay the saved follow-suit lesson for a second look; it does not grade this move.');
    else if(state==='saved')body.innerHTML=recommendation('Saved coaching session · demo','Keep the led suit in view.','Saved example: if your hand contains the led suit, your reply must follow it. Replay that moment before comparing the outcome.');
    else if(state==='review')body.innerHTML=`<p class="kicker">2 rounds · 1 practice focus · Demo data</p>${recommendation('Strength · sample play','Followed the led suit.','In the first example, your 3 of diamonds followed the diamond lead. The reply respected the suit constraint.')}${recommendation('Next practice · sample play','Spot when you are void.','The second example has no clubs in your hand. Any held card is legal; legality alone does not make one the best choice.')}`;
    else if(state==='rating')body.innerHTML=`<p class="kicker">Sample rating</p><p class="sample-rating">1,240</p><p>4 of 8 fictional peers</p><details><summary class="button quiet">See sample peers</summary><ol class="peer-list">${[['Nora','1,410'],['Sam','1,360'],['Inez','1,290'],['You','1,240'],['Alex','1,200'],['Lee','1,175'],['Robin','1,110'],['Kit','1,080']].map(([name,value])=>`<li class="${name==='You'?'current':''}"><span>${name}</span><b>${value}</b></li>`).join('')}</ol></details><p class="data-note">Illustrative values, not a real population or measured skill. Replay illustrates the practice note; it does not establish this rating.</p>${recommendation('Demo data','A place to practise next.','Use the follow-suit example as your next practice point.')}`;
    else if(state==='locked')body.innerHTML=`<h3>That’s two for today.</h3><p>Back tomorrow, or unlock coaching.</p><button class="button secondary wide" data-coach-ref="state" data-state="saved">Return to current session</button><button class="button primary wide" data-coach-ref="state" data-state="unlocked">Demo Unlock</button><p class="data-note">No purchase. Local preview only.</p>`;
    else if(state==='feedback')body.innerHTML=`<p class="kicker">Feedback on this recommendation</p><h3>Was it useful?</h3><form id="reference-feedback"><label for="feedback-reason">Reason (optional)</label><select id="feedback-reason"><option value="">Choose a reason</option><option>Clear explanation</option><option>Not relevant to my question</option><option>I need more detail</option></select><label for="feedback-note">Note (optional)</label><textarea id="feedback-note" rows="3" maxlength="500" placeholder="What would help?"></textarea><button class="button primary wide" type="submit">Save preview feedback</button></form><p class="data-note" id="feedback-status" role="status">Reference only. Nothing is stored or sent.</p><button class="button quiet" data-coach-ref="back">Back</button>`;
    else if(state==='history')body.innerHTML=`<p class="kicker">Saved demo example</p><h3>Round history.</h3>${frames.map(([position,title],index)=>`<button class="setting-choice" data-coach-ref="seek" data-index="${index}"><span><small>${position}</small><br>${title}</span></button>`).join('')}<button class="button quiet" data-coach-ref="state" data-state="playback">Playback</button>`;
    else if(state==='playback'){
      body.innerHTML=`<p class="kicker">Guided playback · demo</p><p id="replay-position"></p><div aria-live="polite"><strong id="replay-title" class="playback-title"></strong><p id="replay-caption"></p></div><div class="playback-buttons"><button class="icon-control" data-coach-ref="previous" aria-label="Previous moment">${icon('back')}</button><button class="icon-control" id="replay-toggle" data-coach-ref="play" aria-label="Play example">${icon('play')}</button><button class="icon-control" data-coach-ref="next" aria-label="Next moment">${icon('next')}</button></div><label for="replay-seek">Moment <span id="replay-counter"></span></label><input id="replay-seek" type="range" min="0" max="7" step="1" value="0" aria-label="Seek across example rounds"><button class="button quiet" data-coach-ref="state" data-state="history">History</button><button class="button quiet" data-coach-ref="feedback">Feedback</button><button class="button secondary wide" data-coach-ref="back">Exit playback</button><p class="data-note">Control specimen only. Historical cards are in the full mock.</p>`;updateReplay();
    }
    if(focus&&!closed&&!portrait)body.focus({preventScroll:true});
  }
  function updateReplay() {
    if(state!=='playback'||!$('#replay-seek'))return;
    const [position,title,caption]=frames[replayIndex];
    $('#replay-position').textContent=position;$('#replay-title').textContent=title;$('#replay-caption').textContent=caption;
    $('#replay-counter').textContent=`${replayIndex+1} / ${frames.length}`;$('#replay-seek').value=String(replayIndex);
    $('[data-coach-ref=previous]').disabled=replayIndex===0;$('[data-coach-ref=next]').disabled=replayIndex===frames.length-1;
    $('#replay-toggle').innerHTML=icon(playing?'pause':'play');$('#replay-toggle').setAttribute('aria-label',playing?'Pause example':'Play example');
  }
  function advance(){clearTimeout(timer);if(!playing||state!=='playback'||document.hidden)return;timer=setTimeout(()=>{if(replayIndex<frames.length-1){replayIndex++;updateReplay();advance();}else pause();},2200);}
  $('#coach-state').addEventListener('change',event=>{replayIndex=0;previous='welcome';setState(event.target.value);});
  $('#coach-size').addEventListener('change',event=>$('#coach-stage').classList.toggle('compact',event.target.value==='compact'));
  $('#coach-pin').addEventListener('click',()=>{pinned=!pinned;$('#coach-pin').setAttribute('aria-pressed',String(pinned));$('#coach-pin').setAttribute('aria-label',pinned?'Unpin coach specimen':'Pin coach specimen');$('#coach-pin').title=pinned?'Unpin coach':'Pin coach';$('#coach-stage').classList.toggle('is-pinned',pinned);});
  function closeCoach(){
    if(!['playback','history','feedback'].includes(state))previous=state;
    if(['closed','attention','portrait','playback','history','feedback'].includes(previous))previous='cue';
    setState('closed');
  }
  $('#coach-close').addEventListener('click',()=>{closeCoach();$('#coach-sticker').focus();});
  $('#coach-sticker').addEventListener('click',()=>{if(['closed','attention'].includes(state))setState(['closed','attention','portrait'].includes(previous)?'welcome':previous,true);else closeCoach();});
  $('#coach-content').addEventListener('click',event=>{
    const button=event.target.closest('[data-coach-ref]');if(!button)return;
    const action=button.dataset.coachRef;
    if(action==='state')setState(button.dataset.state,true);
    else if(action==='why'){previous=state;replayIndex=0;setState('playback',true);}
    else if(action==='back')setState(['feedback','history','playback','closed','attention','portrait'].includes(previous)?'cue':previous,true);
    else if(action==='feedback'){setState('feedback',true);}
    else if(action==='vote'){
      button.parentElement.querySelectorAll('.vote').forEach(vote=>vote.setAttribute('aria-pressed',String(vote===button)));
      const item=button.closest('article');let note=item.querySelector('[data-coach-ref=feedback]');if(!note){note=document.createElement('button');note.className='button quiet';note.dataset.coachRef='feedback';note.textContent='Add a reason or note';item.append(note);}$('#coach-reference-status').textContent=`${button.dataset.vote==='helpful'?'Helpful':'Not helpful'} selected in the specimen. Nothing was saved.`;
    }
    else if(action==='seek'){replayIndex=Number(button.dataset.index);setState('playback',true);}
    else if(action==='previous'||action==='next'){pause();replayIndex=Math.max(0,Math.min(frames.length-1,replayIndex+(action==='next'?1:-1)));updateReplay();}
    else if(action==='play'){if(playing)pause();else{if(replayIndex===frames.length-1)replayIndex=0;playing=true;updateReplay();advance();}}
  });
  $('#coach-content').addEventListener('input',event=>{if(event.target.id==='replay-seek'){pause();replayIndex=Number(event.target.value);updateReplay();}});
  $('#coach-content').addEventListener('submit',event=>{if(event.target.id==='reference-feedback'){event.preventDefault();$('#feedback-status').textContent='Preview complete. No feedback was stored or sent.';}});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});
  let width=844;
  function layout(){
    const height=width===844?390:352,tableWidth=width-52,requested=$('#layout-pin').checked,canPin=tableWidth>=760,pin=requested&&canPin;
    $('#layout-model').style.aspectRatio=`${width}/${height}`;
    $('.layout-hud').style.width=`${52/width*100}%`;
    $('.layout-coach').hidden=!pin;$('.layout-coach').style.width=`${204/(tableWidth-16)*100}%`;
    $('#layout-pin').disabled=!canPin;
    $('#layout-budget').textContent=`${width} × ${height} → 52px side controls + ${tableWidth} × ${height} table.${pin?` Pinned iframe: ${tableWidth-220} × ${height}.`:!canPin?` Pin unavailable below 760px; ${requested?'saved pin preference uses an overlay':'Coach uses an overlay'}.`:' Overlay Coach leaves iframe width unchanged.'}`;
    $$('[data-viewport]').forEach(button=>button.setAttribute('aria-pressed',String(Number(button.dataset.viewport)===width)));
  }
  $$('[data-viewport]').forEach(button=>button.addEventListener('click',()=>{width=Number(button.dataset.viewport);layout();}));$('#layout-pin').addEventListener('change',layout);
  theme('light');setState('welcome');layout();
})();
