import { SlashCommandBuilder, EmbedBuilder, PermissionsBitField } from 'discord.js';
import { runRconCommand } from '../utils/rcon.js';
import { getUserMapping, getDiscordByMcName, addBan, removeUserMappingByMcName, removeUserMappingByDiscord } from '../utils/storage.js';

export const data = new SlashCommandBuilder()
  .setName('whitelistban')
  .setDescription('Bannt einen Discord-Benutzer oder einen Minecraft-Namen und entfernt ihn von der Whitelist')
  .addUserOption((option) =>
    option.setName('discord').setDescription('Discord-Benutzer zum Sperren').setRequired(false)
  )
  .addStringOption((option) =>
    option.setName('mcname').setDescription('Minecraft-Name zum Sperren').setRequired(false)
  );

export async function execute(interaction) {
  if (!interaction.memberPermissions.has(PermissionsBitField.Flags.Administrator)) {
    return interaction.reply({ content: 'Nur Administratoren dürfen diesen Befehl verwenden.', flags: 64 });
  }

  const discordUser = interaction.options.getUser('discord');
  const mcNameOption = interaction.options.getString('mcname');

  if (!discordUser && !mcNameOption) {
    return interaction.reply({ content: 'Bitte gib entweder einen Discord-Benutzer oder einen Minecraft-Namen an.', flags: 64 });
  }

  await interaction.deferReply({ flags: 64 });

  let mcName = mcNameOption || null;
  let targetDiscordId = discordUser?.id || null;
  let targetDiscordTag = discordUser?.tag || null;

  if (targetDiscordId && !mcName) {
    const mapped = await getUserMapping(targetDiscordId);
    if (!mapped) {
      return interaction.editReply({ content: 'Dieser Discord-Benutzer ist keinem Minecraft-Namen zugeordnet.', flags: 64 });
    }
    mcName = mapped;
  }

  if (!mcName && targetDiscordId) {
    return interaction.editReply({ content: 'Konnte keinen Minecraft-Namen für den angegebenen Discord-Benutzer finden.', flags: 64 });
  }

  if (!mcName && mcNameOption) {
    mcName = mcNameOption;
  }

  if (!mcName) {
    return interaction.editReply({ content: 'Ein interner Fehler ist aufgetreten. Bitte versuche es später erneut.', flags: 64 });
  }

  try {
    const removeResponse = await runRconCommand(`whitelist remove ${mcName}`);
    const banResponse = await runRconCommand(`ban ${mcName}`);

    if (targetDiscordId) {
      await addBan({ discordId: targetDiscordId, mcName });
      await removeUserMappingByDiscord(targetDiscordId);
    } else {
      await addBan({ mcName });
      await removeUserMappingByMcName(mcName);
    }

    const embed = new EmbedBuilder()
      .setTitle('Blacklist / Ban erfolgreich')
      .setDescription(`Der Minecraft-Name **${mcName}** wurde gebannt und von der Whitelist entfernt.`)
      .addFields(
        { name: 'Whitelist-Antwort', value: removeResponse || 'Keine Antwort erhalten', inline: false },
        { name: 'Ban-Antwort', value: banResponse || 'Keine Antwort erhalten', inline: false }
      )
      .setColor('DarkRed');

    if (targetDiscordTag) {
      embed.addFields({ name: 'Discord-Benutzer', value: targetDiscordTag, inline: false });
    }

    return interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error('Fehler beim Bannen:', error);
    return interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setTitle('Fehler beim Bannen')
          .setDescription('Der Minecraft-Name konnte nicht gebannt werden. Bitte überprüfe die RCON-Einstellungen.')
          .setColor('Red')
      ]
    });
  }
}
