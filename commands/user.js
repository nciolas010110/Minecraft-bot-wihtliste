import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getUserMapping, getDiscordByMcName, getBanLists } from '../utils/storage.js';

export const data = new SlashCommandBuilder()
  .setName('user')
  .setDescription('Zeigt die Zuordnung zwischen Discord-Benutzer und Minecraft-Name an')
  .addUserOption((option) =>
    option.setName('discord').setDescription('Discord-Benutzer zur Abfrage').setRequired(false)
  )
  .addStringOption((option) =>
    option.setName('mcname').setDescription('Minecraft-Name zur Abfrage').setRequired(false)
  );

export async function execute(interaction) {
  const discordUser = interaction.options.getUser('discord');
  const mcNameOption = interaction.options.getString('mcname');

  await interaction.deferReply({ flags: 64 });

  if (!discordUser && !mcNameOption) {
    const ownMapping = await getUserMapping(interaction.user.id);
    if (!ownMapping) {
      return interaction.editReply({ content: 'Für dich ist kein Minecraft-Name gespeichert.', flags: 64 });
    }
    const bans = await getBanLists();
    const isBanned = bans.mcNames.includes(ownMapping.toLowerCase()) || bans.discord.includes(interaction.user.id);
    return interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setTitle('Deine Zuordnung')
          .addFields(
            { name: 'Discord-Benutzer', value: interaction.user.tag, inline: true },
            { name: 'Minecraft-Name', value: ownMapping, inline: true },
            { name: 'Gebannt', value: isBanned ? 'Ja' : 'Nein', inline: true }
          )
          .setColor(isBanned ? 'Red' : 'Green')
      ]
    });
  }

  if (discordUser) {
    const mapping = await getUserMapping(discordUser.id);
    if (!mapping) {
      return interaction.editReply({ content: 'Für diesen Discord-Benutzer ist kein Minecraft-Name gespeichert.', flags: 64 });
    }
    const bans = await getBanLists();
    const isBanned = bans.mcNames.includes(mapping.toLowerCase()) || bans.discord.includes(discordUser.id);
    return interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setTitle('Benutzerinformation')
          .addFields(
            { name: 'Discord-Benutzer', value: discordUser.tag, inline: true },
            { name: 'Minecraft-Name', value: mapping, inline: true },
            { name: 'Gebannt', value: isBanned ? 'Ja' : 'Nein', inline: true }
          )
          .setColor(isBanned ? 'Red' : 'Green')
      ]
    });
  }

  if (mcNameOption) {
    const result = await getDiscordByMcName(mcNameOption);
    if (!result) {
      return interaction.editReply({ content: 'Für diesen Minecraft-Namen ist kein Discord-Benutzer gespeichert.', flags: 64 });
    }
    const [discordId, mappedName] = result;
    const bans = await getBanLists();
    const isBanned = bans.mcNames.includes(mappedName.toLowerCase()) || bans.discord.includes(discordId);
    return interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setTitle('Minecraft-Namen-Information')
          .addFields(
            { name: 'Minecraft-Name', value: mappedName, inline: true },
            { name: 'Discord-ID', value: discordId, inline: true },
            { name: 'Gebannt', value: isBanned ? 'Ja' : 'Nein', inline: true }
          )
          .setColor(isBanned ? 'Red' : 'Green')
      ]
    });
  }
}
