/*
  Mojang-API-Wrapper
  - Prüft, ob ein Minecraft-Spielername gültig ist.
  - Gibt `null` zurück, wenn der Name nicht existiert.
*/
const MOJANG_API = 'https://api.mojang.com/users/profiles/minecraft';

// Prüft, ob ein Minecraft-Name bei Mojang existiert und gibt die Account-Daten zurück.
export async function checkMinecraftUser(username) {
  const response = await fetch(`${MOJANG_API}/${encodeURIComponent(username)}`);
  if (response.status === 204 || response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`Mojang API Fehler: ${response.status}`);
  }

  return response.json();
}
