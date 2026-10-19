(function () {
  'use strict';
  const {profiles,dimensions,fitScale}=window.RallyDeviceProfiles;
  const $=selector=>document.querySelector(selector),$$=selector=>[...document.querySelectorAll(selector)];
  const frame=$('#preview'),stage=$('#preview-stage'),boundary=$('#viewport-boundary');
  const state={profile:'iphone12',portrait:false,scaleMode:'fit',ready:false,initialized:false,coachRequested:'closed',pending:null};
  const phases={spades:[['play','Trick play'],['bid','Bidding']],hearts:[['play','Trick play'],['pass','Passing']],trix:[['play','Trick play'],['request','Request choice'],['double','Doubling'],['jacks','Trix Jacks']]};
  const phaseLabels={play:'Trick play',bid:'Bidding',pass:'Passing',request:'Request choice',double:'Doubling',jacks:'Trix Jacks',paused:'Paused',reconnect:'Reconnecting',readonly:'Read only',results:'Results'};
  const query=new URLSearchParams(location.search);
  if(profiles.some(p=>p.id===query.get('device')))state.profile=query.get('device');
  const queryMode=query.get('mode'),queryPhase=query.get('phase');
  const knownModes=['hearts-solo','spades-solo','spades-partners','trix-basic-solo','trix-basic-partners','trix-complex-solo','trix-complex-partners'];
  const queryScenario=knownModes.includes(queryMode)&&phases[queryMode.split('-')[0]].some(([phase])=>phase===queryPhase)?{mode:queryMode,phase:queryPhase}:null;
  let queryHandled=false;
  const esc=text=>String(text).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
  let resizeTick=0,connectionTimer;
  const profile=()=>profiles.find(p=>p.id===state.profile)||profiles[2];
  function announce(text){$('#review-status').textContent=text;}
  function send(values){if(location.origin==='null'){announce('Open this reviewer through the local HTTP preview server.');return false;}frame.contentWindow?.postMessage({type:'cardford-review',...values},location.origin);return true;}
  function drawPresets(){const groups=[...new Set(profiles.map(p=>p.group))];$('#profile').innerHTML=groups.map(group=>`<optgroup label="${esc(group)}">${profiles.filter(p=>p.group===group).map(p=>`<option value="${p.id}"${p.id===state.profile?' selected':''}>${esc(p.label)} · ${p.width} × ${p.height}</option>`).join('')}</optgroup>`).join('');}
  function fit(){
    const {width,height}=dimensions(profile(),state.portrait),padding=window.innerWidth<=760?32:48;
    const scale=fitScale(width,height,stage.clientWidth-padding-2,stage.clientHeight-padding-2,state.scaleMode);
    frame.style.transform=`scale(${scale})`;boundary.style.width=`${width*scale}px`;boundary.style.height=`${height*scale}px`;
    stage.classList.toggle('full-size',state.scaleMode==='actual');
    $('#scale-label').textContent=`Display ${Math.round(scale*100)}% · iframe ${width} × ${height} CSS px · shown ${Math.round(width*scale)} × ${Math.round(height*scale)}px`;
    $$('[data-scale]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.scale===state.scaleMode)));
  }
  function scheduleFit(){cancelAnimationFrame(resizeTick);resizeTick=requestAnimationFrame(fit);}
  function resize(announceChange=true){
    const p=profile(),{width,height}=dimensions(p,state.portrait);
    // Never replace or navigate the iframe when resizing the review surface.
    frame.width=String(width);frame.height=String(height);frame.style.width=`${width}px`;frame.style.height=`${height}px`;
    frame.title=`Interactive Rally mock, ${width} by ${height} CSS pixels`;
    $('#profile').value=p.id;$('#profile-title').textContent=p.label;$('#profile-note').textContent=p.basis;
    $('#viewport-size').innerHTML=`${width} × ${height} <small>CSS px</small>`;
    $('#rotate').setAttribute('aria-pressed',String(state.portrait));$('.rotate-label').textContent=state.portrait?'Landscape':'Portrait';
    $('#orientation-label').textContent=width<700&&height>width?'Portrait gate · same hand paused':height>width?'Portrait tablet · no phone rotation gate':'Landscape · hand stays mounted';
    fit();stage.scrollLeft=0;stage.scrollTop=0;if(announceChange)announce(`${p.label}: ${width} by ${height} CSS pixels. Hand preserved.`);
  }
  function changeProfile(id){if(!profiles.some(p=>p.id===id))return;state.profile=id;resize();}
  function updatePhases(preferred){
    const game=$('#game-mode').value.split('-')[0],options=phases[game]||phases.spades;
    const next=options.some(([value])=>value===(preferred||$('#phase').value))?(preferred||$('#phase').value):'play';
    $('#phase').innerHTML=options.map(([value,label])=>`<option value="${value}"${value===next?' selected':''}>${label}</option>`).join('');
  }
  function loadScenario(mode,phase){
    if(!state.ready)return;const game=mode.split('-')[0];if(!phases[game]?.some(([value])=>value===phase))return;
    $('#game-mode').value=mode;updatePhases(phase);state.pending={mode,phase};
    send({action:'scenario',mode,phase});
    announce('Loading an authored demo. This explicit action starts a new hand.');
  }
  function coachStatus(actual){$('#coach-effective').textContent=state.coachRequested==='pinned'&&actual==='overlay'?'Overlay at this width':actual==='pinned'?'Pinned beside table':actual==='overlay'?'Floating over table':'Window closed';}
  function receive(event){
    if(event.source!==frame.contentWindow||event.origin!==location.origin||event.data?.type!=='cardford-review-state')return;
    const data=event.data;if(data.ready!==true)return;clearTimeout(connectionTimer);state.ready=true;
    $$('[data-scenario],#game-mode,#phase,#load-scenario,#theme,#coach-display').forEach(control=>{control.disabled=false;});$('.live-state').classList.add('ready');
    const modeText=$(`#game-mode option[value="${data.mode}"]`)?.textContent||'Rally';
    $('#live-state').textContent=`${modeText} · ${phaseLabels[data.phase]||data.phase||'Ready'}`;
    if(!state.initialized){
      if($(`#game-mode option[value="${data.mode}"]`)){$('#game-mode').value=data.mode;updatePhases(data.phase);}
      if(['closed','overlay','pinned'].includes(data.coachDisplay)){state.coachRequested=data.coachDisplay;$('#coach-display').value=data.coachDisplay;}
      state.initialized=true;announce('Mock connected. Resize freely; Load demo starts a new example.');
    }
    if(['light','dark','warm'].includes(data.theme))$('#theme').value=data.theme;
    if(['closed','overlay','pinned'].includes(data.coachDisplay))coachStatus(data.coachDisplay);
    if(state.pending&&data.mode===state.pending.mode&&data.phase===state.pending.phase){state.pending=null;announce(`${modeText} · ${phaseLabels[data.phase]||data.phase} loaded. Resize to compare this hand.`);}
    // A whitelisted scenario in the review URL is an explicit request, once.
    // Repeated ready/layout messages and subsequent resizes never reload it.
    if(!queryHandled){queryHandled=true;if(queryScenario)loadScenario(queryScenario.mode,queryScenario.phase);}
  }
  $('#profile').addEventListener('change',event=>changeProfile(event.target.value));
  $('#previous-profile').addEventListener('click',()=>changeProfile(profiles[(profiles.findIndex(p=>p.id===state.profile)+profiles.length-1)%profiles.length].id));
  $('#next-profile').addEventListener('click',()=>changeProfile(profiles[(profiles.findIndex(p=>p.id===state.profile)+1)%profiles.length].id));
  $('#rotate').addEventListener('click',()=>{state.portrait=!state.portrait;resize();});
  $$('[data-scale]').forEach(button=>button.addEventListener('click',()=>{state.scaleMode=button.dataset.scale;fit();announce(state.scaleMode==='fit'?'Display fitted to the review area. The game keeps its selected CSS dimensions.':'100 percent display. Scroll the canvas if the selected viewport is larger than the review area.');}));
  $('#game-mode').addEventListener('change',()=>updatePhases());$('#load-scenario').addEventListener('click',()=>loadScenario($('#game-mode').value,$('#phase').value));
  $$('[data-scenario]').forEach(button=>button.addEventListener('click',()=>{
    const value=button.dataset.scenario,current=$('#game-mode').value;
    if(value==='trix-jacks')loadScenario(current.startsWith('trix-')?current:'trix-basic-partners','jacks');
    else if(value==='trix-double')loadScenario(current.startsWith('trix-')?current:'trix-basic-partners','double');
    else if(value==='hearts-pass')loadScenario('hearts-solo','pass');
    else if(value==='spades-bid')loadScenario(current.startsWith('spades-')?current:'spades-partners','bid');else loadScenario(current,'play');
  }));
  $('#theme').addEventListener('change',()=>{if(state.ready){send({action:'theme',theme:$('#theme').value});announce('Theme changed. The current hand is preserved.');}});
  $('#coach-display').addEventListener('change',()=>{if(state.ready){state.coachRequested=$('#coach-display').value;send({action:'coach',display:state.coachRequested});announce('Coach presentation changed. No coaching session was requested.');}});
  frame.addEventListener('load',()=>{state.ready=false;$$('[data-scenario],#game-mode,#phase,#load-scenario,#theme,#coach-display').forEach(control=>{control.disabled=true;});clearTimeout(connectionTimer);send({action:'inspect'});connectionTimer=setTimeout(()=>{if(!state.ready)announce('Waiting for the Rally review connection. Size and rotation controls remain available.');},4000);});
  window.addEventListener('message',receive);window.addEventListener('resize',scheduleFit);
  if(typeof ResizeObserver==='function')new ResizeObserver(scheduleFit).observe(stage);
  drawPresets();resize(false);send({action:'inspect'});
})();
