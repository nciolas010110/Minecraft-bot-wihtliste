import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getAllMappings, getBanLists } from '../utils/storage.js';

export const data = new SlashCommandBuilder()
  .setName('list')
  .setDescription('Zeigt alle gespeicherten Discord- und Minecraft-Zuordnungen an');

export async function execute(interaction) {
  await interaction.deferReply({ flags: 64 });

  const mappings = await getAllMappings();
  const bans = await getBanLists();
  const entries = Object.entries(mappings);

  if (entries.length === 0) {
    return interaction.editReply({
      content: 'Es sind noch keine Discord- zu Minecraft-Zuordnungen gespeichert.',
      flags: 64
    });
  }

  const lines = await Promise.all(entries.map(async ([discordId, mcName]) => {
    const banned = bans.discord.includes(discordId) || bans.mcNames.includes(mcName.toLowerCase());
    let userTag = discordId;

    try {
      const user = await interaction.client.users.fetch(discordId);
      userTag = user.tag;
    } catch {
      // Falls der Discord-Benutzer nicht geladen werden kann, bleibt die ID sichtbar.
    }

    return `**${userTag}** → **${mcName}**${banned ? ' (Gebannt)' : ''}`;
  }));

  const description = lines.join('\n');
  const embed = new EmbedBuilder()
    .setTitle('Alle gespeicherten Zuordnungen')
    .setDescription(description)
    .setColor('Blue');

  return interaction.editReply({ embeds: [embed] });
}
