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

test('card picker metadata links to the standalone card repository', async () => {
  const source = await readFile(new URL('src/index.js', root), 'utf8');
  assert.match(source, /documentationURL:'https:\/\/github\.com\/ivanlee1007\/uninus-greenhouse-rollup-card'/);
});
