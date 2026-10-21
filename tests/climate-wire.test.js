import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInThisContext} from 'node:vm';
import {parseHTML} from 'linkedom';
const fixture=JSON.parse(await readFile(new URL('./fixtures/climate-wire-acceptance.json',import.meta.url),'utf8'));
const {window}=parseHTML('<html><body></body></html>');
Object.assign(globalThis,{window,document:window.document,HTMLElement:window.HTMLElement,CustomEvent:window.CustomEvent,customElements:window.customElements});
runInThisContext(await readFile(new URL('../uninus-greenhouse-rollup-card.js',import.meta.url),'utf8'));
for(const scenario of fixture.cases)test(`shipped wire fixture: ${scenario.id}`,async()=>{
  const card=document.createElement('uninus-greenhouse-rollup-card');
  const config=structuredClone(fixture.config),states=structuredClone(fixture.states);
  if(scenario.items)config.items=scenario.items;
  if(scenario.sensor_attributes)Object.assign(states['sensor.roof_climate'].attributes,scenario.sensor_attributes);
  if(scenario.drop_sensor)delete states['sensor.roof_climate'];
  Object.assign(states,scenario.extra_states);
  const calls=[];
  card.setConfig(config);
  card.hass={user:{id:'admin',is_admin:true},states,services:fixture.services,callService:async(...args)=>{calls.push(args);if(scenario.reject_services?.includes(args[1]))throw new Error('Unauthorized')}};
  document.body.append(card);
  globalThis.confirm=()=>scenario.confirm===true;
  try{
    const button=card.shadowRoot.querySelector(scenario.selector);assert.ok(button,scenario.selector);
    button.click();await new Promise(resolve=>setTimeout(resolve,0));
    assert.deepEqual(calls,scenario.expected_calls);
    if(scenario.error_contains)assert.ok(card.shadowRoot.querySelector('.climate-error').textContent.includes(scenario.error_contains));
    if(!scenario.drop_sensor)assert.equal(states['sensor.roof_climate'].attributes.mode,'shadow','no optimistic mode mutation');
  }finally{card.remove();delete globalThis.confirm;}
});
