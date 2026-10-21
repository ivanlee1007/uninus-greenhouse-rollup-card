import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
const {window}=parseHTML('<html><body></body></html>');
Object.assign(globalThis,{window,document:window.document,HTMLElement:window.HTMLElement,CustomEvent:window.CustomEvent,customElements:window.customElements});
const {UninusGreenhouseRollupCard}=await import('../src/card.js');
const {UninusGreenhouseRollupCardEditor}=await import('../src/editor.js');
customElements.define('climate-test-card',UninusGreenhouseRollupCard);
customElements.define('climate-test-editor',UninusGreenhouseRollupCardEditor);
customElements.define('ha-entity-picker',class extends HTMLElement{});
const item={id:'roof',name:'Roof',cover_entity:'cover.roof',climate_entity:'sensor.roof_climate'};
const attrs={controller_schema:1,cover_entity_id:'cover.roof',mode:'shadow',requested_position:null,effective_target_position:null,reason_codes:['shadow_preview'],manual_until:null,blocked:false};
function create({items=[item],config={},attributes={},states={},services,callService}={}){
  const calls=[];const card=document.createElement('climate-test-card');document.body.append(card);
  card.setConfig({items,...config});
  card.hass={user:{id:'admin',is_admin:true},states:{'cover.roof':{state:'open',attributes:{supported_features:15,current_position:25}},'sensor.roof_climate':{state:'shadow',attributes:{...attrs,...attributes}},...states},services:services??{uninus_greenhouse_climate:{request_position:{},set_mode:{},clear_manual_hold:{}}},callService:async(...args)=>{calls.push(args);return callService?.(...args)}};
  return {card,calls};
}
const event=(entity='cover.roof',action='open',position)=>({stopPropagation(){},currentTarget:{dataset:{entity,action,position}}});
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));

test('associated open routes exact controller request and never optimistically changes reported target',async()=>{
  const {card,calls}=create({config:{climate_hold_seconds:90}});
  await card._control(event());
  assert.deepEqual(calls,[['uninus_greenhouse_climate','request_position',{entity_id:'sensor.roof_climate',position:100,hold_seconds:90}]]);
  assert.equal(card.hass.states['sensor.roof_climate'].attributes.requested_position,null);
  assert.match(card.shadowRoot.querySelector('.climate-status').textContent,/影子/);
  assert.match(card.shadowRoot.querySelector('.climate-status').textContent,/shadow_preview/);
  assert.match(card.shadowRoot.querySelector('.climate-status').textContent,/目標.*—/);
  card.remove();
});

for(const [label,options] of [
  ['missing sensor',{states:{'sensor.roof_climate':undefined}}],
  ['unavailable sensor',{states:{'sensor.roof_climate':{state:'unavailable',attributes:attrs}}}],
  ['wrong cover',{attributes:{cover_entity_id:'cover.other'}}],
  ['wrong schema',{attributes:{controller_schema:2}}],
  ['bad requested position',{attributes:{requested_position:'50'}}],
  ['bad target',{attributes:{effective_target_position:101}}],
  ['bad mode',{attributes:{mode:'autopilot'}}],
  ['bad reasons',{attributes:{reason_codes:'unsafe'}}],
  ['bad blocked',{attributes:{blocked:'false'}}],
  ['bad hold',{attributes:{manual_until:'tomorrow'}}],
  ['bad entity',{items:[{...item,climate_entity:'switch.bad'}]}],
  ['missing service',{services:{}}],
  ['association conflict',{items:[item,{...item,id:'duplicate',climate_entity:'sensor.other'}]}],
  ['direct alias conflict',{items:[item,{...item,id:'alias',climate_entity:''}]}],
])test(`associated direction fails closed for ${label} in UI and forged handler`,async()=>{
  const {card,calls}=create(options);
  assert.equal(card.shadowRoot.querySelector('.controls [data-action="open"]').disabled,true);
  let notification='';card.addEventListener('hass-notification',e=>notification=e.detail.message);
  await card._control(event());
  assert.deepEqual(calls,[]);
  assert.match(notification,/失敗/);
  assert.ok(card.shadowRoot.querySelector('.climate-status'));
  card.remove();
});

