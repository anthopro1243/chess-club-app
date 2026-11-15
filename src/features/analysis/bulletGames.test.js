import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isBulletGame, partitionBulletGames, BULLET_SKIP_REASON } from './bulletGames.js';
import { claimOrder } from '../../services/external/autoPolicy.js';
import { recentAnalysisProgress } from './progress.js';

const pgn = (tc) => `[Event "x"]\n[TimeControl "${tc}"]\n\n1. e4 e5 1-0`;

test('isBulletGame: a sync that knows the time class is trusted', () => {
  assert.equal(isBulletGame({ timeClass: 'bullet' }), true);
  assert.equal(isBulletGame({ timeClass: 'blitz', mode: 'chesscom', pgn: pgn('60') }), false);
});

test('isBulletGame: a Chess.com game already in the queue is read from its PGN', () => {
  assert.equal(isBulletGame({ mode: 'chesscom', pgn: pgn('60') }), true);
  assert.equal(isBulletGame({ mode: 'chesscom', pgn: pgn('120+1') }), true);
  assert.equal(isBulletGame({ mode: 'chesscom', pgn: pgn('180') }), false);
  assert.equal(isBulletGame({ mode: 'chesscom', pgn: pgn('600') }), false);
});

test('isBulletGame: Lichess counts the increment too (base + 40 moves)', () => {
  assert.equal(isBulletGame({ mode: 'lichess', pgn: pgn('60+0') }), true);
  assert.equal(isBulletGame({ mode: 'lichess', pgn: pgn('120+1') }), true);  // 160s
  assert.equal(isBulletGame({ mode: 'lichess', pgn: pgn('120+2') }), false); // 200s: blitz
  assert.equal(isBulletGame({ mode: 'lichess', pgn: pgn('180+0') }), false);
});

test('isBulletGame: club games, daily games and unreadable PGNs are never bullet', () => {
  assert.equal(isBulletGame({ mode: 'human', pgn: pgn('60') }), false);
  assert.equal(isBulletGame({ mode: 'chesscom', pgn: pgn('1/86400') }), false);
  assert.equal(isBulletGame({ mode: 'lichess', pgn: '1. e4 e5' }), false);
  assert.equal(isBulletGame({ mode: 'lichess', pgn: pgn('-') }), false);
  assert.equal(isBulletGame(null), false);
});

test('partitionBulletGames: bullet to skip, the rest to analyse, order kept', () => {
  const rows = [
    { id: 'a', mode: 'chesscom', pgn: pgn('60') },
    { id: 'b', mode: 'chesscom', pgn: pgn('600') },
    { id: 'c', mode: 'lichess', pgn: pgn('60+0') },
  ];
  const { analyse, skip } = partitionBulletGames(rows);
  assert.deepEqual(analyse.map((g) => g.id), ['b']);
  assert.deepEqual(skip.map((g) => g.id), ['a', 'c']);
  assert.match(BULLET_SKIP_REASON, /bullet/);
  assert.match(BULLET_SKIP_REASON, /^skipped:/);
});

test('claimOrder: the most recently played first, whatever order the query returned', () => {
  const rows = [
    { id: 'old', played_at: '2025-01-01T00:00:00Z' },
    { id: 'new', played_at: '2026-11-01T00:00:00Z' },
    { id: 'mid', played_at: '2026-05-01T00:00:00Z' },
  ];
  assert.deepEqual(claimOrder(rows).map((r) => r.id), ['new', 'mid', 'old']);
});

test('claimOrder: the viewer\'s own games stay first, newest first inside each group', () => {
  const rows = [
    { id: 'club-new', played_at: '2026-11-10T00:00:00Z', white_player_id: 'CC-020' },
    { id: 'mine-old', played_at: '2026-01-01T00:00:00Z', white_player_id: 'CC-010' },
    { id: 'mine-new', played_at: '2026-10-01T00:00:00Z', black_player_id: 'CC-010' },
    { id: 'club-old', played_at: '2026-02-01T00:00:00Z', white_player_id: 'CC-021' },
  ];
  assert.deepEqual(claimOrder(rows, 'CC-010').map((r) => r.id), ['mine-new', 'mine-old', 'club-new', 'club-old']);
});

const game = (id, playedAt, analysisStatus, white = 'CC-010') => ({
  id, playedAt, analysisStatus, whitePlayerId: white, blackPlayerId: '',
});

test('recentAnalysisProgress: "37 of 180" style counts over the member\'s recent games', () => {
  const games = [];
  for (let i = 0; i < 180; i += 1) games.push(game(`g${i}`, `2026-01-${String(1 + (i % 28)).padStart(2, '0')}T${String(i % 24).padStart(2, '0')}:00:00Z`, i < 37 ? 'done' : 'pending'));
  const p = recentAnalysisProgress(games, 'CC-010');
  assert.equal(p.total, 180);
  assert.equal(p.done + p.waiting, 180);
});

test('recentAnalysisProgress: bullet (skipped) and failed games are neither done nor waiting', () => {
  const games = [
    game('a', '2026-03-01', 'done'), game('b', '2026-03-02', 'pending'), game('c', '2026-03-03', 'pending'),
    game('d', '2026-03-04', 'pending'), game('e', '2026-03-05', 'skipped'), game('f', '2026-03-06', 'failed'),
  ];
  assert.deepEqual(recentAnalysisProgress(games, 'CC-010'), { done: 1, total: 4, waiting: 3 });
});

test('recentAnalysisProgress: says nothing for a small wait, another player, or nobody', () => {
  const few = [game('a', '2026-03-01', 'done'), game('b', '2026-03-02', 'pending')];
  assert.equal(recentAnalysisProgress(few, 'CC-010'), null);
  assert.equal(recentAnalysisProgress(few, 'CC-099'), null);
  assert.equal(recentAnalysisProgress(few, null), null);
});
