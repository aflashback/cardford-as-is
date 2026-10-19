import { devices } from '@playwright/test';

// Named installed Playwright profiles include the space taken by browser chrome.
// These are CSS/emulation checks; they do not certify a physical device or Safari.
export const landscapeDevices = [
  'iPhone 17 Pro landscape',
  'iPhone 17 Pro Max landscape',
  'Galaxy S24 landscape',
  'Pixel 9 Pro landscape',
  'iPad (gen 11) landscape',
  'iPad Pro 11 landscape',
].map(name => ({ name, ...devices[name].viewport }));

export const landscapeReviewSizes = [
  { name: 'desktop', width: 1280, height: 800 },
  ...landscapeDevices,
];
