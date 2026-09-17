/*
 * Tests for the Lichess linking layer.
 *
 * Run with: node --test src/data/lichessSync.test.js
 *
 * Nothing here touches the network: every export under test takes
 * already-fetched data. The fixtures are trimmed copies of what the Lichess
 * API really returns — /api/user/<name> for the profile, and the ndjson game
 * objects /api/games/user/<name> streams — so the shapes being parsed are the
 * shapes production sees.
 *
 * What is being guarded: a rating quietly moving between time controls, or a
 * game id that changes between syncs. Neither throws. Both corrupt a member's
 * record silently, which is why they are asserted rather than eyeballed.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { lichessRatingRows, toArchiveRecords, summariseSync } from './lichessSync.js';
import { normalizeLichessGame, fetchLichessProfile } from './externalChess.js';

// -- fixtures -------------------------------------------------------------

/** A real-shaped /api/user response. Every perf carries rating, rd, games, prov. */
const PROFILE = {
  id: 'clubmember',
  username: 'ClubMember',
  url: 'https://lichess.org/@/ClubMember',
  perfs: {
    bullet: { games: 412, rating: 1730, rd: 45, prog: 12 },
    blitz: { games: 1284, rating: 1642, rd: 38, prog: -7 },
    rapid: { games: 96, rating: 1588, rd: 62, prog: 20 },
    classical: { games: 7, rating: 1502, rd: 140, prog: 0, prov: true },
    correspondence: { games: 3, rating: 1495, rd: 180, prog: 0, prov: true },
    puzzle: { games: 2310, rating: 2044, rd: 61, prog: 5 },
    // Perfs the club does not track. Present on real accounts; must not be
    // folded into a neighbouring time control.
    ultraBullet: { games: 30, rating: 1400, rd: 90, prog: 0 },
    atomic: { games: 11, rating: 1350, rd: 110, prog: 0, prov: true },
    // Never played: Lichess still reports its placeholder 1500 here.
    storm: { games: 0, rating: 1500, rd: 500, prog: 0, prov: true },
  },
};

/** The same account with most perfs simply absent, as a new player's is. */
const SPARSE_PROFILE = {
  id: 'newbie',
  username: 'Newbie',
  perfs: {
    blitz: { games: 4, rating: 1476, rd: 190, prog: -24, prov: true },
  },
};

const RAW_GAMES = [
  {
    id: 'aB3dEfGh',
    rated: true,
    variant: 'standard',
    perf: 'blitz',
    createdAt: 1726300000000,
    lastMoveAt: 1726300600000,
    status: 'resign',
    winner: 'white',
    players: {
      white: { user: { name: 'ClubMember', id: 'clubmember' }, rating: 1640 },
      black: { user: { name: 'Rival', id: 'rival' }, rating: 1655, provisional: true },
    },
    moves: 'e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6',
    pgn: '[Event "Rated Blitz game"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 1-0',
  },
  {
    id: 'zZ9yXwVu',
    rated: true,
    variant: 'standard',
    perf: 'rapid',
    createdAt: 1726200000000,
    lastMoveAt: 1726201800000,
    status: 'stalemate',
    players: {
      white: { user: { name: 'Other', id: 'other' }, rating: 1600 },
      black: { user: { name: 'ClubMember', id: 'clubmember' }, rating: 1588 },
    },
    moves: 'd4 d5 c4 e6',
    pgn: '[Event "Rated Rapid game"]\n\n1. d4 d5 2. c4 e6 1/2-1/2',
  },
];

const GAMES = RAW_GAMES.map((g) => normalizeLichessGame(g, 'ClubMember'));

const rowFor = (rows, timeControl) => rows.find((r) => r.time_control === timeControl);

// -- ratings: one row per time control ------------------------------------

