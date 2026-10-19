import { expect, type Page } from '@playwright/test';
import { freezeThrows, verifyThrow } from './card-throws';

export async function holdCard(page: Page, card: string) {
  const control = page.locator(`[data-hand-card="${card}"]`);
  const box = (await control.boundingBox())!;
  const face = (await control.locator('.card-face').boundingBox())!;
  const table = (await page.locator('.table-felt').boundingBox())!;
  // Visible left edge remains clickable in a dense overlapping hand.
  const x = box.x + 10, y = box.y + box.height / 2;
  await page.mouse.move(x, y); await page.mouse.down();
  await page.waitForTimeout(230);
  return { x, y, face, dx: table.x + table.width / 2 - face.x - face.width / 2,
    dy: table.y + table.height / 2 - face.y - face.height / 2 };
}

export async function verifyHandDrag(page: Page, card: string, commandCount: () => Promise<number>, proof?: string) {
  const control = page.locator(`[data-hand-card="${card}"]`);
  const origin = (await control.boundingBox())!;
  await control.hover();
  await expect(control.locator('.card-face')).toHaveCSS('transform', 'none');
  await control.click();
  await expect(control).toHaveAttribute('aria-pressed', 'false');
  expect(await commandCount()).toBe(0);
  await page.waitForTimeout(380);

  const near = await holdCard(page, card);
  expect(await page.locator('.hand-drag-card').count()).toBe(1);
  await expect(control.locator('.card-face')).toHaveCSS('visibility', 'hidden');
  expect(await control.boundingBox()).toEqual(origin);
  if (proof) await page.screenshot({ path: proof });
  await page.mouse.move(near.x + near.dx * .15, near.y + near.dy * .15);
  await page.mouse.up();
  await expect(page.locator('.hand-drag-card')).toHaveCount(0);
  expect(await commandCount()).toBe(0);
  expect(await control.boundingBox()).toEqual(origin);
  await expect(control.locator('.card-face')).toHaveCSS('visibility', 'visible');

  const drop = await holdCard(page, card);
  await page.mouse.move(drop.x + drop.dx * .65, drop.y + drop.dy * .65);
  await expect(page.locator('.hand-drag-card')).toHaveAttribute('data-ready', 'true');
  const dropPosition = (await page.locator('.hand-drag-card').boundingBox())!;
  await freezeThrows(page);
  await page.mouse.up();
  await expect.poll(commandCount).toBe(1);
  await expect(page.locator('.hand-drag-card')).toHaveCount(0);
  await expect(control).toHaveCount(0);
  const flight = page.locator(`.card-throw[data-card="${card}"]`);
  await expect(flight).toHaveCount(1);
  const flightStart = (await flight.boundingBox())!;
  expect(flightStart.x + flightStart.width / 2).toBeCloseTo(dropPosition.x + dropPosition.width / 2, 1);
  expect(flightStart.y + flightStart.height / 2).toBeCloseTo(dropPosition.y + dropPosition.height / 2, 1);
  await verifyThrow(page, card, 0);
}
