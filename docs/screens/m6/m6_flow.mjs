// Run from a directory with playwright installed (e.g. /tmp/pw-c) against `npx vite preview --port 4174`.
// M6 stream D (research, the Deep, traits) browser check.
// Usage: node m6_flow.mjs <outdir> [w] [h] [prefix] [port]
import { chromium } from 'playwright';

const out = process.argv[2] ?? '.';
const W = Number(process.argv[3] ?? 1280);
const H = Number(process.argv[4] ?? 800);
const P = process.argv[5] ?? 'desk';
const PORT = process.argv[6] ?? '4174';
const mobile = W < 700;

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: mobile ? 2 : 1, hasTouch: mobile, isMobile: mobile });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(`http://localhost:${PORT}/`);
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForFunction(() => window.homestead && window.homesteadView);
await page.waitForTimeout(800);
const shot = async (name) => { await page.screenshot({ path: `${out}/${P}-${name}.png` }); console.log('shot', name); };
const tap = async (loc) => { if (mobile) await loc.tap(); else await loc.click(); };
const check = (cond, msg) => { if (!cond) { errors.push('CHECK FAILED: ' + msg); console.log('FAIL', msg); } else console.log('ok', msg); };
const closeModal = async () => {
  for (let i = 0; i < 6; i++) {
    const b = page.locator('.modal-backdrop .modal button.primary').last();
    if (!(await b.count())) break;
    await b.click({ force: true }).catch(() => {});
    await page.waitForTimeout(200);
  }
};
const closePanel = async () => { const c = page.locator('.panel header .close'); if (await c.count()) await tap(c.first()); await page.waitForTimeout(200); };

await closeModal();
// A lived-in mid-game homestead with a Lab.
await page.evaluate(() => {
  const hs = window.homestead;
  hs.qol.bigVault(120);
  hs.fill();
  hs.state.time = 3 * 86400 + 21 * 3600; // night shift for the clock
  // Give someone some mastery and put a Lab crew in.
  const lab = hs.state.rooms.find((r) => r.type === 'lab');
  const crew = hs.state.residents.filter((r) => !r.dead && r.adultAt === null && r.expedition === null && r.quest === null).slice(0, 6);
  for (const r of crew) hs.run({ type: 'assign', residentId: r.id, roomId: lab.id });
});
await page.waitForTimeout(600);
await closeModal();

// ---- Research panel with some points
await page.evaluate(() => window.homestead.research.points(700));
await page.waitForTimeout(300);
const toolbarR = page.locator('.toolbar button', { hasText: mobile ? '🔬' : 'Research' });
check(await toolbarR.count() === 1, 'Research toolbar button');
await tap(toolbarR);
await page.waitForTimeout(500);
await shot('01-research');
// research a node through the UI
const buy = page.locator('.rnode.ready .rbuy').first();
await tap(buy);
await page.waitForTimeout(400);
await shot('02-research-done');
check((await page.evaluate(() => window.homestead.state.research.done.length)) >= 1, 'researched a node from the panel');
if (mobile) {
  await tap(page.locator('.research-tabs button', { hasText: 'Deep Works' }));
  await page.waitForTimeout(300);
  await shot('03-research-deep-branch');
} else {
  await tap(page.locator('.research-tabs button', { hasText: 'Deep Works' }));
  await page.waitForTimeout(300);
  await shot('03-research-deep-branch');
  await tap(page.locator('.research-tabs button', { hasText: 'All' }));
}
await closePanel();

// ---- Lab room panel
const labId = await page.evaluate(() => window.homestead.state.rooms.find((r) => r.type === 'lab').id);
await page.evaluate((id) => window.homesteadView.focusFloor(window.homestead.state.rooms.find((r) => r.id === id).floor), labId);
await page.waitForTimeout(300);
const labPos = await page.evaluate((id) => window.homesteadView.roomScreen(id), labId);
await page.mouse.click(labPos.x, labPos.y);
await page.waitForTimeout(400);
await shot('04-lab-room');
check(await page.locator('.panel', { hasText: 'RP/h' }).count() >= 1, 'lab room panel shows research rate');
await closePanel();

// ---- The Deep: survey researched, but no elevator to the bottom yet
await page.evaluate(() => {
  const hs = window.homestead;
  hs.research.points(80);
  hs.run({ type: 'research', nodeId: 'deep_survey' });
});
await page.waitForTimeout(300);
await closeModal();
await tap(page.locator('.hud .deep-chip'));
await page.waitForTimeout(400);
await shot('05-excavation-needs');
check(await page.locator('.req-line:not(.ok)').count() >= 1, 'excavation shows an unmet requirement');
await closePanel();

