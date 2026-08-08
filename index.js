/*
  Haupt-Entrypoint des Bots.
  - Lädt Umgebungsvariablen.
  - Registriert Slash-Commands aus dem Ordner commands/.
  - Startet den Discord-Client und behandelt Interaktionen.
  - Aktiviert optionales Server-Monitoring.
*/
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import { Client, Collection, GatewayIntentBits, Events, REST, Routes } from 'discord.js';
import { startServerMonitor } from './utils/monitor.js';

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID;

if (!token || !clientId) {
  console.error('Fehler: DISCORD_TOKEN und CLIENT_ID müssen in der .env-Datei gesetzt sein.');
  process.exit(1);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

client.commands = new Collection();
const commands = [];
const commandsPath = path.join(process.cwd(), 'commands');
const commandFiles = fs.existsSync(commandsPath)
  ? fs.readdirSync(commandsPath).filter((file) => file.endsWith('.js'))
  : [];

for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  const commandUrl = pathToFileURL(filePath).href;
  const commandModule = await import(commandUrl);
  if (commandModule.data && commandModule.execute) {
    client.commands.set(commandModule.data.name, commandModule);
    commands.push(commandModule.data.toJSON());
  }
}

const rest = new REST({ version: '10' }).setToken(token);

function isSnowflake(value) {
  return typeof value === 'string' && /^[0-9]+$/.test(value);
}

client.once(Events.ClientReady, async () => {
  console.log(`Eingeloggt als ${client.user.tag}`);

  try {
    if (guildId && isSnowflake(guildId)) {
      await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands });
      console.log('Slash-Commands für den Testserver registriert.');
    } else if (guildId) {
      console.warn('Ungültige GUILD_ID in .env erkannt. Verwende globale Registrierung statt Guild-Registrierung.');
      await rest.put(Routes.applicationCommands(clientId), { body: commands });
      console.log('Globale Slash-Commands registriert.');
    } else {
      await rest.put(Routes.applicationCommands(clientId), { body: commands });
      console.log('Globale Slash-Commands registriert.');
    }
  } catch (error) {
    console.error('Fehler beim Registrieren der Slash-Commands:', error);
  }

  await startServerMonitor(client);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction, client);
  } catch (error) {
    console.error('Fehler beim Ausführen des Befehls:', error);
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: 'Es ist ein interner Fehler aufgetreten.', flags: 64 });
    } else {
      await interaction.reply({ content: 'Es ist ein interner Fehler aufgetreten.', flags: 64 });
    }
  }
});

client.login(token);
