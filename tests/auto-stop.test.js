import test from 'node:test';
import assert from 'node:assert/strict';
import * as model from '../src/model.js';

export const managed = (enabled = true, attrs = {}, state = 'open') => ({ state, attributes: {
  position_is_estimated: true, auto_stop_at_travel_end: enabled,
  open_switch_entity: 'switch.up', close_switch_entity: 'switch.down',
  open_switch_on: false, close_switch_on: false, current_position: 100,
  command_state: 'idle', supported_features: 11, ...attrs,
} });

test('auto-stop model supports only managed dual-switch covers and represents unknown values', () => {
  assert.equal(typeof model.resolveAutoStopState, 'function');
  const item = {entity_mode:'cover_entity', cover_entity:'cover.roof'};
  const resolve = (cover) => model.resolveAutoStopState(item, {'cover.roof':cover});
  assert.deepEqual(resolve(managed()), {entityId:'cover.roof', supported:true, enabled:true, busy:false, available:true, known:true});
  assert.equal(resolve(managed(false)).enabled, false);
  assert.equal(resolve(managed('true')).known, false);
  assert.equal(resolve(managed(true,{position_is_estimated:false})).supported, false);
  assert.equal(resolve(managed(true,{open_switch_entity:'sensor.up'})).supported, false);
  assert.equal(resolve(managed(true,{close_switch_entity:'switch.up'})).supported, false);
  assert.equal(resolve(managed(true,{open_switch_on:true})).busy, true);
  assert.equal(resolve(managed(true,{open_switch_on:null})).known, false);
  assert.equal(resolve(managed(true,{},'opening')).busy, true);
  assert.equal(resolve(managed(true,{},'unavailable')).available, false);
  assert.equal(resolve(managed(true,{},'unknown')).available, false);
});
