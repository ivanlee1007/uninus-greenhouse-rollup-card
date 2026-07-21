import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';

const { window } = parseHTML('<html><body></body></html>');
Object.assign(globalThis, {
  window,
  document: window.document,
  HTMLElement: window.HTMLElement,
  CustomEvent: window.CustomEvent,
  customElements: window.customElements,
  ResizeObserver: class {
    observe() {}
    disconnect() {}
  },
});

const { UninusGreenhouseRollupCard } = await import('../src/card.js');
const { UninusGreenhouseRollupCardEditor } = await import('../src/editor.js');
customElements.define('uninus-greenhouse-rollup-test-card', UninusGreenhouseRollupCard);
customElements.define('ha-entity-picker', class extends HTMLElement {});
customElements.define('uninus-greenhouse-rollup-test-editor', UninusGreenhouseRollupCardEditor);

function createCard(coverState, callService) {
  const calls = [];
  const card = window.document.createElement('uninus-greenhouse-rollup-test-card');
  window.document.body.append(card);
  card.setConfig({
    title: 'Runtime test',
    items_per_row: 2,
    faces: [{
      key: 'east',
      name: 'East',
      entity_mode: 'cover_entity',
      cover_entity: 'cover.east',
    }],
  });
  card.hass = {
    states: { 'cover.east': coverState },
    callService: callService ?? (async (...args) => calls.push(args)),
  };
  return { card, calls };
}

test('integration control click calls the exact cover service without opening More Info', async () => {
  const { card, calls } = createCard({
    state: 'opening',
    attributes: {
      current_position: 42,
      command_state: 'opening',
      position_confidence: 'estimated',
      position_is_estimated: true,
    },
  });
  let moreInfoCount = 0;
  card.addEventListener('hass-more-info', () => { moreInfoCount += 1; });

  const stop = card.shadowRoot.querySelector('.controls button[data-action="stop"]');
  assert.ok(stop);
  assert.equal(stop.disabled, false);
  stop.click();
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.deepEqual(calls, [['cover', 'stop_cover', { entity_id: 'cover.east' }]]);
  assert.equal(moreInfoCount, 0);
  assert.match(card.shadowRoot.innerHTML, /42%/);
  assert.match(card.shadowRoot.innerHTML, /開啟命令中/);
  card.remove();
});

test('global controls are hidden by default and opt in renders the three requested actions', () => {
  const { card } = createCard({ state: 'open', attributes: { supported_features: 11 } });
  assert.equal(card.shadowRoot.querySelector('.global-controls'), null);

  card.setConfig({
    show_global_controls: true,
    faces: [{ key: 'east', entity_mode: 'cover_entity', cover_entity: 'cover.east' }],
  });

  assert.deepEqual(
    [...card.shadowRoot.querySelectorAll('.global-controls button')].map((button) => button.textContent.trim()),
    ['全開', '全停', '全關'],
  );
  card.remove();
});

test('global action calls one cover service with every unique controllable card entity', async () => {
  const calls = [];
  const { card } = createCard({ state: 'open', attributes: { supported_features: 11 } });
  card.setConfig({
    show_global_controls: true,
    faces: [
      { key: 'east', entity_mode: 'cover_entity', cover_entity: 'cover.east' },
      { key: 'south', entity_mode: 'cover_entity', cover_entity: 'cover.south' },
      { key: 'west', entity_mode: 'cover_entity', cover_entity: 'cover.unavailable' },
      { key: 'north', entity_mode: 'cover_entity', cover_entity: 'cover.east' },
    ],
  });
  card.hass = {
    states: {
      'cover.east': { state: 'open', attributes: { supported_features: 11 } },
      'cover.south': { state: 'closed', attributes: { supported_features: 11 } },
      'cover.unavailable': { state: 'unavailable', attributes: { supported_features: 11 } },
    },
    callService: async (...args) => calls.push(args),
  };

  const openAll = card.shadowRoot.querySelector('.global-controls [data-action="open"]');
  assert.equal(openAll.disabled, false);
  openAll.click();
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.deepEqual(calls, [['cover', 'open_cover', { entity_id: ['cover.east', 'cover.south'] }]]);
  card.remove();
});

