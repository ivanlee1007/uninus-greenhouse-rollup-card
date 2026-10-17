import { coverServiceForAction, GRID_OPTIONS, normalizeConfig, resolveAutoStopState, resolveFaceState, resolveGlobalControlTargets, resolveSubtitle, resolveThemeTokens, selectLayout } from './model.js';

const escapeHtml=(value)=>String(value??'').replace(/[&<>"']/g,(char)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const KIND_META={rollup:{label:'捲簾',icon:'mdi:window-shutter'},skylight:{label:'天窗',icon:'mdi:window-open-variant'},shade:{label:'遮陽',icon:'mdi:roller-shade'}};

export class UninusGreenhouseRollupCard extends HTMLElement {

  static styles = `
    :host{display:block;min-width:0;container-type:inline-size}
    /* Keep scene labels, rollers, and the local confirmation below external HA dialogs. */
    .rollup-card{display:block;position:relative;isolation:isolate;width:100%;min-height:190px;box-sizing:border-box;overflow:hidden;padding:clamp(12px,2.5cqw,20px);border-radius:22px;background:var(--rollup-bg);color:var(--rollup-text);border:1px solid color-mix(in srgb,var(--rollup-text) 10%,transparent);box-shadow:0 14px 38px var(--rollup-shadow)}
    .header{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin:0 2px 14px;text-align:left}.header h2{margin:0;font-size:clamp(18px,3cqw,24px);line-height:1.2;letter-spacing:.035em}.header p{margin:5px 0 0;color:var(--rollup-muted);font-size:clamp(11px,1.5cqw,14px);overflow-wrap:anywhere}.system{display:inline-flex;align-items:center;gap:6px;padding:6px 9px;border:1px solid color-mix(in srgb,var(--rollup-ui-accent) 42%,transparent);border-radius:999px;color:var(--rollup-ui-accent);font-size:clamp(9px,1.1cqw,11px);font-weight:800;white-space:nowrap}.system i{width:8px;height:8px;border-radius:50%;background:var(--rollup-ui-accent);box-shadow:0 0 8px color-mix(in srgb,var(--rollup-ui-accent) 65%,transparent)}
    .columns-1{--ui-name-size:clamp(16px,3.8cqw,21px);--ui-icon-size:40px;--ui-icon-font-size:14px;--ui-motion-size:clamp(11px,2.7cqw,14px);--ui-detail-size:clamp(13px,3cqw,16px);--ui-meta-size:clamp(11px,2.4cqw,13px);--ui-position-size:clamp(15px,3.2cqw,18px);--ui-control-size:13px;--ui-control-height:44px;--ui-global-size:13px;--ui-global-height:44px}.columns-2{--ui-name-size:clamp(14px,1.9cqw,17px);--ui-icon-size:34px;--ui-icon-font-size:12px;--ui-motion-size:clamp(11px,1.4cqw,12px);--ui-detail-size:clamp(12px,1.55cqw,13px);--ui-meta-size:clamp(10.5px,1.25cqw,11px);--ui-position-size:clamp(13px,1.7cqw,15px);--ui-control-size:12px;--ui-control-height:38px;--ui-global-size:12px;--ui-global-height:40px}.columns-3{--ui-name-size:clamp(13px,1.35cqw,15px);--ui-icon-size:30px;--ui-icon-font-size:11px;--ui-motion-size:clamp(10.5px,1.05cqw,12px);--ui-detail-size:clamp(11.5px,1.15cqw,13px);--ui-meta-size:clamp(10px,1cqw,11px);--ui-position-size:clamp(12px,1.2cqw,14px);--ui-control-size:11px;--ui-control-height:36px;--ui-global-size:11.5px;--ui-global-height:38px}.columns-4{--ui-name-size:clamp(12px,1.05cqw,14px);--ui-icon-size:28px;--ui-icon-font-size:10px;--ui-motion-size:clamp(10px,.9cqw,11px);--ui-detail-size:clamp(11px,.95cqw,12px);--ui-meta-size:clamp(10px,.85cqw,11px);--ui-position-size:clamp(12px,1cqw,13px);--ui-control-size:11px;--ui-control-height:34px;--ui-global-size:11px;--ui-global-height:36px}
    .faces{display:grid;gap:clamp(8px,1.8cqw,13px);min-width:0}.columns-4 .faces{grid-template-columns:repeat(4,minmax(0,1fr))}.columns-3 .faces{grid-template-columns:repeat(3,minmax(0,1fr))}.columns-2 .faces{grid-template-columns:repeat(2,minmax(0,1fr))}.columns-1 .faces{grid-template-columns:minmax(0,1fr)}
    .face{min-width:0;padding:clamp(8px,1.8cqw,13px);border-radius:17px;background:var(--rollup-surface);border:1px solid color-mix(in srgb,var(--rollup-text) 9%,transparent);box-shadow:inset 0 1px color-mix(in srgb,var(--rollup-text) 5%,transparent),0 7px 18px rgba(0,0,0,.17)}
    /* Wrap by actual tile space, never by the dashboard column count. */
    .face-head{display:flex;flex-wrap:wrap;align-items:center;gap:7px;margin-bottom:9px}.face-head>.compass{flex:none}.face-head>.name{flex:1 1 100px}.face-head>.motion{flex:none;margin-left:auto}.compass{display:grid;place-items:center;width:var(--ui-icon-size);height:var(--ui-icon-size);border-radius:9px;background:color-mix(in srgb,var(--face-ui-color) 12%,transparent);border:1px solid color-mix(in srgb,var(--face-ui-color) 42%,transparent);color:var(--face-ui-color);font-size:var(--ui-icon-font-size);font-weight:900}.name{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:var(--ui-name-size);font-weight:800}.motion{display:inline-flex;align-items:center;gap:5px;padding:5px 7px;border-radius:999px;background:color-mix(in srgb,var(--status-ui-color) 11%,transparent);border:1px solid color-mix(in srgb,var(--status-ui-color) 38%,transparent);color:var(--status-ui-color);font-size:var(--ui-motion-size);font-weight:800;white-space:nowrap}.motion i{width:7px;height:7px;border-radius:50%;background:var(--status-ui-color)}.moving .motion i{box-shadow:0 0 9px color-mix(in srgb,var(--status-ui-color) 72%,transparent);animation:pulse 1s ease-in-out infinite}
    .scene{position:relative;height:clamp(96px,24cqw,132px);overflow:hidden;border-radius:11px;background:var(--rollup-frame);border:1px solid color-mix(in srgb,var(--rollup-text) 15%,transparent);box-shadow:inset 0 0 0 3px rgba(0,0,0,.12),inset 0 0 22px rgba(0,0,0,.22)}.opening{position:absolute;left:4px;right:4px;bottom:4px;height:max(0px,calc(var(--open) - 4px));overflow:hidden;background:linear-gradient(145deg,color-mix(in srgb,var(--open-color) 36%,white),var(--open-color));box-shadow:inset 0 0 23px rgba(255,255,220,.15),0 0 20px color-mix(in srgb,var(--open-color) 35%,transparent);transition:height .65s cubic-bezier(.2,.8,.2,1),background .65s}.curtain{position:absolute;left:4px;right:4px;top:4px;height:max(0px,calc(100% - var(--open) - 4px));overflow:hidden;background:linear-gradient(90deg,color-mix(in srgb,var(--closed-color) 72%,black),var(--closed-color) 28%,color-mix(in srgb,var(--closed-color) 82%,black) 52%,color-mix(in srgb,var(--closed-color) 88%,white) 74%,color-mix(in srgb,var(--closed-color) 68%,black));border-bottom:1px solid rgba(255,255,255,.14);transition:height .65s cubic-bezier(.2,.8,.2,1)}.curtain b{position:absolute;top:0;bottom:0;width:1px;background:rgba(255,255,255,.07)}.curtain b:first-of-type{left:34%}.curtain b:last-of-type{left:67%}.shine{position:absolute;inset:0 auto 0 -35%;width:30%;transform:skewX(-16deg);background:linear-gradient(90deg,transparent,rgba(255,255,255,.12),transparent)}
    .roller{position:absolute;z-index:5;left:1px;right:1px;bottom:clamp(4px,calc(var(--open) - 5px),calc(100% - 14px));height:11px;display:flex;align-items:center;transition:bottom .65s cubic-bezier(.2,.8,.2,1)}.roller span{flex:1;height:9px;border-radius:999px;border:1px solid rgba(255,240,170,.46);background:repeating-linear-gradient(90deg,#705714 0,var(--face-accent) 5px,#aa7b13 10px,#fff0a0 15px);box-shadow:0 2px 6px rgba(0,0,0,.5),0 0 10px color-mix(in srgb,var(--face-accent) 30%,transparent)}.roller i{width:7px;height:11px;border-radius:3px;background:#adb7ba}.moving.animated .roller span{animation:roll .43s linear infinite}.moving.animated .shine{animation:sweep 1.35s ease-in-out infinite}
    .rollup-air{position:absolute;left:-45%;width:44%;height:2px;border-radius:999px;opacity:0;background:linear-gradient(90deg,transparent,rgba(225,252,255,.95),transparent)}.rollup-air:nth-child(1){bottom:25%}.rollup-air:nth-child(2){bottom:50%;animation-delay:.18s!important}.rollup-air:nth-child(3){bottom:75%;animation-delay:.36s!important}.moving.animated .rollup-air{animation:airflow 1.45s ease-in-out infinite}.ray{position:absolute;top:-20%;width:12px;height:145%;opacity:.23;transform:rotate(20deg);background:linear-gradient(transparent,rgba(255,255,230,.9),transparent)}.ray.one{left:25%}.ray.two{left:68%}
    .scale{position:absolute;z-index:6;right:5px;color:rgba(255,255,255,.62);font-size:10px;text-shadow:0 1px 2px #000}.scale.top{top:6px}.scale.mid{top:calc(50% - 4px)}.scale.bottom{bottom:5px}.percent{position:absolute;z-index:7;left:7px;bottom:6px;padding:3px 5px;border-radius:6px;background:rgba(0,0,0,.4);color:#fff;font-size:11px;font-weight:900}.unknown .scene::after{content:'位置未知';position:absolute;z-index:6;inset:0;display:grid;place-items:center;background:repeating-linear-gradient(135deg,rgba(255,255,255,.035) 0 8px,rgba(0,0,0,.055) 8px 16px);color:rgba(255,255,255,.82);font-size:12px;font-weight:800;letter-spacing:.08em}
    .foot{display:flex;align-items:end;justify-content:space-between;gap:7px;margin-top:8px;text-align:left}.more-info{all:unset;box-sizing:border-box;display:flex;align-items:end;justify-content:space-between;gap:7px;width:100%;border-radius:6px;cursor:pointer}.more-info:focus-visible{outline:2px solid var(--face-ui-color);outline-offset:2px}.copy{display:grid;min-width:0;gap:2px}.copy strong,.copy small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.copy strong{font-size:var(--ui-detail-size)}.copy small{color:var(--rollup-muted);font-size:var(--ui-meta-size)}.foot em{flex:none;white-space:nowrap;color:var(--face-ui-color);font-size:var(--ui-position-size);font-style:normal;font-weight:900}
    .controls{display:grid;grid-template-columns:repeat(var(--control-count,3),minmax(0,1fr));gap:5px;margin-top:8px}.controls button{min-width:0;min-height:var(--ui-control-height);padding:6px 4px;border:1px solid color-mix(in srgb,var(--face-ui-color) 38%,transparent);border-radius:8px;background:color-mix(in srgb,var(--face-ui-color) 10%,transparent);color:var(--rollup-text);font:inherit;font-size:var(--ui-control-size);font-weight:800;cursor:pointer}.controls button:hover{background:color-mix(in srgb,var(--face-ui-color) 20%,transparent)}.controls button:focus-visible{outline:2px solid var(--face-ui-color);outline-offset:1px}.controls button:disabled{cursor:not-allowed;opacity:.52}.controls .stop{border-color:color-mix(in srgb,var(--rollup-ui-idle) 44%,transparent)}
    .global-controls,.group-controls{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px;margin:-2px 2px 14px;padding:7px;border:1px solid color-mix(in srgb,var(--rollup-text) 9%,transparent);border-radius:13px;background:color-mix(in srgb,var(--rollup-surface) 68%,transparent)}.group-controls{margin:0 2px 10px}.control-heading{grid-column:1/-1;color:var(--rollup-muted);font-size:11px;font-weight:800}.global-controls button,.group-controls button{--global-accent:var(--rollup-ui-accent);min-width:0;height:var(--ui-global-height);border:1px solid color-mix(in srgb,var(--global-accent) 42%,transparent);border-radius:9px;background:color-mix(in srgb,var(--global-accent) 11%,transparent);color:var(--rollup-text);font:inherit;font-size:var(--ui-global-size);font-weight:900;letter-spacing:.04em;cursor:pointer}.global-controls button::before,.group-controls button::before{display:inline-block;margin-right:6px;color:var(--global-accent)}.global-open::before{content:'▲'}.global-stop::before{content:'■'}.global-close::before{content:'▼'}.global-controls button:hover,.group-controls button:hover{background:color-mix(in srgb,var(--global-accent) 21%,transparent)}.global-controls button:focus-visible,.group-controls button:focus-visible{outline:2px solid var(--global-accent);outline-offset:1px}.global-controls button:disabled,.group-controls button:disabled{cursor:not-allowed;opacity:.52}
    .columns-3 .face,.columns-4 .face{padding:clamp(6px,1cqw,9px)}.columns-3 .face-head,.columns-4 .face-head{gap:4px;margin-bottom:6px}.columns-3 .motion,.columns-4 .motion{padding:4px 6px}.columns-3 .scene,.columns-4 .scene{height:clamp(64px,12cqw,88px)}.columns-3 .foot,.columns-4 .foot{display:grid;margin-top:6px}
    .columns-1 .scene{height:clamp(72px,28cqw,112px)}.columns-1 .face{padding:9px}.columns-1 .face-head{margin-bottom:6px}.columns-1 .foot{margin-top:6px}.columns-1 .global-controls button,.columns-1 .controls button{min-height:44px}
    @keyframes roll{to{background-position:30px 0}}@keyframes sweep{0%{left:-40%;opacity:0}35%{opacity:1}100%{left:120%;opacity:0}}@keyframes airflow{0%{left:-45%;opacity:0}25%{opacity:.9}100%{left:110%;opacity:0}}@keyframes pulse{0%,100%{opacity:.55;transform:scale(.85)}50%{opacity:1;transform:scale(1.2)}}
    .scroll-horizontal .opening{top:4px;bottom:4px;left:4px;right:auto;height:auto;width:max(0px,calc(var(--open) - 4px));transition:width .65s cubic-bezier(.2,.8,.2,1),background .65s}
    .scroll-horizontal .curtain{top:4px;bottom:4px;left:auto;right:4px;height:auto;width:max(0px,calc(100% - var(--open) - 4px));border-bottom:0;border-left:1px solid rgba(255,255,255,.14);transition:width .65s cubic-bezier(.2,.8,.2,1)}
    .scroll-horizontal .roller{top:1px;bottom:1px;right:auto;left:clamp(4px,calc(var(--open) - 5px),calc(100% - 14px));width:11px;height:auto;flex-direction:column;transition:left .65s cubic-bezier(.2,.8,.2,1)}
    .scroll-horizontal .roller span{width:9px;height:auto;background:repeating-linear-gradient(0deg,#705714 0,var(--face-accent) 5px,#aa7b13 10px,#fff0a0 15px)}.scroll-horizontal .roller i{width:11px;height:7px;flex-shrink:0}
    .scroll-horizontal.moving.animated .roller span{animation-name:roll-horizontal}.motion-closing.moving.animated .roller span{animation-direction:reverse}
    .scroll-horizontal .scale{top:auto;bottom:5px}.scroll-horizontal .scale.top{right:5px;left:auto}.scroll-horizontal .scale.mid{left:calc(50% - 6px);right:auto}.scroll-horizontal .scale.bottom{left:5px;right:auto}.scroll-horizontal .percent{top:6px;bottom:auto}
    @keyframes roll-horizontal{to{background-position:0 30px}}
    .foot.auto-stop-foot{display:flex;align-items:stretch}.auto-stop-foot .more-info{width:auto;flex:1;min-width:0}.auto-stop-setting{display:grid;gap:2px;flex:none;text-align:right;align-content:end}.auto-stop-label{display:flex;align-items:center;justify-content:end;gap:4px;white-space:nowrap;font-size:var(--ui-detail-size)}.auto-stop-switch{all:unset;box-sizing:border-box;display:inline-block;width:1.8em;height:.95em;border:1px solid var(--rollup-muted);border-radius:1em;background:var(--rollup-frame);cursor:pointer;position:relative}.auto-stop-switch::before{content:'';position:absolute;right:0;top:50%;transform:translateY(-50%);width:44px;height:24px}.auto-stop-switch::after{content:'';position:absolute;top:1px;left:1px;height:calc(.95em - 4px);width:calc(.95em - 4px);border-radius:50%;background:var(--rollup-muted)}.auto-stop-switch[aria-checked=true]{background:var(--rollup-ui-accent);border-color:var(--rollup-ui-accent)}.auto-stop-switch[aria-checked=true]::after{left:auto;right:1px;background:var(--rollup-bg)}.auto-stop-switch:disabled{opacity:.52;cursor:not-allowed}.auto-stop-switch:focus-visible{outline:2px solid var(--rollup-ui-accent);outline-offset:2px}.auto-stop-setting em,.columns-3 .auto-stop-setting em,.columns-4 .auto-stop-setting em{display:block;font-size:var(--ui-meta-size)}
    button.system{background:transparent;cursor:pointer;font-family:inherit;line-height:normal}button.system:focus-visible{outline:2px solid var(--rollup-ui-accent);outline-offset:2px}.auto-stop-panel{margin:0 2px 14px;padding:8px;border:1px solid var(--rollup-muted);border-radius:10px;font-size:11px}.auto-stop-panel p{margin:0 0 6px;color:var(--rollup-muted)}.auto-stop-panel>div{display:flex;gap:6px}.auto-stop-panel button{font:inherit;border:1px solid var(--rollup-ui-accent);border-radius:6px;padding:6px 9px;background:var(--rollup-surface);color:var(--rollup-text);cursor:pointer}.auto-stop-panel button:disabled{opacity:.52;cursor:not-allowed}
    .auto-stop-overlay{position:absolute;inset:0;z-index:20;display:grid;place-items:center;background:rgba(0,0,0,.65);padding:12px}.auto-stop-dialog{max-width:420px;padding:14px;border-radius:12px;background:var(--rollup-frame);color:var(--rollup-text);font-size:12px}.auto-stop-dialog h3{margin:0 0 8px}.auto-stop-dialog button{font:inherit;padding:8px;margin-right:8px;background:var(--rollup-surface);color:var(--rollup-text);border:1px solid var(--rollup-ui-accent);border-radius:6px}.auto-stop-dialog button:disabled{opacity:.52}.auto-stop-error{color:var(--rollup-ui-danger);font-size:12px;overflow-wrap:anywhere}.auto-stop-switch[aria-checked=true]::after{background:#fff}.auto-stop-switch[data-unknown=true]{border-style:dashed}
    @media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
  `;

  constructor(){super();this.attachShadow({mode:'open'});this._config=normalizeConfig({});this._layout='columns-2';this._observer=null;this._lastRect={width:0,height:0};this._hass=null;this._pendingActions=new Map();this._globalActions=new Set();this._autoStopPending=new Map();this._autoStopError='';this.shadowRoot.addEventListener('keydown',(event)=>{if(!this._autoStopConfirmation)return;if(event.key==='Escape'){event.preventDefault();this._closeAutoStopConfirmation()}else if(event.key==='Tab'){const buttons=[...this.shadowRoot.querySelectorAll('.auto-stop-dialog button:not(:disabled)')];const index=buttons.indexOf(this.shadowRoot.activeElement);event.preventDefault();buttons[(index+(event.shiftKey?-1:1)+buttons.length)%buttons.length]?.focus()}})}
  set hass(value){this._hass=value;this._reconcileAutoStop();this._render()}
  get hass(){return this._hass}
  setConfig(config){this._cancelAutoStop();this._config=normalizeConfig(config);this._measure();this._render()}
  connectedCallback(){this._observe();this._measure();this._render()}
  disconnectedCallback(){this._observer?.disconnect();this._cancelAutoStop()}
  _cancelAutoStop(){for(const operation of new Set(this._autoStopPending.values())){clearTimeout(operation.timer);operation.timer=null}this._autoStopPending.clear();this._autoStopConfirmation=null;this._autoStopError=''}
  _observe(){if(!globalThis.ResizeObserver)return;if(!this._observer)this._observer=new ResizeObserver((entries)=>{const r=entries[0]?.contentRect;if(r)this._setLayout(r.width,r.height)});this._observer.disconnect();this._observer.observe(this)}
  _measure(){const r=this.getBoundingClientRect?.();if(r)this._setLayout(r.width,r.height)}
  _setLayout(width,height){this._lastRect={width,height};const next=selectLayout({width,itemsPerRow:this._config.items_per_row});if(next!==this._layout){this._layout=next;this._render()}}
  _moreInfo(entityId){if(!entityId)return;this.dispatchEvent(new CustomEvent('hass-more-info',{detail:{entityId},bubbles:true,composed:true}))}
  async _control(event){
    event.stopPropagation();
    const button=event.currentTarget;const entityId=button?.dataset?.entity;const action=button?.dataset?.action;const service=coverServiceForAction(action);
    if(!entityId||!service||!this.hass?.callService)return;
    const pending=this._pendingActions.get(entityId)??new Set();
    if((action==='stop'&&pending.has('stop'))||(action!=='stop'&&(pending.size||this._autoStopPending.has(entityId))))return;
    pending.add(action);this._pendingActions.set(entityId,pending);this._render();
    try{await this.hass.callService('cover',service,{entity_id:entityId})}
    catch(error){this.dispatchEvent(new CustomEvent('hass-notification',{detail:{message:`${this._config.title}控制失敗：${error?.message??error}`},bubbles:true,composed:true}))}
    finally{pending.delete(action);if(!pending.size)this._pendingActions.delete(entityId);this._render()}
  }

  _globalControlTargets(action,group=''){return resolveGlobalControlTargets(this._config,this.hass?.states,action,group).filter((entityId)=>action!=='stop'||!this._pendingActions.get(entityId)?.has('stop'))}

  async _globalControl(event){
    event.stopPropagation();
    const action=event.currentTarget?.dataset?.action;const group=event.currentTarget?.dataset?.group??'';const service=coverServiceForAction(action);const targets=this._globalControlTargets(action,group);
    const directionBlocked=action!=='stop'&&(this._globalActions.size||this._pendingActions.size||this._autoStopPending.size);
    if(!service||!targets.length||this._globalActions.has(action)||directionBlocked||!this.hass?.callService)return;
    this._globalActions.add(action);
    for(const entityId of targets){const pending=this._pendingActions.get(entityId)??new Set();pending.add(action);this._pendingActions.set(entityId,pending)}
    this._render();
    try{await this.hass.callService('cover',service,{entity_id:targets})}
    catch(error){const label={open:'全開',stop:'全停',close:'全關'}[action]??'全域';this.dispatchEvent(new CustomEvent('hass-notification',{detail:{message:`${this._config.title}${label}失敗：${error?.message??error}`},bubbles:true,composed:true}))}
    finally{for(const entityId of targets){const pending=this._pendingActions.get(entityId);pending?.delete(action);if(!pending?.size)this._pendingActions.delete(entityId)}this._globalActions.delete(action);this._render()}
  }

  _renderGlobalControls(){
    if(!this._config.show_global_controls)return '';
    const directionBusy=Boolean(this._globalActions.size||this._pendingActions.size||this._autoStopPending.size);
    return `<nav class="global-controls" aria-label="卡片內所有 Cover 全域控制">
      ${[['open','global-open','全開'],['stop','global-stop','全停'],['close','global-close','全關']].map(([action,className,label])=>{const busy=action==='stop'?this._globalActions.has('stop'):directionBusy;const disabled=busy||!this._globalControlTargets(action).length;return `<button type="button" class="${className}" data-action="${action}" ${disabled?'disabled':''} aria-label="${label}卡片內所有可控制 Cover">${label}</button>`}).join('')}
    </nav>`;
  }

  _renderGroupControls(){
    if(!this._config.show_group_controls)return '';
    const groups=[...new Set(this._config.items.map((item)=>item.group).filter(Boolean))];
    const directionBusy=Boolean(this._globalActions.size||this._pendingActions.size||this._autoStopPending.size);
    return groups.map((group)=>`<nav class="group-controls" data-group="${escapeHtml(group)}" aria-label="${escapeHtml(`${group}群組控制`)}"><strong class="control-heading">${escapeHtml(group)}</strong>${[['open','global-open','全開'],['stop','global-stop','全停'],['close','global-close','全關']].map(([action,className,label])=>{const busy=action==='stop'?this._globalActions.has('stop'):directionBusy;const disabled=busy||!this._globalControlTargets(action,group).length;return `<button type="button" class="${className}" data-action="${action}" data-group="${escapeHtml(group)}" ${disabled?'disabled':''} aria-label="${escapeHtml(`${group}${label}`)}">${label}</button>`}).join('')}</nav>`).join('');
  }

  _autoStopStates(){return [...new Map(this._config.items.map((item)=>resolveAutoStopState(item,this.hass?.states)).filter((state)=>state.supported).map((state)=>[state.entityId,state])).values()]}

  _autoStopReason(states){
    if(!this.hass?.callService||!this.hass?.services?.uninus_greenhouse_rollup?.set_auto_stop_at_travel_end)return 'Home Assistant 自動停機設定服務不可用';
    if(!states.length||states.some((state)=>!state.available))return 'Cover 狀態不可用';
    if(states.some((state)=>!state.known))return '自動停機或繼電器狀態不完整';
    if(states.some((state)=>state.busy))return '運轉中或繼電器仍通電，請先停止';
    if(states.some((state)=>this._pendingActions.has(state.entityId)))return '控制命令尚未完成';
    if(states.some((state)=>this._autoStopPending.has(state.entityId)))return '自動停機設定等待狀態確認';
    return '';
  }

  _autoStopWritable(states){return !this._autoStopReason(states)}

  _finishAutoStop(operation,error=''){
    if(!operation.ids.some((id)=>this._autoStopPending.get(id)===operation))return;
    clearTimeout(operation.timer);operation.timer=null;
    for(const id of operation.ids)if(this._autoStopPending.get(id)===operation)this._autoStopPending.delete(id);
    this._autoStopError=error;
    this._render();
  }

  _reconcileAutoStop(){
    const states=new Map(this._autoStopStates().map((state)=>[state.entityId,state]));
    for(const operation of new Set(this._autoStopPending.values())){
      if(operation.settled&&operation.ids.every((id)=>states.get(id)?.enabled===operation.enabled))this._finishAutoStop(operation);
    }
  }

  async _writeAutoStop(ids,enabled){
    const scope=this._autoStopStates().filter((state)=>ids.includes(state.entityId));
    if(scope.length!==ids.length||!this._autoStopWritable(scope))return;
    const operation={ids,enabled,settled:false,timer:null};
    for(const id of ids)this._autoStopPending.set(id,operation);
    this._autoStopError='';
    operation.timer=setTimeout(()=>{
      if(!ids.some((id)=>this._autoStopPending.get(id)===operation))return;
      operation.timer=null;operation.timedOut=true;
      const error='自動停機設定未收到狀態確認，請重新確認 Home Assistant 狀態。';
      if(operation.settled)this._finishAutoStop(operation,error);
      else{this._autoStopError=error;this._render()}
    },10000);
    this._render();
    try{
      await this.hass.callService('uninus_greenhouse_rollup','set_auto_stop_at_travel_end',{entity_id:ids,enabled});
      if(!ids.some((id)=>this._autoStopPending.get(id)===operation))return;
      operation.settled=true;this._reconcileAutoStop();
      if(operation.timedOut)this._finishAutoStop(operation,'自動停機設定未收到狀態確認，請重新確認 Home Assistant 狀態。');
    }catch(error){
      if(ids.some((id)=>this._autoStopPending.get(id)===operation))this._finishAutoStop(operation,`自動停機設定失敗：${error?.message??error}`);
    }
  }

  _closeAutoStopConfirmation(){
    const invoker=this._autoStopConfirmation?.invoker;
    this._autoStopConfirmation=null;this._render();
    const buttons=[...this.shadowRoot.querySelectorAll('button')].filter((button)=>!button.disabled&&!button.closest('[inert]'));
    const next=buttons.find((button)=>invoker&&(invoker.batch?button.dataset.autoStopBatch==='false':button.classList.contains('auto-stop-switch')&&button.dataset.entity===invoker.entity))
      ??buttons.find((button)=>button.classList.contains('system'))??buttons[0];
    if(next)next.focus();else{this.tabIndex=-1;this.focus()}
  }

  _requestAutoStop(ids,enabled,batch=false){
    const scope=this._autoStopStates().filter((state)=>ids.includes(state.entityId));
    if(scope.length!==ids.length||!this._autoStopWritable(scope))return;
    if(enabled){this._writeAutoStop(ids,true);return}
    const item=this._config.items.find((item)=>item.cover_entity===ids[0]);
    this._autoStopConfirmation={ids,batch,invoker:{batch,entity:ids[0]},label:batch?`此卡片內 ${ids.length} 個支援的 Cover`:item?.name||ids[0]};
    this._render();
    this.shadowRoot.querySelector('[data-auto-stop-cancel]')?.focus();
  }

  _confirmationWritable(){
    const confirmation=this._autoStopConfirmation;if(!confirmation)return false;
    const scope=this._autoStopStates().filter((state)=>confirmation.ids.includes(state.entityId));
    return scope.length===confirmation.ids.length&&this._autoStopWritable(scope)
      &&(!confirmation.batch||this._autoStopStates().map((state)=>state.entityId).join('|')===confirmation.ids.join('|'));
  }

  _renderAutoStopConfirmation(){
    if(!this._autoStopConfirmation)return '';
    return `<div class="auto-stop-overlay"><section class="auto-stop-dialog" role="alertdialog" aria-modal="true" aria-labelledby="auto-stop-confirm-title" aria-describedby="auto-stop-confirm-description"><h3 id="auto-stop-confirm-title">停用自動停機？</h3><p id="auto-stop-confirm-description">${escapeHtml(this._autoStopConfirmation.label)}：停用後，設定行程時間到達不會自動切斷繼電器，必須自行停止。請確認設備有可靠的限位保護。</p><button type="button" data-auto-stop-cancel>取消</button><button type="button" data-auto-stop-confirm ${this._confirmationWritable()?'':'disabled'}>確認停用</button></section></div>`;
  }

  _renderAutoStopHeader(){
    const states=this._autoStopStates();
    if(!states.length)return '<span class="system"><i></i>GREENHOUSE VENTILATION</span>';
    const label=states.some((state)=>!state.known||!state.available)?'狀態不完整':states.every((state)=>state.enabled)?'全啟用':states.every((state)=>!state.enabled)?'全停用':'部分啟用';
    return `<button type="button" class="system" aria-expanded="${this._autoStopExpanded===true}" aria-controls="auto-stop-panel" aria-label="自動停機：${label}"><i></i>自動停機 · ${label}<span aria-hidden="true">${this._autoStopExpanded?'▴':'▾'}</span></button>`;
  }

  _renderAutoStopPanel(){
    if(!this._autoStopExpanded||!this._autoStopStates().length)return '';
    const disabled=!this._autoStopWritable(this._autoStopStates());
    return `<section id="auto-stop-panel" class="auto-stop-panel" aria-label="卡片內自動停機設定"><p>啟用後，由 Cover 啟動全開／全關並經過設定行程時間後，關閉兩個方向 Switch。僅套用此卡片內支援的雙開關 Cover。</p><div><button type="button" data-auto-stop-batch="true" ${disabled?'disabled':''}>全部啟用</button><button type="button" data-auto-stop-batch="false" ${disabled?'disabled':''}>全部停用</button></div></section>`;
  }

  _render(){
    if(!this.shadowRoot)return;
    if(!this.hass){this.shadowRoot.innerHTML=`<style>${this.constructor.styles}</style><div class="rollup-card"><div>等待 Home Assistant 狀態資料…</div></div>`;return}
    const active=this.shadowRoot.activeElement;const focus=active?{entity:active.dataset?.entity,action:active.dataset?.action,auto:active.classList.contains('auto-stop-switch'),system:active.classList.contains('system'),confirm:active.hasAttribute('data-auto-stop-confirm'),cancel:active.hasAttribute('data-auto-stop-cancel'),batch:active.dataset?.autoStopBatch,more:active.classList.contains('more-info')}:null;
    const tokens=resolveThemeTokens(this._config);const subtitle=resolveSubtitle(this._config,this.hass.states);
    const style=`--rollup-bg:${tokens.background};--rollup-surface:${tokens.surface};--rollup-text:${tokens.text};--rollup-muted:${tokens.muted};--rollup-frame:${tokens.frame};--rollup-shadow:${tokens.shadow};--rollup-ui-accent:${tokens.uiAccent};--rollup-ui-idle:${tokens.uiIdle};--rollup-ui-danger:${tokens.uiDanger};--rollup-moving:${this._config.status_moving_color};--rollup-idle:${this._config.status_idle_color};--closed-color:${this._config.closed_color};--open-color:${this._config.open_color}`;
    this.shadowRoot.innerHTML=`<style>${this.constructor.styles}</style><div class="rollup-card ${escapeHtml(this._layout)}" style="${escapeHtml(style)}" aria-label="${escapeHtml(`${this._config.title}，${subtitle}`)}">
      <header class="header"><div><h2>${escapeHtml(this._config.title)}</h2>${subtitle?`<p>${escapeHtml(subtitle)}</p>`:''}</div>${this._renderAutoStopHeader()}</header>${this._renderAutoStopPanel()}${this._autoStopError?`<p class="auto-stop-error" role="alert">${escapeHtml(this._autoStopError)}</p>`:''}
      ${this._renderGlobalControls()}
      ${this._renderGroupControls()}
      <section class="faces">${this._config.items.map((item)=>this._renderFace(item)).join('')}</section>${this._renderAutoStopConfirmation()}
    </div>`;
    this.shadowRoot.querySelector('button.system')?.addEventListener('click',()=>{this._autoStopExpanded=!this._autoStopExpanded;this._render()});
    this.shadowRoot.querySelectorAll('.auto-stop-switch').forEach((button)=>button.addEventListener('click',(event)=>{event.stopPropagation();if(!button.disabled)this._requestAutoStop([button.dataset.entity],button.getAttribute('aria-checked')!=='true')}));
    this.shadowRoot.querySelectorAll('[data-auto-stop-batch]').forEach((button)=>button.addEventListener('click',()=>{if(!button.disabled)this._requestAutoStop(this._autoStopStates().map((state)=>state.entityId),button.dataset.autoStopBatch==='true',true)}));
    this.shadowRoot.querySelector('[data-auto-stop-cancel]')?.addEventListener('click',()=>this._closeAutoStopConfirmation());
    this.shadowRoot.querySelector('[data-auto-stop-confirm]')?.addEventListener('click',()=>{if(!this._confirmationWritable())return;const {ids}=this._autoStopConfirmation;this._autoStopConfirmation=null;this._writeAutoStop(ids,false)});
    this.shadowRoot.querySelectorAll('.face').forEach((element)=>element.addEventListener('click',()=>this._moreInfo(element.dataset.entity)));
    this.shadowRoot.querySelectorAll('.more-info').forEach((button)=>button.addEventListener('click',(event)=>{event.stopPropagation();this._moreInfo(button.dataset.entity)}));
    this.shadowRoot.querySelectorAll('.controls button').forEach((button)=>button.addEventListener('click',(event)=>this._control(event)));
    this.shadowRoot.querySelectorAll('.global-controls button,.group-controls button').forEach((button)=>button.addEventListener('click',(event)=>this._globalControl(event)));
    this.shadowRoot.querySelectorAll('.rollup-card > :not(.auto-stop-overlay)').forEach((element)=>{element.inert=Boolean(this._autoStopConfirmation)});
    if(focus){const next=[...this.shadowRoot.querySelectorAll('button')].find((button)=>!button.disabled&&button.dataset?.entity===focus.entity&&button.dataset?.action===focus.action&&button.classList.contains('auto-stop-switch')===focus.auto&&button.classList.contains('system')===focus.system&&button.hasAttribute('data-auto-stop-confirm')===focus.confirm&&button.hasAttribute('data-auto-stop-cancel')===focus.cancel&&button.dataset?.autoStopBatch===focus.batch&&button.classList.contains('more-info')===focus.more);if(next&&!next.closest('[inert]'))next.focus()}
    if(this._autoStopConfirmation&&!this.shadowRoot.activeElement?.closest('.auto-stop-dialog'))this.shadowRoot.querySelector('[data-auto-stop-cancel]')?.focus();
  }

  _renderFace(face){
    const state=resolveFaceState(face,this.hass.states);const displayName=String(face.name??'').trim();const meta=KIND_META[face.kind]??KIND_META.rollup;const visualPercent=state.positionKnown?state.percent:50;const accent=face.accent_color||this._config.open_color;const status=state.commandState==='conflict'?'#ff6b6b':state.moving?this._config.status_moving_color:this._config.status_idle_color;const light=18+visualPercent*.48;const open=face.accent_color||`hsl(43 96% ${light}%)`;const cls=`face cover-item kind-${face.kind} scroll-${face.scroll_mode} motion-${state.motion} ${state.moving?'moving':'idle'} ${state.positionKnown?'':'unknown'} ${state.commandState==='conflict'?'conflict':''} ${this._config.animation?'animated':''}`;
    // Both metrics belong to the same Cover. Geometry/services always use opening position.
    const reversed=face.percentage_mode==='reversed';
    const openingAvailable=state.available&&state.positionKnown;
    // Derive only for older integrations/native covers that omit the attribute entirely.
    // An explicit null/invalid coverage_position is authoritative unknown, not a fallback.
    const displayPercent=openingAvailable?(reversed?(state.coveragePositionProvided?state.coveragePercent:100-state.percent):state.percent):null;
    const percentageAvailable=displayPercent!==null;
    const percentageLabel=reversed?'覆蓋率':'開啟率';
    const positionStateLabel=openingAvailable
      ?state.percent<=0?'全閉':state.percent>=100?'全開':state.managedCover?'部分開啟（估算）':'部分開啟'
      :state.positionLabel;
    const footerPercentage=`${percentageLabel} ${percentageAvailable?`${displayPercent}%`:'N/A'}`;
    const positionLabel=percentageAvailable
      ?`${state.percent<=0?'全閉 · ':state.percent>=100?'全開 · ':state.managedCover?'估算':''}${percentageLabel} ${displayPercent}%`
      :openingAvailable&&reversed?'覆蓋率未知':state.positionLabel;
    const detail=state.integration?[state.commandLabel,state.confidenceLabel].filter(Boolean).join(' · '):state.available?`${Math.round(state.value)} ${this._config.unit} / ${state.maximum} ${this._config.unit}`:face.entity||'尚未設定實體';
    const pending=this._pendingActions.get(state.controlEntity)??new Set();const directionDisabled=!state.available||state.commandState==='conflict'||pending.size>0||this._autoStopPending.has(state.controlEntity);const stopDisabled=!state.available||pending.has('stop');
    const controlCount=['open','stop','close'].filter((action)=>state.supports?.[action]!==false).length;
    const controls=state.integration&&controlCount?`<div class="controls" role="group" style="--control-count:${controlCount}" aria-label="${escapeHtml(`${displayName}控制`)}">
      ${state.supports?.open!==false?`<button type="button" data-action="open" data-entity="${escapeHtml(state.controlEntity)}" ${directionDisabled?'disabled':''} aria-label="開啟${escapeHtml(displayName)}">${face.scroll_mode==='horizontal'?'▶':'▲'} 開啟</button>`:''}
      ${state.supports?.stop!==false?`<button type="button" class="stop" data-action="stop" data-entity="${escapeHtml(state.controlEntity)}" ${stopDisabled?'disabled':''} aria-label="停止${escapeHtml(displayName)}">■ 停止</button>`:''}
      ${state.supports?.close!==false?`<button type="button" data-action="close" data-entity="${escapeHtml(state.controlEntity)}" ${directionDisabled?'disabled':''} aria-label="關閉${escapeHtml(displayName)}">${face.scroll_mode==='horizontal'?'◀':'▼'} 關閉</button>`:''}
    </div>`:'';
    const autoStop=resolveAutoStopState(face,this.hass.states);
    const autoStopFooter=autoStop.supported?`<span class="auto-stop-setting"><span class="auto-stop-label">自動停機 <button type="button" class="auto-stop-switch" role="switch" data-entity="${escapeHtml(autoStop.entityId)}" aria-label="${escapeHtml(displayName)}自動停機${autoStop.known?'':'，狀態不完整'}" data-unknown="${!autoStop.known}" title="${escapeHtml(this._autoStopReason([autoStop])||'行程結束後關閉兩個方向 Switch')}" aria-checked="${autoStop.enabled===true}" aria-busy="${this._autoStopPending.has(autoStop.entityId)}" ${!this._autoStopWritable([autoStop])?'disabled':''}></button></span><em>${escapeHtml(footerPercentage)}</em></span>`:'';
    return `<article class="${escapeHtml(cls)}" data-entity="${escapeHtml(state.controlEntity)}" style="--open:${visualPercent}%;--face-accent:${escapeHtml(accent)};--face-ui-color:${face.accent_color?escapeHtml(accent):'var(--rollup-ui-accent)'};--status-color:${escapeHtml(status)};--status-ui-color:${state.commandState==='conflict'?'var(--rollup-ui-danger)':state.moving?'var(--rollup-ui-accent)':'var(--rollup-ui-idle)'};--open-color:${escapeHtml(open)}">
      <div class="face-head"><span class="compass"><ha-icon icon="${escapeHtml(face.icon||meta.icon)}"></ha-icon>${face.direction?`<span>${escapeHtml(face.direction)}</span>`:''}</span><span class="name">${escapeHtml(displayName)}${face.label?`<small>${escapeHtml(face.label)}</small>`:''}</span><span class="motion"><i></i>${escapeHtml(state.motionLabel)}</span></div>
      <div class="scene" role="img" aria-label="${escapeHtml(`${meta.label}${displayName}，${positionLabel}，${state.motionLabel}`)}">
        <div class="opening"><b class="ray one"></b><b class="ray two"></b><i class="rollup-air"></i><i class="rollup-air"></i><i class="rollup-air"></i></div>
        <div class="curtain"><i class="shine"></i><b></b><b></b></div><div class="roller"><i></i><span></span><i></i></div>
        <span class="scale top">${reversed?0:100}</span><span class="scale mid">50</span><span class="scale bottom">${reversed?100:0}</span><strong class="percent">${percentageAvailable?`${displayPercent}%`:'—'}</strong>
      </div>
      <footer class="foot ${autoStop.supported?'auto-stop-foot':''}"><button type="button" class="more-info" data-entity="${escapeHtml(state.controlEntity)}" aria-label="開啟${escapeHtml(displayName)}詳細資料" title="${escapeHtml(`${positionLabel} · ${detail}`)}"><span class="copy"><strong>${escapeHtml(positionStateLabel)}</strong><small>${escapeHtml(detail)}</small></span>${autoStop.supported?'':`<em>${escapeHtml(footerPercentage)}</em>`}</button>${autoStopFooter}</footer>
      ${controls}
    </article>`;
  }

  _layoutColumns(){return Number(this._layout.split('-').at(-1))||1}
  getCardSize(){return Math.max(4,Math.ceil(this._config.items.length/this._layoutColumns())*4)}
  getGridOptions(){return GRID_OPTIONS}
  static getStubConfig(){return normalizeConfig({items:[{id:'east',name:'東側',direction:'E',entity_mode:'cover_entity'},{id:'south',name:'南側',direction:'S',entity_mode:'cover_entity'},{id:'west',name:'西側',direction:'W',entity_mode:'cover_entity'},{id:'north',name:'北側',direction:'N',entity_mode:'cover_entity'}]})}
  static async getConfigElement(){await customElements.whenDefined('uninus-greenhouse-rollup-card-editor');return document.createElement('uninus-greenhouse-rollup-card-editor')}
}