test('every supported perf becomes its own row, with rd and games carried through', () => {
  const rows = lichessRatingRows('p-1', PROFILE, { fetchedAt: '2026-09-17T10:00:00.000Z' });

  assert.equal(rows.length, 6, 'bullet, blitz, rapid, classical, daily, puzzles');

  assert.deepEqual(
    rows.map((r) => r.time_control),
    ['bullet', 'blitz', 'rapid', 'classical', 'daily', 'puzzles'],
  );

  assert.deepEqual(rowFor(rows, 'blitz'), {
    player_id: 'p-1',
    platform: 'lichess',
    time_control: 'blitz',
    rating: 1642,
    rd: 38,
    games: 1284,
    provisional: false,
    fetched_at: '2026-09-17T10:00:00.000Z',
  });

  assert.equal(rowFor(rows, 'bullet').rd, 45, 'bullet rd survives');
  assert.equal(rowFor(rows, 'bullet').games, 412, 'bullet game count survives');
  assert.equal(rowFor(rows, 'rapid').rd, 62, 'rapid rd survives');
  assert.equal(rowFor(rows, 'rapid').games, 96, 'rapid game count survives');
  assert.ok(rows.every((r) => r.platform === 'lichess'), 'every row is tagged lichess');
  assert.ok(rows.every((r) => r.player_id === 'p-1'), 'every row belongs to the player');
});

test('correspondence is stored as daily and puzzle as puzzles', () => {
  const rows = lichessRatingRows('p-1', PROFILE);
  assert.equal(rowFor(rows, 'daily').rating, 1495, 'correspondence maps to daily');
  assert.equal(rowFor(rows, 'puzzles').rating, 2044, 'puzzle maps to puzzles');
  assert.equal(rowFor(rows, 'correspondence'), undefined, 'no raw perf name leaks through');
  assert.equal(rowFor(rows, 'puzzle'), undefined, 'no raw perf name leaks through');
});

test('provisional perfs are flagged, established ones are not', () => {
  const rows = lichessRatingRows('p-1', PROFILE);
  assert.equal(rowFor(rows, 'classical').provisional, true, 'prov: true is carried');
  assert.equal(rowFor(rows, 'daily').provisional, true);
  assert.equal(rowFor(rows, 'blitz').provisional, false, 'an established perf is not provisional');
  assert.equal(rowFor(rows, 'bullet').provisional, false);
  assert.ok(
    rows.every((r) => typeof r.provisional === 'boolean'),
    'provisional is always a real boolean, never undefined',
  );
});

test('a missing perf produces no row at all, not a null rating', () => {
  const rows = lichessRatingRows('p-2', SPARSE_PROFILE);

  assert.equal(rows.length, 1, 'only the one perf this account has');
  assert.equal(rows[0].time_control, 'blitz');
  assert.equal(rows[0].rating, 1476);
  assert.equal(rows[0].provisional, true);

  for (const missing of ['bullet', 'rapid', 'classical', 'daily', 'puzzles']) {
    assert.equal(rowFor(rows, missing), undefined, `${missing} is absent, not null`);
  }
  assert.ok(
    rows.every((r) => r.rating != null),
    'no row is ever written with a null rating',
  );
});

test('untracked and unplayed perfs are dropped, never folded into another time control', () => {
  const rows = lichessRatingRows('p-1', PROFILE);

  // ultraBullet 1400 must not touch the bullet row, and atomic must not appear.
  assert.equal(rowFor(rows, 'bullet').rating, 1730, 'bullet is the bullet perf alone');
  assert.equal(rowFor(rows, 'bullet').games, 412, 'ultraBullet games are not added in');
  assert.equal(rowFor(rows, 'ultrabullet'), undefined);
  assert.equal(rowFor(rows, 'atomic'), undefined);
  assert.equal(rowFor(rows, 'storm'), undefined, 'a 0-game placeholder is not a rating');

  // Nothing anywhere is an average of two perfs.
  const ratings = rows.map((r) => r.rating);
  assert.deepEqual(ratings, [1730, 1642, 1588, 1502, 1495, 2044], 'raw numbers, untouched');
  const total = 1730 + 1642 + 1588 + 1502 + 1495 + 2044;
  assert.ok(!ratings.includes(Math.round(total / 6)), 'no blended average is stored');
});