test('global stop remains available while a global direction command is pending', async () => {
  let finishOpen;
  const openPending = new Promise((resolve) => { finishOpen = resolve; });
  const calls = [];
  const { card } = createCard(
    { state: 'open', attributes: { supported_features: 11 } },
    async (domain, service, data) => {
      calls.push([domain, service, data]);
      if (service === 'open_cover') await openPending;
    },
  );
  card.setConfig({
    show_global_controls: true,
    faces: [{ key: 'east', entity_mode: 'cover_entity', cover_entity: 'cover.east' }],
  });

  card.shadowRoot.querySelector('.global-open').click();
  await Promise.resolve();
  const stopAll = card.shadowRoot.querySelector('.global-stop');
  assert.equal(stopAll.disabled, false);
  stopAll.click();
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.deepEqual(calls.map((call) => call[1]), ['open_cover', 'stop_cover']);
  finishOpen();
  await new Promise((resolve) => setTimeout(resolve, 0));
  card.remove();
});

test('global stop skips an entity with an individual stop pending and preserves its pending UI', async () => {
  let finishEast;
  let finishGlobal;
  let finishSouth;
  const eastPending = new Promise((resolve) => { finishEast = resolve; });
  const globalPending = new Promise((resolve) => { finishGlobal = resolve; });
  const southPending = new Promise((resolve) => { finishSouth = resolve; });
  const calls = [];
  const { card } = createCard({ state: 'open', attributes: { supported_features: 11 } });
  card.setConfig({
    show_global_controls: true,
    faces: [
      { key: 'east', entity_mode: 'cover_entity', cover_entity: 'cover.east' },
      { key: 'south', entity_mode: 'cover_entity', cover_entity: 'cover.south' },
    ],
  });
  card.hass = {
    states: {
      'cover.east': { state: 'open', attributes: { supported_features: 11 } },
      'cover.south': { state: 'open', attributes: { supported_features: 11 } },
    },
    callService: async (domain, service, data) => {
      calls.push([domain, service, data]);
      if (data.entity_id === 'cover.east') await eastPending;
      else if (data.entity_id === 'cover.south') await southPending;
      else await globalPending;
    },
  };

  card.shadowRoot.querySelector('.controls [data-entity="cover.east"][data-action="stop"]').click();
  await Promise.resolve();
  const stopAll = card.shadowRoot.querySelector('.global-stop');
  assert.equal(stopAll.disabled, false);
  stopAll.click();
  await Promise.resolve();

  assert.deepEqual(calls, [
    ['cover', 'stop_cover', { entity_id: 'cover.east' }],
    ['cover', 'stop_cover', { entity_id: ['cover.south'] }],
  ]);
  assert.equal(card.shadowRoot.querySelector('.global-stop').disabled, true);

  finishGlobal();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(card.shadowRoot.querySelector('.controls [data-entity="cover.east"][data-action="stop"]').disabled, true);
  assert.equal(card.shadowRoot.querySelector('.controls [data-entity="cover.south"][data-action="stop"]').disabled, false);
  assert.equal(card.shadowRoot.querySelector('.global-stop').disabled, false);

  card.shadowRoot.querySelector('.controls [data-entity="cover.south"][data-action="stop"]').click();
  await Promise.resolve();
  const disabledStopAll = card.shadowRoot.querySelector('.global-stop');
  assert.equal(disabledStopAll.disabled, true);
  disabledStopAll.click();
  assert.equal(calls.length, 3);

  finishSouth();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(card.shadowRoot.querySelector('.controls [data-entity="cover.east"][data-action="stop"]').disabled, true);
  assert.equal(card.shadowRoot.querySelector('.global-stop').disabled, false);

  finishEast();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(card.shadowRoot.querySelector('.controls [data-entity="cover.east"][data-action="stop"]').disabled, false);
  card.remove();
});

test('integration controls are disabled when the cover is unavailable', () => {
  const { card } = createCard({ state: 'unavailable', attributes: {} });
  const controls = [...card.shadowRoot.querySelectorAll('.controls button')];

  assert.equal(controls.length, 3);
  assert.ok(controls.every((button) => button.disabled));
  assert.match(card.shadowRoot.innerHTML, /N\/A/);
  assert.match(card.shadowRoot.innerHTML, /不可用/);
  card.remove();
});

test('semantic details button opens More Info without calling a Cover service', () => {
  const { card, calls } = createCard({
    state: 'open',
    attributes: { current_position: 50, supported_features: 11 },
  });
  let entityId = '';
  card.addEventListener('hass-more-info', (event) => { entityId = event.detail.entityId; });

  const details = card.shadowRoot.querySelector('button.more-info');
  assert.ok(details);
  assert.match(details.getAttribute('aria-label'), /詳細資料/);
  details.click();

  assert.equal(entityId, 'cover.east');
  assert.deepEqual(calls, []);
  assert.equal(card.shadowRoot.querySelector('.controls').getAttribute('role'), 'group');
  card.remove();
});

