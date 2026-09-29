import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Rebuild the standalone SVGs from the selected Open Hand direction.
// Manrope is already a project dependency and is licensed under SIL OFL 1.1.
const here = path.dirname(fileURLToPath(import.meta.url));
const fontPath = path.resolve(here, '../../../node_modules/@fontsource-variable/manrope/files/manrope-latin-wght-normal.woff2');
const fontBase64 = (await readFile(fontPath)).toString('base64');
const outDir = path.join(here, 'svg');
await mkdir(outDir, { recursive: true });

const color = Object.freeze({
  navy: '#13304D',
  blue: '#2B57E6',
  red: '#CA282B',
  ivory: '#F6F4ED',
  white: '#FFFFFF',
});

const fontFace = `<defs><style><![CDATA[@font-face{font-family:'Cardford Manrope';src:url('data:font/woff2;base64,${fontBase64}') format('woff2');font-style:normal;font-weight:200 800;font-display:block}]]></style></defs>`;

function document(name, width, height, body, description, needsFont = false) {
  const id = name.toLowerCase().replace(/[^a-z0-9-]/g, '-');
  return `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="${id}-title ${id}-desc">\n` +
    `  <title id="${id}-title">${name}</title>\n` +
    `  <desc id="${id}-desc">${description}</desc>\n` +
    (needsFont ? `  ${fontFace}\n` : '') +
    `  ${body}\n</svg>\n`;
}

function symbol(variant = 'primary', x = 0, y = 0, scale = 1) {
  const palette = {
    primary: { back: color.blue, middleFill: color.ivory, middleStroke: color.blue, frontFill: color.ivory, frontStroke: color.navy, pip: color.red },
    mono: { back: color.navy, middleFill: color.ivory, middleStroke: color.navy, frontFill: color.ivory, frontStroke: color.navy, pip: color.navy },
    reverse: { back: color.ivory, middleFill: color.navy, middleStroke: color.ivory, frontFill: color.ivory, frontStroke: color.navy, pip: color.red },
    app: { back: color.ivory, middleFill: color.blue, middleStroke: color.ivory, frontFill: color.ivory, frontStroke: color.navy, pip: color.red },
  }[variant];
  if (!palette) throw new Error(`Unknown symbol variant: ${variant}`);
  return `<g transform="translate(${x} ${y}) scale(${scale})" stroke-linejoin="round">\n` +
    `    <rect x="19" y="37" width="75" height="108" rx="10" transform="rotate(-18 56.5 91)" fill="${palette.back}"/>\n` +
    `    <rect x="46" y="22" width="75" height="116" rx="10" transform="rotate(-7 83.5 80)" fill="${palette.middleFill}" stroke="${palette.middleStroke}" stroke-width="7"/>\n` +
    `    <rect x="71" y="40" width="71" height="108" rx="10" fill="${palette.frontFill}" stroke="${palette.frontStroke}" stroke-width="8"/>\n` +
    `    <path d="M106 76 120 94 106 112 92 94Z" fill="${palette.pip}"/>\n` +
    `  </g>`;
}

function wordmark(x, baseline, size, fill = color.navy) {
  return `<text x="${x}" y="${baseline}" fill="${fill}" font-family="Cardford Manrope, Arial, sans-serif" font-size="${size}" font-weight="800" font-variation-settings="'wght' 800" letter-spacing="-0.045em">Cardford</text>`;
}

function supportingText(text, x, baseline, size, fill = color.navy, extra = '') {
  return `<text x="${x}" y="${baseline}" fill="${fill}" font-family="Cardford Manrope, Arial, sans-serif" font-size="${size}" font-weight="500" ${extra}>${text}</text>`;
}

const assets = {
  'cardford-symbol.svg': document('Cardford symbol', 160, 160, symbol(), 'Three overlapping playing cards with a red diamond pip.'),
  'cardford-symbol-mono.svg': document('Cardford one-color symbol', 160, 160, symbol('mono'), 'One-ink version of the three-card symbol.'),
  'cardford-app-icon.svg': document('Cardford app icon', 180, 180,
    `<rect width="180" height="180" rx="30" fill="${color.blue}"/>\n  ${symbol('app', 8, 9, 1.01)}`,
    'Ivory playing cards and a red diamond on a blue square.'),
  'cardford-wordmark.svg': document('Cardford wordmark', 460, 140,
    wordmark(8, 111, 115), 'Cardford in a bold navy wordmark.', true),
  'cardford-logo-horizontal.svg': document('Cardford horizontal logo', 630, 170,
    `${symbol()}\n  ${wordmark(170, 126, 111)}`,
    'Three-card symbol beside the Cardford wordmark.', true),
  'cardford-logo-tagline.svg': document('Cardford logo with motto', 630, 207,
    `${symbol('primary', 0, 15)}\n  ${wordmark(170, 126, 111)}\n  ${supportingText('Card games. Your way', 177, 173, 37, color.navy, 'letter-spacing="0.035em"')}`,
    'Cardford logo with the motto Card games. Your way', true),
  'cardford-logo-reverse.svg': document('Cardford reverse logo', 630, 170,
    `${symbol('reverse')}\n  ${wordmark(170, 126, 111, color.ivory)}`,
    'Ivory Cardford logo for dark navy backgrounds.', true),
  'cardford-stamp.svg': document('Cardford brand stamp', 550, 160,
    `<rect x="3" y="3" width="544" height="154" rx="25" fill="none" stroke="${color.navy}" stroke-width="3"/>\n` +
    `  ${symbol('primary', 21, 2, 0.94)}\n  ${wordmark(183, 99, 78)}\n` +
    `  ${supportingText('CARD GAMES', 335, 137, 19, color.navy, 'letter-spacing="0.28em" text-anchor="middle"')}`,
    'Outlined Cardford brand stamp with symbol, name and Card Games descriptor.', true),
  'cardford-banner.svg': document('Cardford banner', 1440, 230,
    `<rect width="1440" height="230" rx="17" fill="${color.navy}"/>\n` +
    `  ${symbol('reverse', 58, 35, 1)}\n  ${wordmark(230, 153, 104, color.ivory)}\n` +
    `  <path d="M744 46v138" stroke="${color.ivory}" stroke-width="2" opacity="0.85"/>\n` +
    `  ${supportingText('Card games. Your way', 818, 135, 49, color.ivory, 'letter-spacing="0.018em"')}`,
    'Navy brand banner showing the Cardford logo and motto without a second headline.', true),
  'cardford-header-example.svg': document('Cardford header example', 1440, 110,
    `<rect x="1" y="1" width="1438" height="108" rx="13" fill="${color.ivory}" stroke="${color.navy}" stroke-opacity="0.17" stroke-width="2"/>\n` +
    `  ${symbol('primary', 31, 7, 0.59)}\n  ${wordmark(139, 77, 61)}\n` +
    `  ${supportingText('Games', 1145, 69, 25)}\n` +
    `  <rect x="1298" y="22" width="113" height="66" rx="12" fill="${color.navy}"/>\n` +
    `  ${supportingText('Play', 1354.5, 67, 26, color.ivory, 'text-anchor="middle"')}`,
    'Illustrative website header with Cardford logo, Games link and Play button.', true),
};

for (const [filename, source] of Object.entries(assets)) {
  await writeFile(path.join(outDir, filename), source, 'utf8');
  process.stdout.write(`${filename}\n`);
}