test('rating rows need a player and survive a junk profile', () => {
  assert.deepEqual(lichessRatingRows('', PROFILE), [], 'no player id, no rows');
  assert.deepEqual(lichessRatingRows('p-1', null), []);
  assert.deepEqual(lichessRatingRows('p-1', {}), []);
  assert.deepEqual(lichessRatingRows('p-1', { perfs: {} }), []);
});

/*
 * The other profile shape.
 *
 * lichessRatingRows also accepts the flat profile fetchLichessProfile returns,
 * and that function writes an explicit `null` for every perf the account has
 * not played. `Number(null)` is 0, so the obvious implementation turns "no
 * bullet rating" into "rated 0" — a finite, plausible-looking number that
 * passes every downstream check and lands in player_platform_ratings as a
 * child's bullet rating. These two tests exist to keep that from coming back.
 */
test('a null rating in the flat profile shape is absent, never a rating of 0', () => {
  const rows = lichessRatingRows(
    'p-3',
    {
      platform: 'lichess',
      username: 'Newbie',
      ratings: { bullet: null, blitz: 1476, rapid: null, classical: null, daily: null, puzzles: null },
    },
    { fetchedAt: '2026-09-17T10:00:00.000Z' },
  );

  assert.deepEqual(rows.map((r) => r.time_control), ['blitz'], 'only the perf that has a number');
  assert.equal(rows[0].rating, 1476);
  assert.ok(
    rows.every((r) => Number.isFinite(r.rating) && r.rating > 0),
    'no row is ever written with a rating of 0',
  );
});

test('the flat shape really is what fetchLichessProfile hands back', async (t) => {
  // No network: the API payload is stubbed. The point is that the two modules
  // are checked against each other rather than against a hand-copied fixture,
  // because this seam is exactly where a null rating turns into a 0.
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      id: 'newbie',
      username: 'Newbie',
      perfs: {
        blitz: { games: 4, rating: 1476, rd: 190, prov: true },
        bullet: { games: 0, rating: 1500, rd: 500, prov: true },
      },
    }),
  });
  t.after(() => {
    globalThis.fetch = realFetch;
  });

  const profile = await fetchLichessProfile('Newbie');
  assert.equal(profile.ratings.bullet, null, 'an unplayed perf comes back null, not 1500');

  const rows = lichessRatingRows('p-4', profile);
  assert.deepEqual(rows.map((r) => r.time_control), ['blitz']);
  assert.equal(rows[0].rating, 1476);
});

test('a perf whose rating is null or junk produces no row', () => {
  const junk = {
    perfs: {
      bullet: { games: 40, rating: null, rd: 60 },
      blitz: { games: 40, rating: '', rd: 60 },
      rapid: { games: 40, rating: 'unrated', rd: 60 },
      classical: { games: 40, rating: 1502, rd: 80 },
    },
  };
  const rows = lichessRatingRows('p-5', junk);
  assert.deepEqual(rows.map((r) => r.time_control), ['classical'], 'only the real number survives');
  assert.equal(rows[0].rating, 1502);
});

test('rd and games are integers, because the columns are', () => {
  const rows = lichessRatingRows('p-6', {
    perfs: { blitz: { games: 40.6, rating: 1642.4, rd: 38.7 } },
  });
  assert.deepEqual(
    { rating: rows[0].rating, rd: rows[0].rd, games: rows[0].games },
    { rating: 1642, rd: 39, games: 41 },
  );
});

test('two syncs of the same profile produce identical rows for the same stamp', () => {
  const a = lichessRatingRows('p-1', PROFILE, { fetchedAt: '2026-09-17T10:00:00.000Z' });
  const b = lichessRatingRows('p-1', PROFILE, { fetchedAt: '2026-09-17T10:00:00.000Z' });
  assert.deepEqual(a, b);
});

