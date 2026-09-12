import { SlashCommandBuilder, EmbedBuilder, PermissionsBitField } from 'discord.js';
import { checkMinecraftUser } from '../utils/mojang.js';
import { runRconCommand } from '../utils/rcon.js';
import {
  addBan,
  getAllMappings,
  getBanLists,
  getBanRecords,
  getDiscordByMcName,
  getUserMapping,
  isBanned,
  removeBan,
  removeUserMappingByMcName,
  setUserMapping
} from '../utils/storage.js';
import { normalizeMinecraftName } from '../utils/minecraft.js';
import { BAN_SCOPES, banScopeLabel, normalizeBanScope, scopeIncludesDiscord, scopeIncludesMinecraft } from '../utils/bans.js';
import { banRecordFields } from '../utils/banView.js';
import { buildBanEmbed, collectEvidenceAttachments, fetchUserLabel, resolveBanTarget } from '../utils/banUi.js';
import { chunkLines, selectPage } from '../utils/pagination.js';
import { isModerator, moderatorOnly } from '../utils/permissions.js';
import { logAuditEvent } from '../utils/audit.js';

const cooldowns = new Map();
const COOLDOWN_SECONDS = 30;
// Wenn true, wird bei einer Discord-Sperre zusätzlich der Discord-Server-Bann gesetzt.
const discordBanEnabled = process.env.DISCORD_BAN_ENABLED === 'true';

const scopeChoices = [
  { name: 'Nur Minecraft', value: BAN_SCOPES.MINECRAFT },
  { name: 'Nur Discord', value: BAN_SCOPES.DISCORD },
  { name: 'Minecraft und Discord', value: BAN_SCOPES.BOTH }
];

function addEvidenceOptions(subcommand) {
  return subcommand
    .addStringOption((option) => option.setName('beweise').setDescription('Beweise als Text oder Links'))
    .addAttachmentOption((option) => option.setName('beweis1').setDescription('Beweis als Bild oder Video'))
    .addAttachmentOption((option) => option.setName('beweis2').setDescription('Weiterer Beweis als Bild oder Video'))
    .addAttachmentOption((option) => option.setName('beweis3').setDescription('Weiterer Beweis als Bild oder Video'));
}

export const data = new SlashCommandBuilder()
  .setName('whitelist')
  .setDescription('Minecraft-Whitelist verwalten')
  .addSubcommand((subcommand) => subcommand
    .setName('add')
    .setDescription('Dich selbst auf die Whitelist setzen')
    .addStringOption((option) => option
      .setName('mcname')
      .setDescription('Minecraft-Name')
      .setRequired(true)))
  .addSubcommand((subcommand) => subcommand
    .setName('remove')
    .setDescription('Einen Spieler von der Whitelist entfernen')
    .addStringOption((option) => option.setName('mcname').setDescription('Minecraft-Name').setRequired(true)))
  .addSubcommand((subcommand) => addEvidenceOptions(subcommand
    .setName('ban')
    .setDescription('Einen Spieler sperren: nur Minecraft, nur Discord oder beides')
    .addStringOption((option) => option.setName('grund').setDescription('Warum wird gesperrt?').setRequired(true))
    .addStringOption((option) => option.setName('mcname').setDescription('Minecraft-Name'))
    .addUserOption((option) => option.setName('discord').setDescription('Discord-Benutzer'))
    .addStringOption((option) => option
      .setName('bereich')
      .setDescription('Wo gilt die Sperre? Standard: Minecraft und Discord')
      .addChoices(...scopeChoices))))
  .addSubcommand((subcommand) => subcommand
    .setName('unban')
    .setDescription('Eine Sperre aufheben')
    .addStringOption((option) => option.setName('mcname').setDescription('Minecraft-Name'))
    .addUserOption((option) => option.setName('discord').setDescription('Discord-Benutzer'))
    .addStringOption((option) => option
      .setName('bereich')
      .setDescription('Welche Sperre wird aufgehoben? Standard: alle')
      .addChoices(...scopeChoices))
    .addStringOption((option) => option.setName('grund').setDescription('Warum wird die Sperre aufgehoben?')))
  .addSubcommand((subcommand) => subcommand
    .setName('list')
    .setDescription('Alle gespeicherten Zuordnungen anzeigen')
    .addIntegerOption((option) => option.setName('seite').setDescription('Seitenzahl bei sehr langen Listen').setMinValue(1)))
  .addSubcommand((subcommand) => subcommand
    .setName('user')
    .setDescription('Eine Zuordnung anzeigen')
    .addUserOption((option) => option.setName('discord').setDescription('Discord-Benutzer, nur für Administratoren'))
    .addStringOption((option) => option.setName('mcname').setDescription('Minecraft-Name, nur für Administratoren')));

