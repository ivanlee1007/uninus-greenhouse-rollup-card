import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
const {window}=parseHTML('<html><body></body></html>');
Object.assign(globalThis,{window,document:window.document,HTMLElement:window.HTMLElement,CustomEvent:window.CustomEvent,customElements:window.customElements});
const {UninusGreenhouseRollupCard}=await import('../src/card.js');
customElements.define('auto-stop-test-card',UninusGreenhouseRollupCard);
const managed=(enabled=true,attrs={},state='open')=>({state,attributes:{position_is_estimated:true,auto_stop_at_travel_end:enabled,open_switch_entity:'switch.up',close_switch_entity:'switch.down',open_switch_on:false,close_switch_on:false,current_position:100,position_confidence:'calibrated',command_state:'idle',supported_features:11,...attrs}});
function setup(values=[managed()],config={}){
  const card=document.createElement('auto-stop-test-card');document.body.append(card);
  card.setConfig({items:values.map((_,i)=>({id:`item-${i}`,name:`Roof ${i}`,cover_entity:`cover.roof_${i}`})),...config});
  const calls=[];
  card.hass={states:Object.fromEntries(values.map((value,i)=>[`cover.roof_${i}`,value])),services:{uninus_greenhouse_rollup:{set_auto_stop_at_travel_end:{}}},callService:async(...args)=>calls.push(args)};
  return {card,calls};
}
test('aggregate capsule summarizes deduped supported scope and expands a compact panel above global controls independently of visibility',()=>{
  for(const [values,label] of [[[managed(),managed()],'全啟用'],[[managed(false),managed(false)],'全停用'],[[managed(),managed(false)],'部分啟用'],[[managed(),managed(null)],'狀態不完整']]){
    const {card}=setup(values);
    const capsule=card.shadowRoot.querySelector('button.system');
    assert.ok(capsule,'header capsule is interactive');
    assert.match(capsule.textContent,new RegExp(label));
    assert.equal(capsule.getAttribute('aria-expanded'),'false');
    capsule.click();
    assert.equal(card.shadowRoot.querySelector('.system').getAttribute('aria-expanded'),'true');
    const panel=card.shadowRoot.querySelector('.auto-stop-panel');
    assert.ok(panel);
    assert.deepEqual([...panel.querySelectorAll('button')].map(b=>b.textContent),['全部啟用','全部停用']);
    assert.equal(panel.querySelector('.faces'),null);
    card.hass=card.hass;
    assert.ok(card.shadowRoot.querySelector('.auto-stop-panel'),'panel survives updates');
    card.setConfig({...card._config,show_global_controls:true});
    assert.equal(card.shadowRoot.querySelector('.auto-stop-panel').nextElementSibling.className,'global-controls');
    card.shadowRoot.querySelector('button.system').click();
    assert.equal(card.shadowRoot.querySelector('.auto-stop-panel'),null);
    card.remove();
  }
  const {card}=setup([{state:'open',attributes:{}}]);
  assert.equal(card.shadowRoot.querySelector('button.system'),null);
  assert.equal(card.shadowRoot.querySelector('.system').textContent,'GREENHOUSE VENTILATION');
  card.remove();
});

test('individual enable calls the integration with an array, stays authoritative pending until readback, and never opens More Info',async()=>{
  const {card,calls}=setup([managed(false)]);
  let info=0;card.addEventListener('hass-more-info',()=>info++);
  toggle(card).click();
  await tick();
  assert.deepEqual(calls,[['uninus_greenhouse_rollup','set_auto_stop_at_travel_end',{entity_id:['cover.roof_0'],enabled:true}]]);
  assert.equal(info,0);
  assert.equal(toggle(card).getAttribute('aria-checked'),'false');
  assert.equal(toggle(card).getAttribute('aria-busy'),'true');
  assert.equal(toggle(card).disabled,true);
  assert.equal(card.shadowRoot.querySelector('.controls [data-action="open"]').disabled,true);
  assert.equal(card.shadowRoot.querySelector('.controls [data-action="stop"]').disabled,false);
  card.hass=card.hass;
  toggle(card).click();
  assert.equal(calls.length,1);
  card.hass={...card.hass,states:{'cover.roof_0':managed(true)}};
  assert.equal(toggle(card).getAttribute('aria-checked'),'true');
  assert.equal(toggle(card).disabled,false);
  assert.equal(toggle(card).getAttribute('aria-busy'),'false');
  assert.equal(card.shadowRoot.querySelector('.controls [data-action="open"]').disabled,false);
  card.remove();
});

