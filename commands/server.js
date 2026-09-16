/*
  Server-Fernsteuerung über Discord (nur für Administratoren).
  - `/server konsole` führt einen beliebigen Konsolenbefehl aus (z. B. give, tp, weather).
  - `/server status` und `/server spieler` zeigen TPS, RAM und wer online ist.
  - `/server sagen`, `kick`, `give`, `jail`, `unjail` sind Kurzwege für häufige Aktionen.
  Jede Ausführung landet im Audit-Log, damit nachvollziehbar bleibt, wer was getan hat.
*/
import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { runRconCommand } from '../utils/rcon.js';
import { fetchServerSnapshot } from '../utils/serverStatus.js';
import {
  DANGEROUS_COMMANDS,
  buildTemplateCommand,
  formatRconOutput,
  isBlockedCommand,
  isDangerousCommand,
  normalizeConsoleCommand
} from '../utils/rconConsole.js';
import { isAdministrator, adminOnly } from '../utils/permissions.js';
import { logAuditEvent } from '../utils/audit.js';

// Jail-Plugins verwenden unterschiedliche Syntax, deshalb sind die Befehle Vorlagen.
// Platzhalter: {spieler} {jail} {dauer} {grund}; leere Platzhalter fallen weg.
const jailTemplate = process.env.JAIL_COMMAND_TEMPLATE || 'jail {spieler} {jail} {dauer}';
const unjailTemplate = process.env.UNJAIL_COMMAND_TEMPLATE || 'unjail {spieler}';
const defaultJailName = process.env.JAIL_DEFAULT_NAME || '';

export const data = new SlashCommandBuilder()
  .setName('server')
  .setDescription('Minecraft-Server über Discord steuern und überwachen (nur Admins)')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .setDMPermission(false)
  .addSubcommand((subcommand) => subcommand
    .setName('konsole')
    .setDescription('Beliebigen Konsolenbefehl auf dem Server ausführen')
    .addStringOption((option) => option
      .setName('befehl')
      .setDescription('Befehl ohne führenden Slash, z. B. give Steve diamond 5')
      .setRequired(true)
      .setMaxLength(400))
    .addBooleanOption((option) => option
      .setName('bestaetigen')
      .setDescription('Nötig bei kritischen Befehlen wie stop, restart oder op')))
  .addSubcommand((subcommand) => subcommand
    .setName('status')
    .setDescription('TPS, RAM und Spielerzahl des Servers abfragen'))
  .addSubcommand((subcommand) => subcommand
    .setName('spieler')
    .setDescription('Zeigt, wer gerade online ist'))
  .addSubcommand((subcommand) => subcommand
    .setName('sagen')
    .setDescription('Nachricht an alle Spieler im Chat senden')
    .addStringOption((option) => option
      .setName('nachricht')
      .setDescription('Text für den Server-Chat')
      .setRequired(true)
      .setMaxLength(300)))
  .addSubcommand((subcommand) => subcommand
    .setName('kick')
    .setDescription('Spieler vom Server werfen')
    .addStringOption((option) => option.setName('spieler').setDescription('Minecraft-Name').setRequired(true))
    .addStringOption((option) => option.setName('grund').setDescription('Grund für den Kick').setMaxLength(200)))
  .addSubcommand((subcommand) => subcommand
    .setName('give')
    .setDescription('Einem Spieler ein Item geben')
    .addStringOption((option) => option.setName('spieler').setDescription('Minecraft-Name').setRequired(true))
    .addStringOption((option) => option.setName('item').setDescription('Item-ID, z. B. minecraft:diamond').setRequired(true))
    .addIntegerOption((option) => option.setName('anzahl').setDescription('Menge (Standard: 1)').setMinValue(1).setMaxValue(6400)))
  .addSubcommand((subcommand) => subcommand
    .setName('jail')
    .setDescription('Spieler ins Jail setzen')
    .addStringOption((option) => option.setName('spieler').setDescription('Minecraft-Name').setRequired(true))
    .addStringOption((option) => option.setName('jail').setDescription('Name des Jails (falls das Plugin mehrere kennt)'))
    .addStringOption((option) => option.setName('dauer').setDescription('Dauer, z. B. 30m oder 2h'))
    .addStringOption((option) => option.setName('grund').setDescription('Grund für das Jail').setMaxLength(200)))
  .addSubcommand((subcommand) => subcommand
    .setName('unjail')
    .setDescription('Spieler aus dem Jail entlassen')
    .addStringOption((option) => option.setName('spieler').setDescription('Minecraft-Name').setRequired(true)));

