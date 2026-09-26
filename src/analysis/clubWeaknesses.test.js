import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clubWeaknesses, openingOf, MIN_GAMES } from './clubWeaknesses.js';

const NOW = Date.parse('2026-09-26T22:00:00Z');
const day = 24 * 60 * 60 * 1000;
const game = (id, daysAgo, white, black, result, opening) => ({
  id, playedAt: new Date(NOW - daysAgo * day).toISOString(), whitePlayerId: white, blackPlayerId: black, result,
  pgn: opening ? `[Opening "${opening}"]\n\n1. e4 *` : '1. e4 *',
});
const analysis = (gameId, playerId, motifCounts, critical = [], plies = []) => ({ gameId, playerId, motifCounts, critical, plies });

const active = new Set(['CC-002', 'CC-004', 'CC-005']);
const games = [
  game('g1', 2, 'CC-002', null, '0-1', 'Italian Game: Two Knights'),
  game('g2', 3, null, 'CC-004', '0-1', 'Italian Game'),
  game('g3', 5, 'CC-005', null, '1/2-1/2', 'Sicilian Defense'),
  game('g4', 8, 'CC-003', null, '1-0', 'French Defense'),          // retired player
  game('g5', 40, 'CC-002', null, '1-0', 'Caro-Kann Defense'),      // outside the window
  game('g6', 9, 'CC-004', null, '1-0', 'Italian Game'),
];
const analyses = [
  analysis('g1', 'CC-002', { fork: 2, hangingPiece: 1 }, [{ ply: 30 }], [{ ply: 30, phase: 'middlegame' }]),
  analysis('g2', 'CC-004', { fork: 1 }, [{ ply: 8 }], [{ ply: 8, phase: 'opening' }]),
  analysis('g3', 'CC-005', { hangingPiece: 3 }, [{ ply: 60 }, { ply: 44 }], [{ ply: 60, phase: 'endgame' }, { ply: 44, phase: 'middlegame' }]),
  analysis('g4', 'CC-003', { backRank: 9 }),                       // retired: ignored
  analysis('g5', 'CC-002', { skewer: 5 }),                         // too old: ignored
  analysis('g6', 'CC-004', { fork: 1, bogus: 4 }),
];

test('openingOf: name before a colon, then Chess.com ECOUrl, then ECO', () => {
  assert.equal(openingOf('[Opening "Italian Game: Two Knights"]'), 'Italian Game');
  assert.equal(openingOf('[ECOUrl "https://www.chess.com/openings/Sicilian-Defense-Najdorf-Variation-6.Bg5"]'), 'Sicilian Defense');
  assert.equal(openingOf('[ECO "C50"]'), 'C50');
  assert.equal(openingOf('1. e4 *'), null);
});

test('clubWeaknesses: themes summed across active members inside the window', () => {
  const r = clubWeaknesses({ analyses, games, activeIds: active, now: NOW, knownThemes: new Set(['fork']) });
  assert.deepEqual(r.topMotifs.map((m) => [m.motif, m.count, m.players]), [['fork', 4, 2], ['hangingPiece', 4, 2]]);
  assert.equal(r.topMotifs[0].drill, '#/training?theme=fork');
  assert.equal(r.topMotifs[1].drill, null, 'no drill link for a theme the puzzle set does not have');
});

test('clubWeaknesses: retired members, old games and unknown motifs do NOT count', () => {
  const r = clubWeaknesses({ analyses, games, activeIds: active, now: NOW });
  assert.ok(!r.topMotifs.some((m) => ['backRank', 'skewer', 'bogus'].includes(m.motif)));
  assert.ok(!r.topOpenings.some((o) => ['French Defense', 'Caro-Kann Defense'].includes(o.name)));
});

test('clubWeaknesses: the phase where decisive errors happen', () => {
  const r = clubWeaknesses({ analyses, games, activeIds: active, now: NOW });
  assert.deepEqual(r.phases, { opening: 1, middlegame: 2, endgame: 1 });
  assert.equal(r.worstPhase.label, 'Middlegame');
});

test('clubWeaknesses: openings faced with the club score', () => {
  const r = clubWeaknesses({ analyses, games, activeIds: active, now: NOW });
  assert.deepEqual(r.topOpenings[0], { name: 'Italian Game', games: 3, points: 2, scorePct: 67 });
});

test('clubWeaknesses: says "not enough" below the minimum', () => {
  const r = clubWeaknesses({ analyses, games, activeIds: active, now: NOW });
  assert.equal(r.analysedGames, 4);
  assert.equal(r.enough, 4 >= MIN_GAMES);
  assert.equal(clubWeaknesses({ analyses: [], games: [], activeIds: active, now: NOW }).worstPhase, null);
});

test('clubWeaknesses: back-rank links to the puzzle set\'s backRankMate theme', () => {
  const r = clubWeaknesses({
    analyses: [analysis('g1', 'CC-002', { backRank: 2 })], games, activeIds: active, now: NOW,
    knownThemes: new Set(['backRankMate']),
  });
  assert.equal(r.topMotifs[0].drill, '#/training?theme=backRankMate');
});