export async function execute(interaction) {
  const subcommand = interaction.options.getSubcommand();
  if (subcommand === 'add') return addPlayer(interaction);
  if (subcommand === 'remove') return removePlayer(interaction);
  if (subcommand === 'ban') return banPlayer(interaction);
  if (subcommand === 'unban') return unbanPlayer(interaction);
  if (subcommand === 'list') return listPlayers(interaction);
  return showUser(interaction);
}

function getMinecraftName(interaction) {
  return normalizeMinecraftName(interaction.options.getString('mcname', true));
}

// RCON-Befehle vertragen keine Zeilenumbrüche; der Grund wird deshalb gekürzt und bereinigt.
function sanitizeRconText(value, maxLength = 120) {
  if (!value) return '';
  return value.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

async function addPlayer(interaction) {
  const userId = interaction.user.id;
  const now = Date.now();
  const cooldownExpiration = cooldowns.get(userId) || 0;

  if (now < cooldownExpiration) {
    const remaining = Math.ceil((cooldownExpiration - now) / 1000);
    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle('Bitte warte kurz')
          .setDescription(`Du kannst diesen Befehl in ${remaining} Sekunden erneut verwenden.`)
          .setColor('Orange')
      ],
      flags: 64
    });
  }

  const mcName = getMinecraftName(interaction);
  if (!mcName) {
    return interaction.reply({ content: 'Der Minecraft-Name muss 3 bis 16 Zeichen lang sein und darf nur Buchstaben, Zahlen und Unterstriche enthalten.', flags: 64 });
  }

  await interaction.deferReply({ flags: 64 });

  try {
    if (await isBanned({ discordId: userId, mcName })) {
      const records = await getBanRecords({ discordId: userId, mcName });
      const record = records[0];
      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setTitle('Zugriff verweigert')
            .setDescription('Du bist gesperrt oder dieser Minecraft-Name ist gebannt.')
            .addFields(
              { name: 'Bereich', value: record ? banScopeLabel(record.scope) : 'Unbekannt', inline: true },
              { name: 'Grund', value: record?.reason || 'Kein Grund gespeichert', inline: false }
            )
            .setColor('Red')
        ]
      });
    }

    const existingMapping = await getUserMapping(userId);
    if (existingMapping) {
      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setTitle('Bereits registriert')
            .setDescription(`Du hast bereits den Minecraft-Namen **${existingMapping}** zugeordnet. Bitte entferne ihn zuerst mit **/whitelist remove**.`)
            .setColor('Orange')
        ]
      });
    }

    const linkedDiscord = await getDiscordByMcName(mcName);
    if (linkedDiscord) {
      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setTitle('Name bereits vergeben')
            .setDescription(`Der Minecraft-Name **${mcName}** ist bereits mit einem anderen Discord-Konto verknüpft.`)
            .setColor('Orange')
        ]
      });
    }

    const mojangData = await checkMinecraftUser(mcName);
    if (!mojangData) {
      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setTitle('Ungültiger Minecraft-Name')
            .setDescription(`Der Name **${mcName}** existiert nicht laut Mojang.`)
            .setColor('Red')
        ]
      });
    }

    const rconResponse = await runRconCommand(`whitelist add ${mcName}`);
    await setUserMapping(userId, mcName);
    cooldowns.set(userId, now + COOLDOWN_SECONDS * 1000);
    await logAuditEvent(interaction.client, { action: 'Whitelist hinzugefügt', interaction, minecraftName: mcName, details: 'Spieler registriert' });

    const successEmbed = new EmbedBuilder()
      .setTitle('Whitelist erfolgreich')
      .setDescription(`Der Spieler **${mcName}** wurde auf dem Server freigeschaltet.`)
      .addFields(
        { name: 'Mojang-ID', value: mojangData.id, inline: true },
        { name: 'Discord-Benutzer', value: interaction.user.tag, inline: true }
      )
      .setColor('Green');

    await interaction.editReply({ embeds: [successEmbed] });

    if (interaction.guild) {
      try {
        const role = interaction.guild.roles.cache.find((r) => r.name === 'Whitelisted');
        if (role) {
          const member = interaction.member;
          if (member && member.roles) {
            await member.roles.add(role);
          } else {
            const fetchedMember = await interaction.guild.members.fetch(interaction.user.id);
            await fetchedMember.roles.add(role);
          }
        }
      } catch (roleError) {
        console.error('Fehler beim Zuweisen der Whitelisted-Rolle:', roleError);
      }
    }

    console.log(`Whitelist hinzugefügt: ${mcName} (${mojangData.id})`);
    if (rconResponse) console.log('RCON-Antwort:', rconResponse);
  } catch (error) {
    console.error('Fehler beim Whitelisten:', error);
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setTitle('Whitelist fehlgeschlagen')
          .setDescription('Es gab ein Problem beim Verbinden mit dem Minecraft-Server. Bitte überprüfe die RCON-Einstellungen.')
          .setColor('Red')
      ]
    });
  }
}