export async function execute(interaction, client) {
  if (!isAdministrator(interaction)) return adminOnly(interaction);

  const subcommand = interaction.options.getSubcommand();
  if (subcommand === 'status' || subcommand === 'spieler') {
    return showStatus(interaction, { playersOnly: subcommand === 'spieler' });
  }
  if (subcommand === 'konsole') return runConsole(interaction, client);
  return runShortcut(interaction, client, subcommand);
}

// Baut aus den Optionen eines Kurzbefehls den fertigen Konsolenbefehl.
function buildShortcutCommand(interaction, subcommand) {
  const player = normalizeConsoleCommand(interaction.options.getString('spieler') || '');
  const reason = normalizeConsoleCommand(interaction.options.getString('grund') || '') || '';

  switch (subcommand) {
    case 'sagen': {
      const message = normalizeConsoleCommand(interaction.options.getString('nachricht'));
      return message ? { command: `say ${message}`, action: 'Chat-Nachricht' } : null;
    }
    case 'kick':
      return player ? { command: `kick ${player}${reason ? ` ${reason}` : ''}`, action: 'Kick', player } : null;
    case 'give': {
      const item = normalizeConsoleCommand(interaction.options.getString('item'));
      const amount = interaction.options.getInteger('anzahl') || 1;
      return player && item ? { command: `give ${player} ${item} ${amount}`, action: 'Item vergeben', player } : null;
    }
    case 'jail': {
      const command = buildTemplateCommand(jailTemplate, {
        spieler: player,
        jail: normalizeConsoleCommand(interaction.options.getString('jail') || '') || defaultJailName,
        dauer: normalizeConsoleCommand(interaction.options.getString('dauer') || '') || '',
        grund: reason
      });
      return player && command ? { command, action: 'Jail', player } : null;
    }
    case 'unjail': {
      const command = buildTemplateCommand(unjailTemplate, { spieler: player });
      return player && command ? { command, action: 'Unjail', player } : null;
    }
    default:
      return null;
  }
}

async function runShortcut(interaction, client, subcommand) {
  const shortcut = buildShortcutCommand(interaction, subcommand);
  if (!shortcut) {
    return interaction.reply({ content: 'Die Eingabe konnte nicht in einen gültigen Befehl umgewandelt werden.', flags: 64 });
  }

  await interaction.deferReply({ flags: 64 });
  return executeAndReport(interaction, client, shortcut);
}

