/*
  Server-Status
  - Liest TPS, RAM und Spielerliste über RCON aus.
  - Wird sowohl vom Dauer-Monitor (utils/monitor.js) als auch von `/server status` genutzt.
  - `tps` und `gc` gibt es nur auf Paper/Spigot; fehlt der Befehl, bleiben die Werte leer.
*/
import { runRconCommand } from './rcon.js';

export const COLOR_CODES = /§[0-9a-fk-or]/gi;

function stripColors(value) {
  return String(value ?? '').replace(COLOR_CODES, '');
}

export function isUnknownCommand(output) {
  return /unknown (or incomplete )?command|unbekannter befehl/i.test(String(output ?? ''));
}

function parseMemoryValue(value, unit) {
  const number = Number(value.replace(',', '.'));
  if (Number.isNaN(number)) return null;
  return unit.toLowerCase() === 'gb' ? number * 1024 : number;
}

export function parseServerStatus(tpsOutput, gcOutput) {
  const status = {
    tps1m: null,
    tps5m: null,
    tps15m: null,
    memoryUsedMB: null,
    memoryTotalMB: null,
    memoryPercent: null,
    raw: `${tpsOutput}\n${gcOutput}`
  };

  const tpsMatch = String(tpsOutput ?? '').match(/TPS.*?:\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i);
  if (tpsMatch) {
    status.tps1m = Number(tpsMatch[1]);
    status.tps5m = Number(tpsMatch[2]);
    status.tps15m = Number(tpsMatch[3]);
  }

  const gcText = String(gcOutput ?? '');
  const memoryMatch = gcText.match(/(?:Used memory|Memory use|Current memory use).*?(\d+(?:[.,]\d+)?)\s*(MB|GB).*?(?:of|\/|\()\s*(\d+(?:[.,]\d+)?)\s*(MB|GB)/i);
  if (memoryMatch) {
    const usedMB = parseMemoryValue(memoryMatch[1], memoryMatch[2]);
    const totalMB = parseMemoryValue(memoryMatch[3], memoryMatch[4]);
    if (usedMB !== null && totalMB !== null && totalMB > 0) {
      status.memoryUsedMB = Math.round(usedMB);
      status.memoryTotalMB = Math.round(totalMB);
      status.memoryPercent = Math.round((usedMB / totalMB) * 100);
    }
  }

  const memoryPercentMatch = gcText.match(/(\d+(?:[.,]\d+)?)\s*%/);
  if (status.memoryPercent === null && memoryPercentMatch) {
    status.memoryPercent = Math.round(Number(memoryPercentMatch[1].replace(',', '.')));
  }

  return status;
}

// Aus der Antwort von `list` die Anzahl und die Namen der Online-Spieler lesen.
export function parsePlayerList(listOutput) {
  const text = stripColors(listOutput).trim();
  const result = { online: null, max: null, names: [] };
  if (!text) return result;

  const countMatch = text.match(/(\d+)\s*(?:of a max(?:imum)? of|von maximal|\/)\s*(\d+)/i);
  if (countMatch) {
    result.online = Number(countMatch[1]);
    result.max = Number(countMatch[2]);
  }

  // Die Namen stehen hinter dem letzten Doppelpunkt der Kopfzeile.
  const separatorIndex = text.indexOf(':');
  if (separatorIndex !== -1) {
    result.names = text
      .slice(separatorIndex + 1)
      .split(',')
      .map((name) => name.trim())
      .filter(Boolean);
  }

  if (result.online === null) result.online = result.names.length;
  return result;
}

// Führt einen Zusatzbefehl aus, der nicht auf jedem Server existiert.
async function tryRun(run, command) {
  try {
    const output = await run(command);
    return isUnknownCommand(output) ? '' : output;
  } catch (error) {
    console.error(`Server-Status: "${command}" fehlgeschlagen:`, error);
    return '';
  }
}

// Sammelt den kompletten Status. Schlägt `list` fehl, ist der Server nicht erreichbar.
export async function fetchServerSnapshot(run = runRconCommand) {
  const listOutput = await run('list');
  const tpsOutput = await tryRun(run, 'tps');
  const gcOutput = await tryRun(run, 'gc');

  return {
    players: parsePlayerList(listOutput),
    ...parseServerStatus(tpsOutput, gcOutput),
    tpsSupported: Boolean(tpsOutput),
    memorySupported: Boolean(gcOutput)
  };
}
