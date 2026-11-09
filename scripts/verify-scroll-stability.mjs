import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { chromium, webkit } from 'playwright';

const server = createServer(async (req, res) => {
  if (req.url === '/') {
    res.setHeader('Content-Type', 'text/html');
    res.end('<!doctype html><html><body style="margin:0"></body></html>');
    return;
  }
  const files = { '/card.js': '../src/card.js', '/model.js': '../src/model.js', '/bundle.js': '../uninus-greenhouse-rollup-card.js' };
  if (!files[req.url]) { res.writeHead(404).end(); return; }
  res.setHeader('Content-Type', 'text/javascript');
  res.end(await readFile(new URL(files[req.url], import.meta.url)));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let failures = 0;
let cases = 0;
try {
  for (const engine of [webkit, chromium]) {
    const browser = await engine.launch();
    try {
      for (const entry of ['source', 'bundle']) {
        for (const nested of [false, true]) {
          for (const focused of [false, true]) {
            for (const width of [390, 1280]) {
              const label = `${engine.name()} ${entry} ${nested ? 'nested shadow scroller' : 'document'} focus=${focused} width=${width}`;
              const page = await browser.newPage({ viewport: { width, height: 700 }, hasTouch: true });
              const errors = [];
              page.on('pageerror', error => errors.push(error.message));
              try {
                await page.goto(`http://127.0.0.1:${server.address().port}/`);
                await page.addScriptTag({ type: 'module', content: entry === 'source'
                  ? "import { UninusGreenhouseRollupCard } from '/card.js'; customElements.define('uninus-greenhouse-rollup-card', UninusGreenhouseRollupCard);"
                  : "import '/bundle.js';" });
                await page.evaluate(() => customElements.whenDefined('uninus-greenhouse-rollup-card'));
                const result = await page.evaluate(async ({ nested, focused }) => {
                  const outer = nested ? document.body.appendChild(document.createElement('div')).attachShadow({ mode: 'open' }) : document.body;
                  const container = nested ? outer.appendChild(document.createElement('main')) : document.body;
                  if (nested) container.style.cssText = 'display:block;height:700px;overflow-y:scroll;position:relative';
                  const card = document.createElement('uninus-greenhouse-rollup-card');
                  card.setConfig({ items_per_row: 1, items: Array.from({ length: 12 }, (_, i) => ({ id: `item-${i}`, name: `Cover ${i}`, cover_entity: `cover.test${i}` })) });
                  const states = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`cover.test${i}`, { state: 'open', attributes: { current_position: 50, supported_features: 11 } }]));
                  const calls = [];
                  const callService = async (...args) => calls.push(args);
                  card.hass = { states, callService };
                  container.append(card);
                  const frame = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
                  await frame();
                  const root = card.shadowRoot.querySelector('.rollup-card');
                  const button = card.shadowRoot.querySelector('.controls button');
                  // Safari also fails without focus; test keyboard focus separately.
                  if (focused) button.focus();
                  await new Promise(resolve => setTimeout(resolve, 150));
                  const scroller = nested ? container : document.scrollingElement;
                  scroller.scrollTop = 1500;
                  await frame();
                  const before = scroller.scrollTop;
                  const samples = [];
                  for (let i = 0; i < 5; i++) {
                    states['cover.test0'] = { state: 'opening', attributes: { current_position: 51 + i, supported_features: 11 } };
                    card.hass = { states: { ...states }, callService };
                    await frame();
                    samples.push(scroller.scrollTop);
                  }
                  const retainedFocus = focused ? card.shadowRoot.activeElement === button : card.shadowRoot.activeElement === null;
                  const retainedNodes = root === card.shadowRoot.querySelector('.rollup-card') && button === card.shadowRoot.querySelector('.controls button');
                  const updated = card.shadowRoot.querySelector('.face').classList.contains('moving') && card.shadowRoot.querySelector('.percent').textContent === '55%';
                  // Reused nodes must not accumulate click handlers on each update.
                  let moreInfoCount = 0;
                  card.addEventListener('hass-more-info', () => moreInfoCount++);
                  card.shadowRoot.querySelector('.more-info').click();
                  card.shadowRoot.querySelector('.controls button[data-action="stop"]').click();
                  await frame();
                  samples.push(scroller.scrollTop);
                  return { before, samples, retainedFocus, retainedNodes, updated, moreInfoCount, calls };
                }, { nested, focused });
                console.log(`${label}: ${JSON.stringify(result)}`);
                assert.ok(result.before >= 1400, 'fixture must scroll beyond the first control');
                assert.ok(result.samples.every(y => Math.abs(y - result.before) <= 1), 'HA updates must not reset the scroll position');
                assert.equal(result.retainedFocus, true, 'keyboard focus must remain usable without stealing focus');
                assert.equal(result.retainedNodes, true, 'live updates must preserve the existing card and controls');
                assert.equal(result.updated, true, 'live position and motion must still update');
                assert.equal(result.moreInfoCount, 1, 'exactly one More Info event per click after repeated updates');
                assert.deepEqual(result.calls, [['cover', 'stop_cover', { entity_id: 'cover.test0' }]], 'exactly one service call, without event bubbling');
                assert.deepEqual(errors, [], 'no browser errors');
                cases++;
              } catch (error) { failures++; console.error(`FAIL ${label}: ${error.message}`); }
              finally { await page.close(); }
            }
          }
        }
      }
    } finally { await browser.close(); }
  }
} finally { await new Promise(resolve => server.close(resolve)); }
assert.equal(failures, 0, `${failures} scroll stability scenarios failed`);
console.log(`Passed ${cases} WebKit/Chromium scroll stability scenarios (source + shipped bundle).`);
