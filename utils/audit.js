import { EmbedBuilder } from 'discord.js';

const auditChannelId = process.env.AUDIT_LOG_CHANNEL_ID;

export async function logAuditEvent(client, { action, interaction, minecraftName, details }) {
  if (!auditChannelId) return;

  try {
    const channel = await client.channels.fetch(auditChannelId);
    if (!channel?.isTextBased()) return;

    const embed = new EmbedBuilder()
      .setTitle(`Audit-Log: ${action}`)
      .setColor('Blue')
      .addFields(
        { name: 'Discord', value: `${interaction.user.tag} (${interaction.user.id})`, inline: false },
        { name: 'Minecraft', value: minecraftName || 'Nicht angegeben', inline: true },
        { name: 'Details', value: details || 'Keine weiteren Details', inline: true }
      )
      .setTimestamp();

    await channel.send({ embeds: [embed] });
  } catch (error) {
    console.error('Audit-Log konnte nicht gesendet werden:', error);
  }
}