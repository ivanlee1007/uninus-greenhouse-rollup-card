import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
const { window } = parseHTML('<html><body></body></html>');
Object.assign(globalThis, { window, document: window.document, HTMLElement: window.HTMLElement, CustomEvent: window.CustomEvent, customElements: window.customElements });
const { UninusGreenhouseRollupCard } = await import('../src/card.js');
const { UninusGreenhouseRollupCardEditor } = await import('../src/editor.js');
customElements.define('coverage-test-card', UninusGreenhouseRollupCard);
customElements.define('coverage-test-editor', UninusGreenhouseRollupCardEditor);
const managed = { position_is_estimated: true, position_confidence: 'calibrated', command_state: 'idle', supported_features: 11 };
function render(attributes, state = 'open') {
  const card = document.createElement('coverage-test-card');
  card.setConfig({ items: ['normal', 'reversed'].map(percentage_mode => ({ id: percentage_mode, cover_entity: 'cover.test', percentage_mode })) });
  card.hass = { states: { 'cover.test': { state, attributes } } };
  document.body.append(card);
  return card;
}

test('coverage mode reads the backend attribute as-is, without a second inversion or recomputation', () => {
  // Deliberately noncomplementary values prove which attribute was consumed.
  const card = render({ ...managed, current_position: 25, coverage_position: 73 });
  try {
    const [normal, reversed] = card.shadowRoot.querySelectorAll('.face');
    assert.equal(reversed.querySelector('.percent').textContent, '73%');
    assert.equal(reversed.querySelector('.foot em').textContent, '73%');
    assert.match(reversed.querySelector('.copy strong').textContent, /覆蓋率 73%/);
    assert.match(reversed.querySelector('.scene').getAttribute('aria-label'), /覆蓋率 73%/);
    assert.match(reversed.getAttribute('style'), /--open:25%/);
    assert.equal(normal.querySelector('.percent').textContent, '25%');
    assert.match(normal.querySelector('.copy strong').textContent, /開啟率 25%/);
  } finally { card.remove(); }
});

for (const [opening, coverage, endpoint] of [[0, 100, '全閉'], [25, 75, ''], [100, 0, '全開']]) {
  test(`same Cover supplies opening ${opening} and coverage ${coverage} with explicit metric labels`, () => {
    const card = render({ ...managed, current_position: opening, coverage_position: coverage });
    try {
      const [normal, reversed] = card.shadowRoot.querySelectorAll('.face');
      assert.equal(normal.querySelector('.percent').textContent, `${opening}%`);
      assert.equal(reversed.querySelector('.percent').textContent, `${coverage}%`);
      assert.match(normal.querySelector('.copy strong').textContent, new RegExp(`開啟率 ${opening}%`));
      assert.match(reversed.querySelector('.copy strong').textContent, new RegExp(`覆蓋率 ${coverage}%`));
      if (endpoint) assert.ok(reversed.querySelector('.copy strong').textContent.startsWith(endpoint));
    } finally { card.remove(); }
  });
}

for (const invalid of [null, '', 'unknown', true, -1, 101]) {
  test(`explicit invalid coverage ${JSON.stringify(invalid)} stays unknown rather than falling back`, () => {
    const card = render({ ...managed, current_position: 25, coverage_position: invalid });
    try {
      const [normal, reversed] = card.shadowRoot.querySelectorAll('.face');
      assert.equal(normal.querySelector('.percent').textContent, '25%');
      assert.equal(reversed.querySelector('.percent').textContent, '—');
      assert.equal(reversed.querySelector('.foot em').textContent, 'N/A');
      assert.equal(reversed.querySelector('.copy strong').textContent, '覆蓋率未知');
      assert.doesNotMatch(reversed.querySelector('.scene').getAttribute('aria-label'), /\d+%/);
      assert.match(reversed.getAttribute('style'), /--open:25%/);
    } finally { card.remove(); }
  });
}

for (const attrs of [{ ...managed }, {}]) {
  test(`missing coverage attribute retains compatibility for ${attrs.position_is_estimated ? 'older Integration' : 'native Cover'}`, () => {
    const card = render({ ...attrs, current_position: 25 });
    try {
      const reversed = card.shadowRoot.querySelectorAll('.face')[1];
      assert.equal(reversed.querySelector('.percent').textContent, '75%');
      assert.match(reversed.querySelector('.copy strong').textContent, /覆蓋率 75%/);
    } finally { card.remove(); }
  });
}

for (const [state, attrs] of [
  ['unavailable', { ...managed, current_position: 25, coverage_position: 75 }],
  ['open', { ...managed, current_position: null, coverage_position: 75 }],
  ['open', { ...managed, command_state: 'unavailable', current_position: 25, coverage_position: 75 }],
]) {
  test(`coverage never overrides unavailable or unknown opening position: ${state} ${attrs.command_state} ${attrs.current_position}`, () => {
    const card = render(attrs, state);
    try { for (const face of card.shadowRoot.querySelectorAll('.face')) assert.equal(face.querySelector('.percent').textContent, '—'); }
    finally { card.remove(); }
  });
}

test('percentage editor names both metrics explicitly while preserving saved normal/reversed values', () => {
  const editor = document.createElement('coverage-test-editor');
  editor.setConfig({ items: [{ id: 'test', cover_entity: 'cover.test', percentage_mode: 'reversed' }] });
  const select = editor.shadowRoot.querySelector('[data-property="percentage_mode"]');
  assert.match(select.querySelector('[value="normal"]').textContent, /開啟率/);
  assert.match(select.querySelector('[value="reversed"]').textContent, /覆蓋率/);
  assert.equal(select.value, 'reversed');
});
