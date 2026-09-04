/*
  Speicher-Wrapper für persistente Daten in `data/storage.json`.
  - `userMappings`: Discord-ID → Minecraft-Name
  - `bans`: Listen gesperrter Discord-IDs und Minecraft-Namen
*/
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

const storagePath = path.join(process.cwd(), 'data', 'storage.json');
const defaultStorage = {
  userMappings: {},
  bans: {
    discord: [],
    mcNames: []
  }
};

let writeQueue = Promise.resolve();

function normalizeStorage(storage) {
  return {
    userMappings: storage?.userMappings && typeof storage.userMappings === 'object'
      ? storage.userMappings
      : {},
    bans: {
      discord: Array.isArray(storage?.bans?.discord) ? storage.bans.discord : [],
      mcNames: Array.isArray(storage?.bans?.mcNames) ? storage.bans.mcNames : []
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

export async function addBan({ discordId, mcName }) {
  await updateStorage((storage) => {
    if (discordId && !storage.bans.discord.includes(discordId)) {
      storage.bans.discord.push(discordId);
    }
    if (mcName) {
      const normalized = mcName.toLowerCase();
      if (!storage.bans.mcNames.includes(normalized)) {
        storage.bans.mcNames.push(normalized);
      }
    }
  });
}

export async function removeBan({ discordId, mcName }) {
  await updateStorage((storage) => {
    if (discordId) {
      storage.bans.discord = storage.bans.discord.filter((id) => id !== discordId);
    }
    if (mcName) {
      const normalized = mcName.toLowerCase();
      storage.bans.mcNames = storage.bans.mcNames.filter((name) => name !== normalized);
    }
  });
}

export async function isBanned({ discordId, mcName }) {
  const storage = await readStorage();
  const bannedDiscord = discordId ? storage.bans.discord.includes(discordId) : false;
  const bannedMc = mcName ? storage.bans.mcNames.includes(mcName.toLowerCase()) : false;
  return bannedDiscord || bannedMc;
}

export async function getAllMappings() {
  const storage = await readStorage();
  return storage.userMappings;
}

export async function getBanLists() {
  const storage = await readStorage();
  return storage.bans;
}
