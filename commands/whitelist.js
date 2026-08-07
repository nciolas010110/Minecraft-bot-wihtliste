import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { checkMinecraftUser } from '../utils/mojang.js';
import { runRconCommand } from '../utils/rcon.js';
import { setUserMapping, isBanned, getUserMapping, getDiscordByMcName } from '../utils/storage.js';

const cooldowns = new Map();
const COOLDOWN_SECONDS = 30;

export const data = new SlashCommandBuilder()
  .setName('whitelist')
  .setDescription('Whitelist einen Minecraft-Spieler auf dem Server')
  .addStringOption((option) =>
    option.setName('mcname').setDescription('Minecraft-Name').setRequired(true)
  );

export async function execute(interaction) {
  const userId = interaction.user.id;
  const now = Date.now();
  const cooldownExpiration = cooldowns.get(userId) || 0;

  if (now < cooldownExpiration) {
    const remaining = Math.ceil((cooldownExpiration - now) / 1000);
    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle('Bitte warte kurz')
          .setDescription(`Du kannst diesen Befehl in ${remaining} Sekunden erneut verwenden.`)
          .setColor('Orange')
      ],
      ephemeral: true
    });
  }

  const mcName = interaction.options.getString('mcname', true).trim();

  await interaction.deferReply({ flags: 64 });

  try {
    if (await isBanned({ discordId: userId, mcName })) {
      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setTitle('Zugriff verweigert')
            .setDescription('Du bist gesperrt oder dieser Minecraft-Name ist gebannt.')
            .setColor('Red')
        ]
      });
    }

    const existingMapping = await getUserMapping(userId);
    if (existingMapping) {
      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setTitle('Bereits registriert')
            .setDescription(`Du hast bereits den Minecraft-Namen **${existingMapping}** zugeordnet. Bitte entferne ihn zuerst mit "/whitelistremove" oder verwende denselben Namen erneut.`)
            .setColor('Orange')
        ]
      });
    }

    const linkedDiscord = await getDiscordByMcName(mcName);
    if (linkedDiscord) {
      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setTitle('Name bereits vergeben')
            .setDescription(`Der Minecraft-Name **${mcName}** ist bereits mit einem anderen Discord-Konto verknüpft.`)
            .setColor('Orange')
        ]
      });
    }

    const mojangData = await checkMinecraftUser(mcName);
    if (!mojangData) {
      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setTitle('Ungültiger Minecraft-Name')
            .setDescription(`Der Name **${mcName}** existiert nicht laut Mojang.`)
            .setColor('Red')
        ]
      });
    }

    const rconResponse = await runRconCommand(`whitelist add ${mcName}`);
    await setUserMapping(userId, mcName);
    cooldowns.set(userId, now + COOLDOWN_SECONDS * 1000);

    const successEmbed = new EmbedBuilder()
      .setTitle('Whitelist erfolgreich')
      .setDescription(`Der Spieler **${mcName}** wurde auf dem Server freigeschaltet.`)
      .addFields(
        { name: 'Mojang-ID', value: mojangData.id, inline: true },
        { name: 'Discord-Benutzer', value: interaction.user.tag, inline: true }
      )
      .setColor('Green');

    await interaction.editReply({ embeds: [successEmbed] });

    if (interaction.guild) {
      try {
        const role = interaction.guild.roles.cache.find((r) => r.name === 'Whitelisted');
        if (role) {
          const member = interaction.member;
          if (member && member.roles) {
            await member.roles.add(role);
          } else {
            const fetchedMember = await interaction.guild.members.fetch(interaction.user.id);
            await fetchedMember.roles.add(role);
          }
        }
      } catch (roleError) {
        console.error('Fehler beim Zuweisen der Whitelisted-Rolle:', roleError);
      }
    }

    console.log(`Whitelist hinzugefügt: ${mcName} (${mojangData.id})`);
    if (rconResponse) console.log('RCON-Antwort:', rconResponse);
  } catch (error) {
    console.error('Fehler beim Whitelisten:', error);
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setTitle('Whitelist fehlgeschlagen')
          .setDescription('Es gab ein Problem beim Verbinden mit dem Minecraft-Server. Bitte überprüfe die RCON-Einstellungen.')
          .setColor('Red')
      ]
    });
  }
}