test('controller rejection surfaces error without falling back to direct cover and retains actual readback',async()=>{
  const {card,calls}=create({attributes:{mode:'automatic',requested_position:20,effective_target_position:10,blocked:true,reason_codes:['wind_guard','<unsafe>']},callService:()=>{throw new Error('Unauthorized')}});
  let notification='';card.addEventListener('hass-notification',e=>notification=e.detail.message);
  await card._control(event('cover.roof','close'));
  assert.deepEqual(calls,[['uninus_greenhouse_climate','request_position',{entity_id:'sensor.roof_climate',position:0,hold_seconds:1800}]]);
  assert.match(notification,/Unauthorized/);
  assert.match(card.shadowRoot.querySelector('.climate-status').textContent,/安全阻擋/);
  assert.match(card.shadowRoot.querySelector('.climate-status').textContent,/目標 10/);
  assert.equal(card.shadowRoot.querySelector('unsafe'),null);
  card.remove();
});

for(const fail of [false,true])test(`associated stop pauses before physical stop even when pause rejects=${fail}`,async()=>{
  const {card,calls}=create({callService:(_domain,service)=>{if(fail&&service==='set_mode')throw new Error('Unauthorized pause')}});
  let notice='';card.addEventListener('hass-notification',e=>notice=e.detail.message);
  await card._control(event('cover.roof','stop'));
  assert.deepEqual(calls,[['uninus_greenhouse_climate','set_mode',{entity_id:'sensor.roof_climate',mode:'paused'}],['cover','stop_cover',{entity_id:'cover.roof'}]]);
  if(fail)assert.match(notice,/Unauthorized pause/);
  assert.equal(card.hass.states['sensor.roof_climate'].attributes.mode,'shadow');
  card.remove();
});

test('stop with missing controller still physically stops and reports that pause is unconfirmed',async()=>{
  const {card,calls}=create({states:{'sensor.roof_climate':undefined}});
  let notice='';card.addEventListener('hass-notification',e=>notice=e.detail.message);
  await card._control(event('cover.roof','stop'));
  assert.deepEqual(calls,[['cover','stop_cover',{entity_id:'cover.roof'}]]);
  assert.match(notice,/暫停.*未確認/);
  card.remove();
});

test('pending pause does not disable stop of other covers and captured physical stop survives reconfiguration',async()=>{
  let resolvePause;const paused=new Promise(resolve=>resolvePause=resolve);
  const {card,calls}=create({callService:(_domain,service)=>service==='set_mode'?paused:undefined});
  const stop=card._control(event('cover.roof','stop'));
  await Promise.resolve();
  assert.deepEqual(calls.map(c=>c[1]),['set_mode']);
  assert.equal(card.shadowRoot.querySelector('.controls [data-action="stop"]').disabled,true);
  card.setConfig({items:[{id:'new',cover_entity:'cover.new'}]});
  resolvePause();await stop;
  assert.deepEqual(calls.at(-1),['cover','stop_cover',{entity_id:'cover.roof'}]);
  assert.equal(card._pendingActions.size,0);
  card.remove();
});

