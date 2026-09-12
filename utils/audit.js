/*
  Audit-Log
  - Schreibt jede Whitelist- und Ban-Aktion in einen Discord-Kanal.
  - Spiegelt Beweis-Anhänge (Bilder/Videos) in den Kanal, damit sie dauerhaft auffindbar bleiben.
  - Gibt den Nachrichten-Link zurück, damit er beim Ban gespeichert werden kann.
*/
import { EmbedBuilder } from 'discord.js';

const auditChannelId = process.env.AUDIT_LOG_CHANNEL_ID;

export async function logAuditEvent(client, { action, interaction, minecraftName, details, fields = [], color = 'Blue', attachments = [] }) {
  if (!auditChannelId) return null;

  try {
    const channel = await client.channels.fetch(auditChannelId);
    if (!channel?.isTextBased()) return null;

    const embed = new EmbedBuilder()
      .setTitle(`Audit-Log: ${action}`)
      .setColor(color)
      .addFields(
        { name: 'Discord', value: `${interaction.user.tag} (${interaction.user.id})`, inline: false },
        { name: 'Minecraft', value: minecraftName || 'Nicht angegeben', inline: true },
        { name: 'Details', value: details || 'Keine weiteren Details', inline: true },
        ...fields
      )
      .setTimestamp();

    const files = attachments
      .filter((attachment) => attachment?.url)
      .map((attachment) => ({ attachment: attachment.url, name: attachment.name || 'beweis' }));

    let message;
    try {
      message = await channel.send({ embeds: [embed], files });
    } catch (uploadError) {
      // Wenn der Upload scheitert (zu gross, Link abgelaufen), wenigstens den Eintrag ohne Dateien sichern.
      console.error('Beweis-Anhänge konnten nicht in den Audit-Kanal kopiert werden:', uploadError);
      message = await channel.send({ embeds: [embed] });
    }

    return { messageUrl: message.url, messageId: message.id };
  } catch (error) {
    console.error('Audit-Log konnte nicht gesendet werden:', error);
    return null;
  }
}
