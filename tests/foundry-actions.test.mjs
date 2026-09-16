import test from 'node:test';
import assert from 'node:assert/strict';
import { validActionRequest, actionFormula, validReceipt, validSnapshot, gmCheck } from '../actions.mjs';
const base = { id: 'a'.repeat(32), character: 'Hero', talent: 'Sense' };
test('attack is d100 and damage adds only attack power; dice injection is rejected', () => {
  const attack = { ...base, kind: 'attack', target: 65 };
  assert.ok(validActionRequest(attack)); assert.equal(actionFormula(attack), '1d100');
  assert.ok(validReceipt(attack, { total: 65, die: 65, formula: '1d100', messageId: 'chat' }));
  assert.equal(65 < attack.target, false, 'equality misses');
  const damage = { ...base, kind: 'damage', dice: '2d6', power: 7 };
  assert.equal(actionFormula(damage), '2d6 + 7');
  assert.ok(validReceipt(damage, { total: 15, die: 8, formula: '2d6 + 7', messageId: 'chat' }));
  assert.equal(validReceipt(damage, { total: 20, die: 13, formula: '2d6 + 7', messageId: 'chat' }), false);
  for (const dice of ['1d6 + @actor.power', '999d100', '1d0', '1d6;alert(1)', '<img>']) assert.equal(validActionRequest({ ...damage, dice }), false);
});
test('ability cards require bounded cost and description, and a valid chat receipt', () => {
  const ability = { ...base, kind: 'ability', cost: 3, resource: 'Energie', description: 'An effect' };
  assert.ok(validActionRequest(ability)); assert.equal(actionFormula(ability), '');
  assert.equal(validActionRequest({ ...ability, cost: -1 }), false);
  assert.equal(validActionRequest({ ...ability, description: 'a'.repeat(4001) }), false);
  assert.ok(validReceipt(ability, { total: 0, die: 0, formula: '', messageId: 'chat' }));
});
test('GM requests authenticate the document operation initiator and reject expiry/wrong targets', () => {
  const gm = { id: 'gm', isGM: true, name: 'GM' }, player = { id: 'player', isGM: false };
  const message = { author: gm, flags: { 'sheetshift-bridge': { check: { id: base.id, talent: 'Wahrnehmung', attribute: 'IT', targets: ['player'], expires: 120001 } } } };
  assert.ok(gmCheck(message, gm, player, 1));
  assert.equal(gmCheck(message, player, player, 1), null, 'forged GM author does not grant authority');
  assert.equal(gmCheck({ ...message, author: player }, gm, player, 1), null);
  assert.equal(gmCheck(message, gm, { id: 'other' }, 1), null);
  assert.equal(gmCheck(message, gm, player, 120002), null);
});
test('snapshot fields rendered in action previews cannot carry injected markup', () => {
  const snapshot = { id: base.id, character: 'Hero', attributes: [{ key: 'IT', modifier: 2 }], busy: false,
    actions: [{ id: 'talent:0', label: '<img>', kind: 'talent', favorite: true, score: 3 }] };
  assert.ok(validSnapshot(snapshot));
  assert.equal(validSnapshot({ ...snapshot, actions: [{ ...snapshot.actions[0], score: '<img src=x onerror=alert(1)>' }] }), false);
});
