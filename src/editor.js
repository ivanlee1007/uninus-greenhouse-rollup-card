import { addItem, applyEditorChange, configForSave, deleteItem, moveItem, normalizeConfig, THEME_OPTIONS } from './model.js';

const escapeHtml=(value)=>String(value??'').replace(/[&<>"']/g,(char)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const DEFAULT_ITEM_NAMES={east:'東側',south:'南側',west:'西側',north:'北側'};
const isCoverEntity=(value)=>/^cover\.[a-z0-9_]+$/.test(String(value??''));

export class UninusGreenhouseRollupCardEditor extends HTMLElement {
  static styles=`
    :host{display:block;color:var(--primary-text-color);font-family:var(--paper-font-body1_-_font-family,system-ui,sans-serif)}
    .editor{display:grid;gap:14px;padding:4px}.section{display:grid;gap:11px;padding:14px;border:1px solid var(--divider-color,#ddd);border-radius:14px;background:var(--card-background-color,#fff)}h3{margin:0;font-size:15px}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.field{display:grid;gap:5px;min-width:0}.field.full{grid-column:1/-1}label{font-size:11px;color:var(--secondary-text-color)}input,select{width:100%;min-width:0;height:40px;box-sizing:border-box;padding:0 10px;border:1px solid var(--divider-color,#bbb);border-radius:9px;background:var(--card-background-color,#fff);color:var(--primary-text-color);font:inherit}input[type=color]{padding:4px}ha-entity-picker{display:block;min-width:0}.validation{grid-column:1/-1;margin:0;color:var(--error-color,#db4437);font-size:12px}.switch{display:flex;align-items:center;justify-content:space-between;gap:10px}.switch input{width:18px;height:18px}.items{display:grid;gap:9px}.item{border:1px solid var(--divider-color,#ddd);border-radius:12px;overflow:hidden}.item summary{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:11px 12px;cursor:pointer;font-weight:700}.item .body{display:grid;gap:10px;padding:0 12px 12px}.item-actions{display:flex;gap:6px}.item-actions button,.add-item{min-height:36px;padding:6px 10px;border:1px solid var(--divider-color,#bbb);border-radius:8px;background:var(--secondary-background-color,#eee);color:var(--primary-text-color);font:inherit;cursor:pointer}.item-actions button:disabled{cursor:not-allowed;opacity:.45}.delete{color:var(--error-color,#db4437)}@media(max-width:560px){.grid{grid-template-columns:1fr}.field.full{grid-column:auto}}
  `;
  constructor(){super();this.attachShadow({mode:'open'});this._config=normalizeConfig({});this._hass=null;this._boundChange=(event)=>this._handleChange(event);this._boundEntity=(event)=>this._handleChange(event);this._boundClick=(event)=>this._handleAction(event)}
  set hass(value){const first=!this._hass;this._hass=value;if(first)this._render();else this.shadowRoot?.querySelectorAll('ha-entity-picker').forEach((picker)=>picker.hass=value)}
  get hass(){return this._hass}
  setConfig(config){this._config=normalizeConfig(config);this._render()}
  connectedCallback(){this._render()}
  _emit(next){this._config=normalizeConfig(next);this.dispatchEvent(new CustomEvent('config-changed',{detail:{config:configForSave(this._config)},bubbles:true,composed:true}));this._render()}
  _handleAction(event){
    const button=event.target.closest?.('[data-action]');if(!button)return;
    const action=button.dataset.action;const itemId=button.dataset.item;
    if(action==='add-item')this._emit(addItem(this._config));
    else if(action==='delete')this._emit(deleteItem(this._config,itemId));
    else if(action==='move-up')this._emit(moveItem(this._config,itemId,-1));
    else if(action==='move-down')this._emit(moveItem(this._config,itemId,1));
  }
  _handleChange(event){
    const element=event.target.closest?.('[data-property]')||event.target;if(!element?.dataset?.property)return;
    // HA pickers emit native search-blur changes before the selected value is ready.
    if(element.localName==='ha-entity-picker'&&event.type!=='value-changed')return;
    const valueType=element.dataset.valueType;let value=event.detail?.value??(valueType==='boolean'?element.checked:element.value??'');if(element.dataset.number==='true')value=Number(value);
    const change={property:element.dataset.property,value,valueType,itemId:element.dataset.item||undefined};
    let next=applyEditorChange(this._config,change);
    if(change.property==='cover_entity'&&change.itemId){
      const index=this._config.items.findIndex((item)=>item.id===change.itemId);const current=this._config.items[index];const friendly=this.hass?.states?.[value]?.attributes?.friendly_name;const defaultName=DEFAULT_ITEM_NAMES[current?.id]??`Cover ${index+1}`;
      if(friendly&&(!current?.name||current.name===defaultName))next=applyEditorChange(next,{itemId:change.itemId,property:'name',value:String(friendly)});
    }
    this._emit(next);
  }
  _text(property,label,value,full=false,item=''){return `<div class="field ${full?'full':''}"><label>${escapeHtml(label)}</label><input data-property="${property}" ${item?`data-item="${escapeHtml(item)}"`:''} value="${escapeHtml(value)}"></div>`}
  _entity(property,label,value,item='',domains=[]){const domainData=escapeHtml(domains.join(','));const allowCustom=domains.length?'':'allow-custom-entity';return customElements.get('ha-entity-picker')?`<div class="field"><ha-entity-picker data-property="${property}" ${item?`data-item="${escapeHtml(item)}"`:''} data-value="${escapeHtml(value)}" data-label="${escapeHtml(label)}" data-domains="${domainData}" ${allowCustom} show-entity-id></ha-entity-picker></div>`:`<div class="field"><label>${escapeHtml(label)}</label><input data-property="${property}" ${item?`data-item="${escapeHtml(item)}"`:''} value="${escapeHtml(value)}" placeholder="sensor.example"></div>`}
  _color(property,label,value,item=''){return `<div class="field"><label>${escapeHtml(label)}</label><input type="color" data-property="${property}" ${item?`data-item="${escapeHtml(item)}"`:''} value="${escapeHtml(value||'#ffd54a')}"></div>`}
  _renderItem(item,index){return `<details class="item item-editor" ${index===0?'open':''}><summary><span>${escapeHtml(item.direction?`${item.direction} · `:'')}${escapeHtml(item.name||`Cover ${index+1}`)}</span><span>›</span></summary><div class="body"><div class="item-actions"><button type="button" data-action="move-up" data-item="${escapeHtml(item.id)}" ${index===0?'disabled':''} aria-label="上移">↑ 上移</button><button type="button" data-action="move-down" data-item="${escapeHtml(item.id)}" ${index===this._config.items.length-1?'disabled':''} aria-label="下移">↓ 下移</button><button type="button" class="delete" data-action="delete" data-item="${escapeHtml(item.id)}">刪除</button></div><div class="grid">
    ${this._text('name','顯示名稱',item.name,false,item.id)}
    <div class="field"><label>類型</label><select data-item="${escapeHtml(item.id)}" data-property="kind"><option value="rollup" ${item.kind==='rollup'?'selected':''}>捲簾</option><option value="skylight" ${item.kind==='skylight'?'selected':''}>天窗</option><option value="shade" ${item.kind==='shade'?'selected':''}>遮陽</option></select></div>
    <div class="field"><label>捲動模式</label><select data-item="${escapeHtml(item.id)}" data-property="scroll_mode"><option value="vertical" ${item.scroll_mode==='vertical'?'selected':''}>上下</option><option value="horizontal" ${item.scroll_mode==='horizontal'?'selected':''}>左右</option></select></div>
    <div class="field"><label>百分比顯示模式</label><select data-item="${escapeHtml(item.id)}" data-property="percentage_mode"><option value="normal" ${item.percentage_mode==='normal'?'selected':''}>一般：全關 0%，全開 100%</option><option value="reversed" ${item.percentage_mode==='reversed'?'selected':''}>反向：全關 100%，全開 0%</option></select></div>
    ${this._text('group','群組（選填）',item.group,false,item.id)}${this._text('direction','方向（選填）',item.direction,false,item.id)}
    ${this._text('label','輔助標籤（選填）',item.label,false,item.id)}${this._text('icon','圖示（選填）',item.icon,false,item.id)}
    ${this._color('accent_color','此項目強調色',item.accent_color||this._config.open_color,item.id)}
    <div class="field"><label>資料模式</label><select data-item="${escapeHtml(item.id)}" data-property="entity_mode"><option value="cover_entity" ${item.entity_mode==='cover_entity'?'selected':''}>標準 Cover</option><option value="position_entity" ${item.entity_mode==='position_entity'?'selected':''}>舊版位置 Entity</option></select></div>
    ${item.entity_mode==='cover_entity'
      ?`${this._entity('cover_entity','標準 Cover Entity',item.cover_entity,item.id,['cover'])}${isCoverEntity(item.cover_entity)?'':'<p class="validation" role="alert">請選擇有效的 cover.* 標準 Cover Entity。</p>'}`
      :`${this._entity('entity','舊版位置 Entity',item.entity,item.id,['sensor','input_number'])}${this._entity('motion_entity','舊版移動狀態 Entity',item.motion_entity,item.id,['binary_sensor','sensor','input_boolean'])}${this._entity('max_entity','最大刻度 Entity（選填）',item.max_entity,item.id,['sensor','input_number'])}<div class="field"><label>固定最大刻度</label><input type="number" min="1" step="1" data-number="true" data-item="${escapeHtml(item.id)}" data-property="max_value" value="${item.max_value}"></div>`}
  </div></div></details>`}
  _render(){
    if(!this.shadowRoot)return;const c=this._config;const hasLegacy=c.items.some((item)=>item.entity_mode==='position_entity');
    this.shadowRoot.removeEventListener('change',this._boundChange);this.shadowRoot.removeEventListener('value-changed',this._boundEntity);this.shadowRoot.removeEventListener('click',this._boundClick);
    this.shadowRoot.innerHTML=`<style>${this.constructor.styles}</style><div class="editor">
      <section class="section"><h3>內容與資料來源</h3><div class="grid">
        ${this._text('title','標題',c.title,true)}${this._text('subtitle','副標文字',c.subtitle,true)}
        ${this._entity('subtitle_entity','副標 Entity',c.subtitle_entity)}${this._text('subtitle_attribute','副標 Attribute',c.subtitle_attribute)}${hasLegacy?this._text('unit','舊版位置值單位',c.unit):''}
      </div></section>
      <section class="section"><h3>版面與外觀</h3><div class="grid">
        <div class="field"><label>背景氛圍</label><select data-property="theme">${THEME_OPTIONS.map((option)=>`<option value="${option.value}" ${option.value===c.theme?'selected':''}>${escapeHtml(option.label)}</option>`).join('')}</select></div>
        ${this._text('background_color','自訂背景色（選填）',c.background_color)}
        ${this._color('status_idle_color','靜止狀態色',c.status_idle_color)}${this._color('status_moving_color','移動狀態色',c.status_moving_color)}
        ${this._color('closed_color','關閉區域色',c.closed_color)}${this._color('open_color','開啟區域色',c.open_color)}
        <div class="field"><label>每列項目數量（1～4 欄）</label><select data-property="items_per_row"><option value="auto" ${c.items_per_row==='auto'?'selected':''}>自適應（依卡片寬度）</option>${[1,2,3,4].map((count)=>`<option value="${count}" ${count===c.items_per_row?'selected':''}>${count} 欄</option>`).join('')}</select></div>
        <div class="field switch"><label>啟用動畫</label><input type="checkbox" data-property="animation" data-value-type="boolean" ${c.animation?'checked':''}></div>
        <div class="field switch full"><label>顯示「全開／全停／全關」全域控制</label><input type="checkbox" data-property="show_global_controls" data-value-type="boolean" ${c.show_global_controls?'checked':''}></div>
        <div class="field switch full"><label>依群組顯示「全開／全停／全關」控制</label><input type="checkbox" data-property="show_group_controls" data-value-type="boolean" ${c.show_group_controls?'checked':''}></div>
      </div></section>
      <section class="section"><h3>Cover 項目</h3><div class="items">${c.items.map((item,index)=>this._renderItem(item,index)).join('')}</div><button type="button" class="add-item" data-action="add-item">＋ 新增 Cover 項目</button></section>
    </div>`;
    this.shadowRoot.addEventListener('change',this._boundChange);this.shadowRoot.addEventListener('value-changed',this._boundEntity);this.shadowRoot.addEventListener('click',this._boundClick);
    this.shadowRoot.querySelectorAll('ha-entity-picker').forEach((picker)=>{picker.hass=this.hass;picker.value=picker.dataset.value||'';picker.label=picker.dataset.label||'';const domains=(picker.dataset.domains||'').split(',').filter(Boolean);if(domains.length)picker.includeDomains=domains});
  }
}
