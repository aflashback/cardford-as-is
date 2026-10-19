import { mkdir, writeFile } from 'node:fs/promises';

// Called only through cua_repl's current built-in-browser CDP capability.
// Observes rendered public cards and their visibility; never reads application
// internals, hidden cards, credentials or network payloads.
function install(label) {
  window.__rallyTrickTrace?.stop();
  const rows = [];
  let frame, previous = '', frames = 0;
  const started = performance.now();
  const visible = el => {
    const box = el.getBoundingClientRect(), style = getComputedStyle(el);
    return box.width > 0 && box.height > 0 && style.visibility === 'visible' && Number(style.opacity) > 0;
  };
  const sample = () => {
    frames++;
    const targets = [...document.querySelectorAll('.play-space [data-played-card]')];
    const cards = targets.map(el => ({card: el.dataset.playedCard, seat: el.dataset.playSeat,
      visible: visible(el.querySelector('.card-face'))}));
    const pocket = [...document.querySelectorAll('.rally-last .last-trick-card')].map(el => el.getAttribute('aria-label'));
    const value = {cards, pocket, flights: document.querySelectorAll('.card-throw').length,
      hidden: document.hidden, dialog: !!document.querySelector('[role="dialog"]')};
    const signature = JSON.stringify(value);
    if (signature !== previous) {
      rows.push({ms: Math.round((performance.now() - started) * 10) / 10, ...value});
      previous = signature;
    }
    if (performance.now() - started < 180000) frame = requestAnimationFrame(sample);
  };
  const result = () => ({label, frames, elapsedMs: performance.now() - started,
    viewport: {width: innerWidth, height: innerHeight}, rows});
  window.__rallyTrickTrace = {read: result, stop: () => { cancelAnimationFrame(frame); return result(); }};
  sample();
  return {installed: label};
}

export async function startTrace(cdp, label) {
  return cdp.send('Runtime.evaluate', {expression: `(${install.toString()})(${JSON.stringify(label)})`, returnByValue: true});
}

export async function saveTrace(cdp, directory, name) {
  const result = await cdp.send('Runtime.evaluate', {
    expression: 'JSON.stringify(window.__rallyTrickTrace.stop())', returnByValue: true,
  });
  const trace = JSON.parse(result.result.value);
  await mkdir(directory, {recursive: true});
  await writeFile(`${directory}/${name}.json`, JSON.stringify(trace, null, 2));
  return trace;
}

export async function cleanupTrace(cdp) {
  return cdp.send('Runtime.evaluate', {expression: 'window.__rallyTrickTrace?.stop(); delete window.__rallyTrickTrace', returnByValue: true});
}

export async function inspectTable(tab) {
  return tab.playwright.evaluate(() => ({
    cards: [...document.querySelectorAll('.play-space [data-played-card]')].map(el => ({card:el.getAttribute('data-played-card'),
      visible:getComputedStyle(el.querySelector('.card-face')).visibility === 'visible'})),
    flights: document.querySelectorAll('.card-throw').length,
    yourTurn: !!document.querySelector('.player-0.player-active'),
    status: document.querySelector('.hand-section [role="status"]')?.textContent,
    enabled: [...document.querySelectorAll('.hand-section [data-hand-card]:not(:disabled)')].map(el => ({card:el.getAttribute('data-hand-card'), label:el.getAttribute('aria-label')})),
    dialog: !!document.querySelector('[role="dialog"]'),
  }));
}

export function completedIntervals(trace) {
  const intervals = [];
  let start, previous;
  for (const row of trace.rows) {
    if (start && previous && !previous.dialog && !previous.hidden) start.activeVisibleMs += row.ms - previous.ms;
    const key = row.cards.map(card => card.card).join(',');
    const settled = row.cards.length === 4 && row.cards.every(card => card.visible) && row.flights === 0;
    if (start && (!settled || start.key !== key)) {
      intervals.push({cards: start.key, settledAtMs: start.ms, collectedAtMs: row.ms,
        visibleMs: Math.round((row.ms - start.ms) * 10) / 10,
        activeVisibleMs: Math.round(start.activeVisibleMs * 10) / 10,
        pocketChangedDuringHold: start.pocketChangedDuringHold,
        pocketAdvancedAtCollection: JSON.stringify(start.pocket) !== JSON.stringify(row.pocket),
        interrupted: start.interrupted});
      start = undefined;
    }
    if (settled && !start) start = {...row, key, interrupted: row.dialog || row.hidden, pocketChangedDuringHold: false, activeVisibleMs: 0};
    if (start && settled && JSON.stringify(row.pocket) !== JSON.stringify(start.pocket)) start.pocketChangedDuringHold = true;
    if (start && (row.dialog || row.hidden)) start.interrupted = true;
    previous = row;
  }
  return intervals;
}
