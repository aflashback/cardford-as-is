(function () {
  'use strict';
  window.createRallyCoach = function (api) {
    const { $, esc, icon, iconButton, post } = api;
    const feedbackKey = 'cardford-rally-coach-feedback-v1';
    const labels = { cue: 'Before your move', selection: 'After selection', review: 'Play review', rating: 'Player rating' };
    const topics = Object.keys(labels);
    const records = new Map();
    let feedback = {}, selection = null, selectedItem = null, feedbackDraft = null, activeItem = null, previewPending = null;
    let replay = { active: false, ready: false, playing: false, index: 0, total: 0, frames: [], topic: 'cue' };
    let timer, dayTimer, playSequence = 0;
    const accessKey = 'cardford-rally-coach-access-v1';
    const localDay = () => { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; };
    let access = { day: localDay(), used: 0, unlocked: false, enabled: false, pinned: false, session: null };
    try {
      const saved = JSON.parse(localStorage.getItem(accessKey) || 'null');
      if (saved && typeof saved === 'object') {
        access = { day: typeof saved.day === 'string' ? saved.day : localDay(), used: Number.isInteger(saved.used) ? Math.max(0, Math.min(2, saved.used)) : 0, unlocked: saved.unlocked === true, enabled: saved.enabled === true, pinned: saved.pinned === true, session: null };
        if (saved.session && topics.includes(saved.session.topic) && Array.isArray(saved.session.items)) {
          const items = saved.session.items.filter(rec => rec && typeof rec.id === 'string' && topics.includes(rec.topic) && ['spades', 'hearts', 'trix'].includes(rec.game) && typeof rec.title === 'string' && typeof rec.note === 'string').map(rec => ({ ...rec, badge: 'Saved coaching session · demo', note: `Saved example: ${rec.note.replace(/^Saved example: /, '')}` }));
          if (items.length) access.session = { ...saved.session, items };
        }
      }
    } catch {}
    let currentPage = ['home', 'setup', 'review', 'account', 'coaching'].includes(api.route()) ? api.route() : 'play';
    let panelView = access.session ? 'session' : 'welcome', returnView = 'session', message = '', pendingFocus = false;
    let decisionEpoch = 0;
    let attention = { key: '', game: '', phase: '', token: '', acknowledged: false };
    if (access.session) { access.session.items.forEach(rec => records.set(rec.id, rec)); activeItem = access.session.items[0]; }
    try { const saved = JSON.parse(localStorage.getItem(feedbackKey) || '{}'); if (saved && typeof saved === 'object' && !Array.isArray(saved)) feedback = saved; } catch {}
    const s = () => api.state;
    const game = () => api.mode().game;
    const isPortrait = () => innerWidth < 700 && innerHeight > innerWidth;
    // Reserve a coach column only when the remaining game can stay readable.
    // Keep the pin preference while a small viewport temporarily uses an overlay.
    const canPin = () => {
      const measured = $('#table-screen')?.clientWidth;
      const sideRail = innerWidth <= 1000 && innerHeight <= 430 && innerWidth > innerHeight ? 52 : 0;
      return (Number.isFinite(measured) && measured > 0 ? measured : innerWidth - sideRail) >= 760;
    };
    const cardName = card => {
      const match = /^([CDHS])(A|K|Q|J|10|[2-9])$/.exec(String(card));
      if (!match) return 'Unknown card';
      return `${({ A: 'Ace', K: 'King', Q: 'Queen', J: 'Jack' })[match[2]] || match[2]} of ${{ C: 'clubs', D: 'diamonds', H: 'hearts', S: 'spades' }[match[1]]}`;
    };
    function item(topic, override = {}) {
      const phase = s().phase === 'paused' ? s().beforePause : s().phase;
      let title, note, badge = 'Demo example', id = `${topic}-${game()}`, replayGame = game();
      if (topic === 'cue') {
        const cues = {
          play: ['Follow the diamonds.', 'Diamonds were led. The 3, 7 and king in your hand can follow suit.'],
          bid: ['Count a commitment.', 'Your bid commits to a number of tricks. Review your hand before choosing.'],
          pass: ['Choose three to pass.', 'Select three cards in your hand. You can change the selection before confirming.'],
          request: ['Choose your request.', 'Review the available requests with your own hand in view.'],
          double: ['Check the eligible cards.', 'Select eligible queens or the king of hearts for this request, then confirm separately.'],
          jacks: ['Look at the open ends.', 'A suit extends one rank at a time from its Jack. Check the public layout.']
        };
        [title, note] = cues[phase] || cues.play;
        const saved = s().played > 0 || !['play', 'pass', 'double'].includes(phase) || (phase === 'play' && game() !== 'spades');
        badge = saved ? 'Saved opening example' : 'Before selection · demo cue';
        if (saved) { title = 'Keep the led suit in view.'; note = 'Saved example: if your hand contains the led suit, your reply must follow it. Replay that moment before comparing the outcome.'; }
        id += `-${phase}-${saved ? 'saved' : 'opening'}`;
      } else if (topic === 'selection') {
        const chosen = selection?.cards || [];
        replayGame = selection?.game || 'hearts';
        id = `selection-${replayGame}-${selection?.phase || 'pass'}-${chosen.join('-') || 'none'}`;
        badge = selection ? 'Your current selection · demo' : 'Selection preview';
        title = selection?.phase === 'double' ? 'Check your doubles.' : chosen.length === 3 ? 'Three selected. Still your call.' : 'Selection is a separate step.';
        note = chosen.length ? `${chosen.map(cardName).join(', ')}. ${selection.phase === 'double' ? 'These are selected for doubling; nothing is confirmed yet.' : chosen.length === 3 ? 'Review the group before confirming the pass.' : `Choose ${3 - chosen.length} more before confirming the pass.`}` : 'Select cards in Hearts passing or Trix doubling to see a comment on that exact selection.';
      } else if (topic === 'review') {
        title = 'Revisit the decision, not just the score.';
        note = 'Replay the lead, your available reply, and the completed trick. Keep the information from each moment separate.';
        badge = 'Saved play review · demo data';
        id += '-round-review';
      } else {
        title = 'A place to practise next.';
        note = 'Use the follow-suit example as your next practice point. The sample rating is separate from this coaching note.';
        badge = 'Demo data · 8 fictional peers';
        id += '-sample-peers';
      }
      const result = { id, topic, title, note, badge, game: replayGame, ...override };
      records.set(result.id, result);
      return result;
    }
    function actions(rec) {
      const vote = feedback[rec.id]?.vote;
      return `<div class="coach-actions"><button class="primary-button" data-action="coach-why" data-item="${esc(rec.id)}">Why ${icon('play')}</button><div class="coach-votes" role="group" aria-label="Was this recommendation helpful?"><button data-action="coach-vote" data-item="${esc(rec.id)}" data-value="helpful" aria-pressed="${vote === 'helpful'}" title="Helpful">${icon('check')}<span>Helpful</span></button><button data-action="coach-vote" data-item="${esc(rec.id)}" data-value="not-helpful" aria-pressed="${vote === 'not-helpful'}" title="Not helpful">${icon('close')}<span>Not helpful</span></button></div></div>${vote ? `<button class="coach-feedback-note" data-action="coach-feedback" data-item="${esc(rec.id)}">${feedback[rec.id]?.note || feedback[rec.id]?.reason ? 'Edit feedback' : 'Add a reason or note'} <span>Saved on this device</span></button>` : ''}`;
    }
    function recommendation(rec) {
      return `<article class="coach-recommendation"><p class="coach-kicker">${esc(rec.badge)}</p><h3>${esc(rec.title)}</h3><p class="coach-copy">${esc(rec.note)}</p>${actions(rec)}</article>`;
    }
    function rating() {
      return `<div class="coach-rating"><div><span class="coach-kicker">Sample rating</span><strong>1,240</strong><small>4 of 8 fictional peers</small></div><div class="rating-track" aria-label="Your sample rating is fourth among eight fictional peers">${[1410, 1360, 1290, 1240, 1200, 1175, 1110, 1080].map((value, n) => `<i class="${n === 3 ? 'you' : ''}" style="--height:${Math.round(30 + (value - 1080) / 330 * 49)}px">${n === 3 ? '<span>You</span>' : ''}</i>`).join('')}</div></div><details class="coach-peer-list"><summary>See sample peers</summary><ol>${[['Nora', 1410], ['Sam', 1360], ['Inez', 1290], ['You', 1240], ['Alex', 1200], ['Lee', 1175], ['Robin', 1110], ['Kit', 1080]].map(([name, score]) => `<li class="${name === 'You' ? 'current' : ''}"><span>${name}</span><b>${score.toLocaleString()}</b></li>`).join('')}</ol></details><p class="coach-data-note">Illustrative values, not a real population or measured skill. Replay illustrates the practice note; it does not establish this rating.</p>`;
    }
    function reviewSummary() {
      return `<div class="coach-review-summary"><span><b>2</b> rounds to replay</span><span><b>1</b> practice focus</span><span class="tag">Demo data</span></div>`;
    }
    function reviewItems() {
      const currentGame = game();
      const strength = item('review', { id: `review-${currentGame}-strength`, badge: 'Strength · sample play', title: 'Followed the led suit.', note: currentGame === 'hearts' ? 'In the first example, your 6 of clubs followed the club lead. The reply respected the suit constraint.' : 'In the first example, your 3 of diamonds followed the diamond lead. The reply respected the suit constraint.', startIndex: 0 });
      const practiceNotes = {
        spades: ['Spot when you are void.', 'The second example has no clubs in your hand. Any held card is legal; legality alone does not make one the best choice.'],
        hearts: ['Separate tricks from penalties.', 'The second example is an all-club trick. Taking it adds no hearts or queen of spades. Check its contents, not just the winner.'],
        trix: ['Read the current request.', 'The examples switch from Diamonds to Queens. Check which cards carry penalties before reviewing the collector.']
      };
      const [title, note] = practiceNotes[currentGame];
      const practice = item('review', { id: `review-${currentGame}-practice`, badge: 'Next practice · sample play', title, note, startIndex: 4 });
      return [strength, practice];
    }
    function persistAccess() {
      try { localStorage.setItem(accessKey, JSON.stringify(access)); } catch { message = 'Allowance kept for this visit only.'; }
    }
    function ensureDay() {
      if (access.day === localDay()) return false;
      closeReplay(false); access.day = localDay(); access.used = 0; access.session = null;
      activeItem = null; panelView = 'welcome'; message = ''; persistAccess(); return true;
    }
    function scheduleDay() {
      clearTimeout(dayTimer);
      const now = new Date(), next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      dayTimer = setTimeout(() => { ensureDay(); renderPanel(true); scheduleDay(); }, Math.max(1000, next.getTime() - now.getTime() + 50));
    }
    const remaining = () => Math.max(0, 2 - access.used);
    const entitled = () => Boolean(access.session);
    const visible = () => access.enabled && currentPage === 'play' && !isPortrait();
    function updateDecision(info = {}) {
      const currentGame = info.game || game(), rawPhase = info.phase || s().phase;
      const phase = ['paused', 'reconnect', 'readonly'].includes(rawPhase) ? s().beforePause || 'play' : rawPhase;
      const token = info.decisionId !== undefined ? String(info.decisionId) : attention.game === currentGame && attention.phase === phase ? attention.token : '';
      const key = `${currentGame}:${phase}:${token}:${decisionEpoch}`;
      if (attention.key !== key) attention = { key, game: currentGame, phase, token, acknowledged: false };
      if (access.enabled) attention.acknowledged = true;
      return rawPhase;
    }
    function acknowledgeDecision() { updateDecision(); attention.acknowledged = true; }
    function visibility(info) {
      const shown = visible();
      const rawPhase = updateDecision(info);
      if ($('#coach-panel')) { $('#coach-panel').hidden = !shown; $('#coach-panel').setAttribute('lang', 'en'); }
      const launcher = $('#coach-launcher'), launcherShown = currentPage === 'play' && !isPortrait();
      const decisionLabel = attention.game === 'trix' && rawPhase === 'double' ? 'Trix doubling' : attention.game === 'spades' && rawPhase === 'bid' ? 'Spades bidding' : attention.game === 'hearts' && rawPhase === 'pass' ? 'Hearts passing' : '';
      const needsAttention = launcherShown && !access.enabled && !attention.acknowledged && Boolean(decisionLabel) && (access.unlocked || remaining() > 0);
      if (launcher) {
        launcher.hidden = !launcherShown;
        launcher.dataset.state = needsAttention ? 'attention' : 'waiting';
        launcher.setAttribute('aria-expanded', String(shown)); launcher.setAttribute('aria-controls', 'coach-panel');
        const label = shown ? 'Hide coach' : needsAttention ? `Open coach for ${decisionLabel}` : 'Open coach';
        launcher.setAttribute('aria-label', label); launcher.title = label;
      }
      const image = $('#coach-launcher-image');
      if (image) {
        image.src = `coach-stickers/assets/regular-${needsAttention ? 'whistle-v3' : 'waiting-v2'}.png`;
        image.alt = needsAttention ? 'Coach with a whistle' : 'Coach waiting';
      }
      const status = $('#coach-launcher-status'), statusText = needsAttention ? `Coach is available for ${decisionLabel}. Open Coach when you want help.` : '';
      if (status && status.textContent !== statusText) status.textContent = statusText;
      document.body.classList.toggle('coach-enabled', shown);
      document.body.classList.toggle('coach-pinned', shown && access.pinned && canPin());
      const toggle = $('#hud [data-action="coach"]');
      if (toggle) { toggle.setAttribute('aria-pressed', String(access.enabled)); toggle.setAttribute('aria-label', access.enabled ? 'Hide coach' : 'Show coach'); toggle.title = access.enabled ? 'Hide coach' : 'Show coach'; }
    }
    function header() {
      const root = $('#coach-panel-header'); if (!root) return;
      const focused = root.contains?.(document.activeElement) ? document.activeElement?.dataset?.action : null;
      const pinAvailable = canPin(), pinLabel = !pinAvailable ? 'More table width is needed to pin Coach' : access.pinned ? 'Unpin coach to overlay the table' : 'Pin coach beside the table';
      root.innerHTML = `<div class="coach-panel-heading"><strong>Coach</strong><small class="coach-allowance">${access.unlocked ? 'Unlocked · demo' : `${remaining()} free today`}</small></div><div class="coach-panel-tools"><button class="icon-button coach-pin" data-action="coach-pin" aria-pressed="${access.pinned && pinAvailable}" aria-label="${pinLabel}" title="${pinLabel}" ${pinAvailable ? '' : 'disabled'}>${icon('pin')}</button>${iconButton('coach-close', 'close', 'Close coach')}</div>`;
      if (focused) root.querySelector(`[data-action="${focused}"]`)?.focus({ preventScroll: true });
    }
    function focusPanel() { if (visible()) { $('#coach-panel-body')?.focus({ preventScroll: true }); pendingFocus = false; } else pendingFocus = true; }
    function nav() {
      return `<div class="coach-panel-nav"><button class="quiet-button" data-action="coach-options">New session</button><button class="quiet-button" data-action="coach-feedback-list">Feedback</button></div>`;
    }
    function welcome() {
      if (!access.unlocked && !remaining()) return locked();
      const left = remaining();
      return `<div class="coach-session-start"><h3>A second look?</h3><p class="coach-copy">Choose a coaching moment.</p><div class="coach-topic-list">${[['cue', 'Get a cue'], ['selection', 'Check my selection'], ['review', 'Review the play'], ['rating', 'Sample player rating']].map(([topic, title]) => `<button class="setting-choice" data-action="coach-request" data-value="${topic}">${title}${icon('arrow')}</button>`).join('')}</div>${access.session ? '<button class="quiet-button" data-action="coach-current">Return to current session</button>' : ''}<button class="quiet-button" data-action="coaching">All coach previews ${icon('arrow')}</button></div>`;
    }
    function locked() {
      return `<div class="coach-lock"><h3>That’s two for today.</h3><p class="coach-copy">Back tomorrow, or unlock coaching.</p>${access.session ? '<button class="secondary-button wide" data-action="coach-current">Return to current session</button>' : ''}<button class="primary-button wide" data-action="coach-unlock">Demo Unlock</button><p class="coach-data-note">No purchase. Local preview only.</p><button class="quiet-button" data-action="coaching">Demo controls</button></div>`;
    }
    function sessionMarkup() {
      if (!access.session) return welcome();
      const topic = access.session.topic;
      return `${topic === 'rating' ? rating() : topic === 'review' ? reviewSummary() : ''}<div class="coach-session-items">${access.session.items.map(recommendation).join('')}</div>${nav()}`;
    }
    function feedbackMarkup() {
      if (!selectedItem) return sessionMarkup();
      const saved = feedbackDraft || {};
      return `<button class="quiet-button" data-action="coach-back">${icon('back')} Back</button><p class="coach-kicker">Your feedback</p><h3 class="feedback-context">${esc(selectedItem.title)}</h3><form id="coach-feedback-form"><div class="segments" role="group" aria-label="Recommendation feedback">${[['helpful', 'Helpful'], ['not-helpful', 'Not helpful']].map(([value, label]) => `<button type="button" data-action="coach-feedback-vote" data-value="${value}" aria-pressed="${saved.vote === value}" class="${saved.vote === value ? 'selected' : ''}">${label}</button>`).join('')}</div><label class="field">Reason <span class="optional">optional</span><select name="reason"><option value="">Choose a reason</option>${['Clear explanation', 'Useful timing', 'Already knew this', 'Did not match my selection', 'Too much detail', 'Needs more detail'].map(reason => `<option ${saved.reason === reason ? 'selected' : ''}>${reason}</option>`).join('')}</select></label><label class="field">Note <span class="optional">optional</span><textarea name="note" maxlength="500" rows="3" placeholder="What would help?">${esc(saved.note || '')}</textarea></label><button class="primary-button wide" type="submit">Save feedback</button><p class="coach-data-note">Saved on this device. Nothing sent.</p></form>`;
    }
    function feedbackListMarkup() {
      const entries = Object.entries(feedback);
      return `<button class="quiet-button" data-action="coach-back">${icon('back')} Back</button><h3>Your feedback.</h3><p class="coach-data-note">Private to this browser.</p>${entries.length ? `<div class="coach-feedback-list">${entries.map(([id, value]) => `<article><p class="coach-kicker">${esc(labels[value.topic] || 'Coach')}</p><h3>${esc(value.title || 'Recommendation')}</h3><p>${value.vote === 'helpful' ? 'Helpful' : 'Not helpful'}${value.reason ? ` · ${esc(value.reason)}` : ''}</p>${value.note ? `<blockquote>${esc(value.note)}</blockquote>` : ''}<button class="quiet-button" data-action="coach-feedback-remove" data-item="${esc(id)}">Remove</button></article>`).join('')}</div>` : '<p class="coach-copy">No feedback yet.</p>'}`;
    }
    function historyMarkup() {
      return `<button class="quiet-button" data-action="coach-back">${icon('back')} Playback</button><h3>Round history.</h3><p class="coach-data-note">Saved demo example.</p><div class="coach-round-history">${replay.frames.map(frame => `<button data-action="coach-replay-jump" data-value="${frame.index}" class="${frame.index === replay.index ? 'current' : ''}"><span class="history-tick">${frame.index + 1}</span><span><small>Round ${esc(frame.round)} · ${frame.moment ? esc(frame.moment) : `Trick ${esc(frame.trick)}`}</small><strong>${esc(frame.title)}</strong><p>${esc(frame.caption || '')}</p></span></button>`).join('')}</div>`;
    }
    function renderPanel(force = false) {
      ensureDay(); visibility();
      const body = $('#coach-panel-body'); if (!body || !visible()) return;
      header();
      if (pendingFocus) focusPanel();
      if (panelView === 'replay') { updatePlayback(); return; }
      if (!force && body.dataset.view === panelView) return;
      body.dataset.view = panelView;
      body.innerHTML = `${message ? `<p class="coach-panel-message" role="status">${esc(message)}</p>` : ''}${panelView === 'locked' ? locked() : panelView === 'feedback' ? feedbackMarkup() : panelView === 'feedback-list' ? feedbackListMarkup() : panelView === 'history' ? historyMarkup() : panelView === 'session' ? sessionMarkup() : welcome()}`;
    }
    function showPanel() {
      ensureDay(); acknowledgeDecision(); access.enabled = true; persistAccess(); api.closeDialog();
      if (selection && ['pass', 'double'].includes(s().phase) && access.session?.items.some(rec => rec.topic === 'selection' && rec.archived)) updateSession(item('selection'));
      if (currentPage !== 'play') api.go('play');
      renderPanel(true);
    }
    function toggle() {
      ensureDay();
      if (access.enabled && currentPage === 'play') closePanel();
      else { showPanel(); focusPanel(); }
      api.hud(); visibility();
    }
    function closePanel() {
      acknowledgeDecision(); closeReplay(false); access.enabled = false;
      panelView = access.session ? 'session' : 'welcome'; pendingFocus = false; persistAccess(); visibility();
      const target = !$('#coach-launcher')?.hidden ? $('#coach-launcher') : $('#hud [data-action="menu"]');
      target?.focus({ preventScroll: true }); api.hud(); visibility();
    }
    function requestSession(topic) {
      if (!topics.includes(topic)) return false;
      ensureDay(); showPanel(); closeReplay(false); selection = selection && ['pass', 'double'].includes(s().phase) ? selection : null;
      // Showing the panel is free. A denied request leaves its prior session readable.
      message = '';
      if (!access.unlocked && remaining() === 0) { panelView = 'locked'; persistAccess(); renderPanel(true); focusPanel(); return false; }
      access.session = null; activeItem = null;
      if (!access.unlocked) access.used += 1;
      const items = topic === 'review' ? reviewItems() : [item(topic)];
      access.session = { id: `${Date.now()}-${access.used}`, day: access.day, topic, items };
      activeItem = items[0]; panelView = 'session'; persistAccess(); renderPanel(true); focusPanel(); return true;
    }
    function updateSession(rec) {
      if (!entitled()) return;
      access.session.items = [rec]; access.session.topic = rec.topic; activeItem = rec; persistAccess();
      if (panelView === 'session') renderPanel(true);
    }
    function archiveCurrent(topic, context) {
      if (!entitled()) return;
      let changed = false;
      access.session.items = access.session.items.map(rec => {
        if (rec.topic !== topic || rec.archived || rec.badge.startsWith('Saved') || rec.badge.startsWith('Confirmed')) return rec;
        const saved = { ...rec, archived: true, badge: `Saved ${topic === 'selection' ? 'selection' : 'cue'} · demo`, note: `${context} ${rec.note}` };
        records.set(saved.id, saved); if (activeItem?.id === saved.id) activeItem = saved;
        changed = true; return saved;
      });
      if (changed) { persistAccess(); if (panelView === 'session') renderPanel(true); }
    }
    function automaticAllowed(stage) {
      if (!visible() || !entitled() || replay.active || $('#dialog')?.open || !['session', 'welcome'].includes(panelView)) return false;
      if (s().coachMode === 'after') return stage === 'complete';
      if (s().coachMode === 'nudges') return true;
      return stage === 'selection' && ['cue', 'selection'].includes(access.session.topic);
    }
    function persistFeedback() {
      try { localStorage.setItem(feedbackKey, JSON.stringify(feedback)); message = 'Feedback saved here.'; } catch { message = 'Feedback kept for this visit.'; }
    }
    function openFeedback(rec) {
      if (!access.enabled || !entitled()) return;
      pause(); selectedItem = rec; feedbackDraft = { ...(feedback[rec.id] || {}) }; returnView = replay.active ? 'replay' : 'session'; panelView = 'feedback'; renderPanel(true); focusPanel();
    }
    function pause() { clearTimeout(timer); replay.playing = false; if (panelView === 'replay') updatePlayback(); }
    function tick() {
      clearTimeout(timer);
      if (!replay.active || !replay.playing || !replay.ready || !visible() || document.hidden || $('#dialog')?.open || panelView !== 'replay') { pause(); return; }
      if (replay.index >= replay.total - 1) { pause(); return; }
      timer = setTimeout(() => {
        ensureDay();
        if (!visible() || document.hidden || $('#dialog')?.open || !replay.active || panelView !== 'replay') { pause(); return; }
        post({ type: 'cardford-coach-replay', action: 'seek', index: replay.index + 1 });
      }, 2200 / s().speed);
    }
    function seek(index) {
      if (!replay.active || !replay.ready || !visible()) return;
      pause(); post({ type: 'cardford-coach-replay', action: 'seek', index: Math.max(0, Math.min(replay.total - 1, Number(index))) });
    }
    function startReplay(rec) {
      if (!access.enabled || !entitled() || !access.session.items.some(saved => saved.id === rec.id)) return;
      pause(); api.closeDialog(); activeItem = rec; panelView = 'replay';
      replay = { active: true, ready: false, playing: false, index: 0, total: 0, frames: [], topic: rec.topic, game: rec.game, seekOnReady: rec.startIndex || 0 };
      renderPanel(true);
      focusPanel();
      post({ type: 'cardford-coach-replay', action: 'open', topic: rec.topic, game: rec.game, variant: rec.game === 'hearts' ? 'solo' : (rec.game === api.mode().game ? api.mode().variant : 'partners') });
    }
    function closeReplay(draw = true) {
      clearTimeout(timer); replay.playing = false;
      if (replay.active) post({ type: 'cardford-coach-replay', action: 'close' });
      replay.active = false; replay.ready = false;
      if (['replay', 'history', 'feedback'].includes(panelView)) panelView = access.session ? 'session' : 'welcome';
      if (draw) renderPanel(true);
    }
    function updatePlayback() {
      const root = $('#coach-panel-body'); if (!root || !replay.active || panelView !== 'replay') return;
      if (root.dataset.view !== 'replay') {
        root.innerHTML = `<div class="coach-replay-panel"><p class="coach-kicker">Guided playback · demo</p><p class="replay-panel-position"></p><div class="playback-caption" aria-live="polite"><strong></strong><p></p></div><div class="playback-buttons">${iconButton('coach-replay-back', 'back', 'Previous replay moment')}${iconButton('coach-replay-toggle', 'play', 'Play through the round')}${iconButton('coach-replay-next', 'arrow', 'Next replay moment')}</div><label class="playback-seek"><span><b class="playback-counter"></b><span class="playback-end-label"></span></span><input type="range" min="0" max="0" value="0" step="1" data-coach-seek aria-label="Seek across round history"></label><div class="coach-panel-nav"><button class="quiet-button" data-action="coach-replay-history">History</button><button class="quiet-button" data-action="coach-replay-feedback">Feedback</button></div><button class="secondary-button wide" data-action="coach-replay-exit">Return to live hand</button></div>`;
        root.dataset.view = 'replay';
      }
      root.querySelector('.replay-panel-position').textContent = replay.ready ? `Round ${replay.round} · ${replay.moment || `Trick ${replay.trick}`}` : 'Opening example…';
      root.querySelector('.playback-caption strong').textContent = replay.title || 'A closer look.';
      root.querySelector('.playback-caption p').textContent = replay.caption || 'Your live hand stays where you left it.';
      root.querySelector('.playback-counter').textContent = replay.ready ? `${replay.index + 1} / ${replay.total}` : 'Loading';
      root.querySelector('.playback-end-label').textContent = replay.index === replay.total - 1 && replay.ready ? 'End' : '';
      const range = root.querySelector('[data-coach-seek]'); range.max = String(Math.max(0, replay.total - 1)); range.value = String(replay.index); range.disabled = !replay.ready;
      const playButton = root.querySelector('[data-action="coach-replay-toggle"]'); playButton.innerHTML = icon(replay.playing ? 'pause' : 'play'); playButton.title = replay.playing ? 'Pause playback' : 'Play through the round'; playButton.setAttribute('aria-label', playButton.title); playButton.disabled = !replay.ready || replay.total < 2;
      root.querySelector('[data-action="coach-replay-back"]').disabled = !replay.ready || replay.index === 0;
      root.querySelector('[data-action="coach-replay-next"]').disabled = !replay.ready || replay.index >= replay.total - 1;
    }
    function receive(d) {
      ensureDay();
      if (d.action === 'replay-frame' && replay.active) {
        replay = { ...replay, ...d, active: true, ready: true, frames: Array.isArray(d.frames) ? d.frames : replay.frames };
        if (replay.seekOnReady) { const index = Math.min(replay.total - 1, replay.seekOnReady); replay.seekOnReady = 0; post({ type: 'cardford-coach-replay', action: 'seek', index }); return; }
        if (replay.index >= replay.total - 1) replay.playing = false;
        updatePlayback(); if (replay.playing) tick();
      } else if (d.action === 'replay-closed') { if (replay.active) closeReplay(); }
      else if (d.action === 'coach-preview') {
        selection = null; const next = d.game === 'hearts' ? 'hearts-solo' : 'spades-partners';
        s().mode = next; s().draftMode = next; s().draftGame = d.game; s().phase = d.phase; s().beforePause = d.phase; s().played = 0; s().lastTrick = false; api.hud();
        if (previewPending === 'cue' && entitled()) updateSession(item('cue'));
        if (previewPending === 'selection') selection = { cards: Array.isArray(d.cards) ? d.cards : [], phase: 'pass', game: 'hearts' };
        if (selection && entitled()) updateSession(item('selection'));
        previewPending = null;
      } else if (d.action === 'selected' && ['pass', 'double'].includes(d.phase)) {
        selection = { cards: Array.isArray(d.cards) ? d.cards.filter(card => /^[CDHS](A|K|Q|J|10|[2-9])$/.test(card)) : [], phase: d.phase, game: d.phase === 'pass' ? 'hearts' : 'trix' };
        if (automaticAllowed('selection')) updateSession(item('selection'));
        else archiveCurrent('selection', 'This was the earlier selection, before it changed.');
      } else if (d.action === 'played') {
        selection = null;
        archiveCurrent('cue', `Before ${cardName(d.card)} was played:`);
        archiveCurrent('selection', 'This was a previous selection, before play continued.');
        if (automaticAllowed('play') && /^[CDHS](A|K|Q|J|10|[2-9])$/.test(d.card || '')) updateSession(item('cue', { id: `played-${game()}-${++playSequence}-${d.card}`, badge: 'Played · demo hand', title: `${cardName(d.card)} played.`, note: 'Confirmed. Replay the saved follow-suit lesson for a second look; it does not grade this move.' }));
      } else if (d.action === 'confirmed') {
        const pending = selection;
        selection = null;
        archiveCurrent('cue', 'This cue was shown before confirmation.');
        // Confirmed facts retire an existing selection note even when Coach is off.
        // This is not a new suggestion or a new allowance use.
        if (entitled() && access.session.items.some(rec => rec.topic === 'selection') && ['pass', 'double'].includes(d.phase)) {
          const cards = (Array.isArray(d.cards) ? d.cards : pending?.cards || []).filter(card => /^[CDHS](A|K|Q|J|10|[2-9])$/.test(card));
          const declined = d.phase === 'double' && d.choice === 'decline';
          updateSession(item('selection', { id: `confirmed-${game()}-${++playSequence}`, game: d.phase === 'pass' ? 'hearts' : 'trix', badge: 'Confirmed · demo', title: d.phase === 'pass' ? 'Your pass is confirmed.' : declined ? 'You passed on doubling.' : 'Doubling is confirmed.', note: declined ? 'No cards were doubled. The earlier selection is no longer pending.' : `${cards.length ? cards.map(cardName).join(', ') + '. ' : ''}${d.phase === 'pass' ? 'These cards were passed.' : 'The selected cards were doubled.'} The selection is no longer pending.` }));
        }
      } else if (['hand-complete', 'game-complete'].includes(d.action) && automaticAllowed('complete')) {
        access.session.topic = 'review'; access.session.items = reviewItems(); activeItem = access.session.items[0]; persistAccess(); renderPanel(true);
      }
      if (d.action === 'confirmed') visibility({ game: d.game || game(), phase: d.nextPhase || 'play', decisionId: d.decisionId });
      else if (d.action === 'resume') visibility({ game: d.game || game(), phase: d.phase || s().beforePause || 'play', decisionId: d.decisionId });
      else if (d.action === 'selected') visibility({ game: d.game || (d.phase === 'pass' ? 'hearts' : d.phase === 'double' ? 'trix' : game()), phase: d.phase || s().phase, decisionId: d.decisionId });
      else visibility();
    }
    function gallery() {
      ensureDay();
      return `<div class="coach-gallery"><div class="page-title"><h1>A little perspective.</h1><span class="tag">Coach / Demo</span></div><p class="coach-gallery-intro">One floating coach. Your pace.</p><div class="coach-gallery-list">${[['cue', 'Before your move', 'A short cue before you choose.', 'coach'], ['selection', 'After selection', 'A comment on your selected cards.', 'check'], ['review', 'The whole play', 'Two moments to revisit.', 'history'], ['rating', 'Your practice picture', 'Fictional peers. Clearly demo data.', 'scores']].map(([topic, title, note, symbol], i) => `<article class="coach-gallery-row"><span class="coach-row-number">0${i + 1}</span><div class="coach-row-mark">${icon(symbol)}</div><div class="coach-row-copy"><h2>${title}</h2><p>${note}</p></div><button class="secondary-button" data-action="coach-request" data-value="${topic}">Preview ${icon('arrow')}</button></article>`).join('')}</div><p class="coach-data-note">Each preview requests one session. Why and feedback are included.</p><div class="coach-preview-workbench"><div><span class="coach-kicker">Try it at the table</span><p>Loads a new demo hand and requests a session.</p></div><button class="quiet-button" data-action="coach-preview" data-value="cue">Before a move ${icon('arrow')}</button><button class="quiet-button" data-action="coach-preview" data-value="selection">Three selected cards ${icon('arrow')}</button></div><div class="coach-preview-workbench"><div><span class="coach-kicker">Demo allowance controls</span><p>Resets local demo allowance only.</p></div><button class="quiet-button" data-action="coach-demo-access" data-value="free">2 free</button><button class="quiet-button" data-action="coach-demo-access" data-value="exhausted">Free exhausted</button><button class="quiet-button" data-action="coach-demo-access" data-value="unlocked">Unlocked</button></div><div class="coach-gallery-foot"><button class="quiet-button" data-action="play">${icon('back')} Back to table</button><button class="quiet-button" data-action="coach-feedback-list">Your feedback <span class="coach-count">${Object.keys(feedback).length}</span></button><span>No real ratings. No feedback sent.</span></div></div>`;
    }
    document.addEventListener('click', event => {
      const button = event.target.closest('[data-action]'); if (!button || button.disabled) return;
      const { action, value } = button.dataset, rec = records.get(button.dataset.item) || activeItem;
      if (!action.startsWith('coach-')) return;
      ensureDay();
      if (action === 'coach-toggle') toggle();
      else if (action === 'coach-close') closePanel();
      else if (action === 'coach-pin' && visible() && canPin()) {
        access.pinned = !access.pinned; persistAccess(); visibility(); header();
        $('#coach-panel-header [data-action="coach-pin"]')?.focus({ preventScroll: true });
      }
      else if (action === 'coach-request' || action === 'coach-topic') requestSession(value);
      else if (action === 'coach-options') { pause(); panelView = 'welcome'; message = ''; renderPanel(true); focusPanel(); }
      else if (action === 'coach-current') { panelView = replay.active ? 'replay' : access.session ? 'session' : 'welcome'; renderPanel(true); focusPanel(); }
      else if (action === 'coach-why' && rec) startReplay(rec);
      else if (action === 'coach-vote' && rec && access.enabled && entitled()) {
        feedback[rec.id] = { ...feedback[rec.id], vote: value, title: rec.title, topic: rec.topic, game: rec.game, updatedAt: new Date().toISOString() }; persistFeedback(); renderPanel(true); focusPanel();
      } else if (action === 'coach-feedback' && rec) openFeedback(rec);
      else if (action === 'coach-feedback-vote' && selectedItem) {
        feedbackDraft = { ...feedbackDraft, vote: value, note: $('#coach-feedback-form [name="note"]').value, reason: $('#coach-feedback-form [name="reason"]').value }; renderPanel(true); $(`#coach-panel-body [data-action="coach-feedback-vote"][data-value="${value}"]`)?.focus({ preventScroll: true });
      } else if (action === 'coach-feedback-list') { pause(); returnView = replay.active ? 'replay' : access.session ? 'session' : 'welcome'; panelView = 'feedback-list'; showPanel(); focusPanel(); }
      else if (action === 'coach-feedback-remove') { delete feedback[button.dataset.item]; persistFeedback(); renderPanel(true); }
      else if (action === 'coach-back') { panelView = returnView === 'replay' && replay.active ? 'replay' : access.session ? 'session' : 'welcome'; message = ''; renderPanel(true); focusPanel(); }
      else if (action === 'coach-preview') {
        if (requestSession(value)) { previewPending = value; selection = null; post({ type: 'cardford-coach-preview', stage: value }); }
      } else if (action === 'coach-unlock') { access.unlocked = true; panelView = 'welcome'; message = 'Demo unlocked. No payment.'; persistAccess(); renderPanel(true); focusPanel(); }
      else if (action === 'coach-demo-access' && ['free', 'exhausted', 'unlocked'].includes(value)) {
        closeReplay(false); access = { day: localDay(), used: value === 'exhausted' ? 2 : 0, unlocked: value === 'unlocked', enabled: true, pinned: access.pinned, session: null }; activeItem = null; panelView = value === 'exhausted' ? 'locked' : 'welcome'; message = ''; persistAccess(); showPanel(); focusPanel();
      } else if (action === 'coach-replay-exit') { closeReplay(); focusPanel(); }
      else if (action === 'coach-replay-back') seek(replay.index - 1);
      else if (action === 'coach-replay-next') seek(replay.index + 1);
      else if (action === 'coach-replay-toggle') {
        if (replay.playing) pause(); else if (visible()) { replay.playing = true; updatePlayback(); if (replay.index >= replay.total - 1) post({ type: 'cardford-coach-replay', action: 'seek', index: 0 }); else tick(); }
      } else if (action === 'coach-replay-history') { pause(); returnView = 'replay'; panelView = 'history'; renderPanel(true); focusPanel(); }
      else if (action === 'coach-replay-feedback' && activeItem) openFeedback(activeItem);
      else if (action === 'coach-replay-jump') { panelView = 'replay'; renderPanel(true); seek(Number(value)); focusPanel(); }
    });
    document.addEventListener('input', event => { if (event.target.matches('[data-coach-seek]')) seek(Number(event.target.value)); });
    document.addEventListener('submit', event => {
      if (event.target.id !== 'coach-feedback-form' || !selectedItem) return;
      event.preventDefault(); ensureDay(); if (!entitled() || !access.enabled) return;
      const form = new FormData(event.target), before = feedbackDraft || {};
      if (!before.vote) { message = 'Choose Helpful or Not helpful.'; renderPanel(true); return; }
      feedback[selectedItem.id] = { ...before, title: selectedItem.title, topic: selectedItem.topic, game: selectedItem.game, reason: String(form.get('reason') || ''), note: String(form.get('note') || '').trim().slice(0, 500), updatedAt: new Date().toISOString() };
      persistFeedback(); panelView = returnView === 'replay' && replay.active ? 'replay' : 'session'; renderPanel(true); focusPanel();
    });
    document.addEventListener('visibilitychange', () => { ensureDay(); if (document.hidden) pause(); else renderPanel(); });
    document.addEventListener('keydown', event => { if (event.key === 'Escape' && replay.active && !$('#dialog')?.open) closeReplay(); });
    ensureDay(); scheduleDay();
    return {
      gallery, receive, toggle, request: requestSession,
      isReplaying: () => replay.active,
      isEnabled: () => access.enabled,
      display: () => !visible() ? 'closed' : access.pinned && canPin() ? 'pinned' : 'overlay',
      reviewDisplay: value => {
        if (!['closed', 'overlay', 'pinned'].includes(value)) return;
        if (value === 'closed') { closeReplay(false); access.enabled = false; }
        else { access.enabled = true; access.pinned = value === 'pinned'; }
        acknowledgeDecision(); persistAccess(); renderPanel(true);
      },
      onOrientation: blocked => { ensureDay(); if (blocked) pause(); renderPanel(); },
      onDialog: () => pause(),
      onRoute: route => { currentPage = route; if (route !== 'play') closeReplay(false); renderPanel(); },
      onPreference: () => { pause(); renderPanel(true); },
      reset: () => { closeReplay(false); decisionEpoch += 1; selection = null; access.session = null; activeItem = null; panelView = 'welcome'; persistAccess(); renderPanel(true); },
      exportFeedback: () => feedback,
      exportAccess: () => ({ demo: true, day: access.day, used: access.used, remaining: remaining(), unlocked: access.unlocked, enabled: access.enabled, pinned: access.pinned })
    };
  };
})();
