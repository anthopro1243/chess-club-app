/*
 * rosterAccess.js — what the Roster page offers to whom.
 *
 * The Roster is the club list, so every member can open it. Changing it is the
 * coach's job: the database refuses a member's add, edit or remove on anyone
 * else's row, and showed it to them as a red "Couldn't save" banner (or, for
 * Remove, a player who vanished from their screen until they reloaded).
 *
 * Skill scores, goal and training focus are one member's coaching record.
 * The analyzer spec (Decision 4) is that no member sees another member's
 * scores, so a member sees those on their own row only.
 */

/**
 * @param {{ isCoach?: boolean, isSelf?: boolean }} viewer
 *   isSelf: the selected row is the viewer's own player row.
 */
export function rosterAccess({ isCoach = false, isSelf = false } = {}) {
  return {
    canAdd: isCoach,
    canEdit: isCoach,
    canRemove: isCoach,
    showCoachingRecord: isCoach || isSelf,
  };
}
