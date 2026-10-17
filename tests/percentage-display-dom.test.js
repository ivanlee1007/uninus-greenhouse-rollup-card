import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
const {window}=parseHTML('<html><body></body></html>');
Object.assign(globalThis,{window,document:window.document,HTMLElement:window.HTMLElement,CustomEvent:window.CustomEvent,customElements:window.customElements});
const {UninusGreenhouseRollupCard}=await import('../src/card.js');
const {UninusGreenhouseRollupCardEditor}=await import('../src/editor.js');
const {resolveFaceState}=await import('../src/model.js');
customElements.define('percentage-test-card',UninusGreenhouseRollupCard);
customElements.define('percentage-test-editor',UninusGreenhouseRollupCardEditor);

test('reversed percentages update labels and scale without reversing geometry or cover services',async()=>{
 const c=document.createElement('percentage-test-card');document.body.append(c);const calls=[];
 c.setConfig({items:[{id:'a',cover_entity:'cover.a',percentage_mode:'reversed',scroll_mode:'horizontal'},{id:'b',cover_entity:'cover.a'}]});
 for(const [raw,display] of [[0,100],[25,75],[100,0]]){
  c.hass={states:{'cover.a':{state:'open',attributes:{current_position:raw,supported_features:11}}},callService:async(...args)=>calls.push(args)};
  const [reverse,normal]=c.shadowRoot.querySelectorAll('.face');
  assert.equal(reverse.querySelector('.percent').textContent,display+'%');
  assert.equal(reverse.querySelector('.foot em').textContent,display+'%');
  assert.equal(normal.querySelector('.percent').textContent,raw+'%');
  assert.match(reverse.getAttribute('style'),new RegExp('--open:'+raw+'%'));
  assert.equal(reverse.querySelector('.scale.top').textContent,'0');
  assert.equal(reverse.querySelector('.scale.bottom').textContent,'100');
  if(raw===25){assert.match(reverse.querySelector('.copy strong').textContent,/覆蓋率.*75%/);assert.match(reverse.querySelector('.scene').getAttribute('aria-label'),/75%/)}
 }
 c.shadowRoot.querySelector('[data-action="open"]').click();await new Promise(r=>setTimeout(r,0));
 assert.deepEqual(calls,[['cover','open_cover',{entity_id:'cover.a'}]]);
 c.hass={...c.hass,states:{'cover.a':{state:'open',attributes:{}}}};
 assert.equal(c.shadowRoot.querySelector('.percent').textContent,'—');
 assert.equal(c.shadowRoot.querySelector('.foot em').textContent,'N/A');c.remove();
});

function renderPercentageModes(cover){
 const c=document.createElement('percentage-test-card');document.body.append(c);
 c.setConfig({items:['reversed','normal'].map(percentage_mode=>({id:percentage_mode,cover_entity:'cover.a',percentage_mode}))});
 c.hass={states:{'cover.a':cover},callService:async()=>{},services:{uninus_greenhouse_rollup:{set_auto_stop_at_travel_end:{}}}};
 return c;
}

function assertUnavailablePercentage(face,raw){
 assert.equal(face.querySelector('.percent').textContent,'—');
 assert.equal(face.querySelector('.foot em').textContent,'N/A');
 assert.equal(face.querySelector('.copy strong').textContent,'位置資料不可用');
 assert.match(face.querySelector('.scene').getAttribute('aria-label'),/位置資料不可用/);
 assert.doesNotMatch(face.querySelector('.scene').getAttribute('aria-label'),/\d+%/);
 assert.match(face.querySelector('.more-info').getAttribute('title'),/^位置資料不可用 · /);
 assert.match(face.getAttribute('style'),new RegExp('--open:'+raw+'%'));
 assert.ok([...face.querySelectorAll('.controls button')].every(button=>button.disabled));
}

