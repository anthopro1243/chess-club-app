/*
 * externalChess.js — real games and ratings from Chess.com and Lichess.
 *
 * Both sites publish an open HTTP API for public player data, both need no
 * key and no OAuth, and both send permissive CORS headers, so the browser
 * calls them directly. There is no server to host and nothing for a club to
 * maintain: a member types their username and their real games come back.
 *
 * The two APIs agree on almost nothing. Chess.com returns a whole month of
 * JSON per request and encodes the result as a per-side word ("win",
 * "resigned", "timeout"). Lichess streams newline-delimited JSON and names a
 * winning colour instead. Everything below exists to hide that: each adapter
 * returns the same normalised record, so the sync engine and the rating
 * maths never learn which site a game came from.
 *
 * Normalised game:
 *   {
 *     externalId,      'chesscom:<uuid>' | 'lichess:<id>', unique per game
 *     platform,        'chesscom' | 'lichess'
 *     playedAt,        ISO string, when the game finished
 *     timeClass,       'bullet' | 'blitz' | 'rapid' | 'classical' | 'daily'
 *     color,           'white' | 'black', the side our member played
 *     score,           1 | 0.5 | 0, from our member's side
 *     playerRating,    their platform rating for that game
 *     opponentName,
 *     opponentRating,
 *     opponentProvisional,
 *     whiteName, blackName,
 *     result,          '1-0' | '0-1' | '1/2-1/2'
 *     reason,          how it ended, in plain words
 *     moveCount,       plies, to match the club's own archive
 *     pgn, url,
 *   }
 */

const CHESSCOM_API = 'https://api.chess.com/pub';
const LICHESS_API = 'https://lichess.org/api';

export const PLATFORMS = {
  chesscom: { key: 'chesscom', label: 'Chess.com', profileUrl: (u) => `https://www.chess.com/member/${u}` },
  lichess: { key: 'lichess', label: 'Lichess', profileUrl: (u) => `https://lichess.org/@/${u}` },
};

/**
 * Thrown for anything the member can act on: a typo'd username, a rate limit.
 * `status` carries the HTTP status when there was one, so a background sweep
 * can tell "slow down" (429) from "no such user" (404) without reading prose.
 */
export class ExternalChessError extends Error {
  constructor(message, { status = null } = {}) {
    super(message);
    this.status = status;
  }
}

async function getJson(url, init) {
  let response;
  try {
    response = await fetch(url, init);
  } catch {
    throw new ExternalChessError('Could not reach the site. Check your connection and try again.');
  }
  if (response.status === 404) throw new ExternalChessError('No account with that username.', { status: 404 });
  if (response.status === 429) {
    throw new ExternalChessError('That site is asking us to slow down. Wait a minute and sync again.', { status: 429 });
  }
  if (!response.ok) {
    throw new ExternalChessError(`That site returned an error (${response.status}).`, { status: response.status });
  }
  return response;
}

/**
 * Plies in a PGN. The club's own archive stores half-moves (see PlayPage),
 * so imported games count the same way. Tag pairs, clock annotations, NAGs
 * and variations all have to come out first or they inflate the count.
 */
export function countPlies(pgn) {
  if (!pgn) return 0;
  const body = pgn
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\{[^}]*\}/g, '')
    .replace(/\([^)]*\)/g, '')
    .replace(/\$\d+/g, '');
  return body
    .split(/\s+/)
    .filter(Boolean)
    .filter((token) => !/^\d+\.+$/.test(token) && !/^(1-0|0-1|1\/2-1\/2|\*)$/.test(token)).length;
}

// -- Chess.com ------------------------------------------------------------

// Chess.com reports a result word for each side. Exactly one word means a
// win; several mean a draw; everything else is a loss.
const CHESSCOM_DRAWS = new Set([
  'agreed',
  'repetition',
  'stalemate',
  'insufficient',
  '50move',
  'timevsinsufficient',
]);

const CHESSCOM_REASONS = {
  checkmated: 'Checkmate',
  resigned: 'Resignation',
  timeout: 'Time',
  abandoned: 'Abandoned',
  agreed: 'Agreement',
  repetition: 'Repetition',
  stalemate: 'Stalemate',
  insufficient: 'Insufficient material',
  '50move': 'Fifty-move rule',
  timevsinsufficient: 'Time vs insufficient material',
};

function chesscomScore(sideResult) {
  if (sideResult === 'win') return 1;
  if (CHESSCOM_DRAWS.has(sideResult)) return 0.5;
  return 0;
}

