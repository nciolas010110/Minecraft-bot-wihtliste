/*
  Diagnose-Hilfen für das Log.
  - Beim Start wird geprüft, ob die Konfiguration vollständig ist und ob der Bot
    auf jedem Server wirklich bannen darf.
  - Discord-Fehler werden lesbar ausgegeben statt als roher Stacktrace.
  So ist im Log sofort sichtbar, warum eine Aktion nicht ausgeführt wurde.
*/
import { PermissionsBitField } from 'discord.js';

// Rechte, die der Bot für alle Funktionen braucht.
const REQUIRED_PERMISSIONS = [
  { flag: PermissionsBitField.Flags.BanMembers, label: 'Mitglieder bannen', needed: 'Discord-Sperren' },
  { flag: PermissionsBitField.Flags.ManageRoles, label: 'Rollen verwalten', needed: 'Whitelisted-Rolle' },
  { flag: PermissionsBitField.Flags.ViewChannel, label: 'Kanal ansehen', needed: 'Audit-Log' },
  { flag: PermissionsBitField.Flags.SendMessages, label: 'Nachrichten senden', needed: 'Audit-Log' },
  { flag: PermissionsBitField.Flags.AttachFiles, label: 'Dateien anhängen', needed: 'Beweise im Audit-Log' }
];

function stamp() {
  return new Date().toISOString();
}

export function logInfo(message, extra) {
  console.log(`[${stamp()}] [INFO ] ${message}`, extra !== undefined ? extra : '');
}

export function logWarn(message, extra) {
  console.warn(`[${stamp()}] [WARN ] ${message}`, extra !== undefined ? extra : '');
}

// Discord-Fehler haben einen Code; der sagt mehr als der Stacktrace.
export function logDiscordError(context, error) {
  const code = error?.code ?? 'unbekannt';
  const status = error?.status ?? '-';
  console.error(`[${stamp()}] [ERROR] ${context} | Discord-Code ${code} | HTTP ${status} | ${error?.message || error}`);
  if (code === 50013) console.error('        Ursache: fehlendes Recht oder die Bot-Rolle steht unter der Rolle des Mitglieds.');
  if (code === 50001) console.error('        Ursache: der Bot hat keinen Zugriff auf diesen Kanal oder Server.');
}

// Zeigt beim Start, welche Umgebungsvariablen gesetzt sind (ohne Geheimnisse auszugeben).
function logConfig() {
  const entries = [
    ['DISCORD_TOKEN', Boolean(process.env.DISCORD_TOKEN)],
    ['CLIENT_ID', Boolean(process.env.CLIENT_ID)],
    ['GUILD_ID', process.env.GUILD_ID || 'nicht gesetzt (global)'],
    ['RCON_HOST', process.env.RCON_HOST || 'nicht gesetzt'],
    ['RCON_PORT', process.env.RCON_PORT || 'nicht gesetzt'],
    ['RCON_PASSWORD', Boolean(process.env.RCON_PASSWORD)],
    ['MODERATOR_ROLE_ID', process.env.MODERATOR_ROLE_ID || 'nicht gesetzt'],
    ['ADMIN_ROLE_ID', process.env.ADMIN_ROLE_ID || 'nicht gesetzt (nur echte Admins)'],
    ['RCON_BLOCKED_COMMANDS', process.env.RCON_BLOCKED_COMMANDS || 'keine Sperrliste'],
    ['AUDIT_LOG_CHANNEL_ID', process.env.AUDIT_LOG_CHANNEL_ID || 'nicht gesetzt'],
    ['DISCORD_BAN_ENABLED', process.env.DISCORD_BAN_ENABLED || 'false']
  ];

  logInfo('Konfiguration:');
  for (const [name, value] of entries) {
    const shown = value === true ? 'gesetzt' : value === false ? 'FEHLT' : value;
    console.log(`        ${name.padEnd(22)} ${shown}`);
  }

  if (process.env.DISCORD_BAN_ENABLED !== 'true') {
    logWarn('DISCORD_BAN_ENABLED ist nicht "true": Discord-Sperren werden nur gespeichert, niemand wird vom Discord-Server gebannt.');
  }
}

// Prüft pro Server die Rechte des Bots und seine Position in der Rollenliste.
async function logGuildPermissions(client) {
  if (!client.guilds.cache.size) {
    logWarn('Der Bot ist auf keinem Server. Lade ihn mit dem Invite-Link ein.');
    return;
  }

  for (const guild of client.guilds.cache.values()) {
    const botMember = guild.members.me || await guild.members.fetch(client.user.id).catch(() => null);
    if (!botMember) {
      logWarn(`Server "${guild.name}": Bot-Mitglied konnte nicht geladen werden.`);
      continue;
    }

    const missing = REQUIRED_PERMISSIONS.filter((entry) => !botMember.permissions.has(entry.flag));
    logInfo(`Server "${guild.name}" (${guild.id}) – Bot-Rolle "${botMember.roles.highest.name}" auf Position ${botMember.roles.highest.position}.`);

    if (missing.length) {
      for (const entry of missing) {
        logWarn(`   Fehlendes Recht: "${entry.label}" – nötig für ${entry.needed}.`);
      }
    } else {
      console.log('        Alle benötigten Rechte sind vorhanden.');
    }

    // Mitglieder mit einer höheren Rolle kann der Bot technisch nicht bannen.
    const higherRoles = guild.roles.cache.filter((role) => role.position > botMember.roles.highest.position && !role.managed);
    if (higherRoles.size) {
      logWarn(`   ${higherRoles.size} Rolle(n) stehen über der Bot-Rolle. Mitglieder mit diesen Rollen kann der Bot nicht bannen: ${higherRoles.map((role) => role.name).slice(0, 10).join(', ')}`);
    }

    if (process.env.MODERATOR_ROLE_ID && !guild.roles.cache.has(process.env.MODERATOR_ROLE_ID)) {
      logWarn('   MODERATOR_ROLE_ID passt zu keiner Rolle auf diesem Server.');
    }
    if (!guild.roles.cache.some((role) => role.name === 'Whitelisted')) {
      logWarn('   Es gibt keine Rolle mit dem Namen "Whitelisted".');
    }
  }
}

export async function logStartupDiagnostics(client) {
  logConfig();
  try {
    await logGuildPermissions(client);
  } catch (error) {
    console.error('Rechteprüfung fehlgeschlagen:', error);
  }
}
