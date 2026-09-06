import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { checkMinecraftUser } from '../utils/mojang.js';
import { runRconCommand } from '../utils/rcon.js';
import {
  addBan,
  getAllMappings,
  getBanLists,
  getDiscordByMcName,
  getUserMapping,
  isBanned,
  removeBan,
  removeUserMappingByMcName,
  setUserMapping
} from '../utils/storage.js';
import { normalizeMinecraftName } from '../utils/minecraft.js';
import { isModerator, moderatorOnly } from '../utils/permissions.js';
import { logAuditEvent } from '../utils/audit.js';

const cooldowns = new Map();
const COOLDOWN_SECONDS = 30;
const MAX_LIST_ENTRIES = 25;

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
  .addSubcommand((subcommand) => subcommand
    .setName('ban')
    .setDescription('Einen Spieler bannen und entfernen')
    .addStringOption((option) => option.setName('mcname').setDescription('Minecraft-Name').setRequired(true)))
  .addSubcommand((subcommand) => subcommand
    .setName('unban')
    .setDescription('Einen Spieler entbannen')
    .addStringOption((option) => option.setName('mcname').setDescription('Minecraft-Name').setRequired(true)))
  .addSubcommand((subcommand) => subcommand
    .setName('list')
    .setDescription('Alle gespeicherten Zuordnungen anzeigen'))
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
      ephemeral: true
    });
  }

  const mcName = getMinecraftName(interaction);
  if (!mcName) {
    return interaction.reply({ content: 'Der Minecraft-Name muss 3 bis 16 Zeichen lang sein und darf nur Buchstaben, Zahlen und Unterstriche enthalten.', ephemeral: true });
  }

  await interaction.deferReply({ flags: 64 });

  try {
    if (await isBanned({ discordId: userId, mcName })) {
      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setTitle('Zugriff verweigert')
            .setDescription('Du bist gesperrt oder dieser Minecraft-Name ist gebannt.')
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
  const mcName = getMinecraftName(interaction);
  if (!mcName) return invalidName(interaction);
  await interaction.deferReply({ flags: 64 });

  try {
    const mapping = await getDiscordByMcName(mcName);
    const removeResponse = await runRconCommand(`whitelist remove ${mcName}`);
    const banResponse = await runRconCommand(`ban ${mcName}`);
    await addBan({ discordId: mapping?.[0], mcName });
    await removeUserMappingByMcName(mcName);
    await removeWhitelistedRole(interaction, mapping?.[0]);
    await logAuditEvent(interaction.client, { action: 'Spieler gebannt', interaction, minecraftName: mcName, details: 'Spieler gebannt und entfernt' });
    return interaction.editReply({ embeds: [new EmbedBuilder()
      .setTitle('Ban erfolgreich')
      .setDescription(`**${mcName}** wurde gebannt und von der Whitelist entfernt.`)
      .addFields(
        { name: 'Whitelist-Antwort', value: removeResponse || 'Keine Antwort erhalten' },
        { name: 'Ban-Antwort', value: banResponse || 'Keine Antwort erhalten' }
      )
      .setColor('DarkRed')] });
  } catch (error) {
    return handleCommandError(interaction, error, 'Der Spieler konnte nicht gebannt werden.');
  }
}

async function unbanPlayer(interaction) {
  if (!isModerator(interaction)) return moderatorOnly(interaction);
  const mcName = getMinecraftName(interaction);
  if (!mcName) return invalidName(interaction);
  await interaction.deferReply({ flags: 64 });

  try {
    const response = await runRconCommand(`pardon ${mcName}`);
    await removeBan({ mcName });
    await logAuditEvent(interaction.client, { action: 'Spieler entbannt', interaction, minecraftName: mcName, details: 'Spieler entbannt' });
    return interaction.editReply({ embeds: [new EmbedBuilder()
      .setTitle('Unban erfolgreich')
      .setDescription(`**${mcName}** wurde entbannt.`)
      .addFields({ name: 'Serverantwort', value: response || 'Keine Antwort erhalten' })
      .setColor('Green')] });
  } catch (error) {
    return handleCommandError(interaction, error, 'Der Spieler konnte nicht entbannt werden.');
  }
}

async function listPlayers(interaction) {
  if (!isModerator(interaction)) return moderatorOnly(interaction);
  await interaction.deferReply({ flags: 64 });

  try {
    const mappings = await getAllMappings();
    const bans = await getBanLists();
    const allEntries = Object.entries(mappings);
    const entries = allEntries.slice(0, MAX_LIST_ENTRIES);
    if (!entries.length) return interaction.editReply({ content: 'Es sind noch keine Zuordnungen gespeichert.' });

    const lines = await Promise.all(entries.map(async ([discordId, mcName]) => {
      let userLabel = discordId;
      try {
        const user = await interaction.client.users.fetch(discordId);
        userLabel = user.tag;
      } catch {
        // Die Discord-ID bleibt als Fallback sichtbar.
      }
      const banned = bans.discord.includes(discordId) || bans.mcNames.includes(mcName.toLowerCase());
      return `**${userLabel}** -> **${mcName}**${banned ? ' (Gebannt)' : ''}`;
    }));

    const suffix = allEntries.length > MAX_LIST_ENTRIES
      ? `\n\nWeitere Einträge: ${allEntries.length - MAX_LIST_ENTRIES}`
      : '';
    return interaction.editReply({ embeds: [new EmbedBuilder()
      .setTitle('Whitelist-Zuordnungen')
      .setDescription(`${lines.join('\n')}${suffix}`)
      .setColor('Blue')] });
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
    if (!resolvedName) return interaction.editReply({ content: 'Keine Zuordnung gefunden.' });

    const bans = await getBanLists();
    const banned = bans.discord.includes(discordId) || bans.mcNames.includes(resolvedName.toLowerCase());
    return interaction.editReply({ embeds: [new EmbedBuilder()
      .setTitle('Benutzerinformation')
      .addFields(
        { name: 'Discord', value: discordId || 'Nicht verknüpft', inline: true },
        { name: 'Minecraft', value: resolvedName, inline: true },
        { name: 'Gebannt', value: banned ? 'Ja' : 'Nein', inline: true }
      )
      .setColor(banned ? 'Red' : 'Green')] });
  } catch (error) {
    return handleCommandError(interaction, error, 'Die Benutzerinformationen konnten nicht geladen werden.');
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
  return interaction.reply({ content: 'Der Minecraft-Name ist ungültig.', ephemeral: true });
}

async function handleCommandError(interaction, error, message) {
  console.error(message, error);
  return interaction.editReply({ embeds: [new EmbedBuilder().setTitle('Befehl fehlgeschlagen').setDescription(message).setColor('Red')] });
}