for(const entityState of ['unknown','unavailable'])for(const raw of [0,25,100]){
 test(`native ${entityState} retained position ${raw} suppresses percentages in both modes`,()=>{
  const cover={state:entityState,attributes:{current_position:raw,supported_features:11}};
  const state=resolveFaceState({cover_entity:'cover.a'}, {'cover.a':cover});
  assert.equal(state.positionKnown,true);assert.equal(state.available,false);assert.equal(state.percent,raw);
  const c=renderPercentageModes(cover);
  try{for(const face of c.shadowRoot.querySelectorAll('.face'))assertUnavailablePercentage(face,raw)}finally{c.remove()}
 });
}

const managedAttributes={position_is_estimated:true,position_confidence:'calibrated',command_state:'idle',supported_features:11,open_switch_entity:'switch.a_open',close_switch_entity:'switch.a_close',open_switch_on:false,close_switch_on:false,auto_stop_at_travel_end:true};
for(const unavailableSource of ['entity','command'])for(const raw of [0,25,100]){
 test(`managed ${unavailableSource} unavailable retained position ${raw} suppresses auto-stop footer percentage`,()=>{
  const cover={state:unavailableSource==='entity'?'unavailable':'unknown',attributes:{...managedAttributes,current_position:raw,command_state:unavailableSource==='command'?'unavailable':'idle'}};
  const state=resolveFaceState({cover_entity:'cover.a'}, {'cover.a':cover});
  assert.equal(state.positionKnown,true);assert.equal(state.available,false);assert.equal(state.percent,raw);
  const c=renderPercentageModes(cover);
  try{for(const face of c.shadowRoot.querySelectorAll('.face')){
   assert.ok(face.querySelector('.auto-stop-foot .auto-stop-setting em'));
   assertUnavailablePercentage(face,raw);
   assert.equal(face.querySelector('.auto-stop-switch').disabled,true);
  }}finally{c.remove()}
 });
}

for(const raw of [0,25,100]){
 test(`managed unknown calibrated available position ${raw} keeps legitimate numeric percentages`,()=>{
  const cover={state:'unknown',attributes:{...managedAttributes,current_position:raw}};
  const state=resolveFaceState({cover_entity:'cover.a'}, {'cover.a':cover});
  assert.equal(state.positionKnown,true);assert.equal(state.available,true);assert.equal(state.percent,raw);
  const c=renderPercentageModes(cover);
  try{for(const [index,face] of [...c.shadowRoot.querySelectorAll('.face')].entries()){
   const display=index===0?100-raw:raw;
   assert.equal(face.querySelector('.percent').textContent,display+'%');
   assert.equal(face.querySelector('.auto-stop-setting em').textContent,display+'%');
   assert.equal(face.querySelector('.copy strong').textContent,`${raw===0?'全閉 · ':raw===100?'全開 · ':'估算'}${index===0?'覆蓋率':'開啟率'} ${display}%`);
   if(raw===25)assert.match(face.querySelector('.scene').getAttribute('aria-label'),new RegExp(display+'%'));
   assert.match(face.getAttribute('style'),new RegExp('--open:'+raw+'%'));
   assert.ok([...face.querySelectorAll('.controls button')].every(button=>!button.disabled));
   // Auto-stop uses its own stricter unknown-state policy; do not change it.
   assert.equal(face.querySelector('.auto-stop-switch').disabled,true);
  }}finally{c.remove()}
 });
}

test('percentage mode UI saves and reopens per-facility selection',()=>{
 const e=document.createElement('percentage-test-editor');e.setConfig({items:[{id:'a',cover_entity:'cover.a'},{id:'b',cover_entity:'cover.b'}]});
 const saves=[];e.addEventListener('config-changed',ev=>saves.push(ev.detail.config));
 const select=e.shadowRoot.querySelector('[data-item="a"][data-property="percentage_mode"]');assert.ok(select);assert.equal(select.value,'normal');
 select.querySelector('[value="normal"]').removeAttribute('selected');select.querySelector('[value="reversed"]').setAttribute('selected','');select.dispatchEvent(new window.Event('change',{bubbles:true}));
 assert.equal(saves.at(-1).items[0].percentage_mode,'reversed');assert.equal(saves.at(-1).items[1].percentage_mode,'normal');
 e.setConfig(saves.at(-1));assert.equal(e.shadowRoot.querySelector('[data-item="a"][data-property="percentage_mode"]').value,'reversed');
});
