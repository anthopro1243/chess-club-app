/*
 * swiss.js — club Swiss pairings, following the US Chess basics (D4, F076).
 *
 * Not a tournament-director suite: the district runs the real event, and
 * mature TD software exists. This pairs a Tuesday mock round the way a US
 * Chess TD would pair it by hand, so the club rehearses the real format.
 *
 * WHAT IT DOES, IN THE ORDER THE RULEBOOK PRIORITISES IT
 *
 *   1. No rematches, ever (27A1). Anyone a player has been PAIRED with before,
 *      forfeits included, is off the table. If no pairing of the round avoids
 *      a rematch, the answer is { ok: false, error: 'impossible' } — the
 *      engine never quietly repeats a game to get out of a corner.
 *   2. Score groups (27A2, 29A). Players are ranked by score, then seed.
 *      Each group pairs inside itself; an odd player drops to the next group
 *      and meets its highest-ranked player (29D1).
 *   3. Top half against bottom half (29C1): in a group of 8, 1–5, 2–6, 3–7,
 *      4–8.
 *   4. Colours (29E): equalise first, then alternate. A player never gets the
 *      same colour three times running, nor a colour difference past ±2,
 *      unless the only alternative is a rematch (then it is allowed and a
 *      warning says so). Inside that, the pairing prefers opponents that keep
 *      both players within ±1, but only by the US Chess colour adjustments:
 *      a transposition inside the bottom half within 200 rating points
 *      (29E5, the "200-point rule") or an interchange across the halves
 *      within 80 (the "80-point rule"). Colour never justifies a bigger
 *      jump than that — that would trade a fair opponent for a colour.
 *   5. The bye (28L2): an odd field gives a full-point bye to the lowest-
 *      ranked player in the lowest score group who has not already had a
 *      point without playing (a full bye or a forfeit win). If the pairing
 *      only works with the bye elsewhere, the next candidate up gets it.
 *
 * HOW
 *
 * A depth-first search that always pairs the top remaining player and tries
 * opponents in rulebook order (group bottom half, then group top half, then
 * lower groups), with colour-driven reordering only inside the windows above.
 * Because the top player is always paired first, the first complete pairing
 * found IS the rulebook's preferred one; backtracking only happens when a
 * choice made higher up leaves the players below with no legal pairing,
 * which is exactly when a TD would go back and adjust. Failed sub-problems
 * are memoised by the set of players left, and each node checks that every
 * remaining player still has someone legal to play, so an impossible round
 * fails fast instead of exploring every permutation.
 *
 * WHAT IS DELIBERATELY SIMPLER THAN THE RULEBOOK
 *
 *   - The "odd player" is found by the search rather than by 29D's full
 *     list of considerations (e.g. not dropping the same player twice).
 *   - Round-1 colour is the option `initialColour` (default White for the
 *     top seed) rather than a coin toss, so a round can be re-paired and
 *     come out identical. The coach can swap afterwards.
 *   - Unrated players seed last (seeding.js), so on an odd first round the
 *     bye goes to the lowest-seeded, possibly unrated, player. The coach can
 *     move it with a swap.
 *
 * Pure: no React, no Supabase.
 */

import { outcomeFor, isByeRow, isGameRow, isFinished, pairedRounds, BYE_TYPES } from './results.js';
import { compareSeeds } from './seeding.js';

export const SWISS_DEFAULTS = Object.freeze({
  initialColour: 'w',
  transpositionLimit: 200,
  interchangeLimit: 80,
  // Per search. A club field pairs in a few hundred nodes; this only exists
  // so a pathological round returns an answer instead of hanging the page.
  maxNodes: 20000,
});

/** Whether an entrant is in the event for a given round (withdrawals and late entries). */
export function isActive(entrant, round) {
  if (!entrant) return false;
  if (entrant.withdrawnFromRound != null && round >= entrant.withdrawnFromRound) return false;
  if (entrant.lateEntryRound != null && round < entrant.lateEntryRound) return false;
  return true;
}

/**
 * Each entrant's state going into `round`: score, colour history, everyone
 * they have been paired with, and whether they have had a point without
 * playing.
 */
