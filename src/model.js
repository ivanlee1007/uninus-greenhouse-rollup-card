export const FACE_KEYS = ['east', 'south', 'west', 'north'];

const FACE_DEFAULTS = {
  east: { key: 'east', compass: 'E', name: '東側' },
  south: { key: 'south', compass: 'S', name: '南側' },
  west: { key: 'west', compass: 'W', name: '西側' },
  north: { key: 'north', compass: 'N', name: '北側' },
};

const THEMES = new Set(['dark', 'light', 'greenhouse', 'sand', 'uninus']);
const COLOR_PATTERN = /^(#[0-9a-f]{3,8}|rgba?\([^)]+\)|hsla?\([^)]+\)|[a-z]+)$/i;
const COVER_FEATURE_OPEN = 1;
const COVER_FEATURE_CLOSE = 2;
const COVER_FEATURE_STOP = 8;

export const DEFAULT_CONFIG = Object.freeze({
  type: 'custom:uninus-greenhouse-rollup-card',
  title: '溫室側簾捲揚',
  subtitle: '四向開啟位置・透光／通風狀態・即時運轉監測',
  subtitle_entity: '',
  subtitle_attribute: '',
  theme: 'dark',
  items_per_row: 2,
  animation: true,
  show_global_controls: false,
  unit: '秒',
  status_idle_color: '#8798a2',
  status_moving_color: '#ffd54a',
  closed_color: '#3d4b52',
  open_color: '#ffd54a',
  background_color: '',
});

export const GRID_OPTIONS = Object.freeze({ columns: 'full', min_columns: 6 });

export function isValidColor(value) {
  return typeof value === 'string' && COLOR_PATTERN.test(value.trim()) && !/url|javascript|expression/i.test(value);
}

function normalizeFace(input, key) {
  const base = FACE_DEFAULTS[key];
  const value = input && typeof input === 'object' ? input : {};
  return {
    ...base,
    cover_entity: '',
    entity: '',
    motion_entity: '',
    max_entity: '',
    ...value,
    key,
    entity_mode: value.entity_mode === 'cover_entity' || value.entity_mode === 'position_entity'
      ? value.entity_mode
      : value.cover_entity ? 'cover_entity' : 'position_entity',
    name: String(value.name ?? base.name),
    max_value: Number.isFinite(Number(value.max_value)) && Number(value.max_value) > 0 ? Number(value.max_value) : 120,
    accent_color: isValidColor(value.accent_color) ? value.accent_color : '',
  };
}

export function normalizeConfig(raw = {}) {
  const input = raw && typeof raw === 'object' ? raw : {};
  const { force_1x4: legacyForceOneByFour, ...config } = input;
  const suppliedFaces = Array.isArray(config.faces) ? config.faces : [];
  const byKey = new Map(suppliedFaces.map((face) => [face?.key, face]));
  const normalized = {
    ...DEFAULT_CONFIG,
    ...config,
    type: DEFAULT_CONFIG.type,
    theme: THEMES.has(config.theme) ? config.theme : DEFAULT_CONFIG.theme,
    items_per_row: config.items_per_row === 'auto'
      ? 'auto'
      : Number.isFinite(Number(config.items_per_row))
        ? Math.max(1, Math.min(4, Math.floor(Number(config.items_per_row))))
        : legacyForceOneByFour === true ? 4 : DEFAULT_CONFIG.items_per_row,
    animation: config.animation !== false,
    show_global_controls: config.show_global_controls === true,
    faces: FACE_KEYS.map((key, index) => normalizeFace(byKey.get(key) ?? suppliedFaces[index], key)),
  };
  for (const key of ['status_idle_color', 'status_moving_color', 'closed_color', 'open_color']) {
    if (!isValidColor(config[key])) normalized[key] = DEFAULT_CONFIG[key];
  }
  normalized.background_color = isValidColor(config.background_color) ? config.background_color : '';
  return normalized;
}

function numericState(entityId, states) {
  if (!entityId || !states?.[entityId]) return Number.NaN;
  return Number(states[entityId].state);
}

export function resolveFaceState(face, states = {}) {
  const cover = face.cover_entity ? states?.[face.cover_entity] : undefined;
  const integrationMode = face.entity_mode === 'cover_entity' || (!face.entity_mode && face.cover_entity);
  if (integrationMode) {
    return resolveIntegrationCoverState(
      face,
      cover ?? { state: 'unavailable', attributes: {} },
    );
  }
  const raw = numericState(face.entity, states);
  const maxFromEntity = numericState(face.max_entity, states);
  const maximum = Number.isFinite(maxFromEntity) && maxFromEntity > 0
    ? maxFromEntity
    : Number.isFinite(Number(face.max_value)) && Number(face.max_value) > 0 ? Number(face.max_value) : 120;
  const available = Number.isFinite(raw);
  const value = available ? raw : 0;
  const percent = Math.max(0, Math.min(100, Math.round((value / maximum) * 100)));
  const motionState = face.motion_entity ? states?.[face.motion_entity] : undefined;
  const state = String(motionState?.state ?? '').toLowerCase();
  const direction = String(motionState?.attributes?.direction ?? state).toLowerCase();
  const moving = state === 'on' || state === 'opening' || state === 'closing' || state === 'moving';
  const motion = !moving ? 'idle' : direction === 'closing' ? 'closing' : direction === 'opening' ? 'opening' : 'moving';
  const motionLabel = motion === 'idle' ? '靜止' : motion === 'opening' ? '開啟中' : motion === 'closing' ? '關閉中' : '捲動中';
  const positionLabel = !available ? '位置資料不可用' : percent <= 0 ? '全閉' : percent >= 100 ? '全開' : `局部開啟 ${percent}%`;
  return {
    available,
    value,
    maximum,
    percent,
    moving,
    motion,
    motionLabel,
    positionLabel,
    positionKnown: available,
    integration: false,
    controlEntity: face.entity,
    confidence: '',
    confidenceLabel: '',
    commandState: motion,
    commandLabel: motionLabel,
  };
}

function resolveIntegrationCoverState(face, cover) {
  const entityState = String(cover.state ?? '').toLowerCase();
  const positionValue = cover.attributes?.current_position;
  const rawPosition = positionValue === null || positionValue === undefined || positionValue === ''
    ? Number.NaN
    : Number(positionValue);
  const positionKnown = Number.isFinite(rawPosition);
  const percent = positionKnown ? Math.max(0, Math.min(100, Math.round(rawPosition))) : null;
  const managedCover = cover.attributes?.position_is_estimated === true;
  const commandState = managedCover
    ? String(cover.attributes?.command_state ?? entityState).toLowerCase()
    : entityState;
  const available = entityState !== 'unavailable'
    && (managedCover ? commandState !== 'unavailable' : entityState !== 'unknown');
  const confidence = managedCover
    ? String(cover.attributes?.position_confidence ?? 'unknown').toLowerCase()
    : '';
  const motion = entityState === 'opening' && (!managedCover || !positionKnown || percent < 100)
    ? 'opening'
    : entityState === 'closing' && (!managedCover || !positionKnown || percent > 0) ? 'closing' : 'idle';
  const moving = motion !== 'idle';
  const motionLabel = managedCover && commandState === 'conflict'
    ? '控制衝突'
    : managedCover && commandState === 'opening_timer' && percent >= 100
      ? '已全開'
      : managedCover && positionKnown && commandState === 'closing_timer' && percent <= 0
        ? '已全關'
        : motion === 'opening' ? '開啟中' : motion === 'closing' ? '關閉中' : '靜止';
  const commandLabel = !managedCover
    ? '裝置回報'
    : commandState === 'opening_timer'
      ? '開啟計時中'
      : commandState === 'closing_timer'
        ? '關閉計時中'
        : commandState === 'opening'
          ? '開啟命令中'
          : commandState === 'closing'
            ? '關閉命令中'
            : commandState === 'conflict'
              ? '開關衝突'
              : commandState === 'unavailable' ? '控制不可用' : '沒有控制命令';
  const confidenceLabel = !managedCover
    ? ''
    : confidence === 'calibrated'
      ? '端點已校正'
      : confidence === 'estimated' ? '估算位置' : '位置未校正';
  const positionLabel = !available
    ? '位置資料不可用'
    : managedCover
      ? !positionKnown ? '位置尚未校正' : percent <= 0 ? '全閉' : percent >= 100 ? '全開' : `估算開啟 ${percent}%`
      : positionKnown
        ? percent <= 0 ? '全閉' : percent >= 100 ? '全開' : `開啟 ${percent}%`
        : entityState === 'closed' ? '已全關・位置未提供' : entityState === 'open' ? '已開啟・位置未提供' : entityState === 'opening' ? '開啟中・位置未提供' : entityState === 'closing' ? '關閉中・位置未提供' : '位置未提供';
  const featureValue = Number(cover.attributes?.supported_features);
  const hasFeatures = Number.isFinite(featureValue);
  const supports = !hasFeatures
    ? { open: true, close: true, stop: true }
    : {
        open: Boolean(featureValue & COVER_FEATURE_OPEN),
        close: Boolean(featureValue & COVER_FEATURE_CLOSE),
        stop: Boolean(featureValue & COVER_FEATURE_STOP),
      };
  return {
    available,
    value: positionKnown ? percent : null,
    maximum: 100,
    percent,
    moving,
    motion,
    motionLabel,
    positionLabel,
    positionKnown,
    integration: true,
    managedCover,
    controlEntity: face.cover_entity,
    confidence,
    confidenceLabel,
    commandState,
    commandLabel,
    supports,
  };
}

export function coverServiceForAction(action) {
  return ({ open: 'open_cover', stop: 'stop_cover', close: 'close_cover' })[action] ?? '';
}

export function resolveGlobalControlTargets(config, states = {}, action) {
  if (!coverServiceForAction(action)) return [];
  const targets = new Set();
  for (const face of normalizeConfig(config).faces) {
    const state = resolveFaceState(face, states);
    if (!state.integration || !state.available || !/^cover\.[a-z0-9_]+$/.test(state.controlEntity ?? '')) continue;
    if (state.supports?.[action] === false) continue;
    if (action !== 'stop' && state.commandState === 'conflict') continue;
    targets.add(state.controlEntity);
  }
  return [...targets];
}

export function resolveSubtitle(config, states = {}) {
  const entity = config.subtitle_entity ? states?.[config.subtitle_entity] : undefined;
  if (entity && config.subtitle_attribute) {
    const value = entity.attributes?.[config.subtitle_attribute];
    if (value !== undefined && value !== null && value !== '') return String(value);
  }
  if (entity && !config.subtitle_attribute && entity.state !== undefined) return String(entity.state);
  return String(config.subtitle ?? '');
}

export function selectLayout({ width = 0, itemsPerRow = DEFAULT_CONFIG.items_per_row } = {}) {
  if (itemsPerRow === 'auto') {
    const cardWidth = Math.max(0, Number(width) || 0);
    const columns = cardWidth >= 1120 ? 4 : cardWidth >= 820 ? 3 : cardWidth >= 520 ? 2 : 1;
    return `columns-${columns}`;
  }
  const requested = Math.max(1, Math.min(4, Math.floor(Number(itemsPerRow)) || DEFAULT_CONFIG.items_per_row));
  return `columns-${requested}`;
}

export function updateFaceConfig(config, faceKey, property, value) {
  return {
    ...config,
    faces: config.faces.map((face) => face.key === faceKey ? { ...face, [property]: value } : face),
  };
}

export function applyEditorChange(config, { faceKey, property, value, valueType } = {}) {
  const nextValue = valueType === 'boolean' ? value === true : value;
  if (faceKey) return updateFaceConfig(config, faceKey, property, nextValue);
  return { ...config, [property]: nextValue };
}

export function configForSave(config) {
  const result = {
    ...config,
    faces: config.faces.map((face) => {
      if (face.entity_mode === 'cover_entity') {
        const { entity: _entity, motion_entity: _motion, max_entity: _maxEntity, max_value: _maxValue, ...coverFace } = face;
        return coverFace;
      }
      const { cover_entity: _cover, ...legacyFace } = face;
      return legacyFace;
    }),
  };
  if (!result.faces.some((face) => face.entity_mode === 'position_entity')) delete result.unit;
  return result;
}

const THEME_TOKENS = Object.freeze({
  dark: {
    background: 'radial-gradient(circle at 12% -8%,rgba(104,128,135,.22),transparent 38%),linear-gradient(155deg,#192329 0%,#10171b 58%,#0a0f12 100%)',
    surface: 'rgba(31,43,48,.9)', text: '#eef3f2', muted: '#b8c8c5', frame: '#10191d', shadow: 'rgba(2,8,10,.38)', uiAccent: '#f4cf5a', uiIdle: '#b8c8c5', uiDanger: '#ff8a80',
  },
  light: {
    background: 'radial-gradient(circle at 10% -12%,rgba(255,255,255,.96),transparent 42%),linear-gradient(155deg,#f2f5f3 0%,#e7ece9 58%,#dde5e1 100%)',
    surface: 'rgba(255,255,255,.78)', text: '#21312e', muted: '#4f605b', frame: '#d5dfdb', shadow: 'rgba(39,61,54,.15)', uiAccent: '#155f55', uiIdle: '#50615d', uiDanger: '#a83220',
  },
  greenhouse: {
    background: 'radial-gradient(circle at 14% -10%,rgba(104,148,128,.24),transparent 40%),linear-gradient(155deg,#1b382f 0%,#132a23 58%,#0d1e19 100%)',
    surface: 'rgba(31,67,56,.84)', text: '#eff7f2', muted: '#b9cec4', frame: '#10271f', shadow: 'rgba(5,26,19,.34)', uiAccent: '#f3cd5c', uiIdle: '#b9cec4', uiDanger: '#ff9a8f',
  },
  sand: {
    background: 'radial-gradient(circle at 12% -10%,rgba(255,255,255,.56),transparent 42%),linear-gradient(155deg,#eee9df 0%,#e2d8c9 58%,#d7cab7 100%)',
    surface: 'rgba(250,247,241,.78)', text: '#3d352b', muted: '#66594c', frame: '#d2c5b2', shadow: 'rgba(72,54,32,.16)', uiAccent: '#6d4a0c', uiIdle: '#66594c', uiDanger: '#922f20',
  },
  uninus: {
    background: 'radial-gradient(circle at 10% -12%,#ff87543d,transparent 42%),radial-gradient(circle at 92% 8%,#3074c12e,transparent 36%),linear-gradient(155deg,#fbfaf8 0%,#f3f5f6 58%,#e9eef2 100%)',
    surface: 'rgba(255,255,255,.84)', text: '#3f4548', muted: '#53626d', frame: '#d4dde4', shadow: 'rgba(43,69,91,.16)', uiAccent: '#285f9e', uiIdle: '#53626d', uiDanger: '#a83220',
  },
});

export function resolveThemeTokens(config) {
  const tokens = { ...(THEME_TOKENS[config.theme] ?? THEME_TOKENS.dark) };
  if (isValidColor(config.background_color)) tokens.background = config.background_color;
  return tokens;
}

export const THEME_OPTIONS = Object.freeze([
  { value: 'dark', label: '深夜石墨' },
  { value: 'light', label: '雲霧白' },
  { value: 'greenhouse', label: '森林深綠' },
  { value: 'sand', label: '暖陶米' },
  { value: 'uninus', label: 'Uninus' },
]);
