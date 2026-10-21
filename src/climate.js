// Controller state is read from HA only. No browser-owned holds or safety timers.
import { resolveFaceState } from './model.js';
export const CLIMATE_DOMAIN = 'uninus_greenhouse_climate';

const sensorId = (value) => typeof value === 'string' && /^sensor\.[a-z0-9_]+$/.test(value);
const position = (value) => value === null || typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100;
const isoTime = (value) => value === null || typeof value === 'string'
  && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(value) && Number.isFinite(Date.parse(value));

export function resolveClimateState(item, states = {}) {
  const entityId = item.climate_entity ?? '';
  const entity = states[entityId];
  const attrs = entity?.attributes ?? {};
  const associated = Boolean(entityId);
  const valid = associated && sensorId(entityId) && item.entity_mode !== 'position_entity'
    && Boolean(entity) && !['unknown', 'unavailable'].includes(entity.state)
    && attrs.controller_schema === 1 && attrs.cover_entity_id === item.cover_entity
    && ['shadow', 'automatic', 'paused'].includes(attrs.mode)
    && position(attrs.requested_position) && position(attrs.effective_target_position)
    && Array.isArray(attrs.reason_codes) && attrs.reason_codes.every((reason) => typeof reason === 'string')
    && typeof attrs.blocked === 'boolean' && isoTime(attrs.manual_until);
  // Never spread untrusted attributes into control identity or display state.
  return valid ? {
    associated, valid, entityId, mode: attrs.mode,
    requested_position: attrs.requested_position, effective_target_position: attrs.effective_target_position,
    reason_codes: attrs.reason_codes, manual_until: attrs.manual_until, blocked: attrs.blocked,
    error: '',
  } : { associated, valid: false, entityId, error: associated ? '環控控制器資料不可用、格式錯誤或 Cover 不符' : '' };
}

// Inspect ALL aliases, including items outside a selected group. A direct alias
// must not bypass the controller bound to the same physical Cover.
export function resolveClimateBinding(config, entityId, states = {}) {
  const items = config.items.filter((item) => item.entity_mode !== 'position_entity' && item.cover_entity === entityId);
  const bindings = new Set(items.map((item) => item.climate_entity || ''));
  if (bindings.size > 1) return { associated: true, valid: false, error: '同一 Cover 的環控關聯衝突' };
  return resolveClimateState(items[0] ?? {}, states);
}

export function coverActionError(config, hass, entityId, action, target) {
  const item = config.items.find((item) => item.entity_mode !== 'position_entity' && item.cover_entity === entityId);
  if (!item || !/^cover\.[a-z0-9_]+$/.test(entityId)) return 'Cover 不在此卡片控制範圍';
  const state = resolveFaceState(item, hass.states);
  if (!state.available) return 'Cover 狀態不可用';
  if (action === 'stop') return state.supports?.stop === false ? 'Cover 不支援停止' : '';
  if (state.commandState === 'conflict') return 'Cover 控制衝突，請先停止';
  if (action === 'position') {
    if (!Number.isInteger(target) || target < 0 || target > 100) return '目標必須是 0～100 整數';
    const features = hass.states?.[entityId]?.attributes?.supported_features;
    if (!Number.isInteger(features) || !(features & 4) || !state.positionKnown || state.confidence === 'unknown') return '中間位置需要 SET_POSITION 能力及已知位置';
  } else if (!['open', 'close'].includes(action) || state.supports?.[action] === false) return 'Cover 不支援此控制';
  return climateRequestError(config, entityId, hass);
}

export async function executeCoverAction(config, hass, entityId, action, target) {
  const gate = coverActionError(config, hass, entityId, action, target);
  if (gate) throw new Error(gate);
  const binding = resolveClimateBinding(config, entityId, hass.states);
  if (action === 'stop' && binding.associated) {
    const errors = [];
    try {
      if (!binding.valid || !hass.services?.[CLIMATE_DOMAIN]?.set_mode) throw new Error(binding.error || 'set_mode 服務不可用');
      await hass.callService(CLIMATE_DOMAIN, 'set_mode', { entity_id: binding.entityId, mode: 'paused' });
    } catch (error) { errors.push(`環控暫停未確認：${error?.message ?? error}`); }
    // Do not let a failed pause or a later card lifecycle prevent physical Stop.
    try { await hass.callService('cover', 'stop_cover', { entity_id: entityId }); }
    catch (error) { errors.push(`實體停止失敗：${error?.message ?? error}`); }
    if (errors.length) throw new Error(errors.join('；'));
    return;
  }
  const error = climateRequestError(config, entityId, hass);
  if (error) throw new Error(error);
  if (binding.associated) {
    await hass.callService(CLIMATE_DOMAIN, 'request_position', { entity_id: binding.entityId, position: action === 'position' ? target : action === 'open' ? 100 : 0, hold_seconds: config.climate_hold_seconds });
  } else {
    await hass.callService('cover', {open:'open_cover',close:'close_cover',stop:'stop_cover',position:'set_cover_position'}[action], {entity_id:entityId,...(action === 'position' ? {position:target} : {})});
  }
}

export function climateRequestError(config, entityId, hass) {
  const binding = resolveClimateBinding(config, entityId, hass?.states);
  if (!binding.associated) return '';
  if (!binding.valid) return binding.error;
  if (!hass?.services?.[CLIMATE_DOMAIN]?.request_position) return '環控 request_position 服務不可用';
  return '';
}