for(const group of ['', 'A'])test(`mixed batch ${group||'global'} dedupes physical covers and surfaces per-target partial failure without bypass`,async()=>{
  const {card,calls}=create({config:{show_global_controls:true,show_group_controls:true},items:[
    {...item,group:'A'}, {...item,id:'same',group:'A'},
    {id:'native',cover_entity:'cover.native',group:'A'},
    {id:'bad',cover_entity:'cover.bad',climate_entity:'sensor.missing',group:'A'},
    {id:'outside',cover_entity:'cover.outside',group:'B'},
  ],states:{'cover.native':{state:'closed',attributes:{supported_features:11}},'cover.bad':{state:'open',attributes:{supported_features:11}},'cover.outside':{state:'open',attributes:{supported_features:11}}}});
  let notice='';card.addEventListener('hass-notification',e=>notice=e.detail.message);
  await card._globalControl({stopPropagation(){},currentTarget:{dataset:{action:'open',group}}});
  assert.equal(calls.filter(c=>c[0]==='uninus_greenhouse_climate').length,1);
  assert.deepEqual(calls.find(c=>c[0]==='uninus_greenhouse_climate'),['uninus_greenhouse_climate','request_position',{entity_id:'sensor.roof_climate',position:100,hold_seconds:1800}]);
  assert.deepEqual(calls.find(c=>c[0]==='cover'),['cover','open_cover',{entity_id:group?['cover.native']:['cover.native','cover.outside']}]);
  assert.match(notice,/cover.bad/);
  assert.equal(card._pendingActions.size,0);
  card.remove();
});

test('group cannot use an unassociated alias to bypass a controller outside the group',async()=>{
  const {card,calls}=create({items:[{...item,group:'B'},{...item,id:'alias',group:'A',climate_entity:''}]});
  let notice='';card.addEventListener('hass-notification',e=>notice=e.detail.message);
  await card._globalControl({stopPropagation(){},currentTarget:{dataset:{action:'open',group:'A'}}});
  assert.deepEqual(calls,[]);
  assert.match(notice,/關聯衝突/);
  card.remove();
});

test('mixed stop attempts all physical targets despite unauthorized pause and reports both failures',async()=>{
  const {card,calls}=create({items:[item,{id:'native',cover_entity:'cover.native'}],states:{'cover.native':{state:'open',attributes:{supported_features:11}}},callService:(_domain,service)=>{if(service==='set_mode')throw new Error('Unauthorized');if(service==='stop_cover')throw new Error('relay offline')}});
  let notice='';card.addEventListener('hass-notification',e=>notice=e.detail.message);
  await card._globalControl({stopPropagation(){},currentTarget:{dataset:{action:'stop'}}});
  assert.ok(calls.some(c=>c[1]==='set_mode'));
  assert.ok(calls.some(c=>c[1]==='stop_cover'&&c[2].entity_id==='cover.roof'));
  assert.ok(calls.some(c=>c[1]==='stop_cover'&&Array.isArray(c[2].entity_id)&&c[2].entity_id.includes('cover.native')));
  assert.match(notice,/Unauthorized/);assert.match(notice,/relay offline/);
  card.remove();
});

for(const associated of [true,false])test(`optional target presets send physical opening percentages (associated=${associated})`,async()=>{
  const {card,calls}=create({items:[{...item,climate_entity:associated?item.climate_entity:'',percentage_mode:'reversed'}],config:{show_target_controls:true}});
  let moreInfo=0;card.addEventListener('hass-more-info',()=>moreInfo++);
  const expected=associated?['uninus_greenhouse_climate','request_position',{entity_id:'sensor.roof_climate',position:50,hold_seconds:1800}]:['cover','set_cover_position',{entity_id:'cover.roof',position:50}];
  await card._control(event('cover.roof','position','50'));
  assert.deepEqual(calls,[expected]);
  calls.length=0;
  const half=card.shadowRoot.querySelector('.target-controls [data-position="50"]');
  assert.ok(half);assert.equal(half.disabled,false);half.click();await tick();
  assert.deepEqual(calls,[associated?['uninus_greenhouse_climate','request_position',{entity_id:'sensor.roof_climate',position:50,hold_seconds:1800}]:['cover','set_cover_position',{entity_id:'cover.roof',position:50}]]);
  assert.equal(moreInfo,0);
  assert.equal(card.shadowRoot.querySelector('.percent').textContent,'75%');
  card.remove();
});