// -- archive records ------------------------------------------------------

test('normalised games become archive records the club store accepts', () => {
  const records = toArchiveRecords('p-1', GAMES);

  assert.equal(records.length, 2);
  assert.deepEqual(records[0], {
    id: 'lichess:aB3dEfGh',
    playedAt: new Date(1726300600000).toISOString(),
    whitePlayerId: 'p-1',
    blackPlayerId: '',
    whiteName: 'ClubMember',
    blackName: 'Rival',
    result: '1-0',
    reason: 'Resignation',
    moveCount: 8,
    mode: 'lichess',
    computerElo: null,
    pgn: RAW_GAMES[0].pgn,
  });

  assert.equal(records[1].blackPlayerId, 'p-1', 'the member played black in the second game');
  assert.equal(records[1].whitePlayerId, '', 'an online opponent never gets a club player id');
  assert.equal(records[1].result, '1/2-1/2');
  assert.equal(records[1].reason, 'Stalemate');
  assert.ok(records.every((r) => r.mode === 'lichess'), 'mode marks where the game came from');
});

test('ids are prefixed and stable, so re-syncing cannot duplicate a game', () => {
  const first = toArchiveRecords('p-1', GAMES);
  const again = toArchiveRecords('p-1', GAMES);

  assert.deepEqual(
    first.map((r) => r.id),
    ['lichess:aB3dEfGh', 'lichess:zZ9yXwVu'],
  );
  assert.ok(first.every((r) => r.id.startsWith('lichess:')), 'every id is namespaced');
  assert.deepEqual(
    first.map((r) => r.id),
    again.map((r) => r.id),
    'the same game yields the same id every sync',
  );

  // The same game arriving twice in one batch is filed once.
  const doubled = toArchiveRecords('p-1', [...GAMES, GAMES[0]]);
  assert.equal(doubled.length, 2, 'a repeated game does not become a second record');
});

test('archive records skip anything without a usable id or from another site', () => {
  const mixed = toArchiveRecords('p-1', [
    GAMES[0],
    null,
    { platform: 'chesscom', externalId: 'chesscom:abc', color: 'white' },
    { color: 'white' },
  ]);
  assert.equal(mixed.length, 1, 'only the real Lichess game survives');
  assert.equal(mixed[0].id, 'lichess:aB3dEfGh');
  assert.deepEqual(toArchiveRecords('p-1', null), [], 'a non-array is not an error');
  assert.deepEqual(toArchiveRecords('p-1', []), []);
});

// -- summary --------------------------------------------------------------

test('summariseSync reports the platform, username, count and unmerged ratings', () => {
  const summary = summariseSync(PROFILE, GAMES);

  assert.equal(summary.platform, 'lichess');
  assert.equal(summary.username, 'ClubMember');
  assert.equal(summary.imported, 2);
  assert.deepEqual(Object.keys(summary.ratings), [
    'bullet',
    'blitz',
    'rapid',
    'classical',
    'daily',
    'puzzles',
  ]);
  assert.deepEqual(summary.ratings.blitz, {
    rating: 1642,
    rd: 38,
    games: 1284,
    provisional: false,
  });
  assert.equal(summary.ratings.classical.provisional, true);
  assert.equal(summary.ratings.storm, undefined, 'unplayed perfs stay out of the summary too');
});

test('summariseSync copes with an empty sync', () => {
  const summary = summariseSync(SPARSE_PROFILE, []);
  assert.equal(summary.imported, 0);
  assert.equal(summary.username, 'Newbie');
  assert.deepEqual(Object.keys(summary.ratings), ['blitz']);
  assert.deepEqual(summariseSync(null, null), {
    platform: 'lichess',
    username: '',
    imported: 0,
    ratings: {},
  });
});
