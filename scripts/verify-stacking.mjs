import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

// Real paint/hit testing: a DOM-only implementation cannot detect escaping z-index.
const server = createServer(async (req, res) => {
  const files = {
    '/card.js': '../src/card.js',
    '/model.js': '../src/model.js',
    '/bundle.js': '../uninus-greenhouse-rollup-card.js',
  };
  if (req.url === '/') {
    res.setHeader('Content-Type', 'text/html');
    res.end('<!doctype html><html><body></body></html>');
    return;
  }
  if (!files[req.url]) { res.writeHead(404).end(); return; }
  try {
    res.setHeader('Content-Type', 'text/javascript');
    res.end(await readFile(new URL(files[req.url], import.meta.url)));
  } catch { res.writeHead(500).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
let cases = 0;
try {
  browser = await chromium.launch(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {});
  for (const entry of ['source', 'bundle']) {
    for (const width of [360, 1280]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      await page.goto(`http://127.0.0.1:${server.address().port}/`);
      await page.addScriptTag({ type: 'module', content: entry === 'source'
        ? "import { UninusGreenhouseRollupCard } from '/card.js'; customElements.define('uninus-greenhouse-rollup-card', UninusGreenhouseRollupCard);"
        : "import '/bundle.js';" });
      await page.evaluate(() => customElements.whenDefined('uninus-greenhouse-rollup-card'));
      for (const scroll_mode of ['vertical', 'horizontal']) {
        for (const position of [0, 50, 100, null]) {
          await page.evaluate(({ scroll_mode, position }) => {
            document.body.replaceChildren();
            document.body.style.margin = '8px';
            const card = document.createElement('uninus-greenhouse-rollup-card');
            card.style.cssText = 'display:block;max-width:700px';
            card.setConfig({ items: [{ id: 'shade', name: '外遮蔭', cover_entity: 'cover.shade', scroll_mode }] });
            card.hass = {
              states: { 'cover.shade': { state: 'open', attributes: {
                current_position: position, supported_features: 11,
                position_is_estimated: true, position_confidence: 'calibrated', command_state: 'idle',
                auto_stop_at_travel_end: true, open_switch_entity: 'switch.up', close_switch_entity: 'switch.down',
                open_switch_on: false, close_switch_on: false,
              } } },
              services: { uninus_greenhouse_rollup: { set_auto_stop_at_travel_end: {} } },
              callService: async () => { window.serviceCalls += 1; },
            };
            window.serviceCalls = 0;
            window.moreInfoCalls = 0;
            card.addEventListener('hass-more-info', () => { window.moreInfoCalls += 1; });
            document.body.append(card);
          }, { scroll_mode, position });
          await page.locator('.scene').waitFor();
          const label = `${entry} ${width}px ${scroll_mode} position=${position}`;
          const points = await page.evaluate(() => {
            const root = document.querySelector('uninus-greenhouse-rollup-card').shadowRoot;
            return [...root.querySelectorAll('.percent,.scale,.roller,.scene')].map(el => {
              const r = el.getBoundingClientRect();
              return { name: el.className, x: r.x + r.width / 2, y: r.y + r.height / 2 };
            });
          });
          // A sibling overlay at z=1 must cover every internal layer, including z=7 labels.
          await page.evaluate(() => {
            const overlay = document.createElement('div');
            overlay.id = 'external-dialog';
            overlay.style.cssText = 'position:fixed;inset:0;z-index:1;background:white';
            document.body.append(overlay);
          });
          for (const point of points) {
            const top = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.id, point);
            assert.equal(top, 'external-dialog', `${label}: ${point.name} escaped above the external dialog`);
          }
          await page.mouse.click(points[0].x, points[0].y);
          assert.equal(await page.evaluate(() => window.moreInfoCalls), 0, `${label}: background received dialog click`);
          await page.locator('#external-dialog').evaluate(el => el.remove());
          // Closing the external dialog restores normal card interaction.
          await page.locator('.scene').click();
          assert.equal(await page.evaluate(() => window.moreInfoCalls), 1, `${label}: scene click no longer works`);
          // The card's own confirmation must still cover its scene after isolation.
          await page.locator('.auto-stop-switch').click();
          await page.locator('.auto-stop-dialog').waitFor();
          for (const point of points) {
            const covered = await page.evaluate(({ x, y }) => {
              const root = document.querySelector('uninus-greenhouse-rollup-card').shadowRoot;
              return Boolean(root.elementFromPoint(x, y)?.closest('.auto-stop-overlay'));
            }, point);
            assert.equal(covered, true, `${label}: scene escaped its internal confirmation`);
          }
          await page.locator('[data-auto-stop-cancel]').click();
          assert.equal(await page.locator('.auto-stop-overlay').count(), 0);
          assert.equal(await page.evaluate(() => window.serviceCalls), 0, `${label}: cancellation issued a command`);
          cases += 1;
          console.log(`PASS ${label}`);
        }
      }
      await page.close();
    }
  }
  console.log(`Passed ${cases} browser stacking scenarios (source + shipped bundle).`);
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