test('native MQTT cover hides unsupported stop control and estimator wording', () => {
  const { card } = createCard({
    state: 'open',
    attributes: { supported_features: 3 },
  });

  assert.ok(card.shadowRoot.querySelector('[data-action="open"]'));
  assert.ok(card.shadowRoot.querySelector('[data-action="close"]'));
  assert.equal(card.shadowRoot.querySelector('[data-action="stop"]'), null);
  assert.match(card.shadowRoot.querySelector('.controls').getAttribute('style'), /--control-count:2/);
  assert.match(card.shadowRoot.innerHTML, /已開啟・位置未提供/);
  assert.doesNotMatch(card.shadowRoot.innerHTML, /位置未校正|估算位置|計時中/);
  card.remove();
});

test('read-only native Cover does not render an empty controls container', () => {
  const { card } = createCard({
    state: 'open',
    attributes: { supported_features: 0 },
  });

  assert.equal(card.shadowRoot.querySelector('.controls'), null);
  card.remove();
});

test('unknown position uses neutral geometry instead of looking fully closed', () => {
  const { card } = createCard({
    state: 'opening',
    attributes: { current_position: null, command_state: 'opening', position_confidence: 'unknown', position_is_estimated: true },
  });
  const face = card.shadowRoot.querySelector('.face');

  assert.ok(face.classList.contains('unknown'));
  assert.match(face.getAttribute('style'), /--open:50%/);
  assert.match(card.shadowRoot.innerHTML, />—</);
  card.remove();
});

test('pending direction command survives a hass rerender and blocks duplicate directions', async () => {
  let finish;
  let callCount = 0;
  const pending = new Promise((resolve) => { finish = resolve; });
  const state = { state: 'open', attributes: { current_position: 50, command_state: 'idle', position_is_estimated: true } };
  const { card } = createCard(state, async () => { callCount += 1; await pending; });

  card.shadowRoot.querySelector('[data-action="open"]').click();
  await Promise.resolve();
  card.hass = card.hass;
  const rerenderedOpen = card.shadowRoot.querySelector('[data-action="open"]');
  const rerenderedClose = card.shadowRoot.querySelector('[data-action="close"]');
  assert.equal(rerenderedOpen.disabled, true);
  assert.equal(rerenderedClose.disabled, true);
  rerenderedClose.click();
  assert.equal(callCount, 1);

  finish();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(card.shadowRoot.querySelector('[data-action="open"]').disabled, false);
  card.remove();
});

test('conflict disables directions but leaves stop available', () => {
  const { card } = createCard({
    state: 'open',
    attributes: { current_position: 50, command_state: 'conflict', position_is_estimated: true },
  });

  assert.equal(card.shadowRoot.querySelector('[data-action="open"]').disabled, true);
  assert.equal(card.shadowRoot.querySelector('[data-action="close"]').disabled, true);
  assert.equal(card.shadowRoot.querySelector('[data-action="stop"]').disabled, false);
  card.remove();
});

test('service rejection is handled and emits a Home Assistant notification', async () => {
  const { card } = createCard(
    { state: 'open', attributes: { current_position: 50, command_state: 'idle', position_is_estimated: true } },
    async () => { throw new Error('service failed'); },
  );
  let message = '';
  card.addEventListener('hass-notification', (event) => { message = event.detail.message; });

  card.shadowRoot.querySelector('[data-action="open"]').click();
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.match(message, /控制失敗/);
  assert.equal(card.shadowRoot.querySelector('[data-action="open"]').disabled, false);
  card.remove();
});

test('entity pickers render each field label only once', () => {
  const editor = window.document.createElement('uninus-greenhouse-rollup-test-editor');
  window.document.body.append(editor);
  editor.setConfig({});
  editor.hass = { states: {} };

  const pickers = [...editor.shadowRoot.querySelectorAll('ha-entity-picker')];
  assert.ok(pickers.length > 0);
  for (const picker of pickers) {
    const outerLabels = [...picker.parentElement.children]
      .filter((element) => element.localName === 'label');
    assert.equal(outerLabels.length, 0, `${picker.label} has a duplicate outer label`);
    assert.ok(picker.label);
  }
  editor.remove();
});