async function removePlayer(interaction) {
  if (!isModerator(interaction)) return moderatorOnly(interaction);
  const mcName = getMinecraftName(interaction);
  if (!mcName) return invalidName(interaction);
  await interaction.deferReply({ flags: 64 });

  try {
    const mapping = await getDiscordByMcName(mcName);
    const response = await runRconCommand(`whitelist remove ${mcName}`);
    await removeUserMappingByMcName(mcName);
    await removeWhitelistedRole(interaction, mapping?.[0]);
    await logAuditEvent(interaction.client, { action: 'Whitelist entfernt', interaction, minecraftName: mcName, details: 'Spieler entfernt' });
    return interaction.editReply({ embeds: [new EmbedBuilder()
      .setTitle('Whitelist entfernt')
      .setDescription(`**${mcName}** wurde von der Whitelist entfernt.`)
      .addFields({ name: 'Serverantwort', value: response || 'Keine Antwort erhalten' })
      .setColor('Green')] });
  } catch (error) {
    return handleCommandError(interaction, error, 'Der Spieler konnte nicht von der Whitelist entfernt werden.');
  }
}

async function banPlayer(interaction) {
  if (!isModerator(interaction)) return moderatorOnly(interaction);

  const scope = normalizeBanScope(interaction.options.getString('bereich'));
  const reason = interaction.options.getString('grund', true);
  const evidence = interaction.options.getString('beweise');
  const attachments = collectEvidenceAttachments(interaction);
  const target = await resolveBanTarget(interaction);

  if (target.error) return interaction.reply({ content: target.error, flags: 64 });
  if (scopeIncludesMinecraft(scope) && !target.mcName) {
    return interaction.reply({ content: 'Für eine Minecraft-Sperre wird ein Minecraft-Name benötigt. Gib `mcname` an oder wähle den Bereich "Nur Discord".', flags: 64 });
  }
  if (scopeIncludesDiscord(scope) && !target.discordId) {
    return interaction.reply({ content: 'Für eine Discord-Sperre wird ein Discord-Benutzer benötigt. Gib `discord` an oder wähle den Bereich "Nur Minecraft".', flags: 64 });
  }

  await interaction.deferReply({ flags: 64 });

  const { mcName, discordId } = target;
  const notes = [];

  try {
    if (scopeIncludesMinecraft(scope) && mcName) {
      try {
        const whitelistResponse = await runRconCommand(`whitelist remove ${mcName}`);
        const banResponse = await runRconCommand(`ban ${mcName} ${sanitizeRconText(reason)}`.trim());
        notes.push(`Whitelist: ${whitelistResponse || 'keine Antwort'}`);
        notes.push(`Minecraft-Ban: ${banResponse || 'keine Antwort'}`);
      } catch (rconError) {
        // Die Sperre wird trotzdem gespeichert, damit sie nach einem Serverausfall nicht verloren geht.
        console.error('RCON-Ban fehlgeschlagen:', rconError);
        notes.push('Der Minecraft-Server war nicht erreichbar. Die Sperre ist gespeichert, muss auf dem Server aber nachgeholt werden.');
      }
      await removeUserMappingByMcName(mcName);
    }

    if (scopeIncludesDiscord(scope) && discordId) {
      notes.push(await applyDiscordBan(interaction, discordId, reason));
    }

    await removeWhitelistedRole(interaction, discordId);

    const discordLabel = await fetchUserLabel(interaction.client, discordId);
    // Zuerst ins Audit-Log, damit Bilder und Videos dort dauerhaft liegen und verlinkt werden können.
    const auditResult = await logAuditEvent(interaction.client, {
      action: 'Spieler gesperrt',
      interaction,
      minecraftName: mcName,
      details: banScopeLabel(scope),
      color: 'DarkRed',
      fields: [
        { name: 'Betroffenes Discord-Konto', value: discordId ? `<@${discordId}> (${discordId})` : 'Nicht verknüpft', inline: false },
        { name: 'Grund', value: reason.slice(0, 1024), inline: false },
        ...(evidence ? [{ name: 'Beweise', value: evidence.slice(0, 1024), inline: false }] : [])
      ],
      attachments
    });

    const storedAttachments = attachments.map((attachment) => ({ ...attachment, mirrorUrl: auditResult?.messageUrl || null }));
    const record = await addBan({
      discordId,
      mcName,
      scope,
      reason,
      evidence,
      attachments: storedAttachments,
      moderatorId: interaction.user.id,
      moderatorTag: interaction.user.tag
    });

    const embed = buildBanEmbed(record, { title: 'Sperre gesetzt', discordLabel });
    if (notes.length) embed.addFields({ name: 'Serveraktionen', value: notes.join('\n').slice(0, 1024), inline: false });
    if (!auditResult && attachments.length) {
      embed.addFields({ name: 'Hinweis', value: 'Es ist kein Audit-Kanal konfiguriert. Discord-Links zu Anhängen können deshalb später ablaufen.', inline: false });
    }

    return interaction.editReply({ embeds: [embed] });
  } catch (error) {
    return handleCommandError(interaction, error, 'Der Spieler konnte nicht gesperrt werden.');
  }
}

