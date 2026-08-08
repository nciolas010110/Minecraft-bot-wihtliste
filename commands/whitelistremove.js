/*
  /whitelistremove
  - Entfernt einen Minecraft-Spieler von der Whitelist.
  - Löscht die zugehörige Discord/Minecraft-Zuordnung.
  - Nur Administratoren dürfen diesen Befehl ausführen.
*/
import { SlashCommandBuilder, EmbedBuilder, PermissionsBitField } from 'discord.js';
import { runRconCommand } from '../utils/rcon.js';
import { removeUserMappingByMcName } from '../utils/storage.js';

export const data = new SlashCommandBuilder()
  .setName('whitelistremove')
  .setDescription('Entfernt einen Minecraft-Spieler von der Whitelist')
  .addStringOption((option) =>
    option.setName('mcname').setDescription('Minecraft-Name zum Entfernen').setRequired(true)
  );

export async function execute(interaction) {
  if (!interaction.memberPermissions.has(PermissionsBitField.Flags.Administrator)) {
    return interaction.reply({ content: 'Nur Administratoren dürfen diesen Befehl verwenden.', flags: 64 });
  }

  const mcName = interaction.options.getString('mcname', true).trim();
  await interaction.deferReply({ flags: 64 });

  try {
    const response = await runRconCommand(`whitelist remove ${mcName}`);
    await removeUserMappingByMcName(mcName);

    return interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setTitle('Whitelist entfernt')
          .setDescription(`Der Spieler **${mcName}** wurde von der Whitelist entfernt.`)
          .addFields({ name: 'Serverantwort', value: response || 'Keine Antwort erhalten', inline: false })
          .setColor('Green')
      ]
    });
  } catch (error) {
    console.error('Fehler beim Entfernen von der Whitelist:', error);
    return interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setTitle('Fehler beim Entfernen')
          .setDescription('Die Whitelist konnte nicht aktualisiert werden. Bitte überprüfe die RCON-Verbindung.')
          .setColor('Red')
      ]
    });
  }
}
