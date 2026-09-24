// M5 client (prestige) browser check. Usage: node m5_flow.mjs <outdir> [w] [h] [prefix] [port]
import { chromium } from 'playwright';

const out = process.argv[2] ?? '.';
const W = Number(process.argv[3] ?? 1280);
const H = Number(process.argv[4] ?? 800);
const P = process.argv[5] ?? 'desk';
const PORT = process.argv[6] ?? '4391';
const mobile = W < 700;

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: mobile ? 2 : 1, hasTouch: mobile, isMobile: mobile, acceptDownloads: true });
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

await page.getByText('Got it').click().catch(() => {});
// A lived-in first homestead: varied levels, gear, a few stored items.
await page.evaluate(() => {
  const hs = window.homestead;
  hs.run({ type: 'admitAll' });
  hs.addScrip(5000);
  hs.fill();
  for (const id of ['peacemaker', 'titan_harness', 'scattergun', 'scout_jacket', 'wrench', 'lab_smock']) hs.give(id);
  hs.prestige.charter();
  const rs = hs.state.residents;
  rs.forEach((r, i) => { r.level = Math.max(1, 30 - (i % 37)); });
  rs[3].rarity = 'legendary'; rs[3].weapon = 'glare_lance'; rs[3].outfit = 'bedrock_armor';
  rs[7].rarity = 'rare'; rs[7].weapon = 'coilgun';
  rs[12].pregnancy = { dueAt: hs.state.time + 9999, fatherId: rs[13].id };
  hs.state.time = 12 * 86400;
  hs.state.stats.contractsCompleted = 14;
  hs.state.stats.bossesDefeated = 6;
  hs.state.rooms.filter((r) => r.type !== 'door' && r.type !== 'elevator').slice(0, 2).forEach((r) => (r.level = 3));
});
// The next frame raises charterReached.
await page.waitForSelector('.charter-modal', { timeout: 5000 });
await page.waitForTimeout(700);
await shot('01-charter-reached');
await tap(page.locator('.charter-modal button', { hasText: 'View Legacy' }));
await page.waitForTimeout(500);
await shot('02-legacy-charter');
await page.locator('.legacy-body').evaluate((el) => el.scrollTo(0, 99999));
await page.waitForTimeout(300);
await shot('02b-legacy-charter-bottom');
await tap(page.locator('.legacy-top button', { hasText: 'Perks' }));
await page.waitForTimeout(400);
await shot('03-perks-preview');
await tap(page.locator('.legacy-top button', { hasText: 'Outposts' }));
await page.waitForTimeout(400);
await shot('04-outposts-empty');
await tap(page.locator('.legacy-top button', { hasText: 'Charter' }));
await page.waitForTimeout(300);

// ---- the Found flow
await tap(page.locator('.found-btn'));
await page.waitForSelector('.found-flow');
await page.waitForTimeout(500);
await shot('05-review');
await page.locator('.ff-body').evaluate((el) => el.scrollTo(0, 99999));
await page.waitForTimeout(200);
await shot('05b-review-bottom');
await tap(page.locator('.ff-buttons button.primary'));
await page.waitForTimeout(300);
await tap(page.locator('.site-card', { hasText: 'Rustman Country' }));
await page.waitForTimeout(300);
await shot('06-site');
await tap(page.locator('.ff-buttons button.primary'));
await page.waitForTimeout(300);
await shot('07-party');
// Try to add the pregnant resident (should be locked), and swap one founder.
await tap(page.locator('.founder-slot:not(.empty)').first());
await page.waitForTimeout(200);
const pregnantName = await page.evaluate(() => window.homestead.state.residents[3].firstName);
await tap(page.locator('.founder-row', { hasText: pregnantName }).first());
await page.waitForTimeout(200);
await page.locator('.ff-body').evaluate((el) => el.scrollTo(0, 0));
await shot('07b-party-edited');
await tap(page.locator('.ff-buttons button.primary'));
await page.waitForTimeout(300);
await shot('08-heirlooms');
await tap(page.locator('.ff-buttons button.primary'));
await page.waitForTimeout(400);
await shot('09-confirm');
const before = await page.evaluate(() => ({
  number: window.homestead.state.homesteadNumber,
  cycle: window.homestead.state.legacy.cycle,
  backup: !!localStorage.getItem('homestead.save.backup.1'),
}));
check(before.backup, 'backup written when Confirm opened');
const dl = page.waitForEvent('download', { timeout: 3000 }).catch(() => null);
await tap(page.locator('.ff-backup button'));
const d = await dl;
check(!!d && (await d.suggestedFilename()).includes('before-founding'), 'download backup offered: ' + (d ? await d.suggestedFilename() : 'none'));

// Press and hold.
const hold = page.locator('.hold-btn');
// Letting go early cancels.
await hold.dispatchEvent('pointerdown', { button: 0, pointerId: 1 });
await page.waitForTimeout(300);
await hold.dispatchEvent('pointerup', { button: 0, pointerId: 1 });
await page.waitForTimeout(1500);
check(await page.evaluate(() => window.homestead.state.legacy.cycle === 1), 'early release does not found');
await hold.dispatchEvent('pointerdown', { button: 0, pointerId: 1 });
await page.waitForTimeout(450);
await shot('10-holding');
await page.waitForSelector('.arrival-modal', { timeout: 3000 });
await page.waitForTimeout(1300);
await shot('11-arrival');

