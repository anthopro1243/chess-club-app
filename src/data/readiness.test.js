import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  pgnTag,
  baseSecondsFromTimeControl,
  isSlowGame,
  seasonStart,
  slowGamesFor,
  readinessFor,
  readinessByPlayer,
  SLOW_GAME_MIN_SECONDS,
} from './readiness.js';
import { mergeResult } from './prepResults.js';

const EVENT = { id: 'disd-hs-fall-2026', date: '2026-10-24' };
const pgnWith = (tc) => `[Event "Club"]\n[TimeControl "${tc}"]\n\n1. e4 e5 *`;
const game = (over = {}) => ({
  id: `G-${Math.random()}`,
  whitePlayerId: 'CC-1',
  blackPlayerId: 'CC-2',
  mode: 'human',
  moveCount: 60,
  playedAt: '2026-10-06T23:30:00Z',
  pgn: pgnWith('1800+5'),
  ...over,
});
const result = (playerId, drill, score, total) => ({ playerId, ...mergeResult(null, drill, { score, total, at: '2026-09-29T23:00:00Z' }) });

test('pgnTag reads one tag', () => {
  assert.equal(pgnTag(pgnWith('G/30;d5'), 'TimeControl'), 'G/30;d5');
  assert.equal(pgnTag('[White "A"]', 'TimeControl'), '');
  assert.equal(pgnTag(null, 'TimeControl'), '');
});

test('baseSecondsFromTimeControl: PGN standard forms', () => {
  assert.equal(baseSecondsFromTimeControl('1800'), 1800);
  assert.equal(baseSecondsFromTimeControl('1800+5'), 1800);
  assert.equal(baseSecondsFromTimeControl('3600+0'), 3600);
  assert.equal(baseSecondsFromTimeControl('40/5400:1800'), 5400);
  assert.equal(baseSecondsFromTimeControl('40/5400+30:1800+30'), 5400);
  assert.equal(baseSecondsFromTimeControl('600+5'), 600);
});

test('baseSecondsFromTimeControl: US scholastic forms', () => {
  assert.equal(baseSecondsFromTimeControl('G/30;d5'), 1800);
  assert.equal(baseSecondsFromTimeControl('G/30 d5'), 1800);
  assert.equal(baseSecondsFromTimeControl('g/60'), 3600);
  assert.equal(baseSecondsFromTimeControl('G30'), 1800);
  assert.equal(baseSecondsFromTimeControl('G/25;d5'), 1500);
});

test('baseSecondsFromTimeControl: no clock or junk is null', () => {
  for (const tag of ['-', '?', '', null, 'rapid', 'thirty minutes', '1800x5']) {
    assert.equal(baseSecondsFromTimeControl(tag), null, String(tag));
  }
});

test('isSlowGame: G/30 and longer, in the app or over the board', () => {
  assert.equal(isSlowGame(game()), true);
  assert.equal(isSlowGame(game({ pgn: pgnWith('G/60;d5') })), true);
  assert.equal(isSlowGame(game({ mode: 'computer' })), true);
  assert.equal(SLOW_GAME_MIN_SECONDS, 1800);
});

test('NEGATIVE isSlowGame: faster controls, online games, no tag, and aborted starts do not count', () => {
  assert.equal(isSlowGame(game({ pgn: pgnWith('G/25;d5') })), false);
  assert.equal(isSlowGame(game({ pgn: pgnWith('600+5') })), false);
  assert.equal(isSlowGame(game({ mode: 'chesscom' })), false);
  assert.equal(isSlowGame(game({ mode: 'lichess', pgn: pgnWith('1800+0') })), false);
  assert.equal(isSlowGame(game({ pgn: '1. e4 e5 *' })), false);
  assert.equal(isSlowGame(game({ pgn: pgnWith('-') })), false);
  assert.equal(isSlowGame(game({ moveCount: 4 })), false);
  assert.equal(isSlowGame(null), false);
});

test('seasonStart: Aug 1 of the school year', () => {
  assert.equal(seasonStart('2026-10-24'), '2026-08-01');
  assert.equal(seasonStart('2027-02-20'), '2026-08-01');
  assert.equal(seasonStart('2026-08-01'), '2026-08-01');
  assert.equal(seasonStart('nope'), null);
});

