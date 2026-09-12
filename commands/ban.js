/*
  Nachschlage-Befehle rund um Sperren.
  - `/ban player` zeigt zu einem Spieler: wer, warum, wann, von wem, welche Beweise.
  - `/ban liste` zeigt alle aktiven Sperren.
  - `/ban verlauf` zeigt zusätzlich die bereits aufgehobenen Sperren.
  Gesperrt wird weiterhin mit `/whitelist ban`.
*/
import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getAllBanRecords, getBanRecords } from '../utils/storage.js';
import { banRecordLine } from '../utils/banView.js';
import { buildBanEmbed, fetchUserLabel, resolveBanTarget } from '../utils/banUi.js';
import { chunkLines, selectPage } from '../utils/pagination.js';
import { isModerator, moderatorOnly } from '../utils/permissions.js';

const MAX_DETAIL_EMBEDS = 5;

export const data = new SlashCommandBuilder()
  .setName('ban')
  .setDescription('Sperren nachschlagen: wer, warum, wann und mit welchen Beweisen')
  .addSubcommand((subcommand) => subcommand
    .setName('player')
    .setDescription('Alle Sperren eines Spielers mit Grund und Beweisen anzeigen')
    .addStringOption((option) => option.setName('mcname').setDescription('Minecraft-Name'))
    .addUserOption((option) => option.setName('discord').setDescription('Discord-Benutzer')))
  .addSubcommand((subcommand) => subcommand
    .setName('liste')
    .setDescription('Alle aktuell gesperrten Spieler anzeigen')
    .addIntegerOption((option) => option.setName('seite').setDescription('Seitenzahl bei langen Listen').setMinValue(1)))
  .addSubcommand((subcommand) => subcommand
    .setName('verlauf')
    .setDescription('Alle Sperren inklusive der bereits aufgehobenen anzeigen')
    .addIntegerOption((option) => option.setName('seite').setDescription('Seitenzahl bei langen Listen').setMinValue(1)));

export async function execute(interaction) {
  if (!isModerator(interaction)) return moderatorOnly(interaction);
  const subcommand = interaction.options.getSubcommand();
  if (subcommand === 'player') return showPlayer(interaction);
  return showList(interaction, { includeLifted: subcommand === 'verlauf' });
}

async function showPlayer(interaction) {
  const target = await resolveBanTarget(interaction);
  if (target.error) return interaction.reply({ content: target.error, flags: 64 });

  await interaction.deferReply({ flags: 64 });

  const { mcName, discordId } = target;
  const records = await getBanRecords({ mcName, discordId, includeLifted: true });
  const discordLabel = await fetchUserLabel(interaction.client, discordId);

  if (!records.length) {
    return interaction.editReply({ embeds: [new EmbedBuilder()
      .setTitle('Keine Sperre gefunden')
      .setColor('Green')
      .setDescription('Zu diesem Spieler ist keine Sperre gespeichert.')
      .addFields(
        { name: 'Minecraft', value: mcName || 'Nicht angegeben', inline: true },
        { name: 'Discord', value: discordId ? `<@${discordId}>` : 'Nicht verknüpft', inline: true }
      )] });
  }

  const shown = records.slice(0, MAX_DETAIL_EMBEDS);
  const embeds = shown.map((record, index) => buildBanEmbed(record, {
    title: `${record.active ? 'Aktive Sperre' : 'Aufgehobene Sperre'} ${index + 1} von ${records.length}`,
    discordLabel
  }));

  if (records.length > shown.length) {
    embeds[embeds.length - 1].setFooter({ text: `${records.length - shown.length} weitere Einträge sind gespeichert.` });
  }

  return interaction.editReply({ embeds });
}

async function showList(interaction, { includeLifted }) {
  await interaction.deferReply({ flags: 64 });

  try {
    const records = await getAllBanRecords({ includeLifted });
    if (!records.length) {
      return interaction.editReply({ content: includeLifted ? 'Es sind keine Sperren gespeichert.' : 'Aktuell ist niemand gesperrt.' });
    }

    const lines = await Promise.all(records.map(async (record, index) => {
      const discordLabel = await fetchUserLabel(interaction.client, record.discordId);
      return `${index + 1}. ${banRecordLine(record, { discordLabel })}`;
    }));

    const blocks = chunkLines(lines);
    const page = selectPage(blocks, interaction.options.getInteger('seite') || 1);
    const title = includeLifted ? `Ban-Verlauf (${records.length} Einträge)` : `Aktive Sperren (${records.length})`;
    const embeds = page.blocks.map((block, index) => {
      const embed = new EmbedBuilder().setDescription(block.join('\n')).setColor(includeLifted ? 'Grey' : 'DarkRed');
      if (index === 0) embed.setTitle(title);
      return embed;
    });

    const subcommand = interaction.options.getSubcommand();
    embeds[embeds.length - 1].setFooter({
      text: page.totalPages > 1
        ? `Seite ${page.currentPage} von ${page.totalPages} – weiter mit /ban ${subcommand} seite:${Math.min(page.currentPage + 1, page.totalPages)}`
        : 'Details zu einem Eintrag mit /ban player'
    });

    return interaction.editReply({ embeds });
  } catch (error) {
    console.error('Ban-Liste konnte nicht geladen werden:', error);
    return interaction.editReply({ content: 'Die Sperrliste konnte nicht geladen werden.' });
  }
}
