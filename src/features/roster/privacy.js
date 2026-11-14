/*
 * privacy.js — what may be shown about a student outside the coach's own view.
 *
 * Dallas ISD's guidance is not to post students' names or photos without a
 * media release on file. The app records that as `mediaRelease` on the player:
 * true = release on file, false = opted out, null/undefined = not recorded.
 * Only `true` allows a full name on anything that could leave the room
 * (printed pairings on a wall, a summary for families, a projector). Unknown
 * is treated like "no": a missing form is not consent.
 *
 * The coach's own screens and the private Excel export keep full names; this
 * module is for outputs other people see.
 */

/** Grade → Dallas ISD high-school section ('9–10' or '11–12'), or null if unknown. */
export function gradeSection(grade) {
  const match = String(grade ?? '').match(/\d{1,2}/);
  if (!match) return null;
  const n = Number(match[0]);
  if (n === 9 || n === 10) return '9–10';
  if (n === 11 || n === 12) return '11–12';
  return null;
}

/** Initials from a full name: "Ada Chen" → "A. C.", "Anthony Villanueva-Parra" → "A. V.-P." */
export function initials(name) {
  const parts = String(name ?? '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '—';
  return parts
    .map((part) => part.split('-').map((piece) => (piece ? `${piece[0].toUpperCase()}.` : '')).join('-'))
    .join(' ');
}

/** The name to print for a player on anything seen outside the coach's own screens. */
export function publicName(player) {
  if (!player) return '—';
  return player.mediaRelease === true ? player.name : initials(player.name);
}

/** How the release state reads to the coach. */
export function mediaReleaseLabel(value) {
  if (value === true) return 'On file';
  if (value === false) return 'Opted out';
  return 'Not recorded (treated as no)';
}