test('disable requires contextual confirmation; cancellation writes nothing and confirmation sends exact deduped batch scope',async()=>{
  const {card,calls}=setup([managed(),managed(false),{state:'open',attributes:{}}]);
  card.setConfig({...card._config,items:[...card._config.items,{id:'duplicate',cover_entity:'cover.roof_0'}]});
  card.hass={...card.hass,states:{...card.hass.states,'cover.outside':managed()}};
  let info=0;card.addEventListener('hass-more-info',()=>info++);
  toggle(card).click();
  assert.equal(calls.length,0);
  let dialog=card.shadowRoot.querySelector('[role="alertdialog"]');
  assert.ok(dialog,'turning off requires confirmation');
  assert.match(dialog.textContent,/Roof 0/);
  assert.match(dialog.textContent,/自行停止/);
  dialog.querySelector('[data-auto-stop-cancel]').click();
  assert.equal(card.shadowRoot.querySelector('[role="alertdialog"]'),null);
  assert.equal(calls.length,0);
  card.shadowRoot.querySelector('button.system').click();
  card.shadowRoot.querySelector('[data-auto-stop-batch="false"]').click();
  dialog=card.shadowRoot.querySelector('[role="alertdialog"]');
  assert.match(dialog.textContent,/2/);
  card.hass=card.hass;
  card.shadowRoot.querySelector('[data-auto-stop-confirm]').click();
  await tick();
  assert.equal(info,0);
  assert.deepEqual(calls,[['uninus_greenhouse_rollup','set_auto_stop_at_travel_end',{entity_id:['cover.roof_0','cover.roof_1'],enabled:false}]]);
  assert.equal(card.shadowRoot.querySelector('[data-auto-stop-batch="true"]').disabled,true);
  assert.equal(toggle(card).disabled,true);
  assert.equal(toggle(card,'cover.roof_1').disabled,true);
  assert.equal(card.shadowRoot.querySelector('.controls [data-action="stop"]').disabled,false);
  card.hass={...card.hass,states:{...card.hass.states,'cover.roof_0':managed(false)}};
  assert.equal(card.shadowRoot.querySelector('[data-auto-stop-batch="true"]').disabled,false);
  assert.ok(card.shadowRoot.querySelector('.auto-stop-panel'));
  card.remove();
});

test('permission failures are surfaced in-card and release pending without changing authoritative state',async()=>{
  const {card}=setup([managed(false)]);
  card.hass={...card.hass,callService:async()=>{throw new Error('Unauthorized: permission denied')}};
  toggle(card).click();await tick();
  const error=card.shadowRoot.querySelector('[role="alert"]');
  assert.ok(error,'visible accessible error');
  assert.match(error.textContent,/permission denied/);
  assert.equal(toggle(card).disabled,false);
  assert.equal(toggle(card).getAttribute('aria-checked'),'false');
  card.hass=card.hass;
  assert.match(card.shadowRoot.querySelector('[role="alert"]').textContent,/permission denied/);
  card.remove();
});

test('unknown settings and every safety gate disable writes with explanatory titles while Stop stays available',async()=>{
  for(const cover of [managed(null),managed(false,{open_switch_on:null}),managed(false,{open_switch_on:true}),managed(false,{close_switch_on:true}),managed(false,{command_state:'opening_timer'}),managed(false,{},'opening'),managed(false,{},'closing'),managed(false,{},'unknown'),managed(false,{},'unavailable')]){
    const {card,calls}=setup([cover,managed(false)]);
    assert.equal(toggle(card).disabled,true);
    assert.ok(toggle(card).getAttribute('title'),'disabled reason is explained');
    if(cover.attributes.auto_stop_at_travel_end===null){assert.equal(toggle(card).getAttribute('aria-checked'),'false');assert.equal(toggle(card).dataset.unknown,'true');}
    card.shadowRoot.querySelector('button.system').click();
    assert.equal(card.shadowRoot.querySelector('[data-auto-stop-batch="true"]').disabled,true);
    toggle(card).click();card.shadowRoot.querySelector('[data-auto-stop-batch="true"]').click();
    assert.equal(calls.length,0);
    if(cover.state==='open')assert.equal(card.shadowRoot.querySelector('.controls [data-action="stop"]').disabled,false);
    card.remove();
  }
  const {card,calls}=setup([managed(false)]);
  card.hass={...card.hass,services:{}};
  assert.equal(toggle(card).disabled,true);
  assert.match(toggle(card).getAttribute('title'),/服務/);
  toggle(card).click();assert.equal(calls.length,0);
  card.remove();
});

