/* Documentation-only validation. Does not execute or change the game. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { chromium } = require('C:/Users/AliA/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

const root = path.resolve(__dirname, '../..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'PACKAGE-MANIFEST.json'), 'utf8'));
const original = new Set(manifest.files.map(file => file.path));
const normalize = value => value.replace(/\r\n/g, '\n').trim();
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const escape = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    if (['node_modules', 'dist', '.git', 'reference'].includes(entry.name)) return [];
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}
const files = walk(root);
const diagrams = [];
const uncovered = [];
const markdown = files.filter(file => file.endsWith('.md') && !original.has(path.relative(root, file).replace(/\\/g, '/')));
for (const file of markdown) {
  const relative = path.relative(root, file).replace(/\\/g, '/');
  const text = fs.readFileSync(file, 'utf8');
  const blocks = [...text.matchAll(/^```mermaid\s*\r?\n([\s\S]*?)^```\s*$/gm)];
  if (!blocks.length) uncovered.push(relative);
  blocks.forEach((block, index) => diagrams.push({
    file: relative,
    ordinal: index + 1,
    source: normalize(block[1]),
    title: block[1].match(/^\s*accTitle:\s*(.+)$/m)?.[1]?.trim() || `${relative} ${index + 1}`,
  }));
}

async function main() {
  const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1600, height: 1200 }, deviceScaleFactor: 1, offline: true, serviceWorkers: 'block' });
    await context.route('**/*', route => route.abort('blockedbyclient'));
    const page = await context.newPage();
    const csp = "default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'; style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'";
    await page.setContent('<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="' + csp + '"><style>body{margin:0;background:#fff;font-family:Segoe UI,Arial,sans-serif}#stage{padding:24px}svg{max-width:none!important}</style></head><body><div id="stage"></div></body></html>');
    await page.addScriptTag({ content: fs.readFileSync(path.join(__dirname, 'mermaid-11.12.1.min.js'), 'utf8') });
    await page.evaluate(() => mermaid.initialize({ startOnLoad: false, securityLevel: 'strict' }));
    const results = [];
    const cards = [];
    for (let i = 0; i < diagrams.length; i++) {
      const diagram = diagrams[i];
      const result = { file: diagram.file, ordinal: diagram.ordinal, title: diagram.title, sourceSha256: sha(diagram.source) };
      try {
        const rendered = await page.evaluate(async ({ source, id }) => {
          await mermaid.parse(source);
          const output = await mermaid.render(id, source);
          const stage = document.getElementById('stage');
          stage.innerHTML = output.svg;
          const svg = stage.querySelector('svg');
          const box = svg.viewBox.baseVal;
          const nodes = [...svg.querySelectorAll('g.node')];
          const missingText = nodes.filter(node => !node.textContent.trim()).length;
          return { svg: output.svg, width: box.width, height: box.height, nodes: nodes.length, missingText,
            accessible: Boolean(svg.querySelector('title') && svg.querySelector('desc')) };
        }, { source: diagram.source, id: `diagram_${i}` });
        Object.assign(result, { status: 'rendered', width: rendered.width, height: rendered.height, nodes: rendered.nodes, accessible: rendered.accessible, missingText: rendered.missingText });
        cards.push(`<article id="diagram-${i}"><header><h2>${escape(diagram.title)}</h2><p>${escape(diagram.file)} · diagram ${diagram.ordinal}</p></header><figure>${rendered.svg}</figure><details><summary>Mermaid source</summary><pre>${escape(diagram.source)}</pre></details></article>`);
      } catch (error) {
        result.status = 'error';
        result.error = String(error.message || error);
      }
      results.push(result);
    }
    const standalone = files.filter(file => file.endsWith('.mmd')).map(file => {
      const source = normalize(fs.readFileSync(file, 'utf8'));
      return { file: path.relative(root, file).replace(/\\/g, '/'), matchesEmbedded: diagrams.some(item => item.source === source) };
    });
    const manifestFailures = manifest.files.filter(file => sha(fs.readFileSync(path.join(root, file.path))) !== file.sha256).map(file => file.path);
    const report = {
      createdAt: new Date().toISOString(), renderer: 'Locally vendored Mermaid 11.12.1 in headless Edge',
      rendererSource: 'https://cdn.jsdelivr.net/npm/mermaid@11.12.1/dist/mermaid.min.js',
      rendererLicense: 'mermaid-LICENSE.txt',
      networkPolicy: 'Offline browser context; all routes aborted; connect-src none; no document content sent to an external renderer',
      rendererSha256: sha(fs.readFileSync(path.join(__dirname, 'mermaid-11.12.1.min.js'))),
      scope: 'Authored Markdown diagrams; imported pack and exported chats excluded',
      documents: markdown.length, diagrams: diagrams.length, uncovered, results, standalone,
      originalManifestFilesChecked: manifest.files.length, originalManifestFailures: manifestFailures,
      productTestsRun: false,
    };
    fs.writeFileSync(path.join(__dirname, 'diagram-validation.json'), JSON.stringify(report, null, 2) + '\n');
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Tricks Coach · Diagram review</title><style>body{margin:0;background:#f3f6fa;color:#183153;font:15px/1.5 "Segoe UI",Arial,sans-serif}main{max-width:1120px;margin:48px auto;padding:0 24px}h1{font-size:32px;letter-spacing:-.03em;margin:0 0 8px}.intro{max-width:720px;color:#52657b}article{background:#fff;border:1px solid #dce4ef;border-radius:16px;margin:28px 0;padding:24px}h2{font-size:20px;letter-spacing:-.02em;margin:0}header p{color:#64748b;font-size:13px;margin:5px 0 0}figure{margin:24px 0;overflow-x:auto;padding:12px}figure svg{max-width:100%;height:auto;display:block;margin:auto}details{border-top:1px solid #e6ebf2;padding-top:14px;color:#52657b}summary{cursor:pointer}pre{overflow:auto;background:#f8fafc;border-radius:8px;padding:16px;font-size:12px;line-height:1.6}.tag{display:inline-block;background:#e5f5ef;color:#173f33;border:1px solid #b6dccc;border-radius:20px;padding:5px 12px;margin:12px 8px 0 0;font-size:13px}</style></head><body><main><h1>Tricks Coach · Diagram review</h1><p class="intro">Visual summaries of the current design, supporting research and recorded prototype evidence. Editable Mermaid remains beside the text in each document. Proposed flows do not establish implementation or test results.</p><span class="tag">${diagrams.length} diagrams</span><span class="tag">${markdown.length} authored documents</span>${cards.join('\n')}</main></body></html>`;
    const gallery = path.join(__dirname, 'diagram-review.html');
    fs.writeFileSync(gallery, html);
    await page.setContent(html.replace('<head>', '<head><meta http-equiv="Content-Security-Policy" content="' + csp + '">'));
    for (const [name, wanted, ordinal] of [['hosted','planning/07-hosted-architecture.md',1],['coach','planning/04-coaching-and-evidence.md',1],['scaling','planning/10-capacity-and-scaling.md',1]]) {
      const index = diagrams.findIndex(item => item.file === wanted && item.ordinal === ordinal);
      if (index >= 0 && results[index].status === 'rendered') await page.locator(`#diagram-${index}`).screenshot({ path: path.join(__dirname, `diagram-${name}.png`) });
    }
    const failures = results.filter(item => item.status !== 'rendered' || !item.accessible || item.missingText || item.nodes > 10);
    console.log(JSON.stringify({ documents: markdown.length, diagrams: diagrams.length, uncovered, failures, standalone, originalManifestFailures: manifestFailures, gallery }, null, 2));
    if (failures.length || uncovered.length || manifestFailures.length || standalone.some(item => !item.matchesEmbedded)) process.exitCode = 1;
  } finally {
    await browser.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
