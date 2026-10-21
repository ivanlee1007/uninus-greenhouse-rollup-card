import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
const {window}=parseHTML('<html><body></body></html>');
Object.assign(globalThis,{window,document:window.document,HTMLElement:window.HTMLElement,CustomEvent:window.CustomEvent,customElements:window.customElements});
const {UninusGreenhouseRollupCardEditor}=await import('../src/editor.js');
customElements.define('climate-editor-test',UninusGreenhouseRollupCardEditor);
customElements.define('ha-entity-picker',class extends HTMLElement{});

test('editor associates selected sensor and saves/reopens/clears without changing cover metadata or backend writes',()=>{
  const editor=document.createElement('climate-editor-test');document.body.append(editor);
  editor.setConfig({items:[{id:'roof',name:'Custom',cover_entity:'cover.roof',percentage_mode:'reversed'}]});
  let writes=0;editor.hass={states:{},callService:()=>writes++};
  const saves=[];editor.addEventListener('config-changed',e=>saves.push(e.detail.config));
  // Exercise the real editor event path before inspecting markup.
  const picker=editor.shadowRoot.querySelector('[data-property="climate_entity"]');
  if(picker)picker.dispatchEvent(new CustomEvent('value-changed',{detail:{value:'sensor.roof_climate'},bubbles:true}));
  assert.equal(saves.at(-1)?.items[0].climate_entity,'sensor.roof_climate');
  assert.deepEqual(picker.includeDomains,['sensor']);
  assert.equal(saves.at(-1).items[0].cover_entity,'cover.roof');
  assert.equal(saves.at(-1).items[0].percentage_mode,'reversed');
  assert.equal(saves.at(-1).items[0].name,'Custom');
  editor.setConfig(saves.at(-1));
  let current=editor.shadowRoot.querySelector('[data-property="climate_entity"]');
  assert.equal(current.value,'sensor.roof_climate');
  current.dispatchEvent(new window.Event('change',{bubbles:true}));
  assert.equal(editor.shadowRoot.querySelector('[data-property="climate_entity"]'),current);
  current.dispatchEvent(new CustomEvent('value-changed',{detail:{value:''},bubbles:true}));
  assert.equal(saves.at(-1).items[0].climate_entity,'');
  assert.equal(writes,0);
  assert.doesNotMatch(editor.shadowRoot.innerHTML,/temperature_threshold|humidity_threshold|rain_threshold/);
  editor.remove();
});

test('editor display toggles and bounded hold duration are typed saved and reopened',()=>{
  const editor=document.createElement('climate-editor-test');editor.setConfig({items:[]});
  let saved;editor.addEventListener('config-changed',e=>saved=e.detail.config);
  for(const property of ['show_target_controls','show_climate_controls']){
    const toggle=editor.shadowRoot.querySelector(`[data-property="${property}"]`);
    if(toggle){toggle.checked=true;toggle.dispatchEvent(new window.Event('change',{bubbles:true}));}
    assert.equal(saved?.[property],true);
  }
  const hold=editor.shadowRoot.querySelector('[data-property="climate_hold_seconds"]');
  assert.equal(hold.getAttribute('min'),'1');assert.equal(hold.getAttribute('max'),'86400');
  hold.value='60';hold.dispatchEvent(new window.Event('change',{bubbles:true}));
  assert.equal(saved.climate_hold_seconds,60);
  editor.setConfig(saved);assert.equal(editor.shadowRoot.querySelector('[data-property="climate_hold_seconds"]').value,'60');
});

test('late detached picker events cannot replace a newer editor association',()=>{
  const editor=document.createElement('climate-editor-test');editor.setConfig({items:[{id:'roof',cover_entity:'cover.roof',climate_entity:'sensor.old'}]});
  const stale=editor.shadowRoot.querySelector('[data-property="climate_entity"]');
  editor.setConfig({items:[{id:'roof',cover_entity:'cover.roof',climate_entity:'sensor.new'}]});
  let saves=0;editor.addEventListener('config-changed',()=>saves++);
  if(stale)editor._handleChange({target:stale,type:'value-changed',detail:{value:'sensor.stale'}});
  assert.equal(editor._config.items[0].climate_entity,'sensor.new');
  assert.equal(saves,0);
});
