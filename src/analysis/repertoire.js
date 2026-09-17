/*
 * repertoire.js — what a player ACTUALLY plays, from their own games.
 *
 * The spec defers opening repertoire on the grounds that it "needs an assigned
 * repertoire first". That is true of repertoire *adherence* — did you play what
 * your coach told you to play — but not of the thing a coach actually wants
 * first, which is the descriptive version: across 54 archived games, which
 * lines does this player keep reaching, and which of them is quietly losing?
 * Nobody has to assign anything for that; the games already say it.
 *
 * Deliberately not an ECO lookup. A club coach does not need to be told the
 * line was C50; they need to see "1.e4 e5 2.Nf3 Nc6 3.Bc4 — six games, scoring
 * 0.17" and go and look at those six games. The first N plies ARE the label.
 *
 * Pure and dependency-free: the games it takes are plain objects, so this runs
 * over rows from the database, from a PGN import, or from a test fixture.
 */

/** Plies that make up an opening line by default — four moves a side. */
export const DEFAULT_PLIES = 8;
/** Below this many games a line is an accident, not a repertoire. */
export const DEFAULT_MIN_GAMES = 2;
/** weakestLines wants more evidence before it points a coach at a problem. */
export const DEFAULT_WEAKEST_MIN_GAMES = 3;

const DRAW_RESULTS = new Set(['1/2-1/2', '½-½', '0.5-0.5', 'draw']);

/**
 * A stable label for the first N plies: "1.e4 e5 2.Nf3 Nc6".
 *
 * Truncation is by ply, not by move, so an odd cut gives "… 3.Bc4" with no
 * dangling separator — two lines that differ only in Black's fourth move still
 * share a key at plies: 7, which is the point of the parameter.
 *
 * @param {string[]} sanMoves  mainline SAN, White's first move at index 0
 * @param {number} plies
 * @returns {string} '' when there are no moves to name
 */
export function openingKey(sanMoves, plies = DEFAULT_PLIES) {
  if (!Array.isArray(sanMoves)) return '';
  const limit = Number.isFinite(plies) ? Math.max(0, Math.floor(plies)) : DEFAULT_PLIES;
  const taken = sanMoves.slice(0, limit).filter((san) => typeof san === 'string' && san.trim());

  const parts = [];
  for (let i = 0; i < taken.length; i += 1) {
    const san = taken[i].trim();
    if (i % 2 === 0) parts.push(`${i / 2 + 1}.${san}`);
    else parts.push(san);
  }
  return parts.join(' ');
}

/** 'w' | 'b' | null — which side this player had, if any. */
function sideOf(game, playerId) {
  if (!game || playerId == null) return null;
  if (game.whitePlayerId === playerId) return 'w';
  if (game.blackPlayerId === playerId) return 'b';
  return null;
}

/**
 * Points this player scored, from THEIR side: 1 win, 0.5 draw, 0 loss, or null
 * when the game has no decided result (`*`, an abandoned row, a missing tag).
 *
 * The flip for Black is the whole reason this function exists. A win as Black
 * is a win, and an aggregate that silently scores every game from White's side
 * would report a player's best opening as their worst.
 */
export function playerScore(result, side) {
  if (typeof result !== 'string') return null;
  const normalised = result.trim().toLowerCase();
  if (DRAW_RESULTS.has(normalised)) return 0.5;
  if (normalised === '1-0') return side === 'w' ? 1 : 0;
  if (normalised === '0-1') return side === 'b' ? 1 : 0;
  return null; // '*' and anything unrecognised: not counted either way
}

/**
 * What this player plays, split by colour.
 *
 * @param {Array<{whitePlayerId: *, blackPlayerId: *, result: string, sanMoves: string[]}>} games
 * @param {*} playerId
 * @param {{plies?: number, minGames?: number}} opts
 * @returns {{asWhite: Array<object>, asBlack: Array<object>}}
 *   each entry { key, games, wins, draws, losses, score } with score in 0..1
 *   as points per game, sorted by games descending.
 */
export function repertoireReport(games, playerId, opts = {}) {
  const { plies = DEFAULT_PLIES, minGames = DEFAULT_MIN_GAMES } = opts;
  const buckets = { w: new Map(), b: new Map() };

  for (const game of Array.isArray(games) ? games : []) {
    const side = sideOf(game, playerId);
    if (!side) continue; // someone else's game

    const key = openingKey(game.sanMoves, plies);
    if (!key) continue; // no moves recorded: nothing to call an opening

    const points = playerScore(game.result, side);
    if (points === null) continue; // undecided games would distort the score

    const bucket = buckets[side];
    const line = bucket.get(key) || { key, games: 0, wins: 0, draws: 0, losses: 0, score: 0 };
    line.games += 1;
    if (points === 1) line.wins += 1;
    else if (points === 0.5) line.draws += 1;
    else line.losses += 1;
    bucket.set(key, line);
  }

  return {
    asWhite: finalise(buckets.w, minGames),
    asBlack: finalise(buckets.b, minGames),
  };
}

/** Score each line, drop the one-offs, and order them for reading. */
function finalise(bucket, minGames) {
  const floor = Number.isFinite(minGames) ? minGames : DEFAULT_MIN_GAMES;
  return [...bucket.values()]
    .filter((line) => line.games >= floor)
    .map((line) => ({ ...line, score: (line.wins + line.draws * 0.5) / line.games }))
    .sort(
      (a, b) =>
        b.games - a.games || // most-played first: that is the repertoire
        a.score - b.score || // then worst-scoring, because that is the lesson
        a.key.localeCompare(b.key), // then stable, so the UI does not shuffle
    );
}

/**
 * The lines to take to the board with the player, worst first.
 *
 * Takes the output of repertoireReport rather than the games, so a caller can
 * reuse one report for the table and the coaching prompt. A higher minGames
 * than the report's own is the point: two bad games is noise, four is a habit.
 *
 * @param {{asWhite: Array<object>, asBlack: Array<object>}} report
 * @param {{minGames?: number, limit?: number}} opts
 * @returns {Array<object>} entries as in the report, each tagged with `side`
 */
export function weakestLines(report, opts = {}) {
  const { minGames = DEFAULT_WEAKEST_MIN_GAMES, limit = null } = opts;
  const sides = [
    ['w', report?.asWhite],
    ['b', report?.asBlack],
  ];

  const lines = [];
  for (const [side, entries] of sides) {
    for (const line of Array.isArray(entries) ? entries : []) {
      if (line.games >= minGames) lines.push({ ...line, side });
    }
  }

  lines.sort(
    (a, b) =>
      a.score - b.score || // worst first
      b.games - a.games || // then the one with the most evidence behind it
      a.key.localeCompare(b.key),
  );

  return limit != null ? lines.slice(0, Math.max(0, limit)) : lines;
}