export function playerStates(entrants, rows, round) {
  const states = new Map();
  for (const e of entrants || []) {
    states.set(e.playerId, {
      playerId: e.playerId,
      name: e.name || e.playerId,
      rating: e.rating ?? null,
      score: 0,
      colours: [],
      colourByRound: new Map(),
      opponents: new Set(),
      unplayedPoint: false,
      fullByes: 0,
    });
  }
  const earlier = (rows || []).filter((row) => row.round < round).sort((a, b) => a.round - b.round);
  for (const row of earlier) {
    for (const id of [row.white, row.black]) {
      const state = states.get(id);
      if (!state) continue;
      const o = outcomeFor(row, id);
      if (!o) continue;
      state.score += o.points ?? 0;
      if (o.opponent) state.opponents.add(o.opponent);
      if (o.played) {
        state.colours.push(o.colour);
        state.colourByRound.set(o.round, o.colour);
      }
      if (o.kind === 'full-bye') state.fullByes += 1;
      if (o.kind === 'full-bye' || o.kind === 'forfeit-win') state.unplayedPoint = true;
    }
  }
  return states;
}

/**
 * The colour a player is due and how badly (29E).
 *   3 — absolute: the other colour would be a third in a row, or push the
 *       difference past ±2.
 *   2 — equalisation: one more of one colour than the other.
 *   1 — alternation: balanced, so alternate from the last game.
 *   0 — no history (first game, or only byes and forfeits so far).
 */
export function colourDue(colours) {
  const seq = colours || [];
  if (!seq.length) return { want: null, strength: 0 };
  const diff = seq.filter((c) => c === 'w').length - seq.filter((c) => c === 'b').length;
  const last = seq[seq.length - 1];
  const other = last === 'w' ? 'b' : 'w';
  const twoSame = seq.length >= 2 && seq[seq.length - 2] === last;
  if (diff >= 2) return { want: 'b', strength: 3 };
  if (diff <= -2) return { want: 'w', strength: 3 };
  if (twoSame) return { want: other, strength: 3 };
  if (diff === 1) return { want: 'b', strength: 2 };
  if (diff === -1) return { want: 'w', strength: 2 };
  return { want: other, strength: 1 };
}

/**
 * Who gets White between a and b (states), and what it costs.
 * Returns { white, black, penalty } with white/black null when neither player
 * has any colour history — the board number decides those (round-1 rule).
 * `penalty` is the strength of the preference that had to be refused.
 */
export function allocateColours(a, b, rankOf) {
  const da = colourDue(a.colours);
  const db = colourDue(b.colours);
  if (!da.want && !db.want) return { white: null, black: null, penalty: 0 };
  if (da.want && db.want && da.want === db.want) {
    let winner = null;
    if (da.strength !== db.strength) winner = da.strength > db.strength ? a : b;
    if (!winner) {
      // 29E3-style: go back to the latest round in which they had different
      // colours and alternate from it.
      const rounds = [...new Set([...a.colourByRound.keys(), ...b.colourByRound.keys()])].sort((x, y) => y - x);
      for (const r of rounds) {
        const ca = a.colourByRound.get(r);
        const cb = b.colourByRound.get(r);
        if (ca && cb && ca !== cb) {
          winner = ca !== da.want ? a : b;
          break;
        }
      }
    }
    // Still level: the higher-ranked player gets their due colour.
    if (!winner) winner = rankOf(a) <= rankOf(b) ? a : b;
    const loser = winner === a ? b : a;
    const white = da.want === 'w' ? winner : loser;
    return {
      white,
      black: white === a ? b : a,
      penalty: (loser === a ? da : db).strength,
    };
  }
  const white = da.want ? (da.want === 'w' ? a : b) : db.want === 'w' ? b : a;
  return { white, black: white === a ? b : a, penalty: 0 };
}

function fail(error, message, extra = {}) {
  return { ok: false, error, message, ...extra };
}

function compareForPairing(a, b) {
  if (a.score !== b.score) return b.score - a.score;
  return compareSeeds(a, b);
}

// ---------------------------------------------------------------------------
// bitsets: the "does everyone left still have a legal opponent" check runs at
// every search node, so it is word-wise rather than a nested loop over ids.

function newMask(n) {
  return new Uint32Array(Math.max(1, Math.ceil(n / 32)));
}
function setBit(mask, i) {
  mask[i >>> 5] |= 1 << (i & 31);
}
function intersects(a, b) {
  for (let w = 0; w < a.length; w += 1) if (a[w] & b[w]) return true;
  return false;
}

/**
 * Opponents for p (the top remaining player) in rulebook order, restricted to
 * legal ones. See the header, points 2–4.
 */
