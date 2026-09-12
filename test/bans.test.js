import test from 'node:test';
import assert from 'node:assert/strict';
import { BAN_SCOPES, banMatchesTarget, banScopeLabel, createBanRecord, liftBanRecord, normalizeBanScope, scopeIncludesDiscord, scopeIncludesMinecraft } from '../utils/bans.js';
import { banRecordLine, firstImageUrl, formatAttachments } from '../utils/banView.js';

test('normalisiert Ban-Bereiche und Kurzformen', () => {
  assert.equal(normalizeBanScope('mc'), BAN_SCOPES.MINECRAFT);
  assert.equal(normalizeBanScope('Discord'), BAN_SCOPES.DISCORD);
  assert.equal(normalizeBanScope(undefined), BAN_SCOPES.BOTH);
  assert.equal(banScopeLabel('minecraft'), 'Nur Minecraft');
});

test('Bereich bestimmt die betroffenen Plattformen', () => {
  assert.equal(scopeIncludesMinecraft(BAN_SCOPES.MINECRAFT), true);
  assert.equal(scopeIncludesDiscord(BAN_SCOPES.MINECRAFT), false);
  assert.equal(scopeIncludesMinecraft(BAN_SCOPES.BOTH), true);
  assert.equal(scopeIncludesDiscord(BAN_SCOPES.BOTH), true);
});

test('Ban-Datensatz enthält Grund, Beweise und Moderator', () => {
  const record = createBanRecord({
    mcName: 'Steve',
    discordId: '42',
    scope: 'mc',
    reason: 'Griefing',
    evidence: 'https://example.com/clip',
    attachments: [{ name: 'beweis.png', url: 'https://cdn/beweis.png', contentType: 'image/png' }],
    moderatorId: '7',
    moderatorTag: 'Mod'
  });

  assert.equal(record.active, true);
  assert.equal(record.scope, BAN_SCOPES.MINECRAFT);
  assert.equal(record.reason, 'Griefing');
  assert.equal(record.attachments.length, 1);
  assert.ok(record.createdAt);
});

test('findet Datensätze über Discord-ID oder Minecraft-Name', () => {
  const record = createBanRecord({ mcName: 'Steve', discordId: '42', scope: 'beide' });
  assert.equal(banMatchesTarget(record, { mcName: 'steve' }), true);
  assert.equal(banMatchesTarget(record, { discordId: '42' }), true);
  assert.equal(banMatchesTarget(record, { mcName: 'Alex' }), false);
});

test('Aufhebung speichert Zeitpunkt, Moderator und Grund', () => {
  const record = liftBanRecord(createBanRecord({ mcName: 'Steve', scope: 'mc' }), { moderatorId: '7', moderatorTag: 'Mod', reason: 'Einspruch' });
  assert.equal(record.active, false);
  assert.equal(record.liftReason, 'Einspruch');
  assert.ok(record.liftedAt);
});

test('Beweis-Anhänge werden verlinkt, dauerhafte Kopie bevorzugt', () => {
  const attachments = [
    { name: 'clip.mp4', url: 'https://cdn/clip.mp4', contentType: 'video/mp4' },
    { name: 'bild.png', url: 'https://cdn/bild.png', mirrorUrl: 'https://discord.com/audit/1', contentType: 'image/png' }
  ];
  const text = formatAttachments(attachments);
  assert.match(text, /Video 1: clip\.mp4/);
  assert.match(text, /https:\/\/discord\.com\/audit\/1/);
  assert.equal(firstImageUrl({ attachments }), 'https://discord.com/audit/1');
  assert.equal(formatAttachments([]), null);
});

test('Listenzeile zeigt Bereich, Grund und Anzahl der Anhänge', () => {
  const line = banRecordLine(createBanRecord({ mcName: 'Steve', scope: 'discord', reason: 'Spam', attachments: [{ url: 'x' }] }));
  assert.match(line, /Steve/);
  assert.match(line, /Nur Discord/);
  assert.match(line, /Spam/);
  assert.match(line, /1 Anhang/);
});
