import test from 'node:test';
import assert from 'node:assert/strict';
import { createPanel } from '../panel.mjs';

// Minimal DOM boundary: exercise the panel's actual buttons, forms and receipts.
class Element {
  children = [];
  selectors = new Map();
  markup = '';
  textContent = '';
  classList = { toggle() {} };
  setAttribute() {}
  set innerHTML(value) { this.markup = value; this.children = []; this.selectors.clear(); }
  get innerHTML() { return this.markup; }
  append(...elements) { this.children.push(...elements); }
  insertAdjacentHTML(_position, value) { this.markup += value; }
  querySelector(selector) {
    if (!this.selectors.has(selector)) this.selectors.set(selector, new Element());
    return this.selectors.get(selector);
  }
}
function fixture(options = {}) {
  const body = new Element(), sent = [];
  globalThis.document = { body, createElement: () => new Element() };
  globalThis.game = { user: { id: 'player', name: 'Test player', isGM: false } };
  globalThis.FormData = class { get() { return null; } };
  const panel = createPanel({ invoke: value => sent.push(value), online: () => true,
    status() {}, requestCheck() {}, openSheet() {}, ...options });
  panel.show();
  panel.snapshot({ id: 'a'.repeat(32), character: 'Test character', busy: false,
    attributes: [{ key: 'KK', modifier: 2 }], actions: [
      { id: 'weapon:0', label: 'Sichel', kind: 'weapon', favorite: true, target: 60, dice: '1d8', power: 7 },
      { id: 'weapon:1', label: 'Sichel', kind: 'weapon', favorite: true, target: 62, dice: '1d6', power: 7 },
    ] });
  function elements() { const all = []; function visit(e) { all.push(e); e.children.forEach(visit); } visit(body); return all; }
  function buttons(text) { return elements().filter(e => e.onclick && e.textContent.includes(text)); }
  function submit() { const form = elements().find(e => e.onsubmit); assert.ok(form, 'action preview present'); form.onsubmit({ preventDefault() {} }); return sent.at(-1); }
  function roll(index, total) {
    elements().filter(e => e.className === 'ss-action')[index].onclick();
    const request = submit(); panel.receipt({ id: request.id, result: { total, die: total, formula: '1d100', messageId: request.id } });
    return request;
  }
  return { panel, sent, buttons, elements, submit, roll };
}
test('both same-name weapon hits remain available and damage resolves only its own hit', () => {
  const f = fixture();
  f.roll(0, 20);
  assert.equal(f.buttons('Treffer bestätigt').length, 1);
  f.roll(1, 30);
  assert.equal(f.buttons('Treffer bestätigt').length, 2, 'second attack must not replace the first damage option');
  f.buttons('Treffer bestätigt')[0].onclick();
  const firstDamage = f.submit();
  assert.equal(firstDamage.actionId, 'weapon:0');
  assert.equal(firstDamage.stage, 'damage');
  f.panel.receipt({ id: firstDamage.id, result: { total: 12, die: 5, formula: '1d8 + 7', messageId: firstDamage.id } });
  assert.equal(f.buttons('Treffer bestätigt').length, 1);
  f.buttons('Treffer bestätigt')[0].onclick();
  assert.equal(f.submit().actionId, 'weapon:1');
});

test('a miss, repeated use of one weapon, and snapshot refreshes preserve earlier hits', () => {
  const f = fixture();
  f.roll(0, 20);
  f.roll(1, 62); // Equality is a miss.
  assert.equal(f.buttons('Treffer bestätigt').length, 1);
  f.roll(0, 25);
  assert.equal(f.buttons('Treffer bestätigt').length, 2, 'each attack has its own damage option');
  f.panel.snapshot({ id: 'b'.repeat(32), character: 'Test character', busy: false,
    attributes: [{ key: 'KK', modifier: 2 }], actions: [
      { id: 'weapon:0', label: 'Sichel', kind: 'weapon', favorite: true, target: 60, dice: '1d8', power: 8 },
      { id: 'weapon:1', label: 'Sichel', kind: 'weapon', favorite: true, target: 62, dice: '1d6', power: 8 },
    ] });
  assert.equal(f.buttons('Treffer bestätigt').length, 2);
  f.buttons('Treffer verwerfen')[0].onclick();
  assert.equal(f.buttons('Treffer bestätigt').length, 1);
  f.panel.clear();
  assert.equal(f.buttons('Treffer bestätigt').length, 0, 'a disconnected character must not retain damage options');
});

