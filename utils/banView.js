/*
  Darstellung von Ban-Datensätzen.
  - Baut die Embed-Felder für "wer, warum, wann, von wem, Beweise".
  - Enthält reine Funktionen, damit die Ausgabe getestet werden kann.
*/
import { banScopeLabel } from './bans.js';

const MAX_FIELD_LENGTH = 1024;

// Discord-Zeitstempel: absolute Zeit plus relative Angabe ("vor 3 Tagen").
export function formatTimestamp(isoDate) {
  if (!isoDate) return 'Unbekannt';
  const time = Date.parse(isoDate);
  if (Number.isNaN(time)) return 'Unbekannt';
  const seconds = Math.floor(time / 1000);
  return `<t:${seconds}:f> (<t:${seconds}:R>)`;
}

function truncate(value, limit = MAX_FIELD_LENGTH) {
  const text = String(value);
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}

export function isImageAttachment(attachment) {
  return typeof attachment?.contentType === 'string' && attachment.contentType.startsWith('image/');
}

export function isVideoAttachment(attachment) {
  return typeof attachment?.contentType === 'string' && attachment.contentType.startsWith('video/');
}

function attachmentIcon(attachment) {
  if (isImageAttachment(attachment)) return 'Bild';
  if (isVideoAttachment(attachment)) return 'Video';
  return 'Datei';
}

// Beweis-Anhänge als anklickbare Liste. Bevorzugt den dauerhaften Link aus dem Audit-Kanal.
export function formatAttachments(attachments = []) {
  if (!attachments.length) return null;
  return attachments
    .map((attachment, index) => {
      const label = `${attachmentIcon(attachment)} ${index + 1}${attachment.name ? `: ${attachment.name}` : ''}`;
      const link = attachment.mirrorUrl || attachment.url;
      return link ? `[${label}](${link})` : label;
    })
    .join('\n');
}

export function banStatusLabel(record) {
  return record.active ? 'Aktiv' : 'Aufgehoben';
}

// Alle Felder eines Bans für ein Embed: Bereich, Grund, Beweise, Moderator, Zeitpunkt.
export function banRecordFields(record, { discordLabel = null, skipIdentity = false } = {}) {
  const fields = [
    { name: 'Status', value: banStatusLabel(record), inline: true },
    { name: 'Bereich', value: banScopeLabel(record.scope), inline: true },
    { name: 'Minecraft', value: record.mcName || 'Nicht angegeben', inline: true },
    {
      name: 'Discord',
      value: record.discordId ? `${discordLabel ? `${discordLabel}\n` : ''}<@${record.discordId}> (${record.discordId})` : 'Nicht verknüpft',
      inline: true
    },
    { name: 'Gebannt am', value: formatTimestamp(record.createdAt), inline: true },
    {
      name: 'Gebannt von',
      value: record.moderatorId ? `${record.moderatorTag || 'Unbekannt'} (<@${record.moderatorId}>)` : record.moderatorTag || 'Unbekannt',
      inline: true
    },
    { name: 'Grund', value: truncate(record.reason || 'Kein Grund angegeben'), inline: false }
  ];

  if (record.evidence) {
    fields.push({ name: 'Beweise', value: truncate(record.evidence), inline: false });
  }

  const attachmentList = formatAttachments(record.attachments);
  if (attachmentList) {
    fields.push({ name: 'Beweis-Anhänge', value: truncate(attachmentList), inline: false });
  }

  if (!record.active) {
    fields.push(
      { name: 'Aufgehoben am', value: formatTimestamp(record.liftedAt), inline: true },
      {
        name: 'Aufgehoben von',
        value: record.liftedBy ? `${record.liftedByTag || 'Unbekannt'} (<@${record.liftedBy}>)` : record.liftedByTag || 'Unbekannt',
        inline: true
      },
      { name: 'Grund der Aufhebung', value: truncate(record.liftReason || 'Kein Grund angegeben'), inline: false }
    );
  }

  // Für die Benutzerinfo werden Name und Konto schon oben angezeigt und hier weggelassen.
  return skipIdentity ? fields.filter((field) => field.name !== 'Minecraft' && field.name !== 'Discord') : fields;
}

// Kompakte Zeile für Listenansichten.
export function banRecordLine(record, { discordLabel = null } = {}) {
  const target = record.mcName || discordLabel || (record.discordId ? `Discord ${record.discordId}` : 'Unbekannt');
  const owner = record.discordId ? ` (${discordLabel || `<@${record.discordId}>`})` : '';
  const reason = record.reason ? ` – ${record.reason.replace(/\s+/g, ' ').slice(0, 80)}` : '';
  const evidenceCount = (record.attachments || []).length;
  const evidence = evidenceCount ? ` [${evidenceCount} Anhang/Anhänge]` : '';
  const status = record.active ? '' : ' (aufgehoben)';
  return `**${target}**${owner} · ${banScopeLabel(record.scope)}${status}${reason}${evidence}`;
}

// Erstes Bild eines Bans, damit es direkt im Embed angezeigt werden kann.
export function firstImageUrl(record) {
  const image = (record.attachments || []).find((attachment) => isImageAttachment(attachment));
  return image ? image.mirrorUrl || image.url : null;
}
