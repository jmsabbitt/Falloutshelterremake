// Run from a directory with playwright installed (e.g. /tmp/pw-c) against `npx vite preview --port 4174`.
// Build mode on deep floors, the build panel's deep entries, and the stats overlay with Labs.
import { chromium } from 'playwright';
const out = process.argv[2];
const W = Number(process.argv[3] ?? 1280);
const H = Number(process.argv[4] ?? 800);
const P = process.argv[5] ?? 'desk';
const mobile = W < 700;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await (await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: mobile ? 2 : 1, hasTouch: mobile, isMobile: mobile })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
const tap = async (loc) => { if (mobile) await loc.tap(); else await loc.click(); };
await page.goto('http://localhost:4174/');
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForFunction(() => window.homestead && window.homesteadView);
await page.waitForTimeout(500);
await page.evaluate(() => {
  const hs = window.homestead;
  hs.qol.bigVault(70);
  for (const id of ['deep_survey', 'geothermal_taps', 'fungal_farming', 'deep_survey_2']) { hs.research.points(1000); hs.run({ type: 'research', nodeId: id }); }
  hs.deep.open(1);
  hs.state.scrip += 5_000_000;
  for (let f = 10; f < 27; f++) hs.run({ type: 'build', roomType: 'elevator', floor: f, x: 6 });
  hs.run({ type: 'build', roomType: 'fungalfarm', floor: 25, x: 7 });
  document.querySelectorAll('.modal-backdrop').forEach((m) => m.remove());
});
await page.waitForTimeout(400);
await tap(page.locator('.toolbar button', { hasText: 'Build' }));
await page.waitForTimeout(300);
await page.locator('.panel .list-item', { hasText: 'Geothermal Tap' }).scrollIntoViewIfNeeded();
await page.screenshot({ path: `${out}/${P}-25-build-panel-deep.png` });
await tap(page.locator('.panel .list-item', { hasText: 'Geothermal Tap' }));
await page.waitForTimeout(300);
// (phones keep the panel open: closing it leaves build mode)
await page.evaluate((m) => window.homesteadView.focusFloor(m ? 26.8 : 25.5), mobile);
await page.waitForTimeout(500);
const ghosts = await page.evaluate(() => window.homesteadView.counts().ghosts);
console.log('ghosts', ghosts);
await page.screenshot({ path: `${out}/${P}-26-build-deep-ghosts.png` });
// Stats overlay with a Lab
await page.keyboard.press('Escape');
await page.evaluate(() => {
  const lab = window.homestead.state.rooms.find((r) => r.type === 'lab');
  window.homesteadView.focusFloor(lab.floor);
});
await tap(page.locator('.qol-fabs .fab').nth(1));
await page.waitForTimeout(800);
await page.screenshot({ path: `${out}/${P}-27-stats-overlay-lab.png` });
console.log('errors', errors);
await browser.close();