test('slowGamesFor: the player\'s own slow games inside the window, dated in Chicago', () => {
  const games = [
    game({ id: 'a' }),
    game({ id: 'b', whitePlayerId: 'CC-3', blackPlayerId: 'CC-1' }),
    game({ id: 'c', whitePlayerId: 'CC-3', blackPlayerId: 'CC-4' }),
    game({ id: 'd', playedAt: '2026-07-20T18:00:00Z' }), // last season
    game({ id: 'e', playedAt: '2026-10-25T18:00:00Z' }), // after the event
    // 00:30 UTC on Oct 25 is 7:30 pm on Oct 24 in Dallas: event day, so it counts.
    game({ id: 'f', playedAt: '2026-10-25T00:30:00Z' }),
  ];
  const ids = slowGamesFor('CC-1', games, { since: '2026-08-01', until: '2026-10-24' }).map((g) => g.id);
  assert.deepEqual(ids, ['a', 'b', 'f']);
  assert.deepEqual(slowGamesFor('', games), []);
  assert.deepEqual(slowGamesFor('CC-1', null), []);
});

test('readinessFor: nothing done yet is 0%, and the endgame item is left out of the count', () => {
  const r = readinessFor({ playerId: 'CC-1', event: EVENT });
  assert.equal(r.counted, 4);
  assert.equal(r.done, 0);
  assert.equal(r.percent, 0);
  assert.equal(r.items.find((i) => i.key === 'endgame').status, 'coming-soon');
  assert.equal(r.items.find((i) => i.key === 'repertoire').detail, 'Once registered, the coach ticks this');
});

test('readinessFor: everything done is 100%', () => {
  const results = [result('CC-1', 'rules-quiz', 12, 13), result('CC-1', 'notation-game-type', 78, 80)];
  const games = [game(), game({ id: 'g2', playedAt: '2026-10-13T23:30:00Z' })];
  const r = readinessFor({ playerId: 'CC-1', results, games, event: EVENT, registration: { repertoireReviewed: true } });
  assert.deepEqual(
    r.items.map((i) => [i.key, i.status]),
    [
      ['rules', 'done'],
      ['notation', 'done'],
      ['slowGames', 'done'],
      ['endgame', 'coming-soon'],
      ['repertoire', 'done'],
    ],
  );
  assert.equal(r.percent, 100);
});

test('NEGATIVE readinessFor: near misses stay to-do', () => {
  const results = [
    result('CC-1', 'rules-quiz', 10, 13), // 77%
    result('CC-1', 'notation-game-type', 75, 80), // 93.75%
    result('CC-1', 'notation-skills-type', 17, 17), // perfect, but not the game drill
    result('CC-2', 'rules-quiz', 13, 13), // someone else
  ];
  const r = readinessFor({ playerId: 'CC-1', results, games: [game()], event: EVENT, registration: { repertoireReviewed: false } });
  assert.equal(r.done, 0);
  assert.equal(r.items.find((i) => i.key === 'slowGames').detail, '1 of 2 this season');
  assert.equal(r.items.find((i) => i.key === 'rules').detail, 'Best 10/13');
  assert.equal(r.items.find((i) => i.key === 'notation').detail, 'Best 94% on the 40-move game');
});

test('readinessFor: a coming endgame feature joins the count when it exists', () => {
  const r = readinessFor({ playerId: 'CC-1', event: EVENT, endgameAvailable: true });
  assert.equal(r.counted, 5);
});

test('readinessByPlayer: one entry per player, using only this event\'s registration', () => {
  const players = [{ playerId: 'CC-1' }, { playerId: 'CC-2' }, null];
  const registrations = [
    { eventId: 'other', playerId: 'CC-1', repertoireReviewed: true },
    { eventId: EVENT.id, playerId: 'CC-2', repertoireReviewed: true },
  ];
  const map = readinessByPlayer({ players, registrations, event: EVENT });
  assert.equal(map.size, 2);
  assert.equal(map.get('CC-1').done, 0);
  assert.equal(map.get('CC-2').done, 1);
  assert.equal(map.get('CC-2').percent, 25);
});