async function unbanPlayer(interaction) {
  if (!isModerator(interaction)) return moderatorOnly(interaction);

  const scopeOption = interaction.options.getString('bereich');
  const scope = scopeOption ? normalizeBanScope(scopeOption) : null;
  const reason = interaction.options.getString('grund');
  const target = await resolveBanTarget(interaction);
  if (target.error) return interaction.reply({ content: target.error, flags: 64 });

  await interaction.deferReply({ flags: 64 });

  const { mcName } = target;
  let { discordId } = target;
  const notes = [];

  // Nach einer Minecraft-Sperre ist die Zuordnung gelöscht, das Discord-Konto steht aber noch im Ban-Eintrag.
  if (!discordId && mcName) {
    const [record] = await getBanRecords({ mcName, includeLifted: true });
    discordId = record?.discordId || null;
  }

  try {
    if (mcName && (!scope || scopeIncludesMinecraft(scope))) {
      try {
        const response = await runRconCommand(`pardon ${mcName}`);
        notes.push(`Minecraft-Entbannung: ${response || 'keine Antwort'}`);
      } catch (rconError) {
        console.error('RCON-Pardon fehlgeschlagen:', rconError);
        notes.push('Der Minecraft-Server war nicht erreichbar. Die Entbannung muss auf dem Server nachgeholt werden.');
      }
    }

    if (discordId && (!scope || scopeIncludesDiscord(scope))) {
      notes.push(await liftDiscordBan(interaction, discordId, reason));
    }

    const lifted = await removeBan({
      discordId,
      mcName,
      scope: scope || undefined,
      moderatorId: interaction.user.id,
      moderatorTag: interaction.user.tag,
      reason
    });

    await logAuditEvent(interaction.client, {
      action: 'Sperre aufgehoben',
      interaction,
      minecraftName: mcName,
      details: scope ? banScopeLabel(scope) : 'Alle Bereiche',
      color: 'Green',
      fields: [
        { name: 'Betroffenes Discord-Konto', value: discordId ? `<@${discordId}> (${discordId})` : 'Nicht verknüpft', inline: false },
        { name: 'Grund der Aufhebung', value: (reason || 'Kein Grund angegeben').slice(0, 1024), inline: false },
        { name: 'Aufgehobene Einträge', value: String(lifted.length), inline: true }
      ]
    });

    const embed = new EmbedBuilder()
      .setTitle(lifted.length ? 'Sperre aufgehoben' : 'Keine aktive Sperre gefunden')
      .setColor(lifted.length ? 'Green' : 'Orange')
      .setDescription(lifted.length
        ? `Es wurden ${lifted.length} Eintrag/Einträge aufgehoben.`
        : 'Zu diesem Spieler war keine aktive Sperre gespeichert. Die Serverbefehle wurden trotzdem ausgeführt.')
      .addFields(
        { name: 'Minecraft', value: mcName || 'Nicht angegeben', inline: true },
        { name: 'Discord', value: discordId ? `<@${discordId}>` : 'Nicht verknüpft', inline: true },
        { name: 'Bereich', value: scope ? banScopeLabel(scope) : 'Alle Bereiche', inline: true },
        { name: 'Grund der Aufhebung', value: reason || 'Kein Grund angegeben', inline: false }
      );

    if (notes.length) embed.addFields({ name: 'Serveraktionen', value: notes.join('\n').slice(0, 1024), inline: false });

    return interaction.editReply({ embeds: [embed] });
  } catch (error) {
    return handleCommandError(interaction, error, 'Die Sperre konnte nicht aufgehoben werden.');
  }
}