// Elevator down to floor 25, then dig.
await page.evaluate(() => {
  const hs = window.homestead;
  for (let f = 10; f < 25; f++) hs.run({ type: 'build', roomType: 'elevator', floor: f, x: 6 });
  hs.state.scrip += 20000;
});
await page.waitForTimeout(300);
await tap(page.locator('.hud .deep-chip'));
await page.waitForTimeout(300);
await shot('06-excavation-ready');
await tap(page.locator('.dig-card button.primary', { hasText: 'Dig' }));
await page.waitForTimeout(400);
await shot('07-digging-panel');
check(await page.evaluate(() => !!window.homestead.state.deep.dig), 'dig started');
// fast-forward part of the dig, then look at the drill
await page.evaluate(() => { window.homestead.state.deep.dig.remaining *= 0.45; });
await tap(page.locator('.dig-card button', { hasText: 'Show dig site' }));
await page.waitForTimeout(700);
await shot('08-drill');

// Break through: the discovery modal.
await page.evaluate(() => window.homestead.deep.dig());
await page.waitForTimeout(700);
check(await page.locator('.discovery-modal').count() === 1, 'discovery modal shown');
await shot('09-discovery');
await closeModal();
await page.waitForTimeout(400);
await shot('10-stratum1-open');

// ---- Deep rooms on every stratum, 45 floors
await page.evaluate(() => {
  const hs = window.homestead;
  hs.research.all();
  hs.deep.open(4);
  hs.state.scrip += 50_000_000;
  const types = ['geothermal', 'fungalfarm', 'refinery', 'aquifer', 'lab', 'geothermal', 'quarters'];
  for (let f = 25; f < 45; f++) {
    hs.run({ type: 'build', roomType: 'elevator', floor: f, x: 6 });
    for (let i = 0; i < 6; i++) hs.run({ type: 'build', roomType: types[(f + i) % types.length], floor: f, x: 7 + i * 3 });
    for (let i = 0; i < 2; i++) hs.run({ type: 'build', roomType: types[(f + i + 3) % types.length], floor: f, x: 3 - i * 3 });
  }
  // and fill the upper floors too
  for (let f = 10; f < 25; f++) for (let i = 0; i < 6; i++) hs.run({ type: 'build', roomType: ['generator', 'canteen', 'waterworks', 'quarters'][(f + i) % 4], floor: f, x: 7 + i * 3 });
  // put crews in the deep rooms
  hs.run({ type: 'autoAssign' });
});
await page.waitForTimeout(800);
await closeModal();
const perf = await page.evaluate(() => new Promise((res) => {
  let n = 0; const t0 = performance.now();
  const f = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else res({ fps: n / ((performance.now() - t0) / 1000), rooms: window.homestead.state.rooms.length }); };
  requestAnimationFrame(f);
}));
console.log('perf', JSON.stringify(perf));
const shotFloor = async (floor, name) => {
  await page.evaluate((f) => window.__focus && window.__focus(f), floor);
  await page.waitForTimeout(500);
  await shot(name);
};
await page.evaluate(() => { window.__focus = (f) => window.homesteadView.focus?.(f); });
// Use the view directly through the Deep panel's "Go there" buttons.
const deepTab = async () => { await tap(page.locator('.hud .deep-chip')); await page.waitForTimeout(200); await tap(page.locator('.deep-tabs button', { hasText: 'Excavation' })); await page.waitForTimeout(200); };
await deepTab();
await page.waitForTimeout(300);
await shot('11-excavation-all');
await tap(page.locator('.stratum-card.s1 button', { hasText: 'Go there' }));
await page.waitForTimeout(600);
await shot('12-stratum1');
await deepTab();
await tap(page.locator('.stratum-card.s2 button', { hasText: 'Go there' }));
await page.waitForTimeout(600);
await shot('13-stratum2');
await deepTab();
await tap(page.locator('.stratum-card.s3 button', { hasText: 'Go there' }));
await page.waitForTimeout(600);
await shot('14-stratum3');
await deepTab();
await tap(page.locator('.stratum-card.s4 button', { hasText: 'Go there' }));
await page.waitForTimeout(600);
await page.mouse.wheel(0, 0);
await shot('15-stratum4');

