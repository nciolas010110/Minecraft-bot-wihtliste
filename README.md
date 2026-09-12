# Minecraft Whitelist Bot

Dieser Discord-Bot verwaltet die Minecraft-Whitelist und die Sperren per Slash-Commands und steuert den Minecraft-Server über RCON.

## Übersicht

Dieser Bot bietet:
- `/whitelist add mcname:<Minecraft-Name>` zum Freischalten
- `/whitelist remove mcname:<Minecraft-Name>` zum Entfernen
- `/whitelist ban` zum Sperren mit Bereich (nur Minecraft, nur Discord oder beides), Grund und Beweisen
- `/whitelist unban` zum Aufheben einer Sperre
- `/whitelist user` zur Abfrage der eigenen Zuordnung
- `/whitelist list` zur Anzeige **aller** Zuordnungen für Administratoren (mehrseitig)
- `/ban player`, `/ban liste` und `/ban verlauf` zum Nachschlagen: wer wurde wann, warum und von wem gesperrt
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
- `RCON_TIMEOUT_MS` - optionaler RCON-Timeout in Millisekunden (Standard: `10000`)
- `MOJANG_TIMEOUT_MS` - optionaler Mojang-API-Timeout in Millisekunden (Standard: `8000`)
- `MONITOR_CHANNEL_ID` - optional, Discord-Kanal-ID für Monitoring-Meldungen
- `MONITOR_INTERVAL_SECONDS` - Überwachungsintervall in Sekunden (Standard: `60`)
- `MONITOR_RAM_THRESHOLD` - RAM-Schwelle in Prozent für Warnungen (Standard: `80`)
- `MONITOR_TPS_THRESHOLD` - TPS-Schwelle für Warnungen (Standard: `16`)
- `AUDIT_LOG_CHANNEL_ID` - Kanal für Audit-Logs; dorthin werden auch Beweisbilder und -videos kopiert
- `MODERATOR_ROLE_ID` - Rolle, die neben Administratoren sperren und Listen sehen darf
- `DISCORD_BAN_ENABLED` - wenn `true`, wird bei einer Discord-Sperre zusätzlich der Discord-Server-Bann gesetzt (Standard: `false`)

## Slash-Command-Referenz

### `/whitelist add mcname:<Minecraft-Name>`
- Prüft, ob der Name bei Mojang existiert.
- Führt `whitelist add <Name>` via RCON aus.
- Speichert die Zuordnung Discord-ID → Minecraft-Name in `data/storage.json`.
- Setzt einen Cooldown von 30 Sekunden pro Discord-Benutzer.
- Verhindert doppeltes Mapping für Discord-Benutzer und Minecraft-Namen.
- Fügt im Server, falls vorhanden, optional die Rolle `Whitelisted` hinzu.

### `/whitelist remove mcname:<Minecraft-Name>`
- Entfernt den Spieler von der Whitelist via RCON.
- Löscht die zugehörige Mapping-Eintragung.
- Nur Administratoren dürfen diesen Unterbefehl verwenden.

### `/whitelist ban grund:<Text> [mcname] [discord] [bereich] [beweise] [beweis1-3]`
- `grund` ist Pflicht: ohne Begründung wird nicht gesperrt.
- `bereich` legt fest, wo die Sperre gilt:
  - **Nur Minecraft**: `whitelist remove` und `ban <Name> <Grund>` per RCON.
  - **Nur Discord**: der Account kann sich nicht mehr whitelisten, die Rolle `Whitelisted` wird entfernt.
  - **Minecraft und Discord** (Standard): beides zusammen.
- `mcname` und/oder `discord`: mindestens eines muss angegeben werden, das jeweils andere
  wird über die gespeicherte Zuordnung automatisch ergänzt.
- `beweise` nimmt Text und Links auf, `beweis1` bis `beweis3` nehmen Bilder oder Videos entgegen.
- Beweisdateien werden in den Audit-Kanal kopiert, damit sie dauerhaft auffindbar bleiben.
- Gespeichert werden Bereich, Grund, Beweise, Moderator und Zeitpunkt.
- Ist der Minecraft-Server nicht erreichbar, wird die Sperre trotzdem gespeichert und im Ergebnis vermerkt.
- Mit `DISCORD_BAN_ENABLED=true` wird zusätzlich der Discord-Server-Bann gesetzt.
- Nur Administratoren und die Moderatorrolle dürfen diesen Unterbefehl verwenden.

### `/whitelist unban [mcname] [discord] [bereich] [grund]`
- Hebt den Minecraft-Ban per RCON auf (`pardon`), sofern der Bereich Minecraft betrifft.
- Ohne `bereich` werden alle Sperren des Spielers aufgehoben.
- Der Eintrag wird nicht gelöscht, sondern mit Zeitpunkt, Moderator und Grund als aufgehoben markiert,
  damit der Verlauf erhalten bleibt.
- Nur Administratoren und die Moderatorrolle dürfen diesen Unterbefehl verwenden.

### `/whitelist user`
- Gibt ohne Option die eigene Zuordnung aus.
- Administratoren können optional per `discord` oder `mcname` abfragen.
- Zeigt an, ob der Benutzer/Name gesperrt ist.