/** A PGN result tag, from our member's score and the colour they held. */
export function resultFromScore(score, color) {
  if (score === 0.5) return '1/2-1/2';
  const playerWon = score === 1;
  const whiteWon = color === 'white' ? playerWon : !playerWon;
  return whiteWon ? '1-0' : '0-1';
}

export async function fetchChesscomProfile(username) {
  const user = username.trim().toLowerCase();
  const profile = await (await getJson(`${CHESSCOM_API}/player/${encodeURIComponent(user)}`)).json();

  let stats = {};
  try {
    stats = await (await getJson(`${CHESSCOM_API}/player/${encodeURIComponent(user)}/stats`)).json();
  } catch {
    /* a brand new account can have no stats yet; the profile is enough */
  }

  return {
    platform: 'chesscom',
    username: profile.username || user,
    displayName: profile.name || profile.username || user,
    url: profile.url || PLATFORMS.chesscom.profileUrl(user),
    ratings: {
      bullet: stats.chess_bullet?.last?.rating ?? null,
      blitz: stats.chess_blitz?.last?.rating ?? null,
      rapid: stats.chess_rapid?.last?.rating ?? null,
      daily: stats.chess_daily?.last?.rating ?? null,
      puzzles: stats.tactics?.highest?.rating ?? null,
    },
  };
}

/**
 * Chess.com splits a player's history into one endpoint per calendar month,
 * so we walk the archive list backwards from the newest month and stop as
 * soon as we have enough games or reach ones we already have.
 */
export async function fetchChesscomGames(username, { since = null, limit = 100 } = {}) {
  const user = username.trim().toLowerCase();
  const { archives } = await (
    await getJson(`${CHESSCOM_API}/player/${encodeURIComponent(user)}/games/archives`)
  ).json();
  if (!archives?.length) return [];

  const sinceMs = since ? new Date(since).getTime() : null;
  const collected = [];

  for (const monthUrl of [...archives].reverse()) {
    if (collected.length >= limit) break;

    // Archive URLs end in /YYYY/MM. A month that ended before the last game
    // we imported cannot hold anything new, so it never gets fetched.
    if (sinceMs) {
      const [year, month] = monthUrl.split('/').slice(-2).map(Number);
      const monthEnd = Date.UTC(year, month, 1);
      if (monthEnd < sinceMs) break;
    }

    const { games } = await (await getJson(monthUrl)).json();
    for (const game of games || []) {
      if (sinceMs && (game.end_time || 0) * 1000 <= sinceMs) continue;
      const normalised = normalizeChesscomGame(game, user);
      if (normalised) collected.push(normalised);
    }
  }

  return collected.slice(0, limit);
}

/**
 * One Chess.com archive entry to the shared shape. Returns null for
 * anything that should not touch a rating: unrated games, and variants.
 */
export function normalizeChesscomGame(game, username) {
  if (!game?.rated) return null;
  if (game.rules !== 'chess') return null;

  const user = username.trim().toLowerCase();
  const color = game.white?.username?.toLowerCase() === user ? 'white' : 'black';
  const me = color === 'white' ? game.white : game.black;
  const them = color === 'white' ? game.black : game.white;
  if (!me || !them) return null;

  const score = chesscomScore(me.result);
  return {
    externalId: `chesscom:${game.uuid}`,
    platform: 'chesscom',
    playedAt: new Date((game.end_time || 0) * 1000).toISOString(),
    timeClass: game.time_class || 'blitz',
    color,
    score,
    playerRating: me.rating ?? null,
    opponentName: them.username || 'Opponent',
    opponentRating: them.rating ?? null,
    opponentProvisional: false,
    whiteName: game.white?.username || 'White',
    blackName: game.black?.username || 'Black',
    result: resultFromScore(score, color),
    // Only the loser's word says how the game ended: the winner's is just
    // "win", so a win reads its reason off the other side.
    reason: CHESSCOM_REASONS[me.result === 'win' ? them.result : me.result] || '',
    moveCount: countPlies(game.pgn),
    pgn: game.pgn || '',
    url: game.url || '',
  };
}

// -- Lichess --------------------------------------------------------------

const LICHESS_PERFS = 'ultraBullet,bullet,blitz,rapid,classical,correspondence';

const LICHESS_TIME_CLASS = {
  ultraBullet: 'bullet',
  bullet: 'bullet',
  blitz: 'blitz',
  rapid: 'rapid',
  classical: 'classical',
  correspondence: 'daily',
};

