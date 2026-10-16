/*
 * accountLinking.js — tying each account to the real student (pure logic).
 *
 * After approval, a member answers "Who are you?" once: first name, last
 * name, DISD student ID. The database function link_my_account (migration
 * 0025) does the matching against the coach's imported roster; this module
 * holds what the screens decide around it, so it can be tested without a
 * browser or a backend:
 *   - whether to ask (validate + shouldAskWhoAreYou)
 *   - what to tell the member afterwards (linkOutcomeMessage)
 *   - the coach's picture of who is linked (buildLinkOverview)
 *
 * No network and no React here. accountLinkStore.js does the calls.
 */

import { normaliseStudentId } from './rosterImport.js';

const NAME_LIMIT = 60;

/**
 * Check the "Who are you?" answers. Returns { ok, errors, value } where
 * errors holds one plain sentence per bad field and value is what gets sent.
 */
export function validateWhoAreYou({ firstName = '', lastName = '', studentId = '' } = {}) {
  const first = String(firstName).trim().replace(/\s+/g, ' ').slice(0, NAME_LIMIT);
  const last = String(lastName).trim().replace(/\s+/g, ' ').slice(0, NAME_LIMIT);
  const id = normaliseStudentId(studentId);
  const errors = {};
  if (!first) errors.firstName = 'Type your first name.';
  if (!last) errors.lastName = 'Type your last name.';
  if (!String(studentId).trim()) errors.studentId = 'Type your student ID.';
  else if (!id) errors.studentId = 'A DISD student ID is 7 digits.';
  return {
    ok: Object.keys(errors).length === 0,
    errors,
    value: { firstName: first, lastName: last, studentId: id || '' },
  };
}

/**
 * Whether to show the one-time step.
 *
 * Asked: an approved, non-coach account that hasn't answered, once the
 * status has loaded and the database has the 0025 functions. Not asked: a
 * coach, anyone still waiting for approval, an account the coach already
 * linked to a row that has a student ID, or a database without 0025 (the
 * old "Join the roster" in the account menu still works there).
 */
export function shouldAskWhoAreYou({ configured, account, link }) {
  if (!configured || !account || account.loading) return false;
  if (!account.isApproved || account.isCoach) return false;
  if (!link || link.status !== 'ready' || !link.available) return false;
  if (link.answered) return false;
  if (link.playerId && link.studentId) return false;
  return true;
}

/** What the member reads after answering. */
export function linkOutcomeMessage(outcome) {
  switch (outcome) {
    case 'matched':
      return "Thanks! You're linked to your spot on the club roster.";
    case 'updated':
    case 'created':
      return "Thanks! You're on the club roster.";
    case 'clash':
      return "Thanks! You're in. The coach will check your student ID.";
    default:
      return 'Thanks! Saved.';
  }
}

/**
 * The coach's view of accounts and roster rows.
 *
 * @param players   roster rows (active only), each { playerId, userId, name }
 * @param privateById { [playerId]: { studentId } } from player_private
 * @param accounts  [{ userId, email, displayName, role, status }] (coach_list_accounts)
 * @param links     [{ userId, firstName, lastName, studentId, playerId, outcome, resolvedAt }]
 *
 * Returns four lists:
 *   linked             rows with an account
 *   unlinkedAccounts   approved member accounts with no roster row
 *   rowsWithoutAccount roster rows nobody has signed in as yet
 *   needsAttention     answers the database could not settle on its own
 *                      (a clash), still open
 */
export function buildLinkOverview({ players = [], privateById = {}, accounts = [], links = [] } = {}) {
  const accountById = new Map(accounts.map((a) => [a.userId, a]));
  const linkById = new Map(links.map((l) => [l.userId, l]));
  const rowByUser = new Map(players.filter((p) => p.userId).map((p) => [p.userId, p]));
  const studentIdOf = (playerId) => privateById[playerId]?.studentId || '';
  const byName = (a, b) => String(a.sortName).localeCompare(String(b.sortName));

  const linked = players
    .filter((p) => p.userId)
    .map((player) => {
      const account = accountById.get(player.userId) || null;
      const link = linkById.get(player.userId) || null;
      const studentId = studentIdOf(player.playerId);
      return {
        player,
        account,
        link,
        studentId,
        isCoach: account ? account.role === 'coach' || account.role === 'admin' : false,
        // What they typed is not what the roster row says (wrong ID, or a clash).
        typedDifferent: !!(link && link.studentId && studentId && link.studentId !== studentId),
        sortName: player.name,
      };
    })
    .sort(byName);

  const unlinkedAccounts = accounts
    .filter((a) => a.status === 'approved' && a.role !== 'coach' && a.role !== 'admin')
    .filter((a) => !rowByUser.has(a.userId))
    .map((account) => {
      const link = linkById.get(account.userId) || null;
      const typedName = link ? `${link.firstName} ${link.lastName}`.trim() : '';
      return { account, link, typedName, sortName: typedName || account.displayName || account.email || '' };
    })
    .sort(byName);

  const rowsWithoutAccount = players
    .filter((p) => !p.userId)
    .map((player) => ({ player, studentId: studentIdOf(player.playerId), sortName: player.name }))
    .sort(byName);

  const ownerOfId = new Map(
    players.filter((p) => studentIdOf(p.playerId)).map((p) => [studentIdOf(p.playerId), p]),
  );
  const needsAttention = links
    .filter((l) => l.outcome === 'clash' && !l.resolvedAt)
    .map((link) => {
      const account = accountById.get(link.userId) || null;
      const holder = ownerOfId.get(link.studentId) || null;
      const current = rowByUser.get(link.userId) || null;
      return {
        link,
        account,
        typedName: `${link.firstName} ${link.lastName}`.trim(),
        // The row that already holds the ID they typed, if it is on the roster.
        holder: holder && holder.playerId !== current?.playerId ? holder : null,
        current,
        sortName: `${link.firstName} ${link.lastName}`,
      };
    })
    .sort(byName);

  return { linked, unlinkedAccounts, rowsWithoutAccount, needsAttention };
}
