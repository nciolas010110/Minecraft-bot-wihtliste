# Minecraft Whitelist Bot

Dieser Discord-Bot ermöglicht das Whitelisten von Minecraft-Spielern per Slash-Command und steuert den Minecraft-Server über RCON.

## Übersicht

Dieser Bot bietet:
- `/whitelist mcname:<Minecraft-Name>` zum Freischalten auf der Minecraft-Whitelist
- `/whitelistremove mcname:<Minecraft-Name>` zum Entfernen von der Whitelist
- `/whitelistban discord:<Benutzer> | mcname:<Minecraft-Name>` zum Sperren und Whitelist-Entfernen
- `/user` zur Abfrage gespeicherter Zuordnungen
- `/list` zur Anzeige aller gespeicherten Zuordnungen
- Optionales Server-Monitoring per RCON (TPS, RAM)

## Voraussetzungen

- Node.js >= 18
- Ein Discord-Bot mit Token und Client-ID
- Ein Minecraft-Server mit aktiviertem RCON
- Eine `.env`-Datei mit den benötigten Konfigurationswerten

## Installation

1. Kopiere `.env.example` nach `.env`.
2. Trage deine Discord- und RCON-Werte in `.env` ein.
3. Installiere die Abhängigkeiten:

```bash
npm install
```

4. Starte den Bot:

```bash
npm start
```

## Umgebungsvariablen

Die folgenden Variablen werden unterstützt:

- `DISCORD_TOKEN` - Discord-Bot-Token (erforderlich)
- `CLIENT_ID` - Client-ID des Discord-Bots (erforderlich)
- `GUILD_ID` - optional, für schnelle Slash-Command-Registrierung in einem Testserver
- `RCON_HOST` - Hostname oder IP des Minecraft-Servers
- `RCON_PORT` - RCON-Port (Standard: `25575`)
- `RCON_PASSWORD` - RCON-Passwort
- `MONITOR_CHANNEL_ID` - optional, Discord-Kanal-ID für Monitoring-Meldungen
- `MONITOR_INTERVAL_SECONDS` - Überwachungsintervall in Sekunden (Standard: `60`)
- `MONITOR_RAM_THRESHOLD` - RAM-Schwelle in Prozent für Warnungen (Standard: `80`)
- `MONITOR_TPS_THRESHOLD` - TPS-Schwelle für Warnungen (Standard: `16`)

## Slash-Command-Referenz

### `/whitelist mcname:<Minecraft-Name>`
- Prüft, ob der Name bei Mojang existiert.
- Führt `whitelist add <Name>` via RCON aus.
- Speichert die Zuordnung Discord-ID → Minecraft-Name in `data/storage.json`.
- Setzt einen Cooldown von 30 Sekunden pro Discord-Benutzer.
- Verhindert doppeltes Mapping für Discord-Benutzer und Minecraft-Namen.
- Fügt im Server, falls vorhanden, optional die Rolle `Whitelisted` hinzu.

### `/whitelistremove mcname:<Minecraft-Name>`
- Entfernt den Spieler von der Whitelist via RCON.
- Löscht die zugehörige Mapping-Eintragung.
- Nur Administratoren dürfen diesen Befehl verwenden.

### `/whitelistban [discord:<Benutzer>] [mcname:<Minecraft-Name>]`
- Banniert den angegebenen Minecraft-Namen per RCON (`ban <Name>`).
- Entfernt den Namen von der Whitelist.
- Speichert den Bann in `data/storage.json`.
- Optional wird ein zugeordnetes Discord-Konto gesperrt.
- Nur Administratoren dürfen diesen Befehl verwenden.

### `/user`
- Gibt die eigene Zuordnung aus, wenn keine Option gesetzt ist.
- Optional per `discord` oder `mcname` abfragbar.
- Zeigt an, ob der Benutzer/Name gesperrt ist.

### `/list`
- Listet alle gespeicherten Discord-IDs mit zugehörigen Minecraft-Namen.
- Markiert gesperrte Einträge als `(Gebannt)`.

## Dateien und Logik

