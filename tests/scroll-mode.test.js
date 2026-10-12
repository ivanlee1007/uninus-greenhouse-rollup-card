import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeConfig, configForSave, addItem } from '../src/model.js';

test('scroll mode defaults to vertical and validates per-item modes independently of compass direction', () => {
  const config = normalizeConfig({items: [
    {id:'a', direction:'E'}, {id:'b', scroll_mode:'horizontal', direction:'N'},
    {id:'c', scroll_mode:'invalid'}, {id:'d', scroll_mode:null},
  ]});
  assert.deepEqual(config.items.map(i => i.scroll_mode), ['vertical','horizontal','vertical','vertical']);
  assert.equal(config.items[1].direction, 'N');
  assert.equal(configForSave(config).items[1].scroll_mode, 'horizontal');
  assert.equal(addItem(config).items.at(-1).scroll_mode, 'vertical');
  assert.equal(normalizeConfig({faces:[{key:'east'}]}).items[0].scroll_mode, 'vertical');
});