test('editor exposes and persists the global controls visibility switch', () => {
  const editor = window.document.createElement('uninus-greenhouse-rollup-test-editor');
  window.document.body.append(editor);
  editor.setConfig({ show_global_controls: false });
  editor.hass = { states: {} };
  let saved;
  editor.addEventListener('config-changed', (event) => { saved = event.detail.config; });

  const toggle = editor.shadowRoot.querySelector('[data-property="show_global_controls"]');
  assert.ok(toggle);
  assert.equal(toggle.hasAttribute('checked'), false);
  toggle.checked = true;
  toggle.dispatchEvent(new window.Event('change', { bubbles: true }));

  assert.equal(saved.show_global_controls, true);
  editor.remove();
});

test('editor exposes and persists adaptive items per row', () => {
  const editor = window.document.createElement('uninus-greenhouse-rollup-test-editor');
  window.document.body.append(editor);
  editor.setConfig({ items_per_row: 2 });
  editor.hass = { states: {} };
  let saved;
  editor.addEventListener('config-changed', (event) => { saved = event.detail.config; });

  const select = editor.shadowRoot.querySelector('[data-property="items_per_row"]');
  const adaptive = select.querySelector('option[value="auto"]');
  assert.ok(adaptive);
  assert.match(adaptive.textContent, /自適應/);
  select.querySelector('option[value="2"]').removeAttribute('selected');
  adaptive.setAttribute('selected', '');
  select.dispatchEvent(new window.Event('change', { bubbles: true }));

  assert.equal(saved.items_per_row, 'auto');
  editor.remove();
});

test('new cards default every face to Integration Cover mode', () => {
  const config = UninusGreenhouseRollupCard.getStubConfig();

  assert.equal(config.faces.length, 4);
  assert.ok(config.faces.every((face) => face.entity_mode === 'cover_entity'));
  assert.ok(config.faces.every((face) => face.cover_entity === ''));
  assert.ok(config.faces.every((face) => face.entity === ''));
  assert.ok(config.faces.every((face) => face.motion_entity === ''));
});

test('Integration Cover mode hides every legacy-only editor field', () => {
  const editor = window.document.createElement('uninus-greenhouse-rollup-test-editor');
  window.document.body.append(editor);
  editor.setConfig({ faces: ['east', 'south', 'west', 'north'].map((key) => ({ key, entity_mode: 'cover_entity' })) });
  editor.hass = { states: {} };

  assert.equal(editor.shadowRoot.querySelectorAll('[data-property="cover_entity"]').length, 4);
  for (const property of ['entity', 'motion_entity', 'max_entity', 'max_value', 'unit']) {
    assert.equal(editor.shadowRoot.querySelectorAll(`[data-property="${property}"]`).length, 0, property);
  }
  editor.remove();
});

test('Integration Cover picker only accepts cover entities', () => {
  const editor = window.document.createElement('uninus-greenhouse-rollup-test-editor');
  window.document.body.append(editor);
  editor.setConfig({ faces: [
    { key: 'east', entity_mode: 'cover_entity', cover_entity: 'switch.not_a_cover' },
    { key: 'south', entity_mode: 'cover_entity', cover_entity: 'cover.south' },
    { key: 'west', entity_mode: 'cover_entity', cover_entity: 'cover.west' },
    { key: 'north', entity_mode: 'cover_entity', cover_entity: 'cover.north' },
  ] });
  editor.hass = { states: {} };

  const picker = editor.shadowRoot.querySelector('[data-property="cover_entity"]');
  assert.deepEqual(picker.includeDomains, ['cover']);
  assert.equal(picker.hasAttribute('allow-custom-entity'), false);
  const errors = [...editor.shadowRoot.querySelectorAll('[role="alert"]')];
  assert.equal(errors.length, 1);
  assert.match(errors[0].textContent, /cover\./);
  editor.remove();
});

test('Integration Cover mode immediately identifies faces without a cover entity', () => {
  const editor = window.document.createElement('uninus-greenhouse-rollup-test-editor');
  window.document.body.append(editor);
  editor.setConfig({ faces: [
    { key: 'east', entity_mode: 'cover_entity', cover_entity: '' },
    { key: 'south', entity_mode: 'cover_entity', cover_entity: 'cover.south' },
    { key: 'west', entity_mode: 'cover_entity', cover_entity: 'cover.west' },
    { key: 'north', entity_mode: 'cover_entity', cover_entity: 'cover.north' },
  ] });
  editor.hass = { states: {} };

  const errors = [...editor.shadowRoot.querySelectorAll('[role="alert"]')];
  assert.equal(errors.length, 1);
  assert.match(errors[0].textContent, /標準 Cover Entity/);
  assert.equal(errors[0].closest('.face-editor').querySelector('[data-face="east"]') !== null, true);
  editor.remove();
});

