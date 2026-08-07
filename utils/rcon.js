import { Rcon } from 'rcon-client';

const host = process.env.RCON_HOST;
const port = Number(process.env.RCON_PORT || 25575);
const password = process.env.RCON_PASSWORD;

if (!host || !password) {
  console.error('Fehler: RCON_HOST und RCON_PASSWORD müssen in der .env-Datei gesetzt sein.');
  process.exit(1);
}

// Stellt eine RCON-Verbindung her und führt einen Befehl auf dem Minecraft-Server aus.
export async function runRconCommand(command) {
  const rcon = await Rcon.connect({ host, port, password });
  try {
    const response = await rcon.send(command);
    await rcon.end();
    return response;
  } catch (error) {
    console.error('RCON-Verbindungsfehler:', error);
    try {
      await rcon.end();
    } catch {
      // Ignoriere Fehler beim Schließen.
    }
    throw error;
  }
}
