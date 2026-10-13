import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
const {window}=parseHTML('<html><body></body></html>');
Object.assign(globalThis,{window,document:window.document,HTMLElement:window.HTMLElement,CustomEvent:window.CustomEvent,customElements:window.customElements});
customElements.define('ha-entity-picker',class extends HTMLElement {});
const {UninusGreenhouseRollupCardEditor}=await import('../src/editor.js');
customElements.define('picker-events-editor',UninusGreenhouseRollupCardEditor);

test('native picker blur change must not detach picker before authoritative value-changed',()=>{
 const editor=document.createElement('picker-events-editor');document.body.append(editor);
 editor.setConfig({subtitle_entity:'',items:[]});editor.hass={states:{}};
 const saves=[];editor.addEventListener('config-changed',e=>saves.push(e.detail.config));
 const picker=editor.shadowRoot.querySelector('[data-property="subtitle_entity"]');
 picker.dispatchEvent(new window.Event('change',{bubbles:true}));
 assert.equal(saves.length,0,'search blur is not a config change');
 assert.equal(picker.isConnected,true,'picker must survive blur until selection is published');
 const id='device_tracker.relay_z9r8_relay_z9r8_state';
 picker.value=id;picker.dispatchEvent(new window.CustomEvent('value-changed',{detail:{value:id},bubbles:true}));
 assert.equal(saves.at(-1).subtitle_entity,id);
 editor.setConfig(saves.at(-1));
 assert.equal(editor.shadowRoot.querySelector('[data-property="subtitle_entity"]').value,id);
 editor.remove();
});

test('all entity fields ignore native changes but retain authoritative selection and explicit clearing',()=>{
 const editor=document.createElement('picker-events-editor');document.body.append(editor);
 editor.setConfig({subtitle_entity:'sensor.old',items:[{id:'cover',cover_entity:'cover.old'},{id:'legacy',entity_mode:'position_entity',entity:'sensor.old',motion_entity:'binary_sensor.old',max_entity:'input_number.old'}]});
 editor.hass={states:{'cover.new':{attributes:{friendly_name:'New cover'}}}};
 const saves=[];editor.addEventListener('config-changed',e=>saves.push(e.detail.config));
 for(const [property,id] of [['subtitle_entity','device_tracker.relay_z9r8_relay_z9r8_state'],['cover_entity','cover.new'],['entity','sensor.new'],['motion_entity','binary_sensor.new'],['max_entity','input_number.new']]){
   let picker=editor.shadowRoot.querySelector(`[data-property="${property}"]`);
   const before=saves.length;
   picker.dispatchEvent(new window.CustomEvent('change',{detail:{},bubbles:true}));
   assert.equal(saves.length,before,property);
   picker.value=id;picker.dispatchEvent(new window.CustomEvent('value-changed',{detail:{value:id},bubbles:true}));
   picker=editor.shadowRoot.querySelector(`[data-property="${property}"]`);
   assert.equal(picker.value,id,property);
   picker.dispatchEvent(new window.CustomEvent('value-changed',{detail:{value:''},bubbles:true}));
   assert.equal(editor.shadowRoot.querySelector(`[data-property="${property}"]`).value,'',`clear ${property}`);
 }
 assert.equal(editor._config.items.find(i=>i.id==='cover').name,'New cover');
 editor.remove();
});

test('ordinary text select boolean and number change events still work',()=>{
 const editor=document.createElement('picker-events-editor');document.body.append(editor);
 editor.setConfig({items:[{id:'legacy',entity_mode:'position_entity'}]});editor.hass={states:{}};
 const saves=[];editor.addEventListener('config-changed',e=>saves.push(e.detail.config));
 const title=editor.shadowRoot.querySelector('[data-property="title"]');title.value='Changed';title.dispatchEvent(new window.Event('change',{bubbles:true}));
 assert.equal(saves.at(-1).title,'Changed');
 const toggle=editor.shadowRoot.querySelector('[data-property="animation"]');toggle.checked=false;toggle.dispatchEvent(new window.Event('change',{bubbles:true}));
 assert.equal(saves.at(-1).animation,false);
 const maximum=editor.shadowRoot.querySelector('[data-property="max_value"]');maximum.value='280';maximum.dispatchEvent(new window.Event('change',{bubbles:true}));
 assert.equal(saves.at(-1).items[0].max_value,280);
 const theme=editor.shadowRoot.querySelector('[data-property="theme"]');theme.querySelector('[selected]').removeAttribute('selected');theme.querySelector('[value="uninus"]').setAttribute('selected','');theme.dispatchEvent(new window.Event('change',{bubbles:true}));
 assert.equal(saves.at(-1).theme,'uninus');editor.remove();
});

