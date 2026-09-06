import test from 'node:test';
import assert from 'node:assert/strict';
import { isModerator } from '../utils/permissions.js';

test('Administrator wird als Moderator erkannt', () => {
  const interaction = {
    memberPermissions: { has: () => true },
    member: { roles: { cache: new Map() } }
  };

  assert.equal(isModerator(interaction), true);
});

test('Benutzer ohne Administratorrechte wird abgelehnt', () => {
  const interaction = {
    memberPermissions: { has: () => false },
    member: { roles: { cache: new Map() } }
  };

  assert.equal(isModerator(interaction), false);
});