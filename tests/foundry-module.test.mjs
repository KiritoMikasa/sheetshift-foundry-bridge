import test from 'node:test';
import assert from 'node:assert/strict';
import { CHANNEL } from '../protocol.mjs';

test('module opens configured sheet and produces a native public Foundry chat roll as current player', async () => {
  const hooks = new Map(), listeners = new Map(), messages = [], calls = [];
  const popup = { closed: false, focus: () => {}, postMessage: (message, origin) => messages.push({ message, origin }) };
  const storage = new Map();
  globalThis.Hooks = { once: (name, fn) => hooks.set(name, fn), on: (name, fn) => hooks.set(name, fn) };
  globalThis.window = { addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: name => listeners.delete(name),
    open: (url, name) => { calls.push({ url, name }); return popup; }, sessionStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) } };
  globalThis.game = { ready: true, user: { id: 'player-1', name: 'Real player', active: true }, world: { id: 'world-1', title: 'Test world' }, socket: { connected: true },
    settings: { register: () => {}, get: () => 'https://sheet.example/vault' }, modules: new Map([['sheetshift-bridge', {}]]) };
  globalThis.ui = { notifications: { warn: message => assert.fail(message) } };
  let formula, chatData, chatOptions, executed = 0;
  globalThis.foundry = { dice: { Roll: class {
    constructor(value) { formula = value; }
    async evaluate(options) { assert.equal(options.allowInteractive, false); executed++; this.total = 20; this.dice = [{ total: 13 }]; }
    async toMessage(data, options) { chatData = data; chatOptions = options; return { id: 'native-message' }; }
  } } };
  const { openSheet } = await import('../bridge.mjs');
  hooks.get('init')(); hooks.get('ready')();
  openSheet();
  try {
    assert.equal(calls[0].url, 'https://sheet.example/vault');
    const nonce = messages[0].message.nonce;
    const request = { id: 'b'.repeat(32), character: '<img src=x onerror=alert(1)>', talent: 'Schleichen', attribute: 'GE', score: 6, modifier: 3, bonus: -2 };
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
    openSheet();
    assert.equal(calls.length, 1, 'opening the bridge again must not navigate away from sheet drafts');
  } finally { listeners.get('beforeunload')(); }
});