async function listPlayers(interaction) {
  if (!isModerator(interaction)) return moderatorOnly(interaction);
  await interaction.deferReply({ flags: 64 });

  try {
    const mappings = await getAllMappings();
    const bans = await getBanLists();
    const allEntries = Object.entries(mappings).sort(([, left], [, right]) => left.localeCompare(right, 'de'));
    if (!allEntries.length) return interaction.editReply({ content: 'Es sind noch keine Zuordnungen gespeichert.' });

    const lines = await Promise.all(allEntries.map(async ([discordId, mcName], index) => {
      const userLabel = await fetchUserLabel(interaction.client, discordId);
      const banned = bans.discord.includes(discordId) || bans.mcNames.includes(mcName.toLowerCase());
      return `${index + 1}. **${userLabel}** -> **${mcName}**${banned ? ' (Gebannt)' : ''}`;
    }));

    // Lange Listen werden auf mehrere Embeds verteilt, damit kein Eintrag verloren geht.
    const blocks = chunkLines(lines);
    const page = selectPage(blocks, interaction.options.getInteger('seite') || 1);
    const embeds = page.blocks.map((block, index) => {
      const embed = new EmbedBuilder()
        .setDescription(block.join('\n'))
        .setColor('Blue');
      if (index === 0) embed.setTitle(`Whitelist-Zuordnungen (${allEntries.length} Einträge)`);
      return embed;
    });

    const lastEmbed = embeds[embeds.length - 1];
    lastEmbed.setFooter({
      text: page.totalPages > 1
        ? `Seite ${page.currentPage} von ${page.totalPages} – weitere Seiten mit /whitelist list seite:${Math.min(page.currentPage + 1, page.totalPages)}`
        : `Alle ${allEntries.length} Einträge werden angezeigt`
    });

    return interaction.editReply({ embeds });
  } catch (error) {
    return handleCommandError(interaction, error, 'Die Zuordnungen konnten nicht geladen werden.');
  }
}

async function showUser(interaction) {
  const discordUser = interaction.options.getUser('discord');
  const mcNameOption = interaction.options.getString('mcname');
  if ((discordUser || mcNameOption) && !isModerator(interaction)) return moderatorOnly(interaction);
  await interaction.deferReply({ flags: 64 });

  try {
    const mappingByName = mcNameOption ? await getDiscordByMcName(mcNameOption) : null;
    const discordId = discordUser?.id || mappingByName?.[0] || interaction.user.id;
    const mappedName = await getUserMapping(discordId);
    const resolvedName = mappedName || (mcNameOption && normalizeMinecraftName(mcNameOption));

    const records = await getBanRecords({ discordId, mcName: resolvedName, includeLifted: true });
    const activeRecords = records.filter((record) => record.active);

    if (!resolvedName && !records.length) return interaction.editReply({ content: 'Keine Zuordnung gefunden.' });

    const discordLabel = await fetchUserLabel(interaction.client, discordId);
    const embed = new EmbedBuilder()
      .setTitle('Benutzerinformation')
      .addFields(
        { name: 'Discord', value: `${discordLabel || discordId} (${discordId})`, inline: true },
        { name: 'Minecraft', value: resolvedName || 'Nicht verknüpft', inline: true },
        { name: 'Gebannt', value: activeRecords.length ? 'Ja' : 'Nein', inline: true }
      )
      .setColor(activeRecords.length ? 'Red' : 'Green');

    // Bei einer aktiven Sperre werden Grund, Zeitpunkt, Moderator und Beweise direkt mit angezeigt.
    if (activeRecords.length) {
      // Minecraft und Discord stehen schon oben, deshalb hier ohne die Identitätsfelder.
      embed.addFields(banRecordFields(activeRecords[0], { discordLabel, skipIdentity: true }));
      if (activeRecords.length > 1) {
        embed.setFooter({ text: `${activeRecords.length} aktive Sperren – alle Details mit /ban player` });
      }
    } else if (records.length) {
      embed.addFields({ name: 'Frühere Sperren', value: `${records.length} – Verlauf mit /ban verlauf anzeigen`, inline: false });
    }

    return interaction.editReply({ embeds: [embed] });
  } catch (error) {
    return handleCommandError(interaction, error, 'Die Benutzerinformationen konnten nicht geladen werden.');
  }
}

