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
let browser;
let cases = 0;
try {
  browser = await chromium.launch(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {});
  for (const entry of ['source', 'bundle']) {
    const page = await browser.newPage({ viewport: { width: 1500, height: 1600 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.addScriptTag({ type: 'module', content: entry === 'source'
      ? "import { UninusGreenhouseRollupCard } from '/card.js'; customElements.define('uninus-greenhouse-rollup-card', UninusGreenhouseRollupCard);"
      : "import '/bundle.js';" });
    await page.evaluate(() => customElements.whenDefined('uninus-greenhouse-rollup-card'));
    await page.evaluate(() => {
      const card = document.createElement('uninus-greenhouse-rollup-card');
      card.style.width = '1020px';
      card.setConfig({ title: '溫室側簾捲揚', theme: 'uninus', items_per_row: 'auto', items: ['東側捲揚', '南側捲揚', '西側', '溫室捲揚'].map((name, i) => ({ id: `item${i}`, name, cover_entity: `cover.item${i}` })) });
      card.hass = { states: Object.fromEntries(['open', 'opening', 'closed', 'unavailable'].map((state, i) => [`cover.item${i}`, { state, attributes: { current_position: i === 3 ? null : 50, supported_features: 11 } }])) };
      document.body.append(card);
    });
    // Resize the same connected card in both directions; do not set its class manually.
    for (const width of [1020, 980, 961, 960, 820, 725, 724, 500, 475, 474, 360, 320, 961, 1280]) {
      await page.locator('uninus-greenhouse-rollup-card').evaluate((card, width) => { card.style.width = `${width}px`; }, width);
      await page.waitForFunction(width => {
        const card = document.querySelector('uninus-greenhouse-rollup-card');
        return card._lastRect.width === width;
      }, width);
      const geometry = await page.evaluate(() => {
        const card = document.querySelector('uninus-greenhouse-rollup-card');
        const root = card.shadowRoot;
        const rect = el => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height }; };
        const grid = root.querySelector('.faces');
        return {
          host: rect(card), outer: rect(root.querySelector('.rollup-card')), grid: rect(grid), gap: parseFloat(getComputedStyle(grid).columnGap),
          layout: card._layout,
          faces: [...root.querySelectorAll('.face')].map(face => ({ ...rect(face),
            children: [...face.querySelectorAll('.face-head,.scene,.foot,.controls,button,.motion')].map(rect),
            icon: rect(face.querySelector('.compass')), status: rect(face.querySelector('.motion')),
          })),
        };
      });
      // Derive the expected count from the browser's actual box model, independently of selectLayout.
      const columns = Math.max(1, Math.min(4, Math.floor((geometry.grid.width + geometry.gap) / (220 + geometry.gap))));
      const label = `${entry} auto width=${width}px`;
      assert.equal(geometry.layout, `columns-${columns}`, `${label}: does not use available tile space ${JSON.stringify({host:geometry.host,grid:geometry.grid,gap:geometry.gap})}`);
      if (width >= 961) assert.equal(columns, 4, `${label}: expected four tiles in one row`);
      assert.equal(new Set(geometry.faces.map(f => Math.round(f.top))).size, Math.ceil(4 / columns), `${label}: wrong row count`);
      assert.ok(geometry.host.height >= geometry.outer.height - 1, `${label}: host intrinsic height did not follow rows`);
      for (const face of geometry.faces) {
        assert.ok(face.width >= 219.9, `${label}: tile below readable minimum`);
        assert.ok(face.left >= geometry.grid.left - 1 && face.right <= geometry.grid.right + 1 && face.bottom <= geometry.outer.bottom + 1, `${label}: tile clipped`);
        for (const child of face.children) {
          assert.ok(child.left >= face.left - 1 && child.right <= face.right + 1 && child.bottom <= face.bottom + 1, `${label}: child clipped`);
        }
        if (columns === 4) assert.ok(face.status.top < face.icon.bottom && face.status.bottom > face.icon.top, `${label}: four-column status should fit next to title`);
      }
      if (process.env.LAYOUT_SCREENSHOT_DIR && entry === 'bundle' && [1020, 360].includes(width)) {
        await page.locator('uninus-greenhouse-rollup-card').screenshot({ path: `${process.env.LAYOUT_SCREENSHOT_DIR}/rollup-auto-${width}.png` });
      }
      cases++;
      console.log(`PASS ${label}: ${columns} columns, tile=${geometry.faces[0].width.toFixed(2)}px`);
    }
    assert.deepEqual(errors, [], `${entry}: browser runtime errors`);
    await page.close();
  }
  console.log(`Passed ${cases} adaptive layout resize scenarios (source + shipped bundle).`);
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
