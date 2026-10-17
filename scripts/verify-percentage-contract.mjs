import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const server = createServer(async (req, res) => {
  if (req.url === '/') { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><html lang="zh-Hant"><body style="margin:0;font-family:Arial,sans-serif"></body></html>'); return; }
  const files = { '/card.js': '../src/card.js', '/model.js': '../src/model.js', '/bundle.js': '../uninus-greenhouse-rollup-card.js' };
  if (!files[req.url]) { res.writeHead(404).end(); return; }
  res.setHeader('Content-Type', 'text/javascript');
  res.end(await readFile(new URL(files[req.url], import.meta.url)));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const managed = { position_is_estimated: true, position_confidence: 'calibrated', command_state: 'idle', supported_features: 11 };
const scenarios = [
  ...[[0, 100], [25, 75], [100, 0], [25, 73]].map(([current_position, coverage_position]) => ({ name: `backend ${current_position}/${coverage_position}`, state: 'open', attributes: { ...managed, current_position, coverage_position }, expected: coverage_position })),
  { name: 'old integration', state: 'open', attributes: { ...managed, current_position: 25 }, expected: 75 },
  { name: 'native Cover', state: 'open', attributes: { current_position: 25, supported_features: 11 }, expected: 75 },
  { name: 'explicit unknown coverage', state: 'open', attributes: { ...managed, current_position: 25, coverage_position: null }, expected: null },
  { name: 'unknown opening', state: 'unknown', attributes: { ...managed, current_position: null, coverage_position: null }, expected: null },
  { name: 'unavailable', state: 'unavailable', attributes: { ...managed, current_position: 25, coverage_position: 75 }, expected: null },
];
if (process.env.COVERAGE_FIXTURE_PATH) {
  const fixture = JSON.parse(await readFile(process.env.COVERAGE_FIXTURE_PATH, 'utf8'));
  console.log(`Fixture provenance: ${fixture.provenance}`);
  for (const [name, cover] of Object.entries(fixture.fixtures)) {
    scenarios.push({ name: `backend getter fixture ${name}`, state: cover.state, attributes: cover.attributes, expected: cover.state === 'unavailable' ? null : cover.attributes.coverage_position });
  }
}
let browser;
let cases = 0;
try {
  browser = await chromium.launch(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {});
  for (const entry of ['source', 'bundle']) {
    const page = await browser.newPage({ viewport: { width: 1100, height: 1200 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.addScriptTag({ type: 'module', content: entry === 'source'
      ? "import { UninusGreenhouseRollupCard } from '/card.js'; customElements.define('uninus-greenhouse-rollup-card', UninusGreenhouseRollupCard);"
      : "import '/bundle.js';" });
    await page.evaluate(() => customElements.whenDefined('uninus-greenhouse-rollup-card'));
    for (const scenario of scenarios) for (const width of [360, 1020]) {
      const actual = await page.evaluate(async ({ scenario, width }) => {
        document.body.replaceChildren();
        const card = document.createElement('uninus-greenhouse-rollup-card');
        card.style.width = `${width}px`;
        card.setConfig({ title: '同一 Cover 的兩種位置指標', theme: 'uninus', items_per_row: 'auto', items: ['normal', 'reversed'].map(percentage_mode => ({ id: percentage_mode, name: percentage_mode === 'normal' ? '開啟率' : '覆蓋率', cover_entity: 'cover.test', percentage_mode })) });
        window.coverageCalls = [];
        window.coverageMoreInfo = 0;
        card.hass = { states: { 'cover.test': { state: scenario.state, attributes: scenario.attributes } }, callService: async (...args) => { window.coverageCalls.push(args); } };
        card.addEventListener('hass-more-info', () => { window.coverageMoreInfo++; });
        document.body.append(card);
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        return [...card.shadowRoot.querySelectorAll('.face')].map(face => ({ percent: face.querySelector('.percent').textContent, label: face.querySelector('.copy strong').textContent, aria: face.querySelector('.scene').getAttribute('aria-label'), style: face.getAttribute('style'), overflow: face.scrollWidth > face.clientWidth + 1 }));
      }, { scenario, width });
      const label = `${entry} ${width}px ${scenario.name}`;
      assert.equal(actual[1].percent, scenario.expected === null ? '—' : `${scenario.expected}%`, `${label}: coverage source`);
      if (scenario.expected !== null) {
        assert.match(actual[1].label, new RegExp(`覆蓋率 ${scenario.expected}%`), label);
        assert.match(actual[0].label, /開啟率/, label);
        assert.match(actual[1].aria, /覆蓋率/, label);
      }
      for (const face of actual) assert.equal(face.overflow, false, `${label}: tile overflow`);
      if (scenario.name === 'backend 25/73') {
        assert.match(actual[1].style, /--open:25%/, `${label}: geometry changed`);
        for (const action of ['open', 'stop', 'close']) await page.locator(`.face >> nth=1 >> [data-action="${action}"]`).click();
        assert.deepEqual(await page.evaluate(() => window.coverageCalls), ['open_cover', 'stop_cover', 'close_cover'].map(service => ['cover', service, { entity_id: 'cover.test' }]), `${label}: service semantics changed`);
        assert.equal(await page.evaluate(() => window.coverageMoreInfo), 0, `${label}: controls opened More Info`);
      }
      if (process.env.LAYOUT_SCREENSHOT_DIR && entry === 'bundle' && width === 1020 && scenario.name === 'backend 100/0') {
        await page.locator('uninus-greenhouse-rollup-card').screenshot({ path: `${process.env.LAYOUT_SCREENSHOT_DIR}/rollup-coverage-contract.png` });
      }
      cases++;
      console.log(`PASS ${label}`);
    }
    assert.deepEqual(errors, [], `${entry}: browser errors`);
    await page.close();
  }
  console.log(`Passed ${cases} percentage contract browser scenarios (source + shipped bundle).`);
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
