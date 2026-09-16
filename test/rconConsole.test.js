import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildTemplateCommand,
  formatRconOutput,
  isBlockedCommand,
  isDangerousCommand,
  normalizeConsoleCommand
} from '../utils/rconConsole.js';

test('entfernt führende Slashes und überflüssige Leerzeichen', () => {
  assert.equal(normalizeConsoleCommand('  /give   Steve  diamond 5 '), 'give Steve diamond 5');
});

test('verhindert eingeschleuste Zweitbefehle über Zeilenumbrüche', () => {
  assert.equal(normalizeConsoleCommand('say hallo\nstop'), 'say hallo stop');
});

test('leere Eingabe ergibt keinen Befehl', () => {
  assert.equal(normalizeConsoleCommand('   '), null);
  assert.equal(normalizeConsoleCommand(null), null);
});

test('kritische Befehle werden erkannt, harmlose nicht', () => {
  assert.equal(isDangerousCommand('stop'), true);
  assert.equal(isDangerousCommand('op Steve'), true);
  assert.equal(isDangerousCommand('whitelist off'), true);
  assert.equal(isDangerousCommand('operator-check'), false);
  assert.equal(isDangerousCommand('give Steve stone'), false);
});

test('Sperrliste aus der Umgebung greift auf Befehl und Präfix', () => {
  assert.equal(isBlockedCommand('op Steve', 'op, stop'), true);
  assert.equal(isBlockedCommand('stop', 'op, stop'), true);
  assert.equal(isBlockedCommand('give Steve stone', 'op, stop'), false);
  assert.equal(isBlockedCommand('give Steve stone', ''), false);
});

test('Antwort wird von Farbcodes befreit und gekürzt', () => {
  assert.equal(formatRconOutput('§aFertig').text, 'Fertig');
  assert.equal(formatRconOutput('').text, 'Der Server hat keine Antwort zurückgegeben.');

  const long = formatRconOutput('x'.repeat(5000), { maxChars: 100 });
  assert.equal(long.truncated, true);
  assert.equal(long.text.length, 102);
});

test('Vorlage lässt leere Platzhalter weg', () => {
  assert.equal(buildTemplateCommand('jail {spieler} {jail} {dauer}', { spieler: 'Steve', jail: '', dauer: '30m' }), 'jail Steve 30m');
  assert.equal(buildTemplateCommand('unjail {spieler}', { spieler: 'Steve' }), 'unjail Steve');
});
