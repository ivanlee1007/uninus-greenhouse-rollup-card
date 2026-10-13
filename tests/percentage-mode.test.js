import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeConfig,configForSave,addItem} from '../src/model.js';

test('percentage display defaults to normal and independently saves per-item reversed mode',()=>{
 const c=normalizeConfig({items:[{id:'a'},{id:'b',percentage_mode:'reversed'},{id:'c',percentage_mode:'invalid'}]});
 assert.deepEqual(c.items.map(i=>i.percentage_mode),['normal','reversed','normal']);
 assert.equal(configForSave(c).items[1].percentage_mode,'reversed');
 assert.equal(addItem(c).items.at(-1).percentage_mode,'normal');
 assert.equal(normalizeConfig({faces:[{key:'east'}]}).items[0].percentage_mode,'normal');
});