function candidatesFor(p, remaining, ctx) {
  const { players, elig } = ctx;
  const me = players[p];
  const group = remaining.filter((i) => players[i].score === me.score);
  const k = group.length;
  const h = Math.floor(k / 2);
  const inGroup = [];
  for (let j = Math.max(h, 1); j < k; j += 1) inGroup.push({ idx: group[j], half: 'bottom' });
  for (let j = h - 1; j >= 1; j -= 1) inGroup.push({ idx: group[j], half: 'top' });
  const lower = remaining
    .filter((i) => players[i].score < me.score)
    .map((idx) => ({ idx, half: 'lower' }));

  const legal = (c) => elig[p][c.idx >>> 5] & (1 << (c.idx & 31));
  return [...colourOrder(p, inGroup.filter(legal), ctx), ...colourOrder(p, lower.filter(legal), ctx)];
}

/*
 * Colour adjustment inside the US Chess windows. The first legal candidate
 * is the natural one; any candidate close enough in rating to it may jump
 * ahead if it gives a better colour outcome. Everything outside the window
 * keeps natural order behind.
 */
function colourOrder(p, list, ctx) {
  if (list.length < 2) return list.map((c) => c.idx);
  const { players, penalty, transpositionLimit, interchangeLimit } = ctx;
  const anchor = list[0];
  const anchorRating = players[anchor.idx].rating ?? 0;
  const anchorScore = players[anchor.idx].score;
  const inside = [];
  const outside = [];
  list.forEach((c, n) => {
    const limit = c.half === 'top' ? interchangeLimit : transpositionLimit;
    const sameLevel = players[c.idx].score === anchorScore;
    const close = Math.abs((players[c.idx].rating ?? 0) - anchorRating) <= limit;
    if (sameLevel && close) inside.push({ idx: c.idx, n, pen: penalty[p][c.idx] });
    else outside.push(c.idx);
  });
  inside.sort((x, y) => x.pen - y.pen || x.n - y.n);
  return [...inside.map((c) => c.idx), ...outside];
}

function searchPairs(order, ctx) {
  const failed = new Set();
  let nodes = 0;
  const walk = (remaining) => {
    if (!remaining.length) return [];
    const key = remaining.join(',');
    if (failed.has(key)) return null;
    nodes += 1;
    if (nodes > ctx.maxNodes) {
      ctx.budgetHit = true;
      return null;
    }
    const rem = newMask(ctx.players.length);
    for (const i of remaining) setBit(rem, i);
    for (const i of remaining) {
      if (!intersects(ctx.elig[i], rem)) {
        failed.add(key);
        return null;
      }
    }
    const p = remaining[0];
    for (const q of candidatesFor(p, remaining, ctx)) {
      const sub = walk(remaining.filter((x) => x !== p && x !== q));
      if (sub) return [[p, q], ...sub];
      if (ctx.budgetHit) return null;
    }
    failed.add(key);
    return null;
  };
  return walk(order);
}

/**
 * Pair one round.
 *
 * @param {object}   args
 * @param {Array}    args.entrants  [{ playerId, name, rating, withdrawnFromRound?, lateEntryRound? }]
 * @param {Array}    args.rows      every pairing row of the event so far. Rows already in
 *                                  `round` that are half- or zero-point byes are the byes
 *                                  players asked for; those players are left out.
 * @param {number}   args.round     the round to pair: must be the next unpaired one.
 * @param {object}   [args.options] see SWISS_DEFAULTS.
 * @returns {{ ok: true, round, rows, bye, requested, warnings } | { ok: false, error, message }}
 *   `rows` are only the NEW rows (games plus any full-point bye).
 */