const after = await page.evaluate(() => {
  const s = window.homestead.state;
  return {
    number: s.homesteadNumber,
    cycle: s.legacy.cycle,
    site: s.legacy.siteId,
    points: s.legacy.points,
    rooms: s.rooms.length,
    residents: s.residents.length,
    waiting: s.residents.filter((r) => r.waiting).length,
    outposts: s.legacy.outposts.length,
    items: s.items.length,
    counts: window.homesteadView.counts(),
    saved: JSON.parse(localStorage.getItem('homestead.save.0')).homesteadNumber ?? JSON.parse(localStorage.getItem('homestead.save.0')).state?.homesteadNumber,
    questScreen: document.querySelector('.quest-screen')?.style.display,
    panel: !!document.querySelector('.panel'),
  };
});
console.log('after', JSON.stringify(after));
check(after.cycle === 2 && after.number !== before.number, 'new homestead replaced state');
check(after.site === 'rust_country', 'site applied');
check(after.residents === 6 && after.waiting === 6, 'party + strangers waiting at the door');
check(after.counts.sprites === after.residents, `sprites re-synced (${after.counts.sprites} for ${after.residents})`);
check(after.counts.residentLayer === after.residents, `no leftover sprite nodes (${after.counts.residentLayer})`);
check(after.outposts === 1, 'old homestead became an outpost');
check(!after.panel, 'panels closed');

await tap(page.locator('.arrival-modal button', { hasText: 'To the door' }));
await page.waitForTimeout(800);
await shot('12-new-homestead');

// ---- buy perks
await tap(page.locator('.toolbar .legacy-btn'));
await page.waitForTimeout(300);
await tap(page.locator('.legacy-top button', { hasText: 'Perks' }));
await page.waitForTimeout(300);
await shot('13-perks-with-points');
const pts0 = await page.evaluate(() => window.homestead.state.legacy.points);
await tap(page.locator('.perk-card[data-perk="supply_lines"] .perk-buy'));
await page.waitForTimeout(250);
await shot('14-perk-bought');
const pts1 = await page.evaluate(() => window.homestead.state.legacy.points);
check(pts1 < pts0, `perk bought (${pts0} -> ${pts1})`);
await page.evaluate(() => window.homestead.prestige.legacy(40));
await page.waitForTimeout(600);
for (const id of ['overtime', 'overtime', 'endowment']) {
  await tap(page.locator(`.perk-card[data-perk="${id}"] .perk-buy`));
  await page.waitForTimeout(150);
}
await page.waitForTimeout(1600);
await shot('15-perks-after');
if (mobile) {
  await page.locator('.legacy-body').evaluate((el) => el.scrollTo(0, 900));
  await page.waitForTimeout(300);
  await shot('15b-perks-scrolled');
}

// ---- outposts: wait some hours and collect
await tap(page.locator('.panel .close'));
await page.evaluate(() => window.homestead.skip(6 * 3600));
await page.waitForTimeout(600);
await shot('16-outpost-chip');
await tap(page.locator('.outpost-chip'));
await page.waitForTimeout(400);
await shot('17-outposts');
const scrip0 = await page.evaluate(() => window.homestead.state.scrip);
await tap(page.locator('.outpost-collect button'));
await page.waitForTimeout(400);
const scrip1 = await page.evaluate(() => window.homestead.state.scrip);
check(scrip1 > scrip0, `outposts collected (${scrip0} -> ${scrip1})`);
await shot('18-collected');

// ---- a second founding via the console, to see two outposts and the history
await page.evaluate(() => { window.homestead.prestige.charter(); });
await page.waitForTimeout(500);
await page.evaluate(() => document.querySelector('.charter-modal button')?.click());
const r2 = await page.evaluate(() => window.homestead.prestige.found('the_scorch'));
console.log('second found', JSON.stringify(r2));
await page.waitForTimeout(500);
check(await page.evaluate(() => window.homesteadView.counts().sprites === window.homestead.state.residents.length), 'second founding re-synced sprites');
await page.evaluate(() => window.homestead.skip(30 * 3600));
await page.evaluate(() => document.querySelector('.outpost-chip')?.click());
await page.waitForTimeout(500);
await shot('19-two-outposts');
await page.locator('.legacy-body').evaluate((el) => el.scrollTo(0, 99999));
await page.waitForTimeout(300);
await shot('20-history');

// Reload: the new homestead is what was saved.
const num = await page.evaluate(() => window.homestead.state.homesteadNumber);
await page.evaluate(() => window.homestead.run({ type: 'admitAll' }));
await page.reload();
await page.waitForFunction(() => window.homestead);
check(await page.evaluate((n) => window.homestead.state.homesteadNumber === n && window.homestead.state.legacy.cycle === 3, num), 'reload keeps the new homestead');

console.log('errors', JSON.stringify(errors));
await browser.close();
