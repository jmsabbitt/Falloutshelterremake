// Loads a URL in WebKit (Safari's engine) on an emulated iPhone and a desktop,
// twice each (the second load runs under the service worker), and prints every
// console message, page error and failed request, plus what booted.
import { webkit, devices } from 'playwright';

const url = process.argv[2] ?? 'https://jmsabbitt.github.io/Falloutshelterremake/';
const browser = await webkit.launch();
for (const [name, opts] of [['iphone', devices['iPhone 13']], ['desktop', { viewport: { width: 1280, height: 800 } }]]) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  page.on('console', (m) => console.log(`[${name}] console.${m.type()}: ${m.text().slice(0, 500)}`));
  page.on('pageerror', (e) => console.log(`[${name}] PAGEERROR: ${e.message}\n${(e.stack ?? '').slice(0, 1500)}`));
  page.on('requestfailed', (r) => console.log(`[${name}] REQUEST FAILED: ${r.url()} ${r.failure()?.errorText}`));
  page.on('response', (r) => { if (r.status() >= 400) console.log(`[${name}] HTTP ${r.status()}: ${r.url()}`); });
  for (let i = 1; i <= 2; i++) {
    if (i === 1) await page.goto(url, { waitUntil: 'load', timeout: 60000 });
    else await page.reload({ waitUntil: 'load', timeout: 60000 });
    await page.waitForTimeout(12000);
    const st = await page.evaluate(() => ({
      booted: !!window.__homesteadBooted,
      canvas: document.querySelectorAll('canvas').length,
      ui: document.getElementById('ui')?.children.length ?? -1,
      bootPanel: document.getElementById('boot-errors')?.innerText ?? null,
      sw: !!navigator.serviceWorker?.controller,
      webgl2: !!document.createElement('canvas').getContext('webgl2'),
    })).catch((e) => ({ evalError: String(e) }));
    console.log(`[${name}] load ${i}: ${JSON.stringify(st)}`);
    await page.screenshot({ path: `webkit-${name}-${i}.png` });
  }
  await ctx.close();
}
await browser.close();