const LICHESS_REASONS = {
  mate: 'Checkmate',
  resign: 'Resignation',
  outoftime: 'Time',
  timeout: 'Abandoned',
  stalemate: 'Stalemate',
  draw: 'Agreement',
  cheat: 'Cheat detected',
  noStart: 'Never started',
  variantEnd: 'Variant end',
};

export async function fetchLichessProfile(username) {
  const user = username.trim();
  const profile = await (await getJson(`${LICHESS_API}/user/${encodeURIComponent(user)}`)).json();
  if (profile.closed) throw new ExternalChessError('That Lichess account is closed.');

  const perf = (name) => (profile.perfs?.[name]?.games ? profile.perfs[name].rating : null);
  return {
    platform: 'lichess',
    username: profile.username || user,
    displayName: profile.username || user,
    url: profile.url || PLATFORMS.lichess.profileUrl(user),
    ratings: {
      bullet: perf('bullet'),
      blitz: perf('blitz'),
      rapid: perf('rapid'),
      classical: perf('classical'),
      daily: perf('correspondence'),
      puzzles: profile.perfs?.puzzle?.rating ?? null,
    },
  };
}

/**
 * Lichess streams newline-delimited JSON, one game per line, newest first.
 * `since` is epoch milliseconds and is applied server-side, so an
 * incremental sync only ever downloads what is genuinely new.
 */
export async function fetchLichessGames(username, { since = null, limit = 100 } = {}) {
  const user = username.trim();
  const params = new URLSearchParams({
    max: String(limit),
    rated: 'true',
    perfType: LICHESS_PERFS,
    pgnInJson: 'true',
    sort: 'dateDesc',
  });
  if (since) params.set('since', String(new Date(since).getTime() + 1));

  const response = await getJson(
    `${LICHESS_API}/games/user/${encodeURIComponent(user)}?${params}`,
    { headers: { Accept: 'application/x-ndjson' } },
  );
  const body = await response.text();

  const games = [];
  for (const line of body.split('\n')) {
    if (!line.trim()) continue;
    let parsed;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }
    const normalised = normalizeLichessGame(parsed, user);
    if (normalised) games.push(normalised);
  }

  return games;
}

/**
 * One Lichess game to the shared shape. Lichess names a winning colour and
 * omits it entirely for a draw, where Chess.com gives each side a word.
 */
export function normalizeLichessGame(game, username) {
  if (!game?.rated) return null;
  if (game.variant && game.variant !== 'standard') return null;

  const user = username.trim().toLowerCase();
  const whiteId = game.players?.white?.user?.id;
  const color = whiteId && whiteId.toLowerCase() === user ? 'white' : 'black';
  const me = game.players?.[color];
  const them = game.players?.[color === 'white' ? 'black' : 'white'];
  if (!me || !them) return null;

  const score = game.winner ? (game.winner === color ? 1 : 0) : 0.5;
  return {
    externalId: `lichess:${game.id}`,
    platform: 'lichess',
    playedAt: new Date(game.lastMoveAt || game.createdAt).toISOString(),
    timeClass: LICHESS_TIME_CLASS[game.perf] || 'blitz',
    color,
    score,
    playerRating: me.rating ?? null,
    opponentName: them.user?.name || 'Anonymous',
    opponentRating: them.rating ?? null,
    opponentProvisional: !!them.provisional,
    whiteName: game.players?.white?.user?.name || 'Anonymous',
    blackName: game.players?.black?.user?.name || 'Anonymous',
    result: resultFromScore(score, color),
    reason: LICHESS_REASONS[game.status] || '',
    moveCount: game.moves ? game.moves.split(' ').filter(Boolean).length : countPlies(game.pgn),
    pgn: game.pgn || '',
    url: `https://lichess.org/${game.id}`,
  };
}

// -- one entry point per platform -----------------------------------------

export function fetchProfile(platform, username) {
  if (platform === 'chesscom') return fetchChesscomProfile(username);
  if (platform === 'lichess') return fetchLichessProfile(username);
  throw new ExternalChessError(`Unknown platform: ${platform}`);
}

export function fetchGames(platform, username, options) {
  if (platform === 'chesscom') return fetchChesscomGames(username, options);
  if (platform === 'lichess') return fetchLichessGames(username, options);
  throw new ExternalChessError(`Unknown platform: ${platform}`);
}
