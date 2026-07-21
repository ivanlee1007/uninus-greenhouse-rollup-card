import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), 'utf8');
}

test('card exposes Home Assistant custom-card lifecycle and responsive observer', async () => {
  const text = await source('src/card.js');
  for (const marker of ['getConfigElement', 'getStubConfig', 'getGridOptions', 'ResizeObserver', 'connectedCallback', 'disconnectedCallback']) {
    assert.match(text, new RegExp(marker));
  }
});

test('card uses inline containment so responsive rows keep intrinsic height', async () => {
  const text = await source('src/card.js');
  assert.match(text, /container-type:inline-size/);
  assert.doesNotMatch(text, /container-type:size/);
  assert.doesNotMatch(text, /cqh/);
});

test('editor exposes adaptive layout, optional global controls, subtitle, per-face entity and color controls', async () => {
  const text = await source('src/editor.js');
  for (const marker of ['subtitle_attribute', 'items_per_row', '每列捲揚數量', 'show_global_controls', '全開／全停／全關', 'status_moving_color', 'background_color', 'cover_entity', '標準 Cover Entity', 'motion_entity', 'max_entity', 'accent_color', 'ha-entity-picker', 'config-changed']) {
    assert.match(text, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.doesNotMatch(text, /force_1x4/);
});

test('integration faces expose explicit open stop close controls through cover services', async () => {
  const text = await source('src/card.js');
  for (const marker of ['data-action="open"', 'data-action="stop"', 'data-action="close"', "callService('cover'", 'coverServiceForAction', 'commandLabel', 'confidenceLabel']) {
    assert.match(text, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('all three global controls share one action accent without status-color overrides', async () => {
  const text = await source('src/card.js');
  assert.match(text, /\.global-controls button\{[^}]*--global-accent:var\(--rollup-ui-accent\)/);
  assert.doesNotMatch(text, /\.global-(?:open|stop|close)\{--global-accent:/);
});

test('functional labels and icons use theme-safe UI accents instead of the bright roller color', async () => {
  const text = await source('src/card.js');
  assert.match(text, /--rollup-ui-accent:\$\{tokens\.uiAccent\}/);
  assert.match(text, /--rollup-ui-idle:\$\{tokens\.uiIdle\}/);
  assert.match(text, /--rollup-ui-danger:\$\{tokens\.uiDanger\}/);
  assert.match(text, /\.system\{[^}]*color:var\(--rollup-ui-accent\)/);
  assert.match(text, /\.global-controls button\{[^}]*--global-accent:var\(--rollup-ui-accent\)/);
  assert.match(text, /\.compass\{[^}]*color:var\(--face-ui-color\)/);
  assert.match(text, /\.motion\{[^}]*color:var\(--status-ui-color\)/);
  assert.match(text, /\.foot em\{[^}]*color:var\(--face-ui-color\)/);
  assert.match(text, /\.controls button\{[^}]*var\(--face-ui-color\)/);
  assert.match(text, /--face-ui-color:\$\{[^}]*var\(--rollup-ui-accent\)/);
  assert.match(text, /--status-ui-color:\$\{[^}]*var\(--rollup-ui-idle\)/);
  assert.match(text, /--status-ui-color:\$\{[^}]*var\(--rollup-ui-danger\)/);
  assert.doesNotMatch(text, /\.system\{[^}]*color:var\(--rollup-moving\)/);
});

test('disabled controls remain visibly distinguishable on light themes', async () => {
  const text = await source('src/card.js');
  assert.match(text, /\.controls button:disabled\{[^}]*opacity:\.52/);
  assert.match(text, /\.global-controls button:disabled\{[^}]*opacity:\.52/);
});

test('single-column mobile layout provides touch-sized cover and global controls', async () => {
  const text = await source('src/card.js');
  assert.match(text, /\.columns-1 \.global-controls button,\.columns-1 \.controls button\{min-height:44px/);
  assert.doesNotMatch(text, /\.columns-1 \.global-controls button,\.columns-1 \.controls button\{[^}]*font-size:\d/);
});

test('column layouts expose bounded readable type icon and control size profiles', async () => {
  const text = await source('src/card.js');
  assert.match(text, /\.header h2\{[^}]*font-size:clamp\(18px,[^,]+,24px\)/);
  assert.match(text, /\.columns-1\{[^}]*--ui-name-size:clamp\(16px,[^,]+,21px\)[^}]*--ui-icon-size:40px[^}]*--ui-control-size:13px[^}]*--ui-control-height:44px/);
  assert.match(text, /\.columns-2\{[^}]*--ui-name-size:clamp\(14px,[^,]+,17px\)[^}]*--ui-icon-size:34px[^}]*--ui-control-size:12px[^}]*--ui-control-height:38px/);
  assert.match(text, /\.columns-3\{[^}]*--ui-name-size:clamp\(13px,[^,]+,15px\)[^}]*--ui-icon-size:30px[^}]*--ui-control-size:11px[^}]*--ui-control-height:36px/);
  assert.match(text, /\.columns-4\{[^}]*--ui-name-size:clamp\(12px,[^,]+,14px\)[^}]*--ui-icon-size:28px[^}]*--ui-control-size:11px[^}]*--ui-control-height:34px/);
  assert.match(text, /\.compass\{[^}]*width:var\(--ui-icon-size\)[^}]*height:var\(--ui-icon-size\)/);
  assert.match(text, /\.name\{[^}]*font-size:var\(--ui-name-size\)/);
  assert.match(text, /\.controls button\{[^}]*min-height:var\(--ui-control-height\)[^}]*font-size:var\(--ui-control-size\)/);
});

test('card respects reduced motion and uses namespaced effect classes', async () => {
  const text = await source('src/card.js');
  assert.match(text, /prefers-reduced-motion/);
  assert.match(text, /rollup-air/);
  assert.doesNotMatch(text, /class="air"/);
});

test('index registers card, editor and visual picker metadata', async () => {
  const text = await source('src/index.js');
  assert.match(text, /customElements\.define/);
  assert.match(text, /uninus-greenhouse-rollup-card-editor/);
  assert.match(text, /window\.customCards/);
  assert.match(text, /UNiNUS Greenhouse Rollup Card/);
  assert.match(text, /preview:\s*true/);
});

test('card and editor use native Web Components to avoid HA Lit patch corruption', async () => {
  const card = await source('src/card.js');
  const editor = await source('src/editor.js');
  assert.doesNotMatch(card, /from ['"]lit['"]/);
  assert.doesNotMatch(editor, /from ['"]lit['"]/);
  assert.match(card, /extends HTMLElement/);
  assert.match(editor, /extends HTMLElement/);
  assert.match(card, /rollup-card/);
});
