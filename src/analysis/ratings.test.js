import test from 'node:test';
import assert from 'node:assert/strict';
import {
  toRatingRows,
  percentileOf,
  clubRelativeIndex,
  resolveRating,
  rankForLeaderboard,
  usableAsScoringAnchor,
  DEFAULT_CLUB_BASIS,
} from './ratings.js';

/* ── storage keeps platforms and speeds apart ────────────────────────────── */

test('a profile flattens into one row per platform and time control', () => {
  const rows = toRatingRows('CC-001', 'lichess', { bullet: 1610, blitz: 1544, rapid: null, puzzles: 2100 });
  assert.equal(rows.length, 3, 'null ratings are dropped, not stored as 0');
  assert.deepEqual(
    rows.map((r) => [r.platform, r.time_control, r.rating]).sort(),
    [['lichess', 'blitz', 1544], ['lichess', 'bullet', 1610], ['lichess', 'puzzles', 2100]].sort(),
  );
  assert.ok(rows.every((r) => r.player_id === 'CC-001'));
});

test('nothing is ever averaged into a single number', () => {
  const rows = toRatingRows('CC-001', 'chesscom', { blitz: 900, rapid: 1100 });
  const ratings = rows.map((r) => r.rating).sort((a, b) => a - b);
  assert.deepEqual(ratings, [900, 1100]);
  assert.ok(!ratings.includes(1000), 'the mean of the two must never appear');
});

/* ── club-relative normalisation ─────────────────────────────────────────── */

test('percentileOf places a value within a population', () => {
  const pop = [1000, 1100, 1200, 1300, 1400];
  assert.equal(percentileOf(1200, pop), 50);
  assert.ok(percentileOf(1400, pop) > percentileOf(1000, pop));
  assert.equal(percentileOf(1200, []), null);
  assert.equal(percentileOf(null, pop), null);
});

test('club-relative index compares only like with like', () => {
  const club = [
    { playerId: 'a', platform: 'lichess', timeControl: 'blitz', rating: 1400 },
    { playerId: 'b', platform: 'lichess', timeControl: 'blitz', rating: 1600 },
    { playerId: 'c', platform: 'lichess', timeControl: 'blitz', rating: 1800 },
    // Different platform and speed: must not contaminate the comparison.
    { playerId: 'd', platform: 'chesscom', timeControl: 'rapid', rating: 900 },
  ];
  const idx = clubRelativeIndex({ platform: 'lichess', timeControl: 'blitz', rating: 1600 }, club);
  assert.equal(idx.peers, 3, 'only the lichess blitz players count as peers');
  assert.equal(idx.percentile, 50);
});

test('one data point is not a distribution', () => {
  const club = [{ playerId: 'a', platform: 'lichess', timeControl: 'blitz', rating: 1400 }];
  assert.equal(clubRelativeIndex({ platform: 'lichess', timeControl: 'blitz', rating: 1400 }, club), null);
});

/* ── precedence, and the comparability flag ──────────────────────────────── */

test('a coach override beats everything else', () => {
  const r = resolveRating({
    override: { clubRating: 1150, note: 'plays above his online number' },
    official: { platform: 'uscf', rating: 900 },
    clubRating: 1000,
    platformRatings: [{ platform: 'lichess', timeControl: 'blitz', rating: 1700 }],
  });
  assert.equal(r.rating, 1150);
  assert.equal(r.provenance, 'coach');
  assert.equal(r.comparable, true);
  assert.match(r.note, /plays above/);
});

test('precedence runs coach, official, club, platform', () => {
  assert.equal(resolveRating({ official: { platform: 'uscf', rating: 950 }, clubRating: 1000 }).provenance, 'uscf');
  assert.equal(resolveRating({ clubRating: 1000 }).provenance, 'club');
  assert.equal(
    resolveRating({ platformRatings: [{ platform: 'chesscom', timeControl: 'rapid', rating: 1180 }] }).provenance,
    'platform',
  );
  assert.equal(resolveRating({}).provenance, 'none');
});

test('a platform rating is returned but flagged as NOT comparable', () => {
  // This is the flag that stops a Lichess blitz number being ranked against a
  // Chess.com rapid number as though they meant the same thing.
  const r = resolveRating({ platformRatings: [{ platform: 'lichess', timeControl: 'blitz', rating: 1700 }] });
  assert.equal(r.rating, 1700);
  assert.equal(r.comparable, false);
  assert.match(r.label, /Lichess blitz/);
});

