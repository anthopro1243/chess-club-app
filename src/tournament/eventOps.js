/*
 * eventOps.js — the rules for running an event, separate from storing it.
 *
 * tournamentStore.js decides WHERE things are saved; this decides WHAT is
 * allowed: which round comes next, what a swap does to two seats, which
 * archive games could be the game played on a board. Kept pure so every rule
 * a coach can trip over on a Tuesday is covered by a test instead of found
 * in the room.
 *
 * Pure: no React, no Supabase.
 */

import { pairSwissRound, auditPairings } from './swiss.js';
import { roundRobinSchedule } from './roundRobin.js';
import { isByeRow, isGameRow, isFinished, GAME_RESULTS } from './results.js';

/*
 * Time-control profiles (F084). The label is what goes on the pairing sheet
 * and in the database; `clockId` is the matching preset in chessClock.js, so
 * the Play page's practice clock can default to the event's control. The
 * 45- and 90-minute controls have no preset there yet, so they set no default.
 */
export const TIME_CONTROL_PROFILES = [
  { id: 'G/30 d5', clockId: 'g30d5', note: 'Most common for scholastic Swiss events' },
  { id: 'G/25 d5', clockId: 'g25d5', note: 'Quick: fits a short club meeting' },
  { id: 'G/45 d5', clockId: null, note: '' },
  { id: 'G/60 d5', clockId: 'g60d5', note: 'Longer high-school sections' },
  { id: 'G/90 d5', clockId: null, note: '' },
];

export const DEFAULT_TIME_CONTROL = 'G/30 d5';

/** The chessClock.js preset for an event time control, or null. */
export function clockIdForTimeControl(timeControl) {
  const key = String(timeControl || '').replace(/[;\s]+/g, ' ').trim().toUpperCase();
  return TIME_CONTROL_PROFILES.find((p) => p.id.toUpperCase() === key)?.clockId ?? null;
}

/** Engine-shaped entrants (swiss.js / tiebreaks.js) from stored entrant rows. */
export function engineEntrants(entrants) {
  return (entrants || [])
    .filter((e) => e && e.playerId)
    .map((e) => ({
      playerId: e.playerId,
      name: e.name,
      rating: e.rating ?? null,
      withdrawnFromRound: e.withdrawnFromRound ?? null,
      lateEntryRound: e.lateEntryRound ?? null,
    }));
}

/** Engine-shaped rows from stored pairing rows (drops the storage-only fields). */
export function engineRows(pairings) {
  return (pairings || []).map((p) => ({
    round: p.round,
    board: p.board ?? null,
    white: p.white || null,
    black: p.black || null,
    result: p.result || null,
    byeType: p.byeType || null,
  }));
}

/** Boards and byes of one round, with how many boards still need a result. */
export function roundState(pairings, round) {
  const rows = (pairings || []).filter((p) => p.round === round);
  const games = rows.filter(isGameRow).sort((a, b) => a.board - b.board);
  const byes = rows.filter(isByeRow);
  const pending = games.filter((g) => !isFinished(g)).length;
  return { round, games, byes, pending, complete: games.length > 0 && pending === 0 };
}

/**
 * What the coach can do next. Returns { round, canPair, reason }.
 * `round` is the next round to pair (or the last round once all are paired).
 */
export function nextStep(tournament, pairings) {
  if (!tournament) return { round: null, canPair: false, reason: 'No event selected.' };
  const paired = tournament.pairedRounds || 0;
  if (tournament.status === 'finished') {
    return { round: paired, canPair: false, reason: 'The event is finished.' };
  }
  if (paired >= tournament.rounds) {
    return { round: paired, canPair: false, reason: `All ${tournament.rounds} rounds are paired.` };
  }
  if (paired > 0) {
    const { pending } = roundState(pairings, paired);
    if (pending) {
      return {
        round: paired + 1,
        canPair: false,
        reason: `Round ${paired} has ${pending} board${pending === 1 ? '' : 's'} without a result.`,
      };
    }
  }
  return { round: paired + 1, canPair: true, reason: '' };
}

/**
 * Pair the next round of an event. Returns the engine's answer with the new
 * rows (no ids yet — the store assigns them).
 */
export function pairNext({ tournament, entrants, pairings }) {
  const step = nextStep(tournament, pairings);
  if (!step.canPair) return { ok: false, error: 'cannot-pair', message: step.reason };
  const round = step.round;
  const players = engineEntrants(entrants);

  if (tournament.format === 'round-robin') {
    const schedule = roundRobinSchedule(players);
    if (!schedule.ok) return schedule;
    const planned = schedule.rounds[round - 1];
    if (!planned) return { ok: false, error: 'cannot-pair', message: `A round robin of ${players.length} has no round ${round}.` };
    return { ok: true, round, rows: planned.rows, warnings: [], bye: null };
  }

  return pairSwissRound({
    entrants: players,
    rows: engineRows(pairings),
    round,
    options: { initialColour: tournament.initialColour === 'b' ? 'b' : 'w' },
  });
}

/**
 * Swap two seats in one round (F077): the two-tap override.
 *
 * A seat is { pairingId, side } with side 'white' or 'black'. Two seats on
 * the same board swap colours; seats on different boards swap players; a
 * pairing (full-point) bye can be given to someone else by swapping its
 * holder with a seated player. A requested bye cannot be swapped — that was
 * the player's own choice, so it is cancelled instead, not moved onto someone
 * who did not ask for it. Boards that already have a result are locked:
 * change the result first, so a swap can never silently rewrite a game.
 *
 * Returns { ok, rows: [updated pairing rows], detail } or { ok: false, message }.
 */
