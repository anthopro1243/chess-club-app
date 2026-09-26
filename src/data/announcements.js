/*
 * announcements.js — rules for the coach's announcement board (research F110).
 *
 * One-way on purpose: the coach posts, members read. No replies and no member
 * posts, because student-to-student messaging is a bullying risk a lone coach
 * can't see (research, "things to avoid").
 */

export const TITLE_MAX = 140;
export const BODY_MAX = 4000;

/** Live announcements: pinned first, then newest first. Archived ones are left out. */
export function liveAnnouncements(rows = []) {
  return (rows || [])
    .filter((row) => row && !row.archivedAt)
    .sort((a, b) => {
      if (!!b.pinned !== !!a.pinned) return b.pinned ? 1 : -1;
      return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
    });
}

/** Why a draft can't be posted yet, or null if it can. Mirrors the table's CHECKs. */
export function draftProblem({ title = '', body = '' } = {}) {
  const t = String(title).trim();
  if (!t) return 'Give it a title.';
  if (t.length > TITLE_MAX) return `Keep the title under ${TITLE_MAX} characters.`;
  if (String(body).length > BODY_MAX) return `Keep the message under ${BODY_MAX} characters.`;
  return null;
}