test('a platform pick follows the stated preference and never blends', () => {
  const r = resolveRating({
    platformRatings: [
      { platform: 'chesscom', timeControl: 'bullet', rating: 800 },
      { platform: 'chesscom', timeControl: 'rapid', rating: 1200 },
    ],
  });
  assert.equal(r.rating, 1200, 'rapid is preferred over bullet');
  assert.notEqual(r.rating, 1000, 'and the two are never averaged');
});

test('puzzle ratings are never used as a playing strength', () => {
  const r = resolveRating({ platformRatings: [{ platform: 'lichess', timeControl: 'puzzles', rating: 2400 }] });
  assert.equal(r.provenance, 'none', 'a puzzle rating is not a playing rating');
});

/* ── the leaderboard must not mix scales ─────────────────────────────────── */

test('the leaderboard ranks comparable ratings and sets the rest aside', () => {
  const { ranked, unranked } = rankForLeaderboard([
    { playerId: 'a', clubRating: 1200 },
    { playerId: 'b', clubRating: 1400 },
    { playerId: 'c', platformRatings: [{ platform: 'lichess', timeControl: 'blitz', rating: 1900 }] },
    { playerId: 'd' },
  ]);
  assert.deepEqual(ranked.map((r) => r.playerId), ['b', 'a']);
  // c has the biggest number on the page and still must not top the table.
  assert.deepEqual(unranked.map((r) => r.playerId).sort(), ['c', 'd']);
});

test('only same-pool ratings may anchor scoring', () => {
  assert.equal(usableAsScoringAnchor(resolveRating({ clubRating: 1100 })), true);
  assert.equal(usableAsScoringAnchor(resolveRating({ override: { clubRating: 1100 } })), true);
  assert.equal(
    usableAsScoringAnchor(resolveRating({ platformRatings: [{ platform: 'lichess', timeControl: 'blitz', rating: 1700 }] })),
    false,
    'a platform rating must not calibrate a club measured on another pool',
  );
  assert.equal(usableAsScoringAnchor(resolveRating({})), false);
});

/* ── the club's chosen basis ─────────────────────────────────────────────── */

test('a rating on the club basis is comparable and may be ranked', () => {
  const r = resolveRating({
    platformRatings: [
      { platform: 'chesscom', timeControl: 'rapid', rating: 1356 },
      { platform: 'chesscom', timeControl: 'bullet', rating: 1159 },
    ],
  });
  assert.equal(r.rating, 1356, 'the basis wins over the preference order');
  assert.equal(r.comparable, true, 'same platform and speed is the same pool');
  assert.equal(r.basis, true);
  assert.match(r.label, /Chess\.com rapid/);
});

test('a rating off the basis is still shown, but not ranked', () => {
  const r = resolveRating({
    platformRatings: [{ platform: 'lichess', timeControl: 'blitz', rating: 1900 }],
  });
  assert.equal(r.rating, 1900);
  assert.equal(r.comparable, false, 'a different pool must not be ranked against the basis');
});

test('the basis is configurable', () => {
  const r = resolveRating({
    platformRatings: [{ platform: 'lichess', timeControl: 'blitz', rating: 1900 }],
    basis: { platform: 'lichess', timeControl: 'blitz' },
  });
  assert.equal(r.comparable, true);
});

test('a coach override still beats the basis', () => {
  const r = resolveRating({
    override: { clubRating: 1150 },
    platformRatings: [{ platform: 'chesscom', timeControl: 'rapid', rating: 1356 }],
  });
  assert.equal(r.rating, 1150);
  assert.equal(r.provenance, 'coach');
});

test('players on the basis rank together and others are set aside', () => {
  const { ranked, unranked } = rankForLeaderboard([
    { playerId: 'a', platformRatings: [{ platform: 'chesscom', timeControl: 'rapid', rating: 1356 }] },
    { playerId: 'b', platformRatings: [{ platform: 'chesscom', timeControl: 'rapid', rating: 1100 }] },
    { playerId: 'c', platformRatings: [{ platform: 'lichess', timeControl: 'blitz', rating: 2100 }] },
  ]);
  assert.deepEqual(ranked.map((r) => r.playerId), ['a', 'b']);
  assert.deepEqual(unranked.map((r) => r.playerId), ['c'], 'the biggest number is not the top rank');
});
