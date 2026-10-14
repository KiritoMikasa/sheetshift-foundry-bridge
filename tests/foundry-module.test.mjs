import test from 'node:test';
import assert from 'node:assert/strict';
import { CHANNEL } from '../protocol.mjs';

test('module opens configured sheet and produces a native public Foundry chat roll as current player', async () => {
  const hooks = new Map(), listeners = new Map(), messages = [], calls = [];
  const popup = { closed: false, focus: () => {}, postMessage: (message, origin) => messages.push({ message, origin }) };
  const storage = new Map();
  const element = () => ({ classList: { toggle() {} }, setAttribute() {}, append() {}, querySelector: () => element(), querySelectorAll: () => [], insertAdjacentHTML() {} });
  globalThis.document = { createElement: element, body: element() };
  globalThis.Hooks = { once: (name, fn) => hooks.set(name, fn), on: (name, fn) => hooks.set(name, fn) };
  globalThis.window = { addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: name => listeners.delete(name),
    open: (url, name) => { calls.push({ url, name }); return popup; }, sessionStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) } };
  globalThis.game = { ready: true, user: { id: 'player-1', name: 'Real player', active: true }, world: { id: 'world-1', title: 'Test world' }, socket: { connected: true },
    settings: { register: () => {}, get: () => 'https://sheet.example/vault' }, modules: new Map([['sheetshift-bridge', {}]]) };
  globalThis.ui = { notifications: { warn: message => assert.fail(message) } };
  let formula, chatData, chatOptions, executed = 0, total = 20, die = 13;
  globalThis.foundry = { dice: { Roll: class {
    constructor(value) { formula = value; }
    async evaluate(options) { assert.equal(options.allowInteractive, false); executed++; this.total = total; this.dice = [{ total: die }]; }
    async toMessage(data, options) { chatData = data; chatOptions = options; return { id: 'native-message' }; }
  } } };
  const cards = [];
  globalThis.foundry.documents = { ChatMessage: { create: async data => { cards.push(data); return { id: 'ability-card' }; } } };
  let now = Date.now(); const realNow = Date.now; Date.now = () => now;
  const { openSheet } = await import('../bridge.mjs');
  hooks.get('init')(); hooks.get('ready')();
  openSheet();
  try {
    assert.equal(calls[0].url, 'https://sheet.example/vault');
    const nonce = messages[0].message.nonce;
    let request = { id: 'b'.repeat(32), character: '<img src=x onerror=alert(1)>', talent: 'Schleichen', attribute: 'GE', score: 6, modifier: 3, bonus: -2 };
    const event = type => ({ source: popup, origin: 'https://sheet.example', data: { channel: CHANNEL, nonce, type, request } });
    await listeners.get('message')(event('accept'));
    await listeners.get('message')(event('roll'));
    await listeners.get('message')(event('roll'));
    assert.equal(executed, 1); assert.equal(formula, '1d20 + 6 + 3 - 2');
    assert.deepEqual(chatOptions, { messageMode: 'public' });
    assert.deepEqual(chatData.speaker, { alias: 'Real player' });
    assert.ok(chatData.flavor.includes('&lt;img')); assert.ok(!chatData.flavor.includes('<img'));
    assert.equal(messages.at(-1).message.result.messageId, 'native-message');
    assert.equal(messages.at(-1).origin, 'https://sheet.example');
    for (const [cost, resource] of [[0, ''], [0, 'Energie'], [3, 'Energie']]) {
      now += 1000;
      request = { id: String(cards.length + 1).repeat(32), character: 'Hero', talent: 'Spark', kind: 'ability', cost, resource, description: '<img src=x onerror=alert(1)>Effect' };
      await listeners.get('message')(event('roll'));
      await listeners.get('message')(event('roll'));
      assert.equal(cards.length, cost > 0 ? 3 : resource ? 2 : 1, 'duplicate ability invocation sends one card');
      const card = cards.at(-1);
      assert.ok(card.content.includes('Spark'));
      assert.ok(card.content.includes('&lt;img')); assert.ok(!card.content.includes('<img'));
      assert.equal(card.content.includes('verbraucht'), cost > 0);
      if (!cost) assert.ok(card.content.includes('Gewirkt'));
      assert.equal(messages.at(-1).message.result.messageId, 'ability-card');
    }
    for (const [index, rolled] of [59, 60, 61].entries()) {
      now += 1000; total = die = rolled;
      request = { id: String(index + 4).repeat(32), character: 'Hero', talent: 'Sichel', kind: 'attack', target: 60 };
      await listeners.get('message')(event('roll'));
      assert.ok(chatData.flavor.includes('1d100 &le; 60'));
      assert.equal(chatData.flavor.includes('Probe gelungen'), rolled <= 60);
      assert.equal(chatData.flavor.includes('Verfehlt'), rolled > 60);
      assert.equal(messages.at(-1).message.result.total, rolled);
    }
    openSheet();
    assert.equal(calls.length, 1, 'opening the bridge again must not navigate away from sheet drafts');
  } finally { Date.now = realNow; listeners.get('beforeunload')(); }
});