export function pairSwissRound({ entrants = [], rows = [], round, options = {} } = {}) {
  const opts = { ...SWISS_DEFAULTS, ...options };

  if (!Number.isInteger(round) || round < 1) {
    return fail('bad-round', 'The round to pair must be a whole number from 1 up.');
  }
  const ids = new Set();
  for (const e of entrants) {
    if (!e || !e.playerId) return fail('bad-entrant', 'Every entrant needs a player id.');
    if (ids.has(e.playerId)) return fail('duplicate-entrant', `${e.name || e.playerId} is entered twice.`);
    ids.add(e.playerId);
  }
  for (const row of rows) {
    for (const id of [row.white, row.black]) {
      if (id && !ids.has(id)) {
        return fail('unknown-player', `Round ${row.round} mentions ${id}, who is not an entrant.`);
      }
    }
  }

  const paired = pairedRounds(rows);
  if (paired.includes(round)) return fail('already-paired', `Round ${round} is already paired.`);
  const last = paired.length ? paired[paired.length - 1] : 0;
  if (round !== last + 1) {
    return fail('bad-round', `Round ${last + 1} has to be paired before round ${round}.`);
  }
  const unfinished = rows.filter((row) => row.round < round && isGameRow(row) && !isFinished(row));
  if (unfinished.length) {
    return fail(
      'previous-round-unfinished',
      `${unfinished.length} board${unfinished.length === 1 ? '' : 's'} from earlier rounds still need a result.`,
    );
  }

  const requested = new Set(
    rows
      .filter((row) => row.round === round && isByeRow(row) && BYE_TYPES.includes(row.byeType))
      .map((row) => row.white),
  );
  const states = playerStates(entrants, rows, round);
  const pool = entrants
    .filter((e) => isActive(e, round) && !requested.has(e.playerId))
    .map((e) => states.get(e.playerId))
    .sort(compareForPairing);

  if (pool.length < 2) {
    return fail('too-few-players', `Round ${round} has ${pool.length} player${pool.length === 1 ? '' : 's'} to pair; it needs at least 2.`);
  }

  const players = pool;
  const n = players.length;
  const rankOf = (s) => players.indexOf(s);
  const allocation = players.map((a) => players.map((b) => (a === b ? null : allocateColours(a, b, rankOf))));
  const penalty = allocation.map((row) => row.map((alloc) => (alloc ? alloc.penalty : 0)));

  // Pass 1 honours the absolute colour rules; pass 2 drops them, and exists
  // only so that "impossible" means "impossible without a rematch".
  const eligibility = (pass) =>
    players.map((a, i) => {
      const mask = newMask(n);
      players.forEach((b, j) => {
        if (i === j || a.opponents.has(b.playerId)) return;
        if (pass === 1 && penalty[i][j] >= 3) return;
        setBit(mask, j);
      });
      return mask;
    });

  // Bye candidates: lowest score group first, lowest seed first within it.
  const byeOrder = n % 2 ? [...players.keys()].reverse() : [null];
  const fresh = byeOrder.filter((i) => i === null || !players[i].unplayedPoint);
  const repeat = byeOrder.filter((i) => i !== null && players[i].unplayedPoint);

  let found = null;
  let budgetHit = false;
  for (const pass of [1, 2]) {
    const ctx = {
      players,
      elig: eligibility(pass),
      penalty,
      transpositionLimit: opts.transpositionLimit,
      interchangeLimit: opts.interchangeLimit,
      maxNodes: opts.maxNodes,
      budgetHit: false,
    };
    for (const byeIdx of [...fresh, ...repeat]) {
      ctx.budgetHit = false;
      const order = [...players.keys()].filter((i) => i !== byeIdx);
      const pairs = searchPairs(order, ctx);
      budgetHit = budgetHit || ctx.budgetHit;
      if (pairs) {
        found = { pairs, byeIdx, pass };
        break;
      }
    }
    if (found) break;
  }

  if (!found) {
    return budgetHit
      ? fail('search-limit', `Round ${round} could not be paired automatically in time without a rematch. Pair it by hand with swaps.`)
      : fail(
          'impossible',
          `No pairing for round ${round} avoids a rematch: too many of these players have already met. End the event, or pair a round robin instead.`,
        );
  }

  const warnings = [];
  if (found.byeIdx !== null && players[found.byeIdx].unplayedPoint) {
    warnings.push(
      `${players[found.byeIdx].name} gets another full-point bye: everyone who could take it has already had a point without playing.`,
    );
  }

  // Boards: higher score groups first, then the better-ranked player in the pair.
  const boards = found.pairs
    .map(([i, j]) => ({ i, j, top: Math.min(i, j), score: Math.max(players[i].score, players[j].score) }))
    .sort((x, y) => y.score - x.score || x.top - y.top);

  const newRows = boards.map((b, index) => {
    const board = index + 1;
    const alloc = allocation[b.i][b.j];
    let white = alloc.white;
    let black = alloc.black;
    if (!white) {
      // Neither has a colour yet: the higher-ranked player takes the event's
      // first colour on odd boards and the other one on even boards.
      const higher = players[b.top];
      const lower = players[b.top === b.i ? b.j : b.i];
      const higherWhite = (board % 2 === 1) === (opts.initialColour !== 'b');
      white = higherWhite ? higher : lower;
      black = higherWhite ? lower : higher;
    }
    if (alloc.penalty >= 3) {
      const loser = colourDue(white.colours).want === 'w' ? black : white;
      const colour = loser === white ? 'White' : 'Black';
      warnings.push(`${loser.name} gets ${colour} against the colour rules on board ${board}; every alternative was a rematch.`);
    }
    return { round, board, white: white.playerId, black: black.playerId, result: null, byeType: null };
  });

  if (found.byeIdx !== null) {
    newRows.push({ round, board: null, white: players[found.byeIdx].playerId, black: null, result: null, byeType: 'full' });
  }

  return {
    ok: true,
    round,
    rows: newRows,
    bye: found.byeIdx !== null ? players[found.byeIdx].playerId : null,
    requested: [...requested],
    warnings,
  };
}

