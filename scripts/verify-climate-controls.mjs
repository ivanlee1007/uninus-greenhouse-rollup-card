import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';
const fixture=JSON.parse(await readFile(new URL('../tests/fixtures/climate-wire-acceptance.json',import.meta.url),'utf8'));
const files={'/card.js':'../src/card.js','/model.js':'../src/model.js','/climate.js':'../src/climate.js','/bundle.js':'../uninus-greenhouse-rollup-card.js'};
const server=createServer(async(req,res)=>{
  if(req.url==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><html lang="zh-Hant"><body style="margin:0"></body></html>');return;}
  if(!files[req.url]){res.writeHead(404).end();return;}
  res.setHeader('Content-Type','text/javascript');res.end(await readFile(new URL(files[req.url],import.meta.url)));
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser,cases=0;
try{
  browser=await chromium.launch(process.env.BROWSER_CHANNEL?{channel:process.env.BROWSER_CHANNEL}:{});
  console.log(`Browser ${browser.version()}; synthetic local HA only`);
  for(const entry of ['source','bundle'])for(const width of [360,1020])for(const theme of ['dark','light']){
    const page=await browser.newPage({viewport:{width:1100,height:1200}}),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.addScriptTag({type:'module',content:entry==='source'?"import {UninusGreenhouseRollupCard} from '/card.js';customElements.define('uninus-greenhouse-rollup-card',UninusGreenhouseRollupCard);":"import '/bundle.js';"});
    await page.evaluate(()=>customElements.whenDefined('uninus-greenhouse-rollup-card'));
    await page.evaluate(({fixture,width,theme})=>{
      window.calls=[];window.rejectPause=false;window.moreInfo=0;
      const card=document.createElement('uninus-greenhouse-rollup-card');window.card=card;
      card.style.width=`${width}px`;
      card.setConfig({...fixture.config,items_per_row:'auto',theme});
      card.hass={user:{id:'admin',is_admin:true},states:fixture.states,services:fixture.services,callService:async(...args)=>{window.calls.push(args);if(window.rejectPause&&args[1]==='set_mode')throw new Error('Unauthorized pause');}};
      card.addEventListener('hass-more-info',()=>window.moreInfo++);document.body.append(card);
    },{fixture,width,theme});
    const half=page.locator('.target-controls [data-position="50"]');
    await half.click();
    assert.deepEqual(await page.evaluate(()=>window.calls),[['uninus_greenhouse_climate','request_position',{entity_id:'sensor.roof_climate',position:50,hold_seconds:1800}]]);
    assert.match(await page.locator('.climate-status').textContent(),/影子.*目標 —/);
    assert.equal(await page.evaluate(()=>window.moreInfo),0);
    // The browser owns this confirmation; no synthetic confirm replacement.
    page.once('dialog',dialog=>dialog.dismiss());
    await page.locator('[data-climate-mode="automatic"]').click();
    assert.equal(await page.evaluate(()=>window.calls.length),1);
    page.once('dialog',dialog=>{assert.match(dialog.message(),/自動.*設備/);return dialog.accept();});
    await page.locator('[data-climate-mode="automatic"]').click();
    await page.waitForFunction(()=>window.calls.length===2&&window.card._pendingActions.size===0);
    assert.deepEqual(await page.evaluate(()=>window.calls[1]),['uninus_greenhouse_climate','set_mode',{entity_id:'sensor.roof_climate',mode:'automatic'}]);
    assert.match(await page.locator('.climate-status').textContent(),/影子/);
    assert.equal(await page.evaluate(()=>window.card.shadowRoot.activeElement?.dataset.climateMode),'automatic','mode invoker focus survives command render');
    await page.evaluate(()=>{window.calls=[];window.rejectPause=true;});
    await page.locator('.controls:not(.target-controls) [data-action="stop"]').click();
    await page.waitForFunction(()=>window.calls.some(c=>c[1]==='stop_cover')&&window.card._pendingActions.size===0);
    assert.deepEqual(await page.evaluate(()=>window.calls.map(c=>c[1])),['set_mode','stop_cover']);
    assert.match(await page.locator('.climate-error').textContent(),/Unauthorized pause/);
    const geometry=await page.evaluate(()=>{
      const card=window.card,root=card.shadowRoot;
      return {width:card.getBoundingClientRect().width,overflow:[...root.querySelectorAll('.face,.rollup-card')].some(el=>el.scrollWidth>el.clientWidth+1),buttons:[...root.querySelectorAll('.climate-controls button,.target-controls button')].map(el=>({width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height}))};
    });
    assert.equal(geometry.width,width);assert.equal(geometry.overflow,false);assert.ok(geometry.buttons.every(r=>r.width>0&&r.height>=32));
    await page.evaluate(()=>{delete window.card.hass.states['sensor.roof_climate'];window.card.hass={...window.card.hass};});
    assert.equal(await page.locator('.controls:not(.target-controls) [data-action="open"]').isDisabled(),true);
    assert.equal(await page.locator('.controls:not(.target-controls) [data-action="stop"]').isDisabled(),false);
    assert.deepEqual(errors,[]);
    console.log(`PASS ${entry} ${width}px ${theme} target/dialog/focus/partial-stop/geometry/unavailable`);cases++;
    await page.close();
  }
  assert.equal(cases,8);console.log(`Passed ${cases} climate browser scenarios.`);
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