### `/whitelist list [seite]`
- Listet alle gespeicherten Discord-Namen mit zugehörigen Minecraft-Namen, nummeriert und alphabetisch.
- Lange Listen werden auf mehrere Embeds verteilt, es wird also nichts mehr abgeschnitten.
- Passt alles nicht in eine Antwort, zeigt die Fußzeile die Seitenzahl und den Befehl für die nächste Seite.
- Markiert gesperrte Einträge als `(Gebannt)`.
- Nur Administratoren dürfen die vollständige Liste sehen.

### `/ban player [mcname] [discord]`
- Zeigt alle Sperren eines Spielers, auch die bereits aufgehobenen.
- Pro Eintrag: Status, Bereich, Minecraft-Name, Discord-Konto, Grund, Beweise, Beweis-Anhänge,
  wer gesperrt hat und wann (als Discord-Zeitstempel, also in lokaler Zeit).
- Ein Beweisbild wird direkt im Embed angezeigt.

### `/ban liste [seite]`
- Zeigt alle aktuell gesperrten Spieler mit Bereich, Kurzgrund und Anzahl der Beweis-Anhänge.

### `/ban verlauf [seite]`
- Wie `/ban liste`, zeigt zusätzlich die bereits aufgehobenen Sperren.

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
- Speichert Mappings und Sperren in `utils/storage.js`.
- Setzt Sperren mit Bereich, Grund und Beweisen und hebt sie wieder auf.
- Versendet Ausgaben als Discord-Embed.

### `commands/ban.js`
- Nur Nachschlagen, gesperrt wird mit `/whitelist ban`.
- `/ban player` zeigt alle Sperren eines Spielers mit Grund und Beweisen.
- `/ban liste` und `/ban verlauf` zeigen alle Sperren, bei Bedarf über mehrere Seiten.

### `utils/mojang.js`
- Enthält die Funktion `checkMinecraftUser(username)`.
- Ruft die Mojang-API auf, um zu prüfen, ob ein Minecraft-Name existiert.
- Gibt die Account-Daten zurück oder `null`, falls der Name nicht existiert.

### `utils/rcon.js`
- Stellt eine RCON-Verbindung zum Server her.
- Führt den übergebenen Befehl aus und beendet die Verbindung wieder.
- Meldet fehlende Konfiguration beim jeweiligen Befehl und beendet nicht den gesamten Bot-Import.
- Unterstützt einen Timeout über `RCON_TIMEOUT_MS`.

### `utils/storage.js`
- Speichert Daten in `data/storage.json`.
- Verwaltet Mappings und vollständige Ban-Datensätze inklusive Verlauf.
- Migriert alte Bannlisten beim ersten Laden automatisch in das neue Format.
- Bietet Funktionen zum Lesen, Schreiben und Aktualisieren der JSON-Datei.

### `utils/bans.js`
- Definiert die Bereiche `minecraft`, `discord` und `beide`.
- Erstellt Ban-Datensätze und markiert sie als aufgehoben.
- Enthält nur reine Funktionen und ist deshalb direkt testbar.

### `utils/banView.js`
- Baut die Embed-Felder eines Bans: wer, warum, wann, von wem, Beweise.
- Formatiert Zeitpunkte als Discord-Zeitstempel und Anhänge als Links.

### `utils/banUi.js`
- Liest Beweis-Anhänge aus einer Interaktion.
- Löst das Ziel eines Bans aus `mcname` und `discord` auf.
- Baut das fertige Embed inklusive Beweisbild.

### `utils/pagination.js`
- Teilt lange Listen in Blöcke, die in ein Embed passen.
- Verteilt die Blöcke auf Seiten, damit kein Eintrag verloren geht.

### `utils/audit.js`
- Schreibt jede Whitelist- und Ban-Aktion in den Audit-Kanal.
- Kopiert Beweisbilder und -videos in diesen Kanal und liefert den Nachrichten-Link zurück.

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
    "entries": [
      {
        "id": "uuid",
        "mcName": "MinecraftName",
        "discordId": "DiscordID",
        "scope": "minecraft | discord | beide",
        "reason": "Grund der Sperre",
        "evidence": "Beweistext oder Links",
        "attachments": [
          {
            "name": "beweis.png",
            "url": "https://cdn.discordapp.com/...",
            "contentType": "image/png",
            "mirrorUrl": "Link zur Kopie im Audit-Kanal"
          }
        ],
        "moderatorId": "DiscordID",
        "moderatorTag": "Moderatorname",
        "createdAt": "2026-09-13T12:00:00.000Z",
        "active": true,
        "liftedAt": null,
        "liftedBy": null,
        "liftedByTag": null,
        "liftReason": null
      }
    ]
  }
}
```

Sperren werden beim Aufheben nicht gelöscht, sondern auf `active: false` gesetzt.
So bleibt nachvollziehbar, wer wann warum gesperrt und wieder freigegeben wurde.
Ältere Dateien mit `bans.discord` und `bans.mcNames` werden beim ersten Start automatisch übernommen;
für diese Alt-Einträge fehlen Grund und Zeitpunkt.

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
- Setze `AUDIT_LOG_CHANNEL_ID`, wenn Beweisbilder und -videos dauerhaft erhalten bleiben sollen:
  Discord-Links aus dem Slash-Command können nach einiger Zeit ablaufen, die Kopie im Audit-Kanal nicht.
