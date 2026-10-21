import test from 'node:test';
import assert from 'node:assert/strict';
import * as model from '../src/model.js';

test('climate association defaults and hold normalization preserve legacy identity and literal bad bindings', () => {
  const config=model.normalizeConfig({items:[{id:'roof',cover_entity:'cover.roof',percentage_mode:'reversed'},{id:'bad',cover_entity:'cover.bad',climate_entity:'switch.not_a_controller'}]});
  assert.equal(config.items[0].climate_entity,'');
  assert.equal(config.climate_hold_seconds,1800);
  assert.equal(config.items[0].id,'roof');
  assert.equal(config.items[0].percentage_mode,'reversed');
  assert.equal(config.items[1].climate_entity,'switch.not_a_controller');
  for(const value of [0,86401,1.2,null,true,'',Infinity]) assert.equal(model.normalizeConfig({items:[],climate_hold_seconds:value}).climate_hold_seconds,1800);
  for(const value of [1,1800,86400]) assert.equal(model.normalizeConfig({items:[],climate_hold_seconds:value}).climate_hold_seconds,value);
  assert.equal(model.normalizeConfig({items:[]}).show_target_controls,false);
  assert.equal(model.normalizeConfig({items:[]}).show_climate_controls,false);
  assert.equal(model.configForSave(config).items[0].cover_entity,'cover.roof');
});
