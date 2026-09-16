import test from 'node:test';
import assert from 'node:assert/strict';
import { createReceiver } from '../receiver.mjs';
import { CHANNEL, formulaFor, validRequest, sheetUrl, escapeHtml } from '../protocol.mjs';
const nonce = 'a'.repeat(32);
const request = { id: 'b'.repeat(32), character: 'Hero', talent: 'Schleichen', attribute: 'GE', score: 6, modifier: 3, bonus: -2 };
function fixture(options = {}) {
  const source = {}, messages = [], data = new Map(); let calls = 0;
  const storage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
  const args = { source, origin: 'https://sheet.example', nonce, storage, storageKey: 'test', send: message => messages.push(message), execute: async () => { calls++; return { total: 20 }; }, ...options };
  const receive = createReceiver(args);
  const event = (type, changes = {}) => ({ source, origin: args.origin, data: { channel: CHANNEL, nonce, type, request }, ...changes });
  return { args, receive, event, messages, data, calls: () => calls };
}
test('only the approved exact window, origin, protocol and nonce can roll', async () => {
  const f = fixture();
  await f.receive(f.event('roll')); assert.equal(f.calls(), 0);
  for (const changes of [{ source: {} }, { origin: 'https://evil.example' }, { data: { channel: 'wrong', nonce, type: 'accept' } }, { data: { channel: CHANNEL, nonce: 'c'.repeat(32), type: 'accept' } }]) await f.receive(f.event('accept', changes));
  await f.receive(f.event('roll')); assert.equal(f.calls(), 0);
  await f.receive(f.event('accept'));
  await f.receive(f.event('roll', { origin: 'https://evil.example' })); assert.equal(f.calls(), 0);
  await f.receive(f.event('roll')); assert.equal(f.calls(), 1);
});
test('duplicate and concurrent requests execute once; status and receiver reload reuse receipt', async () => {
  let finish, calls = 0;
  const f = fixture({ execute: () => { calls++; return new Promise(resolve => { finish = resolve; }); } });
  await f.receive(f.event('accept'));
  const rolling = f.receive(f.event('roll'));
  await f.receive(f.event('roll')); assert.equal(calls, 1); assert.equal(f.messages.at(-1).pending, true);
  finish({ total: 20 }); await rolling;
  await f.receive(f.event('status')); assert.equal(f.messages.at(-1).result.total, 20);
  const reopened = createReceiver(f.args);
  await reopened(f.event('accept')); await reopened(f.event('roll')); assert.equal(calls, 1);
});
test('failed or interrupted rolls never automatically execute twice', async () => {
  const f = fixture({ execute: async () => { throw new Error('Lost chat acknowledgement'); } });
  await f.receive(f.event('accept')); await f.receive(f.event('roll'));
  assert.match(f.messages.at(-1).error, /Chat prüfen/);
  const restored = createReceiver({ ...f.args, execute: () => assert.fail('must not reroll') });
  await restored(f.event('accept')); await restored(f.event('roll'));
  f.data.set(`test:${request.id}`, JSON.stringify({ pending: true }));
  const interrupted = createReceiver({ ...f.args, execute: () => assert.fail('must not reroll') });
  await interrupted(f.event('accept')); await interrupted(f.event('roll'));
  assert.equal(f.messages.at(-1).pending, true);
});
test('rejects offline sessions and storage failures before rolling', async () => {
  const f = fixture({ isOnline: () => false });
  await f.receive(f.event('accept')); await f.receive(f.event('roll')); assert.equal(f.calls(), 0);
  assert.equal(f.messages.at(-1).type, 'disconnected');
  const blocked = fixture({ storage: { getItem: () => null, setItem: () => { throw new Error('blocked'); } } });
  await blocked.receive(blocked.event('accept')); await blocked.receive(blocked.event('roll')); assert.equal(blocked.calls(), 0);
});
test('strict components prevent injected dice formulas and retain negative modifiers', () => {
  assert.equal(validRequest(request), true); assert.equal(formulaFor(request), '1d20 + 6 + 3 - 2');
  for (const patch of [{ score: '1d20' }, { modifier: NaN }, { bonus: 1.5 }, { bonus: 10001 }, { attribute: 'GE + 50' }, { character: '' }]) assert.equal(validRequest({ ...request, ...patch }), false);
  assert.equal(escapeHtml('<img src="x">'), '&lt;img src=&quot;x&quot;&gt;');
  assert.equal(sheetUrl('http://localhost:3457/transfer?secret=no').href, 'http://localhost:3457/vault');
  assert.throws(() => sheetUrl('javascript:alert(1)')); assert.throws(() => sheetUrl('https://user:password@sheet.example'));
});