export function swapSeats(pairings, a, b) {
  const rowA = (pairings || []).find((p) => p.id === a?.pairingId);
  const rowB = (pairings || []).find((p) => p.id === b?.pairingId);
  if (!rowA || !rowB) return { ok: false, message: 'Pick two seats from the pairing list.' };
  if (rowA.round !== rowB.round) return { ok: false, message: 'Both seats have to be in the same round.' };
  if (rowA.id === rowB.id && a.side === b.side) return { ok: false, message: 'That is the same seat twice.' };
  for (const [row, seat] of [[rowA, a], [rowB, b]]) {
    if (!['white', 'black'].includes(seat.side)) return { ok: false, message: 'A seat is White or Black.' };
    if (isByeRow(row) && row.byeType !== 'full') {
      return { ok: false, message: 'A requested bye is the player\'s choice. Cancel it instead of swapping it.' };
    }
    if (isByeRow(row) && seat.side !== 'white') return { ok: false, message: 'A bye has one seat.' };
    if (isGameRow(row) && row.result) return { ok: false, message: `Board ${row.board} already has a result. Clear it before swapping.` };
  }

  const who = (row, side) => row[side];
  const playerA = who(rowA, a.side);
  const playerB = who(rowB, b.side);
  if (!playerA || !playerB) return { ok: false, message: 'One of those seats is empty.' };

  let updated;
  if (rowA.id === rowB.id) {
    updated = [{ ...rowA, white: rowA.black, black: rowA.white }];
  } else {
    updated = [
      { ...rowA, [a.side]: playerB },
      { ...rowB, [b.side]: playerA },
    ];
  }
  const describe = (row, side) => (isByeRow(row) ? 'bye' : `board ${row.board} ${side}`);
  return {
    ok: true,
    rows: updated,
    detail: {
      round: rowA.round,
      a: { player: playerA, from: describe(rowA, a.side), to: describe(rowB, b.side) },
      b: { player: playerB, from: describe(rowB, b.side), to: describe(rowA, a.side) },
    },
  };
}

/**
 * What a manual change broke, restricted to one round so the coach sees the
 * consequences of THIS swap rather than a replay of old history.
 */
export function roundIssues(pairings, round, nameOf) {
  const upTo = engineRows((pairings || []).filter((p) => p.round <= round));
  return auditPairings(upTo, nameOf).filter((issue) => issue.round === round);
}

/** Accept only real result codes (or clearing). */
export function isValidResult(result) {
  return result === null || result === '' || GAME_RESULTS.includes(result);
}

/**
 * Archive games that could be the game played on a board: same White, same
 * Black. Closest to the event date first, so the Tuesday game beats a casual
 * one from last month.
 */
export function archiveCandidates(games, pairing, startsOn) {
  if (!pairing || !pairing.white || !pairing.black) return [];
  const anchor = startsOn ? Date.parse(startsOn) : NaN;
  return (games || [])
    .filter((g) => g && g.whitePlayerId === pairing.white && g.blackPlayerId === pairing.black)
    .map((g) => ({ game: g, distance: Number.isNaN(anchor) ? 0 : Math.abs(Date.parse(g.playedAt) - anchor) || 0 }))
    .sort((x, y) => x.distance - y.distance || String(y.game.playedAt).localeCompare(String(x.game.playedAt)))
    .map((x) => x.game);
}

/** The archive result that matches a board's result, or null if they disagree / either is missing. */
export function gameResultMatches(game, pairing) {
  if (!game || !pairing?.result) return null;
  const board = { '1-0': '1-0', '0-1': '0-1', '1/2-1/2': '1/2-1/2' }[pairing.result];
  if (!board) return null;
  return game.result === board;
}

/**
 * Checks on a new event before it is created. Returns a list of messages;
 * empty means go.
 */
export function validateEventDraft({ name, rounds, format, entrantCount }) {
  const problems = [];
  if (!String(name || '').trim()) problems.push('Give the event a name.');
  const r = Number(rounds);
  if (format !== 'round-robin' && (!Number.isInteger(r) || r < 1 || r > 15)) {
    problems.push('Rounds must be between 1 and 15.');
  }
  if (format === 'round-robin') {
    if (entrantCount < 3 || entrantCount > 10) problems.push('A round robin needs 3 to 10 players.');
  } else if (entrantCount < 2) {
    problems.push('Pick at least two players.');
  } else if (Number.isInteger(r)) {
    // Everyone can meet everyone at most once: n − 1 rounds, or n when the
    // field is odd and each round's bye is the one "opponent" repeated.
    const most = entrantCount % 2 ? entrantCount : entrantCount - 1;
    if (r > most) {
      problems.push(`${entrantCount} players cannot play ${r} Swiss rounds without rematches; use ${most} or fewer.`);
    }
  }
  return problems;
}

/**
 * Half-point byes for the rounds a late entrant missed, when the coach
 * grants them (US Chess leaves this to the director; the default is to
 * grant nothing, so these rows exist only if the coach ticks the box).
 */
export function lateEntryByes(playerId, lateEntryRound) {
  const rows = [];
  for (let round = 1; round < lateEntryRound; round += 1) {
    rows.push({ round, board: null, white: playerId, black: null, result: null, byeType: 'half' });
  }
  return rows;
}
