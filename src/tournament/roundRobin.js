/*
 * roundRobin.js — all-play-all schedules for small groups (F078).
 *
 * For a beginners' group or a placement pool of 3–10, where a Swiss would
 * run out of fresh opponents in a couple of rounds. The schedule is the
 * Berger table FIDE publishes (C.05 Annex 1), generated rather than copied:
 *
 *   with N players (N even; an odd field gets a phantom N+1 who is "the bye"),
 *   round r's anchor a = ((r − 1) · N/2 mod (N − 1)) + 1 meets player N —
 *   a has White in odd rounds, N in even ones — and the other boards are
 *   (a + k) against (a − k), wrapping round 1..N−1, with a + k on White.
 *
 * That reproduces the published tables exactly (tested against the six-player
 * one) and keeps every player's colours within one of level over the event.
 *
 * With an odd field, whoever meets the phantom sits the round out. Every
 * player sits out exactly once, so the sit-out scores nothing: it is stored
 * as a zero-point bye rather than the full-point bye a Swiss uses to repair
 * an odd field, and it gives no one an edge.
 *
 * Seeds are the entrants' order as given (seeding.js sorts them); seed 1 is
 * player 1 of the table.
 *
 * Pure: no React, no Supabase.
 */

export const ROUND_ROBIN_MIN = 3;
export const ROUND_ROBIN_MAX = 10;

function wrap(x, m) {
  return ((((x - 1) % m) + m) % m) + 1;
}

/**
 * Berger pairings for `n` seats (even), as [white, black] seat numbers per round.
 * Board 1 is the game involving seat n.
 */
export function bergerTable(n) {
  if (!Number.isInteger(n) || n < 2 || n % 2) throw new Error('bergerTable needs an even number of seats');
  const m = n - 1;
  const rounds = [];
  for (let r = 1; r <= m; r += 1) {
    const a = ((r - 1) * (n / 2)) % m + 1;
    const games = [r % 2 ? [a, n] : [n, a]];
    for (let k = 1; k < n / 2; k += 1) games.push([wrap(a + k, m), wrap(a - k, m)]);
    rounds.push(games);
  }
  return rounds;
}

/**
 * The whole schedule for an entrant list.
 *
 * @param {Array} entrants [{ playerId, ... }] in seed order
 * @returns {{ ok: true, rounds: Array<{ round, rows }> } | { ok: false, error, message }}
 *   Each round's rows are in the pairing-row shape (results.js), boards
 *   numbered from 1, plus a zero-point bye row for the player sitting out.
 */
export function roundRobinSchedule(entrants) {
  const list = entrants || [];
  const ids = list.map((e) => e && e.playerId);
  if (ids.some((id) => !id)) return { ok: false, error: 'bad-entrant', message: 'Every entrant needs a player id.' };
  if (new Set(ids).size !== ids.length) {
    return { ok: false, error: 'duplicate-entrant', message: 'Someone is entered twice.' };
  }
  if (ids.length < ROUND_ROBIN_MIN) {
    return { ok: false, error: 'too-few-players', message: `A round robin needs at least ${ROUND_ROBIN_MIN} players.` };
  }
  if (ids.length > ROUND_ROBIN_MAX) {
    return {
      ok: false,
      error: 'too-many-players',
      message: `A round robin of ${ids.length} would take ${roundRobinRounds(ids.length)} rounds; use a Swiss above ${ROUND_ROBIN_MAX}.`,
    };
  }

  const seats = ids.length % 2 ? ids.length + 1 : ids.length;
  const idAt = (seat) => ids[seat - 1] ?? null; // the phantom seat has no id
  const rounds = bergerTable(seats).map((games, index) => {
    const round = index + 1;
    const rows = [];
    let board = 0;
    for (const [w, b] of games) {
      const white = idAt(w);
      const black = idAt(b);
      if (white && black) {
        board += 1;
        rows.push({ round, board, white, black, result: null, byeType: null });
      } else {
        rows.push({ round, board: null, white: white || black, black: null, result: null, byeType: 'zero' });
      }
    }
    // Byes after the games, matching how the Swiss engine returns a round.
    rows.sort((x, y) => (x.board ?? Infinity) - (y.board ?? Infinity));
    return { round, rows };
  });
  return { ok: true, rounds };
}

/** How many rounds a round robin of `count` players takes. */
export function roundRobinRounds(count) {
  if (!Number.isInteger(count) || count < 2) return 0;
  return count % 2 ? count : count - 1;
}
