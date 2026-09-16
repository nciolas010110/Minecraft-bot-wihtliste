import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchServerSnapshot, parsePlayerList, parseServerStatus } from '../utils/serverStatus.js';

test('liest Anzahl und Namen aus der Antwort von list', () => {
  const result = parsePlayerList('There are 2 of a max of 20 players online: Steve, Alex');
  assert.equal(result.online, 2);
  assert.equal(result.max, 20);
  assert.deepEqual(result.names, ['Steve', 'Alex']);
});

test('leerer Server liefert keine Namen', () => {
  const result = parsePlayerList('There are 0 of a max of 20 players online:');
  assert.equal(result.online, 0);
  assert.deepEqual(result.names, []);
});

test('TPS und RAM werden aus tps und gc gelesen', () => {
  const status = parseServerStatus('TPS from last 1m, 5m, 15m: 19.8, 19.9, 20.0', 'Used memory: 2.0 GB of 4.0 GB');
  assert.equal(status.tps1m, 19.8);
  assert.equal(status.memoryUsedMB, 2048);
  assert.equal(status.memoryPercent, 50);
});

test('Snapshot bleibt nutzbar, wenn tps und gc fehlen', async () => {
  const snapshot = await fetchServerSnapshot(async (command) => {
    if (command === 'list') return 'There are 1 of a max of 20 players online: Steve';
    return 'Unknown command. Type "/help" for help.';
  });

  assert.equal(snapshot.players.online, 1);
  assert.equal(snapshot.tpsSupported, false);
  assert.equal(snapshot.memorySupported, false);
  assert.equal(snapshot.tps1m, null);
});
