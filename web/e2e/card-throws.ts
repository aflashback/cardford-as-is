import { expect, type Page } from '@playwright/test';

/** Freeze real WAAPI flights at their first frame so assertions do not race 115ms motion. */
export async function freezeThrows(page: Page) {
  await page.evaluate(() => {
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (...args) {
      const animation = animate.apply(this, args);
      if (this.classList.contains('card-throw')) { animation.pause(); animation.currentTime = 0; }
      return animation;
    };
  });
}
export async function verifyThrow(page: Page, card: string, seat: number) {
  const flight = page.locator(`.card-throw[data-card="${card}"]`);
  await expect(flight).toHaveCount(1);
  await expect(flight).toHaveAttribute('data-from-seat', String(seat));
  const target = page.locator(`[data-played-card="${card}"] .card-face`);
  await expect(target).toHaveCSS('visibility', 'hidden');
  const destination = await target.boundingBox();
  const start = await flight.boundingBox();
  expect(destination).not.toBeNull(); expect(start).not.toBeNull();
  expect(Math.hypot(start!.x - destination!.x, start!.y - destination!.y)).toBeGreaterThan(20);
  const timing = await flight.evaluate(node => {
    const animation = node.getAnimations()[0];
    return { duration: animation.effect!.getTiming().duration, id: animation.id };
  });
  expect(timing.id).toBe('card-throw');
  expect(timing.duration).toBeCloseTo(150 / 1.3, 1);
  // Verify the animated clone lands on the existing face with no layout change.
  await flight.evaluate(node => {
    const animation = node.getAnimations()[0];
    animation.currentTime = Number(animation.effect!.getTiming().duration) - .01;
  });
  const landing = await flight.boundingBox();
  for (const key of ['x', 'y', 'width', 'height'] as const) expect(landing![key]).toBeCloseTo(destination![key], 1);
  await flight.evaluate(node => node.getAnimations()[0].finish());
  await expect(flight).toHaveCount(0);
  await expect(target).toHaveCSS('visibility', 'visible');
  expect(await target.boundingBox()).toEqual(destination);
}
