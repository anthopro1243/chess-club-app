import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildReportCard, ratingLines, activityFor, missedTactics } from './reportCard.js';

const NOW = Date.parse('2026-09-27T12:00:00Z');
const DAY = 24 * 60 * 60 * 1000;
const iso = (daysAgo) => new Date(NOW - daysAgo * DAY).toISOString();
const COACH = { role: 'coach', playerId: 'CC-002' };

const ana = {
  playerId: 'CC-010',
  name: 'Ana Test',
  grade: '10',
  commitment: 'Competitive',
  joined: '2026-08-20',
  ratings: { uscf: 950 },
  goal: 'Reach 1100 US Chess',
  attendance: [
    { date: '2026-09-01', present: true },
    { date: '2026-09-08', present: false },
    { date: '2026-09-15', present: true },
    { date: '2026-09-22', present: true },
  ],
};

test('ratingLines: each pool labelled separately; other players and unknown pools left out', () => {
  const lines = ratingLines(
    ana,
    [
      { playerId: 'CC-010', platform: 'lichess', timeControl: 'blitz', rating: 1300 },
      { playerId: 'CC-010', platform: 'chesscom', timeControl: 'rapid', rating: 820 },
      { playerId: 'CC-010', platform: 'chesscom', timeControl: 'puzzles', rating: 1500 },
      { playerId: 'CC-011', platform: 'chesscom', timeControl: 'rapid', rating: 2000 },
    ],
    [{ playerId: 'CC-010', clubRating: 900 }],
  );
  assert.deepEqual(lines.map((l) => [l.label, l.rating]), [
    ['US Chess', 950],
    ['Club rating (coach)', 900],
    ['Chess.com rapid', 820],
    ['Lichess blitz', 1300],
  ]);
});

test('activityFor: counts only this player, only the last 30 days, and finds the last active day', () => {
  const games = [
    { whitePlayerId: 'CC-010', playedAt: iso(3) },
    { blackPlayerId: 'CC-010', playedAt: iso(40) },
    { whitePlayerId: 'CC-011', playedAt: iso(1) },
  ];
  const attempts = [
    { playerId: 'CC-010', correct: true, attemptedAt: iso(2) },
    { playerId: 'CC-010', correct: false, attemptedAt: iso(5) },
    { playerId: 'CC-011', correct: true, attemptedAt: iso(0) },
  ];
  const a = activityFor('CC-010', { games, attempts, now: NOW });
  assert.equal(a.games, 1);
  assert.equal(a.gamesTotal, 2);
  assert.equal(a.puzzles, 2);
  assert.equal(a.puzzlesSolved, 1);
  assert.equal(a.daysSinceActive, 2);
});

test('activityFor: nothing recorded gives nulls, not zero days (negative case)', () => {
  const a = activityFor('CC-010', { now: NOW });
  assert.equal(a.lastActiveAt, null);
  assert.equal(a.daysSinceActive, null);
});

test('missedTactics: most-missed first, own analyses only, unknown motifs dropped', () => {
  const analyses = [
    { playerId: 'CC-010', motifCounts: { fork: 2, hangingPiece: 3, mystery: 9 } },
    { playerId: 'CC-010', motifCounts: { fork: 2 } },
    { playerId: 'CC-011', motifCounts: { backRank: 10 } },
  ];
  assert.deepEqual(missedTactics(analyses, 'CC-010').map((m) => [m.motif, m.count]), [
    ['fork', 4],
    ['hangingPiece', 3],
  ]);
});

test('buildReportCard: a coach gets the whole card with a plain-words headline', () => {
  const card = buildReportCard({
    player: ana,
    viewer: COACH,
    games: [{ whitePlayerId: 'CC-010', playedAt: iso(3) }],
    coachNote: '  Strong in the opening. ',
    now: NOW,
  });
  assert.equal(card.available, true);
  assert.equal(card.name, 'Ana Test');
  assert.equal(card.coachNote, 'Strong in the opening.');
  assert.equal(card.goal, 'Reach 1100 US Chess');
  assert.match(card.headline, /1 game and 0 puzzles in the last 30 days/);
});

test('buildReportCard: an inactive member is flagged in the headline', () => {
  const card = buildReportCard({ player: ana, viewer: COACH, games: [{ whitePlayerId: 'CC-010', playedAt: iso(20) }], now: NOW });
  assert.match(card.headline, /Inactive for 20 days/);
});

test('buildReportCard: a player, or a retired member, gets no card (negative case)', () => {
  assert.equal(buildReportCard({ player: ana, viewer: { role: 'player', playerId: 'CC-010' }, now: NOW }).available, false);
  assert.equal(buildReportCard({ player: { ...ana, deletedAt: iso(1) }, viewer: COACH, now: NOW }).reason, 'retired');
  assert.equal(buildReportCard({ viewer: COACH }).reason, 'no-player');
});