test('disconnect and reconfiguration invalidate settings timers and stale service completions',async()=>{
  const {card}=setup([managed(false)]);
  let finish;
  card.hass={...card.hass,callService:()=>new Promise(resolve=>{finish=resolve})};
  toggle(card).click();
  const operation=card._autoStopPending.get('cover.roof_0');
  card.remove();
  assert.equal(card._autoStopPending.size,0);
  assert.equal(operation.timer,null);
  finish();await tick();
  card._finishAutoStop(operation,'stale error');
  assert.equal(card._autoStopError,'');
  document.body.append(card);
  card.hass={...card.hass,callService:async()=>{}};
  toggle(card).click();await tick();
  card.setConfig({items:[]});
  assert.equal(card._autoStopPending.size,0);
  assert.equal(card.shadowRoot.querySelector('.auto-stop-switch'),null);
  card.remove();
});

test('confirmation makes card background inert and Escape cancels without a write',()=>{
  const {card,calls}=setup();toggle(card).click();
  assert.equal(card.shadowRoot.querySelector('.faces').inert,true);
  const event=new window.Event('keydown',{bubbles:true});event.key='Escape';
  card.shadowRoot.querySelector('[data-auto-stop-cancel]').dispatchEvent(event);
  assert.equal(card.shadowRoot.querySelector('[role="alertdialog"]'),null);
  assert.equal(card.shadowRoot.querySelector('.faces').inert,false);
  assert.equal(calls.length,0);card.remove();
});

test('timeout reports an error but keeps unresolved service gated through late success and readback',async(t)=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const {card,calls}=setup([managed(false)],{show_global_controls:true});
  let finish;card.hass={...card.hass,callService:(...args)=>{calls.push(args);return new Promise(resolve=>{finish=resolve})}};
  toggle(card).click();
  t.mock.timers.tick(10000);
  assert.match(card.shadowRoot.querySelector('[role="alert"]').textContent,/未收到狀態確認/);
  assert.equal(toggle(card).disabled,true,'unresolved service retains settings gate');
  assert.equal(card.shadowRoot.querySelector('.controls [data-action="open"]').disabled,true);
  assert.equal(card.shadowRoot.querySelector('.global-open').disabled,true);
  assert.equal(card.shadowRoot.querySelector('.controls [data-action="stop"]').disabled,false);
  card._requestAutoStop(['cover.roof_0'],true);
  await card._control({stopPropagation(){},currentTarget:{dataset:{action:'open',entity:'cover.roof_0'}}});
  assert.equal(calls.length,1);
  card.hass={...card.hass,states:{'cover.roof_0':managed(true)}};
  assert.equal(toggle(card).disabled,true,'readback alone cannot release in-flight gate');
  finish();await Promise.resolve();
  assert.equal(toggle(card).disabled,false);
  assert.equal(card.shadowRoot.querySelector('[role="alert"]'),null);
  card.remove();
});

test('late success without readback releases timeout gate for a retry',async(t)=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const {card,calls}=setup([managed(false)]);
  let finish;card.hass={...card.hass,callService:(...args)=>{calls.push(args);return new Promise(resolve=>{finish=resolve})}};
  toggle(card).click();t.mock.timers.tick(10000);
  finish();await Promise.resolve();
  assert.equal(toggle(card).disabled,false,'settled service must release expired readback wait');
  assert.match(card.shadowRoot.querySelector('[role="alert"]').textContent,/未收到狀態確認/);
  toggle(card).click();assert.equal(calls.length,2);
  card.remove();finish();await Promise.resolve();
});

test('late rejection after timeout releases gate and surfaces escaped service error',async(t)=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const {card}=setup([managed(false)]);
  let reject;card.hass={...card.hass,callService:()=>new Promise((_,fail)=>{reject=fail})};
  toggle(card).click();t.mock.timers.tick(10000);
  assert.equal(toggle(card).disabled,true);
  const hostile='<img src=x onerror="alert(1)"> & \'denied\'';
  reject(new Error(hostile));await Promise.resolve();
  assert.equal(toggle(card).disabled,false);
  assert.equal(toggle(card).getAttribute('aria-checked'),'false');
  const alert=card.shadowRoot.querySelector('[role="alert"]');
  assert.equal(alert.textContent,`自動停機設定失敗：${hostile}`);
  assert.equal(alert.children.length,0);
  card.remove();
});