test('cover editor uses standard Cover wording for native MQTT and managed covers', () => {
  const editor = window.document.createElement('uninus-greenhouse-rollup-test-editor');
  window.document.body.append(editor);
  editor.setConfig({ faces: [{ key: 'east', entity_mode: 'cover_entity', cover_entity: 'cover.east' }] });
  editor.hass = { states: {} };

  assert.match(editor.shadowRoot.innerHTML, /標準 Cover/);
  assert.doesNotMatch(editor.shadowRoot.innerHTML, /Integration Cover/);
  editor.remove();
});

test('switching a face to Integration Cover removes persisted legacy fields', () => {
  const editor = window.document.createElement('uninus-greenhouse-rollup-test-editor');
  window.document.body.append(editor);
  editor.setConfig({ faces: [{
    key: 'east',
    entity_mode: 'position_entity',
    cover_entity: 'cover.east',
    entity: 'input_number.east',
    motion_entity: 'binary_sensor.east',
    max_entity: 'input_number.maximum',
    max_value: 120,
  }] });
  editor.hass = { states: {} };
  let saved;
  editor.addEventListener('config-changed', (event) => { saved = event.detail.config; });

  const mode = editor.shadowRoot.querySelector('[data-face="east"][data-property="entity_mode"]');
  mode.querySelector('[value="position_entity"]').removeAttribute('selected');
  mode.querySelector('[value="cover_entity"]').setAttribute('selected', '');
  mode.dispatchEvent(new window.Event('change', { bubbles: true }));

  const east = saved.faces.find((face) => face.key === 'east');
  assert.equal(east.cover_entity, 'cover.east');
  for (const property of ['entity', 'motion_entity', 'max_entity', 'max_value']) {
    assert.equal(property in east, false, property);
  }
  editor.remove();
});

test('selecting a cover adopts its friendly name unless the face name was customized', () => {
  const editor = window.document.createElement('uninus-greenhouse-rollup-test-editor');
  window.document.body.append(editor);
  editor.setConfig({ faces: [{ key: 'east', entity_mode: 'cover_entity', name: '東側' }] });
  editor.hass = { states: { 'cover.east': { attributes: { friendly_name: '東側溫室捲揚' } } } };
  let saved;
  editor.addEventListener('config-changed', (event) => { saved = event.detail.config; });

  const picker = editor.shadowRoot.querySelector('[data-face="east"][data-property="cover_entity"]');
  picker.dispatchEvent(new window.CustomEvent('value-changed', { detail: { value: 'cover.east' }, bubbles: true }));

  assert.equal(saved.faces.find((face) => face.key === 'east').name, '東側溫室捲揚');
  editor.remove();
});

test('face display names are not suffixed with a duplicate rollup label', () => {
  const { card } = createCard({ state: 'open', attributes: { current_position: 100 } });
  card.setConfig({ faces: [{ key: 'east', name: '東側溫室捲揚', entity_mode: 'cover_entity', cover_entity: 'cover.east' }] });

  assert.match(card.shadowRoot.innerHTML, /東側溫室捲揚/);
  assert.doesNotMatch(card.shadowRoot.innerHTML, /捲揚捲揚/);
  card.remove();
});

test('English cover friendly names keep their existing roll-up wording', () => {
  const { card } = createCard({ state: 'open', attributes: { current_position: 100 } });
  card.setConfig({ faces: [{ key: 'east', name: 'East Rollup Test', entity_mode: 'cover_entity', cover_entity: 'cover.east' }] });

  assert.match(card.shadowRoot.innerHTML, /East Rollup Test/);
  assert.doesNotMatch(card.shadowRoot.innerHTML, /East Rollup Test捲揚/);
  card.remove();
});

test('closed color editor setting drives the rendered curtain color token', () => {
  const { card } = createCard({ state: 'open', attributes: { current_position: 50 } });
  card.setConfig({ closed_color: '#123456', faces: [{ key: 'east', entity_mode: 'cover_entity', cover_entity: 'cover.east' }] });

  assert.match(card.shadowRoot.innerHTML, /--closed-color:#123456/);
  assert.match(card.shadowRoot.innerHTML, /var\(--closed-color\)/);
  card.remove();
});

test('global open control inherits the configured open color token', () => {
  const { card } = createCard({ state: 'open', attributes: { supported_features: 11 } });
  card.setConfig({
    open_color: '#123456',
    show_global_controls: true,
    faces: [{ key: 'east', entity_mode: 'cover_entity', cover_entity: 'cover.east' }],
  });

  assert.match(card.shadowRoot.querySelector('.rollup-card').getAttribute('style'), /--open-color:#123456/);
  card.remove();
});
