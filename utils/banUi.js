/*
  Gemeinsame Ban-Bausteine für die Slash-Commands.
  - Liest Beweis-Anhänge (Bilder/Videos) aus einer Interaktion.
  - Löst das Ziel eines Bans auf (Minecraft-Name und/oder Discord-Konto).
  - Baut das Embed mit allen Feldern: wer, warum, wann, von wem, Beweise.
*/
import { EmbedBuilder } from 'discord.js';
import { banRecordFields, firstImageUrl } from './banView.js';
import { normalizeMinecraftName } from './minecraft.js';
import { getDiscordByMcName, getUserMapping } from './storage.js';

export const EVIDENCE_OPTION_NAMES = ['beweis1', 'beweis2', 'beweis3'];

// Sammelt alle angehängten Beweisdateien einer Interaktion.
export function collectEvidenceAttachments(interaction) {
  return EVIDENCE_OPTION_NAMES
    .map((optionName) => interaction.options.getAttachment(optionName))
    .filter(Boolean)
    .map((attachment) => ({
      name: attachment.name,
      url: attachment.url,
      contentType: attachment.contentType || null,
      size: attachment.size || null,
      mirrorUrl: null
    }));
}

// Ermittelt Minecraft-Name und Discord-ID aus den Optionen und den gespeicherten Zuordnungen.
export async function resolveBanTarget(interaction) {
  const rawName = interaction.options.getString('mcname');
  const discordUser = interaction.options.getUser('discord');

  if (!rawName && !discordUser) {
    return { error: 'Bitte gib mindestens einen Minecraft-Namen oder einen Discord-Benutzer an.' };
  }

  let mcName = null;
  if (rawName) {
    mcName = normalizeMinecraftName(rawName);
    if (!mcName) {
      return { error: 'Der Minecraft-Name muss 3 bis 16 Zeichen lang sein und darf nur Buchstaben, Zahlen und Unterstriche enthalten.' };
    }
  }

  let discordId = discordUser?.id || null;

  if (!mcName && discordId) {
    mcName = await getUserMapping(discordId);
  }

  if (!discordId && mcName) {
    const mapping = await getDiscordByMcName(mcName);
    discordId = mapping?.[0] || null;
  }

  return { mcName: mcName || null, discordId: discordId || null };
}

// Holt einen lesbaren Discord-Namen, fällt bei Fehlern auf die ID zurück.
export async function fetchUserLabel(client, discordId) {
  if (!discordId) return null;
  try {
    const user = await client.users.fetch(discordId);
    return user.tag;
  } catch {
    return discordId;
  }
}

// Baut ein Embed mit allen Ban-Informationen inklusive Beweisbild.
export function buildBanEmbed(record, { title, discordLabel = null, color = null, footer = null } = {}) {
  const embed = new EmbedBuilder()
    .setTitle(title || (record.active ? 'Sperre aktiv' : 'Sperre aufgehoben'))
    .setColor(color || (record.active ? 'DarkRed' : 'Green'))
    .addFields(banRecordFields(record, { discordLabel }));

  const image = firstImageUrl(record);
  if (image) embed.setImage(image);
  if (footer) embed.setFooter({ text: footer });

  return embed;
}
