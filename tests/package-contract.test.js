import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);

test('HACS metadata, package and built card agree', async () => {
  const [pkg, hacs, readme, bundle] = await Promise.all([
    readFile(new URL('package.json', root), 'utf8').then(JSON.parse),
    readFile(new URL('hacs.json', root), 'utf8').then(JSON.parse),
    readFile(new URL('README.md', root), 'utf8'),
    readFile(new URL('uninus-greenhouse-rollup-card.js', root), 'utf8'),
  ]);

  assert.equal(pkg.main, 'uninus-greenhouse-rollup-card.js');
  assert.equal(hacs.filename, pkg.main);
  assert.match(bundle.split('\n')[0], new RegExp(`v${pkg.version.replaceAll('.', '\\.')}`));
  assert.match(readme, /HACS/);
  assert.match(readme, /Dashboard/);
  assert.match(readme, /自動加入.*資源/);
});

test('README documents the visual editor and exact items per row', async () => {
  const readme = await readFile(new URL('README.md', root), 'utf8');
  assert.match(readme, /視覺化設定/);
  assert.match(readme, /每列捲揚數量/);
  assert.match(readme, /最多 4/);
  assert.match(readme, /items_per_row/);
  assert.match(readme, /固定產生 1～4 欄/);
  assert.match(readme, /原生 MQTT Cover/);
  assert.match(readme, /舊版雙 Switch/);
  assert.doesNotMatch(readme, /force_1x4/);
});

test('README documents optional global controls and their card-only scope', async () => {
  const readme = await readFile(new URL('README.md', root), 'utf8');
  assert.match(readme, /show_global_controls/);
  assert.match(readme, /全開.*全停.*全關/);
  assert.match(readme, /只控制.*卡片.*cover/i);
});

test('README documents adaptive card-width layout and mobile touch behavior', async () => {
  const readme = await readFile(new URL('README.md', root), 'utf8');
  assert.match(readme, /items_per_row:\s*auto/);
  assert.match(readme, /自適應.*卡片.*寬度/s);
  assert.match(readme, /手機.*單欄.*44px/s);
});

test('README documents bounded eyesight-friendly typography and icon scaling', async () => {
  const readme = await readFile(new URL('README.md', root), 'utf8');
  assert.match(readme, /視力友善.*字體.*icon/s);
  assert.match(readme, /1 欄.*16px.*40px.*44px/s);
  assert.match(readme, /4 欄.*12px.*28px.*34px/s);
  assert.match(readme, /高度.*自然延展.*不.*縮小字體/s);
});

test('README documents high-contrast light themes and the official Uninus palette', async () => {
  const readme = await readFile(new URL('README.md', root), 'utf8');
  assert.match(readme, /雲霧白.*#155f55/s);
  assert.match(readme, /暖陶米.*#6d4a0c/s);
  assert.match(readme, /https:\/\/www\.uninus\.com\.tw\//);
  assert.match(readme, /Uninus.*#ff8754.*#3074c1.*#285f9e/s);
  assert.match(readme, /disabled.*\.52/s);
});

test('card picker metadata links to the standalone card repository', async () => {
  const source = await readFile(new URL('src/index.js', root), 'utf8');
  assert.match(source, /documentationURL:'https:\/\/github\.com\/ivanlee1007\/uninus-greenhouse-rollup-card'/);
});
