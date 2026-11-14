/*
 * Avatar — a player's initials on a colour of their own, so a name can be
 * found in a list at a glance. Decoration only: the name is always beside it.
 */
export function initialsOf(name = '') {
  const words = String(name).trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '?';
  const first = words[0][0];
  const last = words.length > 1 ? words[words.length - 1][0] : '';
  return (first + last).toUpperCase();
}

/** A stable hue (0-359) for a name: the same player is always the same colour. */
export function hueOf(name = '') {
  let hash = 0;
  for (const char of String(name)) hash = (hash * 31 + char.codePointAt(0)) % 360;
  return hash;
}

export default function Avatar({ name, size = 'md' }) {
  return (
    <span className={`avatar avatar-${size}`} style={{ '--avatar-hue': hueOf(name) }} aria-hidden="true">
      {initialsOf(name)}
    </span>
  );
}