test('settled service without readback stays gated until timeout then permits retry',async(t)=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const {card,calls}=setup([managed(false)]);
  toggle(card).click();await Promise.resolve();
  t.mock.timers.tick(9999);assert.equal(toggle(card).disabled,true);
  t.mock.timers.tick(1);assert.equal(toggle(card).disabled,false);
  assert.match(card.shadowRoot.querySelector('[role="alert"]').textContent,/未收到狀態確認/);
  toggle(card).click();await Promise.resolve();
  assert.equal(calls.length,2);assert.equal(toggle(card).disabled,true);
  card.remove();
});

test('stale timed-out service success or rejection cannot release a newer lifecycle operation',async(t)=>{
  t.mock.timers.enable({apis:['setTimeout']});
  for(const boundary of ['disconnect','reconfigure'])for(const outcome of ['success','rejection']){
    const {card}=setup([managed(false)]);
    const completions=[];
    card.hass={...card.hass,callService:()=>new Promise((resolve,reject)=>completions.push({resolve,reject}))};
    toggle(card).click();const old=card._autoStopPending.get('cover.roof_0');
    t.mock.timers.tick(10000);
    if(boundary==='disconnect'){card.remove();document.body.append(card)}else card.setConfig(card._config);
    toggle(card).click();const current=card._autoStopPending.get('cover.roof_0');
    assert.notEqual(current,old);
    if(outcome==='success')completions[0].resolve();else completions[0].reject(new Error('stale denied'));
    await Promise.resolve();
    card._finishAutoStop(old,'stale timeout');
    assert.equal(card._autoStopPending.get('cover.roof_0'),current);
    assert.equal(toggle(card).disabled,true);assert.equal(card._autoStopError,'');
    assert.equal(old.timer,null);
    card.remove();completions[1].resolve();await Promise.resolve();
  }
});

test('confirmation rejects changed supported batch scope or vanished service and escapes hostile names',()=>{
  const hostile='<img src=x onerror="alert(1)"> & \'Roof\'';
  for(const drift of ['scope','service']){
    const {card,calls}=setup([managed(),managed()],{items:[{cover_entity:'cover.roof_0',name:hostile},{cover_entity:'cover.roof_1'}]});
    toggle(card).click();
    const description=card.shadowRoot.querySelector('#auto-stop-confirm-description');
    assert.ok(description.textContent.includes(hostile));assert.equal(description.children.length,0);
    card.shadowRoot.querySelector('[data-auto-stop-cancel]').click();
    card.shadowRoot.querySelector('button.system').click();
    card.shadowRoot.querySelector('[data-auto-stop-batch="false"]').click();
    if(drift==='scope')card.hass={...card.hass,states:{...card.hass.states,'cover.roof_1':{state:'open',attributes:{}}}};
    else card.hass={...card.hass,services:{}};
    const confirm=card.shadowRoot.querySelector('[data-auto-stop-confirm]');
    assert.equal(confirm.disabled,true);confirm.click();
    assert.equal(calls.length,0);assert.ok(card.shadowRoot.querySelector('[role="alertdialog"]'));
    card.remove();
  }
});

const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
const toggle=(card,id='cover.roof_0')=>card.shadowRoot.querySelector(`.auto-stop-switch[data-entity="${id}"]`);

test('supported footer has sibling switch and percent in existing two-line info region; unsupported footer is unchanged',()=>{
  const {card}=setup([managed(),{state:'open',attributes:{current_position:100}},managed(true,{open_switch_entity:'sensor.bad'})],{items_per_row:4});
  const foot=card.shadowRoot.querySelector('.foot');
  assert.ok(toggle(card),'managed switch exists');
  assert.equal(toggle(card).closest('.more-info'),null);
  assert.equal(foot.querySelector('.copy strong').textContent,'全開');
  assert.equal(foot.querySelector('.copy small').textContent,'沒有控制命令 · 端點已校正');
  assert.equal(foot.querySelector('.auto-stop-setting em').textContent,'開啟率 100%');
  assert.equal(card.shadowRoot.querySelectorAll('.auto-stop-switch').length,1);
  assert.equal(card.shadowRoot.querySelectorAll('.foot').length,3);
  assert.equal(card.shadowRoot.querySelectorAll('.foot')[1].querySelector('.more-info em').textContent,'開啟率 100%');
  card.remove();
});
