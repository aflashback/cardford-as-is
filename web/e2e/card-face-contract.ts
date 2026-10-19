import { expect, type Page } from '@playwright/test';

// Check rendered geometry, including fonts and corners, at different sizes.
// No particular implementation/token values are hardcoded into this check.
export async function faceSignatures(page: Page) {
  return page.locator('.card-face').evaluateAll(cards => cards.map(card => {
    const css = getComputedStyle(card), width = parseFloat(css.width);
    const corner = getComputedStyle(card.querySelector('.card-corner')!);
    const rank = getComputedStyle(card.querySelector('.card-corner b')!);
    const suit = getComputedStyle(card.querySelector('.card-corner > span')!);
    const pip = getComputedStyle(card.querySelector('.card-pip')!);
    return { radius: parseFloat(css.borderRadius) / width, aspect: parseFloat(css.height) / width,
      cornerX: parseFloat(corner.left) / width, cornerY: parseFloat(corner.top) / width,
      rank: parseFloat(rank.fontSize) / width, suit: parseFloat(suit.fontSize) / width,
      pip: parseFloat(pip.fontSize) / width, weight: rank.fontWeight,
      direction: corner.flexDirection, font: rank.fontFamily };
  }));
}
export function sameFaces(signatures: Awaited<ReturnType<typeof faceSignatures>>, reference = signatures[0]) {
  expect(signatures.length).toBeGreaterThan(0);
  for (const face of signatures) for (const key of Object.keys(reference) as (keyof typeof reference)[]) {
    if (typeof face[key] === 'number') expect(face[key]).toBeCloseTo(reference[key] as number, 2);
    else expect(face[key]).toBe(reference[key]);
  }
}
