import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const server = createServer(async (req, res) => {
  if (req.url === '/') { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><html><body style="margin:0"></body></html>'); return; }
  const files = { '/card.js': '../src/card.js', '/model.js': '../src/model.js', '/bundle.js': '../uninus-greenhouse-rollup-card.js' };
  if (!files[req.url]) { res.writeHead(404).end(); return; }
  res.setHeader('Content-Type', 'text/javascript');
  res.end(await readFile(new URL(files[req.url], import.meta.url)));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
let cases = 0;
try {
  browser = await chromium.launch(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {});
  for (const entry of ['source', 'bundle']) {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.addScriptTag({ type: 'module', content: entry === 'source'
      ? "import { UninusGreenhouseRollupCard } from '/card.js'; customElements.define('uninus-greenhouse-rollup-card', UninusGreenhouseRollupCard);"
      : "import '/bundle.js';" });
    await page.evaluate(() => customElements.whenDefined('uninus-greenhouse-rollup-card'));
    for (const columns of [3, 4, 1, 2]) {
      for (const width of [440, 270, 180]) {
        for (const name of ['東側', 'Relay-4FA5 cover0(hh) — 很長的溫室捲揚控制名稱 — 超長名稱測試確保省略顯示而不擠掉右上角狀態']) {
          const geometry = await page.evaluate(async ({ columns, width, name }) => {
            document.body.replaceChildren();
            const card = document.createElement('uninus-greenhouse-rollup-card');
            card.style.width = '1400px';
            card.setConfig({ items_per_row: columns, items: [{ id: 'east', name, cover_entity: 'cover.east' }] });
            card.hass = { states: { 'cover.east': { state: 'open', attributes: { current_position: 50, supported_features: 11 } } } };
            document.body.append(card);
            await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
            const root = card.shadowRoot;
            // Isolate tile width from the outer dashboard's column-selection policy.
            root.querySelector('.rollup-card').className = `rollup-card columns-${columns}`;
            root.querySelector('.faces').style.gridTemplateColumns = `${width}px`;
            const rect = selector => { const r = root.querySelector(selector).getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width }; };
            const title = root.querySelector('.name');
            return { face: rect('.face'), head: rect('.face-head'), icon: rect('.compass'), title: rect('.name'), status: rect('.motion'), ellipsis: getComputedStyle(title).textOverflow, clipped: title.scrollWidth > title.clientWidth };
          }, { columns, width, name });
          const label = `${entry}: columns=${columns}, tile=${width}px, ${name}`;
          const { face, head, icon, title, status } = geometry;
          if (width >= 270) {
            assert.ok(status.top < icon.bottom && status.bottom > icon.top, `${label}: status incorrectly moved to second row`);
            assert.ok(status.left >= title.right - 1, `${label}: title overlaps status`);
            if (name.length > 10) { assert.equal(geometry.ellipsis, 'ellipsis'); assert.equal(geometry.clipped, true, `${label}: long name should truncate`); }
          } else {
            assert.ok(status.top >= icon.bottom, `${label}: narrow tile should wrap status`);
          }
          for (const child of [icon, title, status]) {
            assert.ok(child.left >= head.left - 1 && child.right <= head.right + 1 && child.bottom <= head.bottom + 1, `${label}: header child overflow`);
          }
          assert.ok(status.width < face.width / 2, `${label}: status stretched across tile`);
          assert.ok(Math.abs(status.right - head.right) <= 1, `${label}: status not right aligned`);
          cases++;
          console.log(`PASS ${label}`);
        }
      }
    }
    assert.deepEqual(errors, [], `${entry}: browser errors`);
    await page.close();
  }
  console.log(`Passed ${cases} header layout scenarios (source + shipped bundle).`);
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
