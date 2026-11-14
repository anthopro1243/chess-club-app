/*
 * studentId.js — the one rule about student IDs, shared by the roster
 * import (coach) and "Who are you?" (every member), kept apart so the
 * member side doesn't download the whole CSV importer.
 */

/**
 * Every DISD student ID is exactly 7 digits. Anything else is a typo, and a
 * typo'd ID is worse than a missing one: it is the first dedupe key, so a
 * wrong one silently splits or merges the wrong people.
 */
export function normaliseStudentId(value) {
  const digits = String(value ?? '').trim().replace(/\D/g, '');
  return /^\d{7}$/.test(digits) ? digits : null;
}
