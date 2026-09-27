/*
 * availabilityPoll.js — "can you come on the 24th?", answered per event.
 *
 * Pure logic, no React or Supabase. Each member gives one answer per event —
 * yes, maybe or no — plus an optional transport note ("needs the bus",
 * "parent drives"). The coach needs two things from the result: the counts,
 * because the Dallas ISD caps and the 6-student stipend floor depend on them,
 * and the list of who hasn't answered, because that is who to ask at the
 * next Tuesday meeting.
 *
 * Only players on the current roster are counted. A retired member's old
 * answer stays in the table but must not inflate the yes count.
 */

export const POLL_ANSWERS = ['yes', 'maybe', 'no'];

export const ANSWER_LABEL = { yes: 'Yes', maybe: 'Maybe', no: 'No' };

export const TRANSPORT_NOTE_MAX = 200;

/** 'Yes', ' y ', 'MAYBE' → canonical answer; anything else → null. */
export function normaliseAnswer(input) {
  const value = String(input ?? '').trim().toLowerCase();
  if (value === 'y') return 'yes';
  if (value === 'n') return 'no';
  if (value === 'm' || value === '?') return 'maybe';
  return POLL_ANSWERS.includes(value) ? value : null;
}

/** Collapse whitespace and cap the length; an empty note is stored as ''. */
export function cleanTransportNote(note) {
  return String(note ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, TRANSPORT_NOTE_MAX);
}

/** Check one answer before it is saved. Returns `{ ok, errors }`. */
export function validateAvailability({ eventId, playerId, answer, transportNote } = {}) {
  const errors = [];
  if (!eventId) errors.push('No event chosen.');
  if (!playerId) errors.push('No player chosen.');
  if (!normaliseAnswer(answer)) errors.push('Answer yes, maybe or no.');
  if (String(transportNote ?? '').trim().length > TRANSPORT_NOTE_MAX) {
    errors.push(`Keep the transport note under ${TRANSPORT_NOTE_MAX} characters.`);
  }
  return { ok: errors.length === 0, errors };
}

/** This event's answers, keyed by player id. The latest answer wins. */
export function answersForEvent(rows, eventId) {
  const out = new Map();
  for (const row of rows || []) {
    if (!row || row.eventId !== eventId || !normaliseAnswer(row.answer)) continue;
    const prior = out.get(row.playerId);
    if (!prior || String(row.answeredAt || '') >= String(prior.answeredAt || '')) out.set(row.playerId, row);
  }
  return out;
}

/**
 * The poll as the coach reads it.
 *
 * Returns `{ total, answeredCount, counts, byAnswer, unanswered, notes }`:
 *   counts     — { yes, maybe, no } over current roster members only
 *   byAnswer   — the players behind each count, in roster order
 *   unanswered — roster members with no answer yet
 *   notes      — every non-empty transport note, with its player and answer
 */
export function summarisePoll(players, rows, eventId) {
  const answers = answersForEvent(rows, eventId);
  const counts = { yes: 0, maybe: 0, no: 0 };
  const byAnswer = { yes: [], maybe: [], no: [] };
  const unanswered = [];
  const notes = [];

  for (const player of players || []) {
    if (!player?.playerId) continue;
    const row = answers.get(player.playerId);
    if (!row) {
      unanswered.push(player);
      continue;
    }
    const answer = normaliseAnswer(row.answer);
    counts[answer] += 1;
    byAnswer[answer].push(player);
    const note = cleanTransportNote(row.transportNote);
    if (note) notes.push({ player, answer, note });
  }

  const total = counts.yes + counts.maybe + counts.no + unanswered.length;
  return { total, answeredCount: total - unanswered.length, counts, byAnswer, unanswered, notes };
}

/** The ids who said yes (and, optionally, maybe) — the registration helper's pool. */
export function willingPlayerIds(rows, eventId, { includeMaybe = false } = {}) {
  const out = [];
  for (const [playerId, row] of answersForEvent(rows, eventId)) {
    const answer = normaliseAnswer(row.answer);
    if (answer === 'yes' || (includeMaybe && answer === 'maybe')) out.push(playerId);
  }
  return out;
}
