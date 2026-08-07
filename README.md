# Minecraft Whitelist Bot

Dieser Discord-Bot verwendet `discord.js` v14 und `rcon-client`, um Minecraft-Spieler per Slash-Command `/whitelist` auf einem Server freizuschalten.

## Setup

1. Erstelle eine Kopie von `.env.example` als `.env`.
2. Trage die Werte für `DISCORD_TOKEN`, `CLIENT_ID`, `GUILD_ID`, `RCON_HOST`, `RCON_PORT` und `RCON_PASSWORD` ein.
3. Installiere die Abhängigkeiten:

   ```bash
   npm install
   ```

4. Starte den Bot:

   ```bash
   npm start
   ```

## Nutzung

- `/whitelist mcname:<Minecraft-Name>` prüft zunächst, ob der Minecraft-Name bei Mojang existiert.
- Bei erfolgreicher Überprüfung wird per RCON `whitelist add <name>` auf dem Minecraft-Server ausgeführt.
- Der Befehl speichert die Zuordnung zwischen Discord-Benutzer und Minecraft-Name.
- Der Befehl hat einen Cooldown von 30 Sekunden pro Benutzer.
- Optional wird dem Discord-Benutzer die Rolle `Whitelisted` zugewiesen, falls die Rolle im Server existiert.
- `/whitelistremove mcname:<Minecraft-Name>` entfernt den Spieler von der Whitelist.
- `/whitelistban discord:<Benutzer> | mcname:<Minecraft-Name>` bannt einen Spieler und entfernt ihn von der Whitelist.
- `/user discord:<Benutzer> | mcname:<Minecraft-Name>` zeigt die Zuordnung und Ban-Informationen an.
- `/list` zeigt alle gespeicherten Discord- zu Minecraft-Zuordnungen an.

## Minecraft Server / RCON Setup

1. Öffne die `server.properties` im Minecraft-Server-Verzeichnis, z. B. `/opt/minecraft/server.properties`.
2. Setze oder ändere folgende Einträge:

   ```properties
   enable-rcon=true
   rcon.port=25575
   rcon.password=<ein starkes, langes Passwort>
   broadcast-rcon-to-ops=false
   ```

3. Speichere die Datei und starte den Minecraft-Server neu:

   ```bash
   sudo systemctl restart mc-server
   ```

4. Da Bot und Minecraft-Server im selben Container laufen, verwende für den Bot folgende Werte in `.env`:

   ```env
   RCON_HOST=127.0.0.1
   RCON_PORT=25575
   RCON_PASSWORD=<das gleiche Passwort wie oben>
   ```

5. Optional kannst du RCON zunächst mit `mcrcon` testen:

   ```bash
   mcrcon -H 127.0.0.1 -P 25575 -p <passwort> "whitelist list"
   ```

   Wenn das funktioniert, ist die Server- und RCON-Konfiguration korrekt.

## Bot-Code

Im Bot installiert die Datei `utils/rcon.js` die Verbindung per `rcon-client` und führt Minecraft-Befehle so aus:

```js
import { Rcon } from 'rcon-client';

const rcon = await Rcon.connect({
  host: process.env.RCON_HOST,
  port: Number(process.env.RCON_PORT),
  password: process.env.RCON_PASSWORD
});
const response = await rcon.send(`whitelist add ${minecraftName}`);
await rcon.end();
```

## Deployment-Schritte

### 1. Vom PC zum GitHub-Repository

1. Öffne dein Projekt auf dem PC.
2. Füge neue Dateien hinzu und committe die Änderungen:

   ```bash
   git add .
   git commit -m "Bot-Code und RCON-Dokumentation aktualisiert"
   ```

3. Push die Änderungen zu GitHub:

   ```bash
   git push origin main
   ```

   Falls dein Branch anders heißt, ersetze `main` durch den passenden Branch.

### 2. Auf dem Server den Code holen

1. Melde dich per SSH am Server an:

   ```bash
   ssh benutzer@dein-server
   ```

2. Wechsle in das Verzeichnis, in dem der Bot liegen soll, z. B. `/opt/minecraft-bot`.
3. Falls das Verzeichnis noch nicht existiert, lege es an:

   ```bash
   mkdir -p /opt/minecraft-bot
   cd /opt/minecraft-bot
   ```

4. Klone das Repository zum ersten Mal:

   ```bash
   git clone https://github.com/DEIN-USERNAME/DEIN-REPO.git .
   ```

   Oder, falls das Repository bereits existiert, hole die neuesten Änderungen:

   ```bash
   git pull origin main
   ```

### 3. `.env` auf dem Server anlegen

1. Erstelle die Datei `.env` im Bot-Verzeichnis.
2. Trage dort die sensiblen Werte ein:

   ```env
   DISCORD_TOKEN=DeinDiscordBotToken
   CLIENT_ID=DeineBotClientID
   # GUILD_ID optional, falls du nur in einem Testserver registrieren willst
   GUILD_ID=DeineTestGuildID
   RCON_HOST=127.0.0.1
   RCON_PORT=25575
   RCON_PASSWORD=<das gleiche Passwort wie in server.properties>
   ```

3. Achte darauf, dass `.env` nicht zu Git hinzugefügt wird – `.gitignore` schützt die Datei bereits.

### 4. Auf dem Server installieren und starten

1. Installiere die Abhängigkeiten:

   ```bash
   npm install
   ```

2. Starte den Bot:

   ```bash
   npm start
   ```

3. Prüfe, ob der Bot online ist und die Slash-Commands im Discord verfügbar sind.

## `mcrcon` installieren

Wenn `mcrcon` nicht installiert ist, kannst du es auf Debian/Ubuntu so installieren:

```bash
sudo apt update
sudo apt install mcrcon
```

Falls `mcrcon` nicht im Paketmanager vorhanden ist, kannst du es auch aus den Quellen bauen.

## Wichtige Sicherheits-Anmerkung

- RCON braucht nicht nach außen geöffnet zu werden, wenn Bot und Server im selben Container laufen.
- Verwende trotzdem ein starkes Passwort.
- Schütze den Container-Zugriff, damit niemand einfach die `.env`-Daten lesen kann.

## Dateiübersicht

- `index.js` - Bot-Start und Registrierung der Slash-Commands
- `commands/whitelist.js` - Slash-Command-Logik
- `utils/mojang.js` - Mojang-API-Abfrage
- `utils/rcon.js` - RCON-Verbindung und Ausführung von Minecraft-Befehlen
