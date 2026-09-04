const MINECRAFT_NAME_PATTERN = /^[A-Za-z0-9_]{3,16}$/;

export function normalizeMinecraftName(value) {
  if (typeof value !== 'string') return null;

  const name = value.trim();
  return MINECRAFT_NAME_PATTERN.test(name) ? name : null;
}

export function sameMinecraftName(left, right) {
  return typeof left === 'string'
    && typeof right === 'string'
    && left.toLowerCase() === right.toLowerCase();
}