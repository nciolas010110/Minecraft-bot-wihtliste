/*
  Ban-Hilfsmodul
  - Definiert die Ban-Bereiche (nur Minecraft, nur Discord, beide).
  - Erstellt und vergleicht Ban-Datensätze.
  - Enthält nur reine Funktionen, damit sie testbar bleiben.
*/
import crypto from 'crypto';

export const BAN_SCOPES = {
  MINECRAFT: 'minecraft',
  DISCORD: 'discord',
  BOTH: 'beide'
};

const SCOPE_LABELS = {
  [BAN_SCOPES.MINECRAFT]: 'Nur Minecraft',
  [BAN_SCOPES.DISCORD]: 'Nur Discord',
  [BAN_SCOPES.BOTH]: 'Minecraft und Discord'
};

const SCOPE_ALIASES = {
  minecraft: BAN_SCOPES.MINECRAFT,
  mc: BAN_SCOPES.MINECRAFT,
  discord: BAN_SCOPES.DISCORD,
  dc: BAN_SCOPES.DISCORD,
  beide: BAN_SCOPES.BOTH,
  both: BAN_SCOPES.BOTH,
  alle: BAN_SCOPES.BOTH
};

// Wandelt eine Benutzereingabe in einen gültigen Bereich um, Standard ist "beide".
export function normalizeBanScope(value, fallback = BAN_SCOPES.BOTH) {
  if (typeof value !== 'string') return fallback;
  return SCOPE_ALIASES[value.trim().toLowerCase()] || fallback;
}

export function banScopeLabel(scope) {
  return SCOPE_LABELS[normalizeBanScope(scope)] || SCOPE_LABELS[BAN_SCOPES.BOTH];
}

export function scopeIncludesMinecraft(scope) {
  const normalized = normalizeBanScope(scope);
  return normalized === BAN_SCOPES.MINECRAFT || normalized === BAN_SCOPES.BOTH;
}

export function scopeIncludesDiscord(scope) {
  const normalized = normalizeBanScope(scope);
  return normalized === BAN_SCOPES.DISCORD || normalized === BAN_SCOPES.BOTH;
}

// Baut einen vollständigen Ban-Datensatz mit Zeitstempel und ID.
export function createBanRecord({
  mcName = null,
  discordId = null,
  scope,
  reason = null,
  evidence = null,
  attachments = [],
  moderatorId = null,
  moderatorTag = null,
  createdAt = new Date().toISOString(),
  id = crypto.randomUUID()
} = {}) {
  return {
    id,
    mcName: mcName || null,
    discordId: discordId || null,
    scope: normalizeBanScope(scope),
    reason: reason || null,
    evidence: evidence || null,
    attachments: Array.isArray(attachments) ? attachments : [],
    moderatorId: moderatorId || null,
    moderatorTag: moderatorTag || null,
    createdAt,
    active: true,
    liftedAt: null,
    liftedBy: null,
    liftedByTag: null,
    liftReason: null
  };
}

// Prüft, ob ein Datensatz zum gesuchten Spieler gehört (Discord-ID oder Minecraft-Name).
export function banMatchesTarget(record, { discordId = null, mcName = null } = {}) {
  if (!record) return false;
  if (discordId && record.discordId && record.discordId === discordId) return true;
  if (mcName && record.mcName && record.mcName.toLowerCase() === mcName.toLowerCase()) return true;
  return false;
}

// Markiert einen Datensatz als aufgehoben.
export function liftBanRecord(record, { moderatorId = null, moderatorTag = null, reason = null, liftedAt = new Date().toISOString() } = {}) {
  record.active = false;
  record.liftedAt = liftedAt;
  record.liftedBy = moderatorId || null;
  record.liftedByTag = moderatorTag || null;
  record.liftReason = reason || null;
  return record;
}
