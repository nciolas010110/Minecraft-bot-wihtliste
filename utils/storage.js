/*
  Speicher-Wrapper für persistente Daten in `data/storage.json`.
  - `userMappings`: Discord-ID → Minecraft-Name
  - `bans.entries`: vollständige Ban-Datensätze (Bereich, Grund, Beweise, Moderator, Zeitpunkt)
  - Alte Bannlisten (`bans.discord`, `bans.mcNames`) werden beim Laden automatisch migriert.
*/
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import {
  BAN_SCOPES,
  banMatchesTarget,
  createBanRecord,
  liftBanRecord,
  normalizeBanScope,
  scopeIncludesDiscord,
  scopeIncludesMinecraft
} from './bans.js';

const storagePath = path.join(process.cwd(), 'data', 'storage.json');
const backupPath = `${storagePath}.bak`;
const defaultStorage = {
  userMappings: {},
  bans: {
    entries: []
  }
};

let writeQueue = Promise.resolve();

// Wandelt einen Alt-Eintrag (nur Discord-ID oder nur Name) in einen vollständigen Datensatz um.
function migrateLegacyBan({ discordId = null, mcName = null, scope }) {
  const hash = crypto.createHash('sha1').update(`${scope}:${discordId || ''}:${mcName || ''}`).digest('hex').slice(0, 12);
  return {
    ...createBanRecord({
      discordId,
      mcName,
      scope,
      reason: 'Kein Grund gespeichert (Eintrag aus der alten Bannliste)',
      createdAt: null
    }),
    id: `legacy-${hash}`
  };
}

function normalizeBanEntries(bans) {
  const entries = Array.isArray(bans?.entries)
    ? bans.entries.filter((entry) => entry && typeof entry === 'object').map((entry) => ({
      ...entry,
      scope: normalizeBanScope(entry.scope),
      mcName: entry.mcName || null,
      discordId: entry.discordId || null,
      attachments: Array.isArray(entry.attachments) ? entry.attachments : [],
      active: entry.active !== false
    }))
    : [];

  // Migration: früher wurden nur flache Listen ohne Grund und Zeitpunkt gespeichert.
  const legacyDiscord = Array.isArray(bans?.discord) ? bans.discord : [];
  const legacyNames = Array.isArray(bans?.mcNames) ? bans.mcNames : [];

  for (const mcName of legacyNames) {
    if (entries.some((entry) => entry.mcName && entry.mcName.toLowerCase() === String(mcName).toLowerCase())) continue;
    entries.push(migrateLegacyBan({ mcName: String(mcName), scope: BAN_SCOPES.MINECRAFT }));
  }

  for (const discordId of legacyDiscord) {
    if (entries.some((entry) => entry.discordId === discordId)) continue;
    entries.push(migrateLegacyBan({ discordId: String(discordId), scope: BAN_SCOPES.DISCORD }));
  }

  return entries;
}

function normalizeStorage(storage) {
  return {
    userMappings: storage?.userMappings && typeof storage.userMappings === 'object'
      ? storage.userMappings
      : {},
    bans: {
      entries: normalizeBanEntries(storage?.bans)
    }
  };
}

async function ensureStorageFile() {
  await fs.mkdir(path.dirname(storagePath), { recursive: true });
  try {
    await fs.access(storagePath);
  } catch {
    await fs.writeFile(storagePath, JSON.stringify(defaultStorage, null, 2), 'utf8');
  }
}

async function readStorage() {
  await ensureStorageFile();
  const raw = await fs.readFile(storagePath, 'utf8');
  return normalizeStorage(JSON.parse(raw));
}