### `index.js`
- Lädt `.env` mit `dotenv`.
- Erstellt einen Discord-Client mit Gateway-Intent `Guilds`.
- Lädt automatisch alle JS-Dateien aus `commands/`.
- Registriert Slash-Commands bei Discord (guild-basiert oder global).
- Startet optionales Server-Monitoring über `utils/monitor.js`.

### `commands/whitelist.js`
- Validiert Cooldown, Bannstatus und bestehende Mappings.
- Prüft Minecraft-Namen mit der Mojang-API via `utils/mojang.js`.
- Führt RCON-Befehle mit `utils/rcon.js` aus.
- Speichert Mappings in `utils/storage.js`.
- Versendet Ausgaben als Discord-Embed.

### `commands/whitelistremove.js`
- Löscht einen Minecraft-Namen von der Whitelist.
- Entfernt die zugehörige Zuordnung aus dem Speicher.
- Gibt den Serverantworttext zurück.

### `commands/whitelistban.js`
- Bannt einen Minecraft-Namen und entfernt ihn von der Whitelist.
- Speichert Banns sowohl für Discord-ID als auch Namen.
- Unterstützt Abfragen per Discord-Benutzer oder Namen.

### `commands/user.js`
- Fragt eine gespeicherte Zuordnung ab.
- Unterstützt Abfrage per Discord-User oder Minecraft-Name.
- Gibt Bannstatus zurück.

### `commands/list.js`
- Listet alle gespeicherten Mappings.
- Versucht, Discord-Tags aus den IDs zu laden.
- Markiert gebannte Einträge.

### `utils/mojang.js`
- Enthält die Funktion `checkMinecraftUser(username)`.
- Ruft die Mojang-API auf, um zu prüfen, ob ein Minecraft-Name existiert.
- Gibt die Account-Daten zurück oder `null`, falls der Name nicht existiert.

### `utils/rcon.js`
- Stellt eine RCON-Verbindung zum Server her.
- Führt den übergebenen Befehl aus und beendet die Verbindung wieder.
- Bricht bei fehlenden RCON-Konfigurationswerten ab.

### `utils/storage.js`
- Speichert Daten in `data/storage.json`.
- Unterstützt Mappings und Bannlisten.
- Bietet Funktionen zum Lesen, Schreiben und Aktualisieren der JSON-Datei.

### `utils/monitor.js`
- Führt in regelmäßigen Intervallen RCON-Befehle `tps` und `gc` aus.
- Parst TPS- und RAM-Werte aus der Serverausgabe.
- Sendet Warnungen, wenn Schwellenwerte überschritten werden.
- Sendet eine Erholungsnachricht, wenn der Server wieder in Ordnung ist.

## Speicherformat

Die Datei `data/storage.json` enthält folgenden Aufbau:

```json
{
  "userMappings": {
    "DiscordID": "MinecraftName"
  },
  "bans": {
    "discord": ["DiscordID"],
    "mcNames": ["minecraftname"]
  }
}
```

## RCON & Minecraft-Server

In der Minecraft-Server-`server.properties` muss RCON aktiviert sein:

```properties
enable-rcon=true
rcon.port=25575
rcon.password=<starkes-passwort>
```

Falls dein Minecraft-Server keine Befehle `tps` oder `gc` unterstützt, funktioniert das Monitoring nur eingeschränkt.

## Deployment

1. Klone das Repository auf den Server.
2. Erstelle die `.env`-Datei mit deinen Produktionswerten.
3. Installiere Abhängigkeiten mit `npm install`.
4. Starte den Bot mit `npm start`.

> Für produktive Installationen empfiehlt sich ein Prozessmanager wie `pm2` oder `systemd`, damit der Bot nach Crashes automatisch neu startet.

## Hinweise

- Die Datei `.env` sollte niemals ins Git-Repository gelangen.
- `GUILD_ID` ist optional; ohne sie werden die Slash-Commands global registriert.
- Bei Problemen mit RCON prüfe die Server-Logausgabe und die korrekte `RCON_PASSWORD`-Einstellung.