for(const attributes of [{supported_features:11,current_position:25},{supported_features:15,current_position:null},{supported_features:15,current_position:25,position_is_estimated:true,position_confidence:'unknown'}])test(`intermediate target is disabled without capability or known estimate ${JSON.stringify(attributes)}`,async()=>{
  const {card,calls}=create({config:{show_target_controls:true},states:{'cover.roof':{state:'open',attributes}}});
  assert.equal(card.shadowRoot.querySelector('.target-controls [data-position="50"]').disabled,true);
  assert.equal(card.shadowRoot.querySelector('.controls [data-action="open"]').disabled,false);
  await card._control(event('cover.roof','position','50'));
  assert.deepEqual(calls,[]);
  card.remove();
});

test('forged target rejects fractions out of range and malformed values without any service',async()=>{
  const {card,calls}=create({config:{show_target_controls:true}});
  for(const position of ['-1','101','1.5','NaN','','true'])await card._control(event('cover.roof','position',position));
  assert.deepEqual(calls,[]);card.remove();
});

test('optional mode actions require admin and explicit automatic confirmation while labels stay authoritative',async()=>{
  const {card,calls}=create({config:{show_climate_controls:true}});
  let warning='';globalThis.confirm=(message)=>{warning=message;return true;};
  card.shadowRoot.querySelector('[data-climate-mode="automatic"]')?.click();await tick();
  assert.deepEqual(calls,[['uninus_greenhouse_climate','set_mode',{entity_id:'sensor.roof_climate',mode:'automatic'}]]);
  assert.match(warning,/自動.*設備/);
  assert.match(card.shadowRoot.querySelector('.climate-status').textContent,/影子/);
  card.shadowRoot.querySelector('[data-climate-mode="paused"]').click();await tick();
  card.shadowRoot.querySelector('[data-climate-mode="shadow"]').click();await tick();
  assert.deepEqual(calls.slice(1),[['uninus_greenhouse_climate','set_mode',{entity_id:'sensor.roof_climate',mode:'paused'}],['uninus_greenhouse_climate','set_mode',{entity_id:'sensor.roof_climate',mode:'shadow'}]]);
  card.hass={...card.hass,user:{id:'viewer',is_admin:false}};
  assert.equal(card.shadowRoot.querySelector('[data-climate-mode="automatic"]').disabled,true);
  card.shadowRoot.querySelector('[data-climate-mode="automatic"]').click();await tick();
  assert.equal(calls.length,3);card.remove();delete globalThis.confirm;
});

test('canceling automatic or resume warning writes nothing; resume sends only clear_manual_hold',async()=>{
  const {card,calls}=create({config:{show_climate_controls:true},attributes:{mode:'automatic',manual_until:'2026-10-21T08:00:00+00:00'}});
  globalThis.confirm=()=>false;
  card.shadowRoot.querySelector('[data-climate-mode="automatic"]')?.click();
  card.shadowRoot.querySelector('[data-climate-resume]')?.click();await tick();assert.deepEqual(calls,[]);
  globalThis.confirm=()=>true;
  card.shadowRoot.querySelector('[data-climate-resume]')?.click();await tick();
  assert.deepEqual(calls,[['uninus_greenhouse_climate','clear_manual_hold',{entity_id:'sensor.roof_climate'}]]);
  assert.match(card.shadowRoot.querySelector('.climate-status').textContent,/手動至/);
  card.remove();delete globalThis.confirm;
});

test('mode permission failure is visible in-card and never changes the auto-stop switch',async()=>{
  const {card,calls}=create({config:{show_climate_controls:true},callService:()=>{throw new Error('Unauthorized admin')}});
  globalThis.confirm=()=>true;
  card.shadowRoot.querySelector('[data-climate-mode="automatic"]')?.click();await tick();
  assert.equal(calls.length,1);
  assert.match(card.shadowRoot.querySelector('.climate-error')?.textContent??'',/Unauthorized admin/);
  assert.equal(card.shadowRoot.querySelector('.auto-stop-switch'),null);
  card.remove();delete globalThis.confirm;
});

