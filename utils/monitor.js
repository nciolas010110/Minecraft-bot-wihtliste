/*
  Server-Monitor
  - Führt regelmäßig die RCON-Befehle `tps` und `gc` aus.
  - Parst TPS- und RAM-Werte.
  - Sendet Warnungen und Erholungsmeldungen in einen Discord-Kanal.
*/
import { EmbedBuilder } from 'discord.js';
import { runRconCommand } from './rcon.js';
import { parseServerStatus } from './serverStatus.js';

const channelId = process.env.MONITOR_CHANNEL_ID;
const intervalSeconds = Number(process.env.MONITOR_INTERVAL_SECONDS || 60);
const ramThreshold = Number(process.env.MONITOR_RAM_THRESHOLD || 80);
const tpsThreshold = Number(process.env.MONITOR_TPS_THRESHOLD || 16);

const state = {
  ramAlert: false,
  tpsAlert: false,
  unsupportedCommandAlert: false,
  connectionAlert: false
};

function buildAlertEmbed(status, issues, recovered = false) {
  const embed = new EmbedBuilder()
    .setTitle(recovered ? 'Server-Monitor: Erholung' : 'Server-Monitor: Warnung')
    .setColor(recovered ? 'Green' : 'Red')
    .setDescription(recovered ? 'Der Server hat sich wieder erholt.' : 'Der Server zeigt aktuelle Probleme. Bitte prüfen!')
    .addFields(
      { name: 'Warnungen', value: issues.join('\n'), inline: false },
      { name: 'TPS 1m / 5m / 15m', value: `${status.tps1m ?? 'n/a'} / ${status.tps5m ?? 'n/a'} / ${status.tps15m ?? 'n/a'}`, inline: true },
      { name: 'RAM', value: status.memoryPercent !== null ? `${status.memoryUsedMB ?? 'n/a'} MB / ${status.memoryTotalMB ?? 'n/a'} MB (${status.memoryPercent}%)` : 'n/a', inline: true }
    );

  return embed;
}

export async function startServerMonitor(client) {
  if (!channelId) {
    console.log('Server-Monitor deaktiviert: MONITOR_CHANNEL_ID ist nicht gesetzt.');
    return;
  }

  if (!client.isReady()) {
    console.warn('Server-Monitor konnte nicht gestartet werden, weil der Client noch nicht bereit war.');
    return;
  }

  console.log(`Starte Server-Monitor: Kanal=${channelId}, Intervall=${intervalSeconds}s, RAM-Schwelle=${ramThreshold}%, TPS-Schwelle=${tpsThreshold}`);

  async function checkServer() {
    let channel;
    try {
      channel = await client.channels.fetch(channelId);
      if (!channel || !channel.isTextBased()) {
        console.error('Server-Monitor: Kanal nicht gefunden oder ist kein Textkanal.');
        return;
      }
    } catch (error) {
      console.error('Server-Monitor: Fehler beim Laden des Kanals:', error);
      return;
    }

    try {
      const tpsOutput = await runRconCommand('tps');
      const gcOutput = await runRconCommand('gc');
      const status = parseServerStatus(tpsOutput, gcOutput);
      const issues = [];

      if (status.memoryPercent !== null && status.memoryPercent >= ramThreshold) {
        issues.push(`RAM ist bei ${status.memoryPercent}% (Schwelle: ${ramThreshold}%).`);
      }
      if (status.tps1m !== null && status.tps1m < tpsThreshold) {
        issues.push(`TPS ist niedrig: ${status.tps1m} (Schwelle: ${tpsThreshold}).`);
      }

      const shouldAlert = issues.length > 0 && ((status.memoryPercent !== null && status.memoryPercent >= ramThreshold && !state.ramAlert) || (status.tps1m !== null && status.tps1m < tpsThreshold && !state.tpsAlert));

      if (shouldAlert) {
        await channel.send({ embeds: [buildAlertEmbed(status, issues)] });
        state.ramAlert = status.memoryPercent !== null && status.memoryPercent >= ramThreshold;
        state.tpsAlert = status.tps1m !== null && status.tps1m < tpsThreshold;
        state.unsupportedCommandAlert = false;
      } else if ((state.ramAlert || state.tpsAlert) && issues.length === 0) {
        await channel.send({ embeds: [buildAlertEmbed(status, ['Der Server hat sich erholt.'], true)] });
        state.ramAlert = false;
        state.tpsAlert = false;
      }

      const unsupported = [tpsOutput, gcOutput].some((text) => text.toLowerCase().includes('unknown command') || text.toLowerCase().includes('unbekannter befehl'));
      if (unsupported && !state.unsupportedCommandAlert) {
        await channel.send({ content: 'Server-Monitor: Ein benötigter Server-Befehl wird nicht unterstützt. Monitoring ist deshalb eingeschränkt.' });
        state.unsupportedCommandAlert = true;
      }
    } catch (error) {
      console.error('Server-Monitor: Fehler beim Abfragen des Servers:', error);
      if (!state.connectionAlert) {
        await channel.send({ content: 'Server-Monitor: Der Minecraft-Server oder RCON ist nicht erreichbar.' });
        state.connectionAlert = true;
      }
      return;
    }

    if (state.connectionAlert) {
      await channel.send({ content: 'Server-Monitor: Die Verbindung zum Minecraft-Server ist wieder hergestellt.' });
      state.connectionAlert = false;
    }
  }

  await checkServer();
  setInterval(checkServer, intervalSeconds * 1000);
}
