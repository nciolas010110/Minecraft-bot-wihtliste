import { PermissionsBitField } from 'discord.js';

const moderatorRoleId = process.env.MODERATOR_ROLE_ID;
const adminRoleId = process.env.ADMIN_ROLE_ID;

function hasRole(interaction, roleId) {
  if (!roleId || !interaction.member?.roles) return false;
  return interaction.member.roles.cache?.has(roleId) ?? false;
}

export function isModerator(interaction) {
  if (interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator)) {
    return true;
  }

  return hasRole(interaction, moderatorRoleId) || hasRole(interaction, adminRoleId);
}

// Strenger als isModerator: nur echte Administratoren oder die ADMIN_ROLE_ID.
// Die Moderatorrolle reicht hier bewusst nicht aus, weil damit Server-Befehle laufen.
export function isAdministrator(interaction) {
  if (interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator)) {
    return true;
  }

  return hasRole(interaction, adminRoleId);
}

export function moderatorOnly(interaction) {
  return interaction.reply({
    content: 'Nur Administratoren oder Mitglieder mit der konfigurierten Moderatorrolle dürfen diesen Unterbefehl verwenden.',
    flags: 64
  });
}

export function adminOnly(interaction) {
  return interaction.reply({
    content: 'Nur Administratoren oder Mitglieder mit der konfigurierten ADMIN_ROLE_ID dürfen Server-Befehle ausführen.',
    flags: 64
  });
}
