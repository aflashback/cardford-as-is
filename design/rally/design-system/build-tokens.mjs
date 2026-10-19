// Offline extraction only. Run from any directory with Node; no browser or network.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = file => readFileSync(path.resolve(here, file), 'utf8');
const shellFile = '../approved/style.css';
const boardFile = '../approved/shared/board-theme.css';
const coachFile = '../approved/coaching.css';
const sources = Object.fromEntries([shellFile, boardFile, coachFile].map(file => [file, read(file)]));
function block(file, selector) {
  const start = sources[file].indexOf(`${selector}{`);
  if (start < 0) throw new Error(`Missing selector ${selector}`);
  const end = sources[file].indexOf('}', start);
  const body = sources[file].slice(start + selector.length + 1, end);
  const line = sources[file].slice(0, start).split('\n').length;
  return Object.fromEntries([...body.matchAll(/(--[\w-]+):([^;]+)/g)].map(match => [match[1].slice(2), {
    $type: match[2].startsWith('#') ? 'color' : 'string', $value: match[2],
    source: { file, line, selector, property: match[1] }
  }]));
}
const shellBase = block(shellFile, ':root');
const boardBase = block(boardFile, ':root');
const studioBase = block(boardFile, ':root[data-concept=studio]');
const themes = {};
for (const theme of ['light', 'dark', 'warm']) {
  const shell = { ...shellBase, ...(theme === 'light' ? {} : block(shellFile, `:root[data-theme=${theme}]`)) };
  const board = { ...boardBase, ...studioBase, ...(theme === 'light' ? {} : block(boardFile, `:root[data-concept=studio][data-theme=${theme}]`)) };
  delete shell.hud; delete board['app-height'];
  themes[theme] = { shell, board };
}
const fixed = {};
function token(name, value, file, selector, property, note = '') {
  const text = sources[file];
  const offset = text.indexOf(selector);
  if (offset < 0 || !text.slice(offset, text.indexOf('}', offset) + 1).includes(value)) throw new Error(`Source mismatch: ${name}`);
  fixed[name] = { $type: /px$/.test(value) ? 'dimension' : 'string', $value: value,
    source: { file, line: text.slice(0, offset).split('\n').length, selector, property }, ...(note ? { note } : {}) };
}
token('font-body','Rally,Arial,sans-serif',shellFile,'body{','font-family','Rally aliases the packaged DM Sans variable font.');
token('font-heading','RallyDisplay,Rally,sans-serif',shellFile,'h1,h2,h3,.hud-score b','font-family','RallyDisplay aliases Manrope.');
token('body-size','16px',shellFile,'body{','font-size');
token('body-leading','1.45',shellFile,'body{','line-height');
token('heading-weight','780',shellFile,'h1,h2,h3{','font-weight');
token('heading-leading','1.08',shellFile,'h1,h2,h3{','line-height');
token('heading-tracking','-.045em',shellFile,'h1,h2,h3{','letter-spacing');
token('hud-height','56px',shellFile,':root{','--hud');
token('target','44px',shellFile,'.icon-button{','width');
token('button-height','48px',shellFile,'.primary-button,.secondary-button,.quiet-button{','min-height');
token('button-radius','8px',shellFile,'.primary-button,.secondary-button,.quiet-button{','border-radius');
token('segment-radius','7px',shellFile,'.segments button{','border-radius');
token('tile-radius','12px',shellFile,'.game-tile{','border-radius');
token('dialog-radius','16px',shellFile,'dialog{','border-radius');
token('button-size','14px',shellFile,'.primary-button,.secondary-button,.quiet-button{','font-size');
token('button-weight','750',shellFile,'.primary-button,.secondary-button,.quiet-button{','font-weight');
token('icon-size','22px',shellFile,'svg{','width');
token('icon-stroke','1.8',shellFile,'svg{','stroke-width');
token('focus','3px solid var(--accent)',shellFile,'button:focus-visible,a:focus-visible,input:focus-visible,select:focus-visible{','outline');
token('focus-offset','3px',shellFile,'button:focus-visible,a:focus-visible,input:focus-visible,select:focus-visible{','outline-offset');
token('disabled-opacity','.38',shellFile,'button:disabled{','opacity');
token('coach-width','240px',coachFile,':root','--coach-card-width');
token('coach-edge','12px',coachFile,':root','--coach-edge');
token('coach-sticker','72px',coachFile,':root','--coach-sticker-size');
token('coach-hand-clearance','172px',coachFile,':root','--coach-hand-clearance');
token('felt-radius','130px',boardFile,'[data-concept=studio] .demo-board .table-felt{','border-radius');
token('trix-felt-radius','22px',boardFile,'[data-game=trix][data-concept=studio] .demo-board .table-felt{','border-radius');
token('badge-radius','9px',boardFile,'[data-concept=studio] .demo-board .player-0,','border-radius');
const manifest = {
  name: 'CardFord Rally', version: '1.1.0', date: '2026-10-13', status: 'Approved Rally direction; DESIGN-R09 responsive refinement for review; no production implementation',
  description: 'Extracted source values. Shell and iframe board are separate scopes; aliases are documentation exports, not a production token migration.',
  sources: { shell: shellFile, coach: coachFile, board: boardFile, responsive: '../approved/responsive.css', provenance: '../approved/SOURCE.json' },
  themes, fixed,
  responsive: {
    shellCompact: { query: '(max-height:480px) and (orientation:landscape)', hud: '48px', source: shellFile },
    sideControls: { query: '(max-width:1000px) and (max-height:430px) and (orientation:landscape)', route: 'play', width: '52px', hud: '0px', target: '44px', source: '../approved/responsive.css' },
    coachCompact: { query: '(max-width:900px), (max-height:480px) and (orientation:landscape)', width: '204px', edge: '8px', sticker: '52px', radius: '12px', source: coachFile },
    coachClearance: { measured: 'Board layout event sets table-screen --coach-hand-clearance; the panel bottom recomputes in that scope.', fallback: { default: '172px', compact: '144px', shortLandscape480: '112px', shortLandscape428: '96px' }, source: '../approved/app.js' },
    coachLarge: { query: '(min-width:901px) and (min-height:481px)', width: 'clamp(240px, 22vw, 320px)', heightLimit: 'min(560px, 70dvh)', source: '../approved/responsive.css' },
    coachPin: { minimumTableScreenWidth: '760px', narrowBehavior: 'Overlay; retained pin preference resumes with enough room.', source: '../approved/coaching.js' },
    portrait: { condition: 'innerWidth < 700 && innerHeight > innerWidth', source: '../approved/app.js#orientation' }
  }
};
let css = '/* CardFord Rally v1.1.0 · 2026-10-13. Generated by build-tokens.mjs.\n * Documentation aliases only; do not replace the immutable card styles. */\n';
for (const [theme, scopes] of Object.entries(themes)) {
  css += `${theme === 'light' ? ':root, :root[data-theme="light"]' : `:root[data-theme="${theme}"]`} {\n`;
  for (const [scope, entries] of Object.entries(scopes)) for (const [name, entry] of Object.entries(entries)) {
    const cleanName = scope === 'board' ? name.replace(/^board-/, '') : name;
    css += `  /* ${entry.source.file}:${entry.source.line} ${entry.source.property} */\n  --rally-${scope}-${cleanName}: ${entry.$value};\n`;
  }
  css += '}\n';
}
css += ':root {\n';
for (const [name, entry] of Object.entries(fixed)) css += `  --rally-${name}: ${entry.$value.replace('var(--accent)', 'var(--rally-shell-accent)')};\n`;
css += '}\n';
writeFileSync(path.join(here, 'tokens.json'), JSON.stringify(manifest, null, 2) + '\n');
writeFileSync(path.join(here, 'tokens.css'), css);
writeFileSync(path.join(here, 'tokens.js'), `/* Generated local manifest; works without fetch or network. */\nwindow.RALLY_TOKENS = ${JSON.stringify(manifest)};\n`);
console.log(`Extracted ${Object.keys(fixed).length} fixed tokens and ${Object.values(themes).reduce((n, theme) => n + Object.values(theme).reduce((m, scope) => m + Object.keys(scope).length, 0), 0)} theme tokens from current source.`);
