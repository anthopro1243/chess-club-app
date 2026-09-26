/*
 * results.js — what a pairing row means for the two people on it.
 *
 * Pairing, tiebreaks and the Events page all have to agree on exactly one
 * reading of a row, so it lives here and nowhere else. The shape is the one
 * the database stores (0019):
 *
 *   { round, board, white, black, result, byeType }
 *
 * A game row has a board, two players and (once it is over) a result code.
 * A bye row has NO board and NO black player: the player receiving the bye
 * sits in `white`. That is a storage convenience, not a colour — a bye never
 * counts as a game with White, which is the whole reason colourOf() below
 * returns null for it.
 *
 * Result codes follow US Chess wall-chart usage:
 *   '1-0', '0-1', '1/2-1/2'   played games
 *   '1F-0F', '0F-1F'          forfeits: a point, but no game was played
 *   '0F-0F'                   double forfeit: nobody scores, nobody played
 * The distinction matters twice: a forfeit does not count for colour
 * allocation (the players never sat down), and tiebreaks treat an unplayed
 * point differently from a won game (see tiebreaks.js).
 *
 * Pure: no React, no Supabase.
 */

export const GAME_RESULTS = ['1-0', '1/2-1/2', '0-1', '1F-0F', '0F-1F', '0F-0F'];
export const PLAYED_RESULTS = new Set(['1-0', '0-1', '1/2-1/2']);
export const FORFEIT_RESULTS = new Set(['1F-0F', '0F-1F', '0F-0F']);

export const RESULT_LABEL = {
  '1-0': '1–0',
  '0-1': '0–1',
  '1/2-1/2': '½–½',
  '1F-0F': '+ / − (forfeit)',
  '0F-1F': '− / + (forfeit)',
  '0F-0F': '− / − (double forfeit)',
};

/*
 * Bye types. 'full' is the pairing bye an odd field forces on somebody.
 * 'half' is a bye the player asked for in advance. 'zero' is for a player who
 * is still in the event but will miss a round without having asked — kept
 * separate from a withdrawal so the coach can say "back next week".
 */
export const BYE_TYPES = ['full', 'half', 'zero'];
export const BYE_POINTS = { full: 1, half: 0.5, zero: 0 };
export const BYE_LABEL = { full: 'Full-point bye', half: 'Half-point bye', zero: 'Zero-point bye' };

const POINTS = {
  '1-0': [1, 0],
  '0-1': [0, 1],
  '1/2-1/2': [0.5, 0.5],
  '1F-0F': [1, 0],
  '0F-1F': [0, 1],
  '0F-0F': [0, 0],
};

export function isByeRow(row) {
  return !!row && !!row.byeType;
}

export function isGameRow(row) {
  return !!row && !row.byeType;
}

/** A row is finished once it has a result; a bye is finished the moment it exists. */
export function isFinished(row) {
  if (!row) return false;
  if (isByeRow(row)) return BYE_TYPES.includes(row.byeType);
  return GAME_RESULTS.includes(row.result);
}

export function involves(row, playerId) {
  return !!row && !!playerId && (row.white === playerId || row.black === playerId);
}

/**
 * One player's reading of one row. Returns null if the row is not theirs.
 *
 * kind is one of: win | loss | draw | forfeit-win | forfeit-loss |
 * double-forfeit | full-bye | half-bye | zero-bye | pending.
 * `played` is true only for a game that was actually played to a result.
 * `points` is null while the game is still pending.
 */
export function outcomeFor(row, playerId) {
  if (!involves(row, playerId)) return null;
  const round = row.round;
  if (isByeRow(row)) {
    return {
      round,
      opponent: null,
      colour: null,
      points: BYE_POINTS[row.byeType] ?? 0,
      played: false,
      kind: `${row.byeType}-bye`,
    };
  }
  const isWhite = row.white === playerId;
  const opponent = isWhite ? row.black : row.white;
  const colour = isWhite ? 'w' : 'b';
  const pair = POINTS[row.result];
  if (!pair) {
    return { round, opponent, colour, points: null, played: false, kind: 'pending' };
  }
  const points = isWhite ? pair[0] : pair[1];
  if (row.result === '0F-0F') {
    return { round, opponent, colour, points: 0, played: false, kind: 'double-forfeit' };
  }
  if (FORFEIT_RESULTS.has(row.result)) {
    return { round, opponent, colour, points, played: false, kind: points ? 'forfeit-win' : 'forfeit-loss' };
  }
  return {
    round,
    opponent,
    colour,
    points,
    played: true,
    kind: points === 1 ? 'win' : points === 0 ? 'loss' : 'draw',
  };
}

/** Every outcome for one player, in round order, through `throughRound` (inclusive). */
export function historyOf(rows, playerId, throughRound = Infinity) {
  return (rows || [])
    .filter((row) => row.round <= throughRound)
    .map((row) => outcomeFor(row, playerId))
    .filter(Boolean)
    .sort((a, b) => a.round - b.round);
}

/** Total points from finished rows. Pending games add nothing yet. */
export function scoreOf(rows, playerId, throughRound = Infinity) {
  return historyOf(rows, playerId, throughRound).reduce((sum, o) => sum + (o.points ?? 0), 0);
}

/**
 * The wall-chart code for one outcome, as a US Chess crosstable prints it:
 * W12 / L3 / D7 for played games, X / F for forfeits, B / H / U for byes and
 * unplayed rounds. `numberOf` maps a player id to their pairing number.
 */
export function wallChartCode(outcome, numberOf = () => '') {
  if (!outcome) return 'U';
  const n = outcome.opponent ? numberOf(outcome.opponent) : '';
  switch (outcome.kind) {
    case 'win':
      return `W${n}`;
    case 'loss':
      return `L${n}`;
    case 'draw':
      return `D${n}`;
    case 'forfeit-win':
      return `X${n}`;
    case 'forfeit-loss':
      return `F${n}`;
    case 'double-forfeit':
      return `F${n}`;
    case 'full-bye':
      return 'B';
    case 'half-bye':
      return 'H';
    case 'zero-bye':
      return 'U';
    case 'pending':
      return `${outcome.colour === 'w' ? 'W' : 'B'}?${n}`;
    default:
      return 'U';
  }
}

/** Rounds that have at least one game or a pairing (full-point) bye in them. */
export function pairedRounds(rows) {
  const rounds = new Set();
  for (const row of rows || []) {
    if (isGameRow(row) || row.byeType === 'full') rounds.add(row.round);
  }
  return [...rounds].sort((a, b) => a - b);
}

/** Last round whose rows are all finished (0 if none). Requested byes alone don't make a round. */
export function lastCompleteRound(rows) {
  let complete = 0;
  for (const round of pairedRounds(rows)) {
    const inRound = rows.filter((row) => row.round === round);
    if (inRound.every(isFinished)) complete = round;
    else break;
  }
  return complete;
}
