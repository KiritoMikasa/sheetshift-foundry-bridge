import test from 'node:test';
import assert from 'node:assert/strict';
class Element {
  children = []; selectors = new Map(); textContent = ''; markup = '';
  classList = { toggle() {} }; setAttribute() {}
  set innerHTML(value) { this.markup = value; this.children = []; this.selectors.clear(); }
  append(...elements) { this.children.push(...elements); }
  insertAdjacentHTML(_position, value) { this.markup += value; }
  querySelector(selector) { if (!this.selectors.has(selector)) this.selectors.set(selector, new Element()); return this.selectors.get(selector); }
}
test('confirmed GM free rolls use Foundry dice, public player chat and persisted duplicate protection without Sheetshift', async () => {
  const hooks = new Map(), storage = new Map(), messages = [], player = { id: 'player', name: 'Player', active: true }, gm = { id: 'gm', name: 'GM', isGM: true };
  const body = new Element(); globalThis.document = { body, createElement: () => new Element() };
  globalThis.Hooks = { once: (n, f) => hooks.set(n, f), on: (n, f) => hooks.set(n, f) };
  globalThis.window = { addEventListener() {}, removeEventListener() {}, sessionStorage: { getItem: k => storage.get(k) ?? null, setItem: (k,v) => storage.set(k,v) } };
  globalThis.game = { ready: true, user: player, users: { get: id => id === gm.id ? gm : player }, world: { id: 'world' }, socket: { connected: true }, settings: { register() {} }, modules: new Map([['sheetshift-bridge', {}]]) };
  globalThis.ui = { notifications: { info() {}, warn: assert.fail } };
  globalThis.FormData = class { get() { return null; } };
  let rolls = 0;
  globalThis.foundry = { dice: { Roll: class {
    constructor(formula) { assert.equal(formula, '2d6 + 3'); }
    async evaluate() { rolls++; this.total = 11; this.dice = [{ total: 8 }]; }
    async toMessage(data, options) { messages.push({ data, options }); return { id: 'chat-1' }; }
  } } };
  const check = { id: 'e'.repeat(32), kind: 'free', label: '<img>Glück', formula: '2d6 + 3', targets: ['player'], expires: Date.now() + 120000 };
  function elements() { const out = []; function visit(e) { out.push(e); e.children.forEach(visit); } visit(body); return out; }
  async function confirm() {
    const button = elements().find(e => e.textContent.includes('GM: <img>Glück'));
    assert.ok(button); button.onclick();
    assert.equal(rolls, messages.length, 'opening a preview must not roll');
    elements().find(e => e.onsubmit).onsubmit({ preventDefault() {} });
    await new Promise(resolve => setImmediate(resolve));
  }
  await import('../bridge.mjs');
  hooks.get('init')(); hooks.get('ready')();
  hooks.get('createChatMessage')({ author: gm, flags: { 'sheetshift-bridge': { check } } }, {}, 'player');
  assert.equal(body.children.length, 0, 'non-GM cannot spoof a request');
  hooks.get('createChatMessage')({ author: gm, flags: { 'sheetshift-bridge': { check } } }, {}, 'gm');
  assert.equal(rolls, 0);
  await confirm(); assert.equal(rolls, 1); assert.equal(messages.length, 1);
  assert.deepEqual(messages[0].options, { messageMode: 'public' });
  assert.deepEqual(messages[0].data.speaker, { alias: 'Player' });
  assert.ok(messages[0].data.flavor.includes('&lt;img&gt;'));
  assert.ok(storage.get(`sheetshift-bridge:world:player:${check.id}`).includes('chat-1'));
  // Recreate the module as after a reload, keeping only persistent browser storage.
  body.children = [];
  await import('../bridge.mjs?reload');
  hooks.get('ready')();
  hooks.get('createChatMessage')({ author: gm, flags: { 'sheetshift-bridge': { check } } }, {}, 'gm');
  await confirm();
  assert.equal(rolls, 1, 'replayed request reuses the original receipt after reload');
  assert.equal(messages.length, 1);
});
