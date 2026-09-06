import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeMinecraftName, sameMinecraftName } from '../utils/minecraft.js';

test('akzeptiert gültige Minecraft-Namen', () => {
  assert.equal(normalizeMinecraftName(' Steve_123 '), 'Steve_123');
});

test('lehnt ungültige Minecraft-Namen ab', () => {
  assert.equal(normalizeMinecraftName('ab'), null);
  assert.equal(normalizeMinecraftName('name mit leerzeichen'), null);
  assert.equal(normalizeMinecraftName('name!'), null);
});

test('vergleicht Minecraft-Namen ohne Groß-/Kleinschreibung', () => {
  assert.equal(sameMinecraftName('Steve', 'steve'), true);
  assert.equal(sameMinecraftName('Steve', 'Alex'), false);
});