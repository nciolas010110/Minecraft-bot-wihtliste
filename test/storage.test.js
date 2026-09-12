import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

// Der Speicher arbeitet relativ zum Arbeitsverzeichnis, deshalb wird in einen Temp-Ordner gewechselt.
const workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mc-bot-storage-'));
await fs.mkdir(path.join(workDir, 'data'), { recursive: true });
await fs.writeFile(
  path.join(workDir, 'data', 'storage.json'),
  JSON.stringify({
    userMappings: { '111': 'AltSpieler' },
    bans: { discord: ['999'], mcNames: ['altbann'] }
  }),
  'utf8'
);
process.chdir(workDir);

const storage = await import('../utils/storage.js');

test('migriert alte Bannlisten in vollständige Datensätze', async () => {
  const records = await storage.getAllBanRecords();
  assert.equal(records.length, 2);
  assert.ok(records.every((record) => record.scope && record.reason && record.active));
  assert.equal(await storage.isBanned({ mcName: 'AltBann' }), true);
  assert.equal(await storage.isBanned({ discordId: '999' }), true);
});

test('speichert Grund, Beweise und Anhänge und findet sie wieder', async () => {
  await storage.addBan({
    discordId: '222',
    mcName: 'Steve',
    scope: 'minecraft',
    reason: 'Griefing am Spawn',
    evidence: 'https://example.com/clip',
    attachments: [{ name: 'beweis.png', url: 'https://cdn/beweis.png', contentType: 'image/png' }],
    moderatorId: '7',
    moderatorTag: 'Mod#1'
  });

  const [record] = await storage.getBanRecords({ mcName: 'steve' });
  assert.equal(record.reason, 'Griefing am Spawn');
  assert.equal(record.moderatorTag, 'Mod#1');
  assert.equal(record.attachments.length, 1);
  assert.ok(record.createdAt);
  assert.equal(await storage.isBanned({ discordId: '222' }), true);
});

test('Bereich steuert die Kompatibilitätslisten', async () => {
  await storage.addBan({ discordId: '333', mcName: 'Alex', scope: 'discord', reason: 'Spam' });
  const lists = await storage.getBanLists();
  assert.ok(lists.discord.includes('333'));
  assert.ok(!lists.mcNames.includes('alex'), 'Ein reiner Discord-Bann sperrt den Minecraft-Namen nicht');
  assert.ok(lists.mcNames.includes('steve'));
});

test('Aufheben schreibt Verlauf statt zu löschen', async () => {
  const lifted = await storage.removeBan({ mcName: 'Steve', moderatorId: '7', moderatorTag: 'Mod#1', reason: 'Einspruch angenommen' });
  assert.equal(lifted.length, 1);
  assert.equal(await storage.isBanned({ mcName: 'Steve' }), false);

  const history = await storage.getBanRecords({ mcName: 'Steve', includeLifted: true });
  assert.equal(history.length, 1);
  assert.equal(history[0].active, false);
  assert.equal(history[0].liftReason, 'Einspruch angenommen');
});
