// End-to-end smoke test v Chromiu (Playwright).
//   npm run smoke                        -> spustí lokální server a otestuje ho
//   SMOKE_URL=https://... npm run smoke  -> otestuje běžící (např. produkční) URL
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from './serve.js';

const require = createRequire(import.meta.url);
const { chromium, devices } = require('playwright');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = process.env.SMOKE_SCREENSHOTS || path.join(ROOT, 'screenshots');

const passed = [];
const failures = [];
const check = (name, ok, detail = '') => (ok ? passed.push(name) : failures.push(`${name}${detail ? ` – ${detail}` : ''}`));
// Čeká na herní čas (ne na reálné ms): v headless prohlížeči bez GPU jsou snímky pomalé.
async function simWait(page, seconds) {
  await page.waitForFunction(
    (target) => window.__praha.state.elapsed >= target,
    (await page.evaluate(() => window.__praha.state.elapsed)) + seconds,
    { timeout: 90000 },
  );
}
const attr = (page, name) => page.getAttribute('body', `data-${name}`);

async function runChecks(browser, baseUrl, label, options) {
  const context = await browser.newContext(options);
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    // Očekávané: chybí reálná data praha.geojson, hra přepne na ukázková data.
    if (m.location().url.endsWith('/data/praha.geojson')) return;
    errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

  await page.goto(baseUrl, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__praha && document.body.dataset.status, null, { timeout: 15000 });

  check(`[${label}] český titulek`, (await page.title()).includes('Praha'));
  check(`[${label}] plátno je viditelné`, await page.locator('#scene').isVisible());
  check(`[${label}] hra začíná ve stavu playing`, (await attr(page, 'status')) === 'playing');
  check(`[${label}] HUD ukazuje koruny`, (await page.textContent('#coins')).trim() === '0');
  await page.waitForFunction(() => window.__praha.district, null, { timeout: 15000 });
  const counts = await page.evaluate(() => ({
    buildings: window.__praha.district.buildings.length,
    roads: window.__praha.district.roads.length,
    source: window.__praha.district.source,
  }));
  check(`[${label}] mapa je načtená (budovy a silnice)`, counts.buildings > 50 && counts.roads > 10, JSON.stringify(counts));
  check(`[${label}] zdroj dat je označen (ukázka, ne reálná Praha)`, counts.source === 'sample', counts.source);
  check(`[${label}] auto startuje na silnici mimo budovy`, await page.evaluate(() => {
    const s = window.__praha.state.car;
    return window.__praha.district.roads.some((r) => r.points.length > 1);
  }));

  // Jízda: plyn a zatáčení
  await simWait(page, 0.3);
  const startZ = await page.evaluate(() => window.__praha.state.car.z);
  await page.keyboard.down('w');
  await simWait(page, 2.5);
  await page.keyboard.up('w');
  const after = await page.evaluate(() => ({ z: window.__praha.state.car.z, speed: window.__praha.state.speed }));
  check(`[${label}] plyn (W) rozjede auto`, after.speed > 10, `rychlost ${after.speed.toFixed(1)} km/h`);
  check(`[${label}] auto se posunulo v prostoru`, Math.abs(after.z - startZ) > 5, `posun ${(after.z - startZ).toFixed(1)}`);

  await page.keyboard.down('d');
  await simWait(page, 0.5);
  await page.keyboard.up('d');
  const yaw = await page.evaluate(() => window.__praha.state.car.yaw);
  check(`[${label}] zatáčení (D) mění yaw`, Math.abs(yaw) > 0.05, `yaw ${yaw.toFixed(3)}`);

  // Dlouhá jízda: auto má dojet a nic nesmí spadnout
  await simWait(page, 1);
  const status = await attr(page, 'status');
  check(`[${label}] hra běží dál (stav playing/wrecked)`, status === 'playing' || status === 'wrecked', `stav ${status}`);
  check(`[${label}] render smyčka tiká (uplynulý čas roste)`, (await page.evaluate(() => window.__praha.state.elapsed)) > 2);

  await page.screenshot({ path: path.join(SHOTS, `${label}.png`) });

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(`[${label}] žádné vodorovné posouvání`, overflow <= 0, `přetečení ${overflow}px`);
  check(`[${label}] žádné chyby v konzoli`, errors.length === 0, errors.join(' | '));
  await context.close();
}

async function main() {
  let server = null;
  let baseUrl = process.env.SMOKE_URL;
  if (!baseUrl) ({ server, url: baseUrl } = await startServer(0));
  console.log(`Smoke test proti ${baseUrl}`);

  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    await runChecks(browser, baseUrl, 'desktop', { viewport: { width: 1280, height: 800 } });
    await runChecks(browser, baseUrl, 'mobil', { ...devices['iPhone 13'] });
  } finally {
    await browser.close();
    if (server) server.close();
  }

  console.log(`\nProšlo: ${passed.length}`);
  passed.forEach((p) => console.log(`  ✔ ${p}`));
  if (failures.length) {
    console.log(`\nSelhalo: ${failures.length}`);
    failures.forEach((f) => console.log(`  ✘ ${f}`));
    process.exitCode = 1;
  } else console.log('\nVše v pořádku.');
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