/**
 * Check a set of rows against the invariants a pairing must keep. Used by the
 * tests and by the Events page after a manual swap, so a coach overriding the
 * engine is told what the override broke.
 *
 * Returns [{ type, round, players, message }]. Types: rematch, double-booked,
 * three-in-a-row, colour-imbalance (|W−B| > 2), second-bye.
 */
export function auditPairings(rows, nameOf = (id) => id) {
  const issues = [];
  const games = (rows || []).filter(isGameRow).sort((a, b) => a.round - b.round || (a.board ?? 0) - (b.board ?? 0));

  const met = new Map();
  for (const g of games) {
    if (!g.white || !g.black) continue;
    const key = [g.white, g.black].sort().join('|');
    if (met.has(key)) {
      issues.push({
        type: 'rematch',
        round: g.round,
        players: [g.white, g.black],
        message: `${nameOf(g.white)} and ${nameOf(g.black)} already met in round ${met.get(key)}.`,
      });
    } else {
      met.set(key, g.round);
    }
  }

  const seenInRound = new Map();
  for (const row of rows || []) {
    for (const id of [row.white, row.black]) {
      if (!id) continue;
      const key = `${row.round}|${id}`;
      if (seenInRound.has(key)) {
        issues.push({
          type: 'double-booked',
          round: row.round,
          players: [id],
          message: `${nameOf(id)} appears twice in round ${row.round}.`,
        });
      }
      seenInRound.set(key, true);
    }
  }

  const ids = new Set();
  for (const row of rows || []) {
    if (row.white) ids.add(row.white);
    if (row.black) ids.add(row.black);
  }
  for (const id of ids) {
    const played = (rows || [])
      .map((row) => outcomeFor(row, id))
      .filter((o) => o && (o.played || o.kind === 'pending') && o.colour)
      .sort((a, b) => a.round - b.round);
    let runColour = null;
    let run = 0;
    let diff = 0;
    for (const o of played) {
      run = o.colour === runColour ? run + 1 : 1;
      runColour = o.colour;
      diff += o.colour === 'w' ? 1 : -1;
      if (run === 3) {
        issues.push({
          type: 'three-in-a-row',
          round: o.round,
          players: [id],
          message: `${nameOf(id)} has ${o.colour === 'w' ? 'White' : 'Black'} three games running (round ${o.round}).`,
        });
      }
      if (Math.abs(diff) > 2) {
        issues.push({
          type: 'colour-imbalance',
          round: o.round,
          players: [id],
          message: `${nameOf(id)} is ${Math.abs(diff)} ${diff > 0 ? 'Whites' : 'Blacks'} ahead after round ${o.round}.`,
        });
      }
    }
    const fullByes = (rows || []).filter((row) => row.byeType === 'full' && row.white === id);
    if (fullByes.length > 1) {
      issues.push({
        type: 'second-bye',
        round: fullByes[1].round,
        players: [id],
        message: `${nameOf(id)} has had ${fullByes.length} full-point byes.`,
      });
    }
  }
  return issues;
}

/** The colour difference (W − B, played games only) per player — for the tests and the standings footnote. */
export function colourBalance(rows, playerId) {
  return (rows || [])
    .map((row) => outcomeFor(row, playerId))
    .filter((o) => o && o.played)
    .reduce((diff, o) => diff + (o.colour === 'w' ? 1 : -1), 0);
}
