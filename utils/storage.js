import fs from 'fs/promises';
import path from 'path';

const storagePath = path.join(process.cwd(), 'data', 'storage.json');
const defaultStorage = {
  userMappings: {},
  bans: {
    discord: [],
    mcNames: []
  }
};

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
  return JSON.parse(raw);
}

async function writeStorage(data) {
  await ensureStorageFile();
  await fs.writeFile(storagePath, JSON.stringify(data, null, 2), 'utf8');
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
  const storage = await readStorage();
  storage.userMappings[discordId] = mcName;
  await writeStorage(storage);
}

export async function removeUserMappingByDiscord(discordId) {
  const storage = await readStorage();
  delete storage.userMappings[discordId];
  await writeStorage(storage);
}

export async function removeUserMappingByMcName(mcName) {
  const storage = await readStorage();
  for (const [discordId, savedName] of Object.entries(storage.userMappings)) {
    if (savedName.toLowerCase() === mcName.toLowerCase()) {
      delete storage.userMappings[discordId];
    }
  }
  await writeStorage(storage);
}

export async function addBan({ discordId, mcName }) {
  const storage = await readStorage();
  if (discordId && !storage.bans.discord.includes(discordId)) {
    storage.bans.discord.push(discordId);
  }
  if (mcName) {
    const normalized = mcName.toLowerCase();
    if (!storage.bans.mcNames.includes(normalized)) {
      storage.bans.mcNames.push(normalized);
    }
  }
  await writeStorage(storage);
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