for(const transition of ['reconfigure','disconnect','demote'])test(`late mode rejection after ${transition} cannot publish stale UI`,async()=>{
  let reject;const flight=new Promise((_resolve,fail)=>reject=fail);
  const {card}=create({config:{show_climate_controls:true},callService:()=>flight});
  card.shadowRoot.querySelector('[data-climate-mode="paused"]').click();await Promise.resolve();
  if(transition==='reconfigure')card.setConfig({items:[{...item,climate_entity:'sensor.new'}]});
  if(transition==='disconnect')card.remove();
  if(transition==='demote')card.hass={...card.hass,user:{id:'admin',is_admin:false}};
  reject(new Error('stale failure'));await tick();
  assert.equal(card._climateError,'');
  assert.equal(card._climateNotice,'');
  card.remove();
});

test('settling a mode request cannot release a simultaneously pending emergency stop',async()=>{
  let resolveMode,resolveStop;
  const modeFlight=new Promise(resolve=>resolveMode=resolve),stopFlight=new Promise(resolve=>resolveStop=resolve);
  let modeCalls=0;
  const {card}=create({config:{show_climate_controls:true},callService:(_domain,service)=>service==='set_mode'?(++modeCalls===1?modeFlight:undefined):service==='stop_cover'?stopFlight:undefined});
  card.shadowRoot.querySelector('[data-climate-mode="paused"]').click();
  const stop=card._control(event('cover.roof','stop'));await Promise.resolve();
  resolveMode();await tick();
  assert.equal(card.shadowRoot.querySelector('.controls [data-action="stop"]').disabled,true);
  assert.equal(card.shadowRoot.querySelector('.controls [data-action="open"]').disabled,true);
  resolveStop();await stop;card.remove();
});

test('late request rejection and detached controls cannot affect replacement association',async()=>{
  let reject;const flight=new Promise((_resolve,fail)=>reject=fail);
  const {card,calls}=create({callService:()=>flight});
  let notices=0;card.addEventListener('hass-notification',()=>notices++);
  const old=card.shadowRoot.querySelector('.controls [data-action="open"]');
  const request=card._control(event());
  card.setConfig({items:[{...item,climate_entity:'sensor.new'}]});
  reject(new Error('old denial'));await request;
  assert.equal(notices,0);
  old.click();await tick();
  assert.equal(calls.length,1);
  card.remove();
});

test('missing request service disables directions but retains authoritative mode and available pause action',async()=>{
  const {card,calls}=create({config:{show_climate_controls:true},services:{uninus_greenhouse_climate:{set_mode:{},clear_manual_hold:{}}}});
  assert.equal(card.shadowRoot.querySelector('.controls [data-action="open"]').disabled,true);
  assert.match(card.shadowRoot.querySelector('.climate-status').textContent,/影子/);
  card.shadowRoot.querySelector('[data-climate-mode="paused"]')?.click();await tick();
  assert.deepEqual(calls,[['uninus_greenhouse_climate','set_mode',{entity_id:'sensor.roof_climate',mode:'paused'}]]);
  card.remove();
});

test('synchronously rejected native batch does not release pending associated service or lose its error',async()=>{
  let finish;const flight=new Promise(resolve=>finish=resolve);
  const {card}=create({items:[item,{id:'native',cover_entity:'cover.native'}],states:{'cover.native':{state:'closed',attributes:{supported_features:11}}}});
  card.hass={...card.hass,callService:(_domain,service)=>{if(service==='request_position')return flight;throw new Error('sync native failure')}};
  const batch=card._globalControl({stopPropagation(){},currentTarget:{dataset:{action:'open'}}});
  await tick();
  assert.equal(card._pendingActions.has('cover.roof'),true);
  finish();await batch;
  assert.match(card._climateError,/sync native failure/);
  card.remove();
});