test('back, failed damage and unrelated receipts cannot consume a hit', () => {
  const f = fixture();
  f.roll(0, 20);
  f.buttons('Treffer bestätigt')[0].onclick();
  const form = f.elements().find(e => e.onsubmit);
  form.querySelector('[data-back]').onclick();
  assert.equal(f.buttons('Treffer bestätigt').length, 1);
  f.buttons('Treffer bestätigt')[0].onclick();
  const damage = f.submit();
  f.panel.receipt({ id: 'z'.repeat(32), result: { total: 12 } });
  f.panel.receipt({ id: damage.id, error: 'Not confirmed; check chat.' });
  f.panel.receipt({ id: damage.id, result: { total: 12, die: 5, formula: '1d8 + 7', messageId: damage.id } });
  assert.equal(f.buttons('Treffer bestätigt').length, 0);
  f.panel.receipt({ id: damage.id, result: { total: 12, die: 5, formula: '1d8 + 7', messageId: damage.id } });
  assert.equal(f.buttons('Treffer bestätigt').length, 0, 'duplicate receipt cannot restore a resolved hit');
});


test('free GM requests require confirmation and work without a character snapshot', () => {
  const local = [], f = fixture({ rollFree: request => local.push(request), canRollFree: () => true });
  f.panel.clear();
  const check = { id: 'c'.repeat(32), kind: 'free', label: 'Glück', formula: '1d100', gm: 'GM', expires: Date.now() + 120000 };
  f.panel.check(check);
  assert.equal(local.length, 0, 'GM requests must not automatically roll');
  f.buttons('GM: Glück')[0].onclick();
  assert.equal(local.length, 0, 'preview still requires confirmation');
  const form = f.elements().find(e => e.onsubmit);
  form.onsubmit({ preventDefault() {} });
  assert.equal(local.length, 1);
  assert.equal(local[0].kind, 'free');
  assert.equal(local[0].formula, '1d100');
  assert.equal(local[0].character, 'Test player');
  assert.equal(f.sent.length, 0, 'free rolls bypass Sheetshift');
  f.panel.receipt({ id: check.id, result: { total: 45, die: 45, formula: '1d100', messageId: 'free-chat' } });
  f.panel.check(check);
  assert.equal(f.buttons('GM: Glück').length, 0, 'completed request cannot prompt the player again');
});

test('an expired GM request cannot start a free roll', () => {
  const local = [], f = fixture({ rollFree: request => local.push(request), canRollFree: () => true });
  f.panel.check({ id: 'd'.repeat(32), kind: 'free', label: 'Expired', formula: '1d20', gm: 'GM', expires: Date.now() - 1 });
  assert.equal(f.buttons('GM: Expired').length, 0);
  assert.equal(local.length, 0);
});

test('GM talent selection resolves the matching row when names are duplicated', () => {
  const f = fixture();
  f.panel.snapshot({ id: 'a'.repeat(32), character: 'Test character', busy: false, attributes: [{ key: 'KL', modifier: 2 }], actions: [
    { id: 'talent:0', label: 'Gifte', kind: 'talent', favorite: false, score: 2, talentKey: 'Talente!A1' },
    { id: 'talent:1', label: 'Gifte', kind: 'talent', favorite: false, score: 9, talentKey: 'Talente!B1' },
  ] });
  f.panel.check({ id: 'e'.repeat(32), talent: 'Gifte', talentKey: 'Talente!B1', attribute: 'KL', gm: 'GM', expires: Date.now() + 120000 });
  const button = f.buttons('GM: Gifte')[0];
  assert.equal(button.disabled, false);
  button.onclick();
  assert.equal(f.submit().actionId, 'talent:1', 'use the selected row, never the GM character value or another same-name talent');
});