// Prüft, ob der Discord-Bann überhaupt versucht werden kann, und sagt sonst, was fehlt.
// So sieht die Moderation im Ergebnis, warum nur der Minecraft-Bann gesetzt wurde.
function discordBanBlocker(interaction) {
  if (!discordBanEnabled) return 'DISCORD_BAN_ENABLED steht nicht auf true. Der Bann ist nur gespeichert.';
  if (!interaction.guild) return 'Der Befehl wurde nicht auf einem Server ausgeführt.';
  const botMember = interaction.guild.members.me;
  if (!botMember) return 'Der Bot konnte sich selbst auf dem Server nicht finden.';
  if (!botMember.permissions.has(PermissionsBitField.Flags.BanMembers)) {
    return 'Dem Bot fehlt das Recht "Mitglieder bannen".';
  }
  return null;
}

// Discord meldet fehlende Rechte und eine zu tiefe Bot-Rolle beide als Code 50013.
function describeDiscordError(error, fallback) {
  if (error?.code === 50013) {
    return 'Discord hat die Aktion abgelehnt: Dem Bot fehlt das Recht "Mitglieder bannen" oder seine Rolle steht unter der Rolle des Mitglieds.';
  }
  if (error?.code === 10026) return 'Für dieses Konto war kein Discord-Server-Bann gesetzt.';
  return fallback;
}

async function applyDiscordBan(interaction, discordId, reason) {
  const blocker = discordBanBlocker(interaction);
  if (blocker) return `Discord-Server-Bann übersprungen: ${blocker}`;
  try {
    await interaction.guild.bans.create(discordId, { reason: sanitizeRconText(reason, 400) });
    return 'Discord-Server-Bann gesetzt.';
  } catch (error) {
    console.error('Discord-Bann fehlgeschlagen:', error);
    return describeDiscordError(error, 'Discord-Server-Bann fehlgeschlagen.');
  }
}

async function liftDiscordBan(interaction, discordId, reason) {
  const blocker = discordBanBlocker(interaction);
  if (blocker) return `Discord-Entbannung übersprungen: ${blocker}`;
  try {
    await interaction.guild.bans.remove(discordId, sanitizeRconText(reason || 'Entbannt über den Bot', 400));
    return 'Discord-Server-Bann aufgehoben.';
  } catch (error) {
    console.error('Discord-Entbannung fehlgeschlagen:', error);
    return describeDiscordError(error, 'Discord-Server-Bann konnte nicht aufgehoben werden (eventuell war keiner gesetzt).');
  }
}

async function removeWhitelistedRole(interaction, discordId) {
  if (!interaction.guild || !discordId) return;
  const role = interaction.guild.roles.cache.find((candidate) => candidate.name === 'Whitelisted');
  if (!role) return;
  try {
    const member = await interaction.guild.members.fetch(discordId);
    await member.roles.remove(role);
  } catch (error) {
    console.error('Fehler beim Entfernen der Whitelisted-Rolle:', error);
  }
}

function invalidName(interaction) {
  return interaction.reply({ content: 'Der Minecraft-Name ist ungültig.', flags: 64 });
}

async function handleCommandError(interaction, error, message) {
  console.error(message, error);
  return interaction.editReply({ embeds: [new EmbedBuilder().setTitle('Befehl fehlgeschlagen').setDescription(message).setColor('Red')] });
}