async function writeStorage(data) {
  await ensureStorageFile();
  await fs.copyFile(storagePath, backupPath);
  const temporaryPath = `${storagePath}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temporaryPath, `${JSON.stringify(normalizeStorage(data), null, 2)}\n`, 'utf8');
  await fs.rename(temporaryPath, storagePath);
}

async function updateStorage(mutator) {
  const operation = writeQueue.then(async () => {
    const storage = await readStorage();
    const result = await mutator(storage);
    await writeStorage(storage);
    return result;
  });
  writeQueue = operation.catch(() => undefined);
  return operation;
}

export async function getUserMapping(discordId) {
  const storage = await readStorage();
  return storage.userMappings[discordId] || null;
}

export async function getDiscordByMcName(mcName) {
  const storage = await readStorage();
  return Object.entries(storage.userMappings).find(([, name]) => name.toLowerCase() === mcName.toLowerCase()) || null;
}

export async function setUserMapping(discordId, mcName) {
  await updateStorage((storage) => {
    storage.userMappings[discordId] = mcName;
  });
}

export async function removeUserMappingByDiscord(discordId) {
  await updateStorage((storage) => {
    delete storage.userMappings[discordId];
  });
}

export async function removeUserMappingByMcName(mcName) {
  await updateStorage((storage) => {
    for (const [discordId, savedName] of Object.entries(storage.userMappings)) {
      if (savedName.toLowerCase() === mcName.toLowerCase()) {
        delete storage.userMappings[discordId];
      }
    }
  });
}

// Legt einen Ban an oder ergänzt einen bestehenden aktiven Ban mit gleichem Bereich.
export async function addBan({ discordId, mcName, scope, reason, evidence, attachments = [], moderatorId, moderatorTag }) {
  return updateStorage((storage) => {
    const normalizedScope = normalizeBanScope(scope);
    const existing = storage.bans.entries.find((entry) => entry.active
      && entry.scope === normalizedScope
      && banMatchesTarget(entry, { discordId, mcName }));

    if (existing) {
      existing.mcName = mcName || existing.mcName;
      existing.discordId = discordId || existing.discordId;
      existing.reason = reason || existing.reason;
      existing.evidence = evidence || existing.evidence;
      existing.attachments = [...(existing.attachments || []), ...attachments];
      existing.moderatorId = moderatorId || existing.moderatorId;
      existing.moderatorTag = moderatorTag || existing.moderatorTag;
      existing.updatedAt = new Date().toISOString();
      return existing;
    }

    const record = createBanRecord({ discordId, mcName, scope: normalizedScope, reason, evidence, attachments, moderatorId, moderatorTag });
    storage.bans.entries.push(record);
    return record;
  });
}

// Hebt passende aktive Bans auf und gibt die aufgehobenen Datensätze zurück.
export async function removeBan({ discordId, mcName, scope, moderatorId, moderatorTag, reason }) {
  return updateStorage((storage) => {
    const normalizedScope = scope ? normalizeBanScope(scope) : null;
    const lifted = [];

    for (const entry of storage.bans.entries) {
      if (!entry.active) continue;
      if (!banMatchesTarget(entry, { discordId, mcName })) continue;
      if (normalizedScope && normalizedScope !== BAN_SCOPES.BOTH && entry.scope !== normalizedScope && entry.scope !== BAN_SCOPES.BOTH) continue;
      lifted.push(liftBanRecord(entry, { moderatorId, moderatorTag, reason }));
    }

    return lifted;
  });
}

// Prüft, ob für Discord-ID oder Minecraft-Name ein aktiver Ban existiert.
export async function isBanned({ discordId, mcName }) {
  const records = await getBanRecords({ discordId, mcName });
  return records.length > 0;
}

export async function getAllMappings() {
  const storage = await readStorage();
  return storage.userMappings;
}

// Liefert Ban-Datensätze für einen Spieler, standardmäßig nur die aktiven.
export async function getBanRecords({ discordId = null, mcName = null, includeLifted = false } = {}) {
  const storage = await readStorage();
  return storage.bans.entries
    .filter((entry) => (includeLifted || entry.active) && banMatchesTarget(entry, { discordId, mcName }))
    .sort((left, right) => String(right.createdAt || '').localeCompare(String(left.createdAt || '')));
}

// Liefert alle Ban-Datensätze, optional inklusive der bereits aufgehobenen.
export async function getAllBanRecords({ includeLifted = false } = {}) {
  const storage = await readStorage();
  return storage.bans.entries
    .filter((entry) => includeLifted || entry.active)
    .sort((left, right) => String(right.createdAt || '').localeCompare(String(left.createdAt || '')));
}

// Kompatibilitätsansicht: flache Listen der aktiv gesperrten IDs und Namen.
export async function getBanLists() {
  const entries = await getAllBanRecords();
  return {
    entries,
    discord: entries.filter((entry) => entry.discordId && scopeIncludesDiscord(entry.scope)).map((entry) => entry.discordId),
    mcNames: entries.filter((entry) => entry.mcName && scopeIncludesMinecraft(entry.scope)).map((entry) => entry.mcName.toLowerCase())
  };
}
