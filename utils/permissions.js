import { PermissionsBitField } from 'discord.js';

const moderatorRoleId = process.env.MODERATOR_ROLE_ID;

export function isModerator(interaction) {
  if (interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator)) {
    return true;
  }

  if (!moderatorRoleId || !interaction.member?.roles) {
    return false;
  }

  return interaction.member.roles.cache?.has(moderatorRoleId) ?? false;
}

export function moderatorOnly(interaction) {
  return interaction.reply({
    content: 'Nur Administratoren oder Mitglieder mit der konfigurierten Moderatorrolle dürfen diesen Unterbefehl verwenden.',
    flags: 64
  });
}