async function runConsole(interaction, client) {
  const command = normalizeConsoleCommand(interaction.options.getString('befehl'));
  if (!command) {
    return interaction.reply({ content: 'Der Befehl ist leer oder enthält nur ungültige Zeichen.', flags: 64 });
  }

  if (isBlockedCommand(command)) {
    return interaction.reply({ content: `Dieser Befehl steht in \`RCON_BLOCKED_COMMANDS\` und ist gesperrt: \`${command}\``, flags: 64 });
  }

  // Kritische Befehle laufen nur mit ausdrücklicher Bestätigung, damit kein Versehen den Server stoppt.
  if (isDangerousCommand(command) && !interaction.options.getBoolean('bestaetigen')) {
    return interaction.reply({
      content: `\`${command}\` gilt als kritisch. Führe den Befehl erneut mit \`bestaetigen:true\` aus.\nKritisch sind: ${DANGEROUS_COMMANDS.map((entry) => `\`${entry}\``).join(', ')}`,
      flags: 64
    });
  }

  await interaction.deferReply({ flags: 64 });
  return executeAndReport(interaction, client, { command, action: 'Konsolenbefehl' });
}

// Führt den Befehl aus, antwortet in Discord und schreibt den Vorgang ins Audit-Log.
async function executeAndReport(interaction, client, { command, action, player = null }) {
  const startedAt = Date.now();

  try {
    const response = await runRconCommand(command);
    const { text, truncated } = formatRconOutput(response);
    const duration = Date.now() - startedAt;

    const embed = new EmbedBuilder()
      .setTitle(`Server: ${action}`)
      .setColor('Green')
      .setDescription(`Befehl:\n\`\`\`\n${command}\n\`\`\`\nAntwort:\n\`\`\`\n${text}\n\`\`\``)
      .setFooter({ text: `${duration} ms${truncated ? ' – Antwort gekürzt' : ''}` })
      .setTimestamp();

    await logAuditEvent(client, {
      action: `Server-Befehl: ${action}`,
      interaction,
      minecraftName: player,
      details: `\`${command}\``,
      color: 'Orange'
    });

    return interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error(`Server-Befehl "${command}" fehlgeschlagen:`, error);

    await logAuditEvent(client, {
      action: `Server-Befehl fehlgeschlagen: ${action}`,
      interaction,
      minecraftName: player,
      details: `\`${command}\` – ${error.message}`,
      color: 'Red'
    });

    return interaction.editReply({
      embeds: [new EmbedBuilder()
        .setTitle('Server-Befehl fehlgeschlagen')
        .setColor('Red')
        .setDescription(`Befehl:\n\`\`\`\n${command}\n\`\`\``)
        .addFields({ name: 'Fehler', value: error.message.slice(0, 1000) })
        .setFooter({ text: 'Prüfe RCON_HOST, RCON_PORT und RCON_PASSWORD sowie ob der Server läuft.' })]
    });
  }
}

async function showStatus(interaction, { playersOnly }) {
  await interaction.deferReply({ flags: 64 });

  try {
    const snapshot = await fetchServerSnapshot();
    const { players } = snapshot;
    const playerText = players.names.length
      ? players.names.join(', ').slice(0, 1000)
      : 'Gerade ist niemand online.';

    const embed = new EmbedBuilder()
      .setTitle(playersOnly ? 'Spieler online' : 'Server-Status')
      .setColor('Green')
      .setTimestamp()
      .addFields({
        name: `Spieler (${players.online ?? '?'}${players.max ? ` / ${players.max}` : ''})`,
        value: playerText,
        inline: false
      });

    if (!playersOnly) {
      embed.addFields(
        {
          name: 'TPS 1m / 5m / 15m',
          value: snapshot.tpsSupported
            ? `${snapshot.tps1m ?? 'n/a'} / ${snapshot.tps5m ?? 'n/a'} / ${snapshot.tps15m ?? 'n/a'}`
            : 'Befehl `tps` nicht verfügbar (nur Paper/Spigot)',
          inline: true
        },
        {
          name: 'RAM',
          value: snapshot.memoryPercent !== null
            ? `${snapshot.memoryUsedMB ?? 'n/a'} MB / ${snapshot.memoryTotalMB ?? 'n/a'} MB (${snapshot.memoryPercent}%)`
            : 'Befehl `gc` nicht verfügbar (nur Paper/Spigot)',
          inline: true
        }
      );
    }

    return interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error('Server-Status konnte nicht geladen werden:', error);
    return interaction.editReply({
      embeds: [new EmbedBuilder()
        .setTitle('Server nicht erreichbar')
        .setColor('Red')
        .setDescription('Der Minecraft-Server hat über RCON nicht geantwortet.')
        .addFields({ name: 'Fehler', value: error.message.slice(0, 1000) })]
    });
  }
}