// Scroll to the seal at the bottom.
if (!mobile) {
  await page.mouse.move(W / 2, H / 2);
  await page.mouse.down();
  await page.mouse.move(W / 2, H / 2 - 600, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(400);
  await shot('16-the-seal');
}

// ---- Deep incidents
const deepRooms = await page.evaluate(() => {
  const hs = window.homestead;
  const pick = (floor) => hs.state.rooms.find((r) => r.floor === floor && r.type !== 'elevator');
  const a = pick(26), b = pick(33), c = pick(38);
  hs.incident('cavein', a.id);
  hs.incident('flood', b.id);
  hs.incident('deepcrawlers', c.id);
  return [a.floor, b.floor, c.floor];
});
await page.waitForTimeout(300);
await shot('17-incident-toasts');
for (const [i, f] of deepRooms.entries()) {
  await page.evaluate((fl) => window.homesteadView.focusFloor?.(fl), f);
  await page.waitForTimeout(500);
  await shot(`18-incident-${['cavein', 'flood', 'crawlers'][i]}`);
}

// ---- Journal
await page.evaluate(() => { const hs = window.homestead; for (let i = 0; i < 6; i++) hs.deep.discover(); });
await page.waitForTimeout(300);
await closeModal();
await page.evaluate(() => { document.querySelectorAll('.modal-backdrop').forEach((m) => m.remove()); });
await tap(page.locator('.hud .deep-chip'));
await page.waitForTimeout(200);
await tap(page.locator('.deep-tabs button', { hasText: 'Journal' }));
await page.waitForTimeout(300);
await shot('19-journal');
await closePanel();

// ---- Refinery room panel
const ref = await page.evaluate(() => window.homestead.state.rooms.find((r) => r.type === 'refinery' && r.floor > 25)?.floor);
await page.evaluate((fl) => window.homesteadView.focusFloor(fl), ref);
await page.waitForTimeout(400);
const refId = await page.evaluate(() => {
  const hs = window.homestead;
  const room = hs.state.rooms.find((r) => r.type === 'refinery' && r.floor > 25);
  const idle = hs.state.residents.filter((r) => !r.dead && r.adultAt === null && r.expedition === null && r.quest === null && r.roomId !== room.id).slice(-2);
  for (const r of idle) hs.run({ type: 'assign', residentId: r.id, roomId: room.id });
  return room.id;
});
const refPos = await page.evaluate((id) => window.homesteadView.roomScreen(id), refId);
if (refPos) await page.mouse.click(refPos.x, Math.min(H - 100, refPos.y));
await page.waitForTimeout(400);
await shot('20-refinery-room');
await closePanel();

// ---- Traits and mastery on a resident
await tap(page.locator('.toolbar button', { hasText: mobile ? 'People' : 'Residents' }));
await page.waitForTimeout(400);
await shot('21-resident-list');
const rid = Number(await page.locator('.rl-row').nth(1).getAttribute('data-id'));
await page.evaluate((id) => {
  const hs = window.homestead;
  const r = hs.state.residents.find((x) => x.id === id);
  const room = hs.state.rooms.find((y) => y.id === r.roomId);
  const tiers = hs.content.traits.tuning.masteryTierSeconds;
  r.mastery = { [room.type]: tiers[1] * 1.6, canteen: tiers[2] + 1, waterworks: tiers[1] + 1 };
  window.__rid = id;
}, rid);
await tap(page.locator('.rl-row').nth(1));
await page.waitForTimeout(500);
const chip = page.locator('.panel .trait-chips .trait-chip').first();
if (await chip.count()) await tap(chip);
await page.waitForTimeout(400);
await shot('22-resident-traits');
check(await page.locator('.panel .mastery-block').count() >= 1, 'mastery block on resident');
check(await page.locator('.panel .trait-tip').count() === 1, 'trait tip opens on tap');
await closePanel();

// ---- mastery toast
await page.evaluate(() => {
  const hs = window.homestead;
  const r = hs.state.residents.find((x) => x.id === window.__rid);
  const room = hs.state.rooms.find((y) => y.id === r.roomId);
  r.mastery[room.type] = hs.content.traits.tuning.masteryTierSeconds[2] - 1;
  hs.skip(3);
});
await page.waitForTimeout(300);
await shot('23-mastery-toast');

// ---- threat chip
await tap(page.locator('.hud .threat-chip'));
await page.waitForTimeout(300);
await shot('24-threat');
await closeModal();

console.log('errors', JSON.stringify(errors, null, 1));
await browser.close();
process.exit(errors.length ? 1 : 0);
