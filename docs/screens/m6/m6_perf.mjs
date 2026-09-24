// Run from a directory with playwright installed (e.g. /tmp/pw-c) against `npx vite preview --port 4174`.
import { chromium } from 'playwright';
const PORT = process.argv[2] ?? '4174';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(`http://localhost:${PORT}/`);
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForFunction(() => window.homestead && window.homesteadView);
await page.waitForTimeout(800);
const fps = async () => {
  await page.evaluate(() => window.homesteadView.frameCost());
  const f = await page.evaluate(() => new Promise((res) => {
    let n = 0; const t0 = performance.now();
    const f = () => { n++; if (performance.now() - t0 < 2500) requestAnimationFrame(f); else res(Math.round(n / ((performance.now() - t0) / 1000) * 10) / 10); };
    requestAnimationFrame(f);
  }));
  const c = await page.evaluate(() => window.homesteadView.frameCost());
  return `${f} fps · js/frame sim ${c.sim.toFixed(2)} view ${c.view.toFixed(2)} ui ${c.ui.toFixed(2)} ms`;
};
console.log('empty', await fps());
await page.evaluate(() => { window.homestead.qol.bigVault(120); document.querySelectorAll('.modal-backdrop').forEach((m) => m.remove()); });
await page.waitForTimeout(500);
console.log('bigVault', await fps(), await page.evaluate(() => window.homestead.state.rooms.length));
await page.evaluate(() => {
  const hs = window.homestead;
  hs.research.all();
  hs.deep.open(4);
  hs.state.scrip += 50_000_000;
  const types = ['geothermal', 'fungalfarm', 'refinery', 'aquifer', 'lab', 'geothermal', 'quarters'];
  for (let f = 10; f < 45; f++) hs.run({ type: 'build', roomType: 'elevator', floor: f, x: 6 });
  for (let f = 25; f < 45; f++) {
    for (let i = 0; i < 6; i++) hs.run({ type: 'build', roomType: types[(f + i) % types.length], floor: f, x: 7 + i * 3 });
    for (let i = 0; i < 2; i++) hs.run({ type: 'build', roomType: types[(f + i + 3) % types.length], floor: f, x: 3 - i * 3 });
  }
  for (let f = 10; f < 25; f++) for (let i = 0; i < 6; i++) hs.run({ type: 'build', roomType: ['generator', 'canteen', 'waterworks', 'quarters'][(f + i) % 4], floor: f, x: 7 + i * 3 });
  hs.run({ type: 'autoAssign' });
  document.querySelectorAll('.modal-backdrop').forEach((m) => m.remove());
});
await page.waitForTimeout(800);
console.log('45 floors', await fps(), await page.evaluate(() => window.homestead.state.rooms.length));
await page.evaluate(() => window.homesteadView.focusFloor(40));
await page.waitForTimeout(300);
console.log('45 floors, looking at floor 40', await fps());
// zoomed out
await page.mouse.move(640, 400);
for (let i = 0; i < 12; i++) await page.mouse.wheel(0, 200);
await page.waitForTimeout(300);
console.log('45 floors, zoomed out', await fps());
const prof = await page.evaluate(() => window.homesteadView.profile?.());
if (prof) console.log('profile', JSON.stringify(prof));
console.log('errors', errors);
await browser.close();
