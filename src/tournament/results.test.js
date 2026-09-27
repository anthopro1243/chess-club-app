import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  outcomeFor,
  historyOf,
  scoreOf,
  isFinished,
  wallChartCode,
  pairedRounds,
  lastCompleteRound,
} from './results.js';
import { ratingFor, seedEntrants, coverage, describeRating, ratingSourceLabel } from './seeding.js';

const game = (round, board, white, black, result = null) => ({ round, board, white, black, result, byeType: null });
const bye = (round, player, byeType) => ({ round, board: null, white: player, black: null, result: null, byeType });

test('outcomeFor: a played win, loss and draw, from each side', () => {
  assert.deepEqual(outcomeFor(game(1, 1, 'A', 'B', '1-0'), 'A'), {
    round: 1, opponent: 'B', colour: 'w', points: 1, played: true, kind: 'win',
  });
  assert.equal(outcomeFor(game(1, 1, 'A', 'B', '1-0'), 'B').kind, 'loss');
  assert.equal(outcomeFor(game(1, 1, 'A', 'B', '1/2-1/2'), 'B').points, 0.5);
  assert.equal(outcomeFor(game(1, 1, 'A', 'B', '1/2-1/2'), 'B').colour, 'b');
});

test('outcomeFor: forfeits score but are not played games', () => {
  const win = outcomeFor(game(2, 1, 'A', 'B', '0F-1F'), 'B');
  assert.equal(win.kind, 'forfeit-win');
  assert.equal(win.points, 1);
  assert.equal(win.played, false);
  const dbl = outcomeFor(game(2, 1, 'A', 'B', '0F-0F'), 'A');
  assert.equal(dbl.kind, 'double-forfeit');
  assert.equal(dbl.points, 0);
});

test('outcomeFor: a bye has no colour and no opponent, whatever column it sits in', () => {
  const full = outcomeFor(bye(1, 'A', 'full'), 'A');
  assert.equal(full.colour, null);
  assert.equal(full.opponent, null);
  assert.equal(full.points, 1);
  assert.equal(outcomeFor(bye(1, 'A', 'half'), 'A').points, 0.5);
  assert.equal(outcomeFor(bye(1, 'A', 'zero'), 'A').points, 0);
});

test('outcomeFor: a pending game has no points yet; a stranger gets null', () => {
  const pending = outcomeFor(game(3, 2, 'A', 'B'), 'A');
  assert.equal(pending.kind, 'pending');
  assert.equal(pending.points, null);
  assert.equal(outcomeFor(game(3, 2, 'A', 'B'), 'C'), null);
  assert.equal(outcomeFor(null, 'A'), null);
});

test('scoreOf / historyOf count through a round and ignore pending games', () => {
  const rows = [game(1, 1, 'A', 'B', '1-0'), bye(2, 'A', 'half'), game(3, 1, 'C', 'A')];
  assert.equal(scoreOf(rows, 'A'), 1.5);
  assert.equal(scoreOf(rows, 'A', 1), 1);
  assert.deepEqual(historyOf(rows, 'A').map((o) => o.kind), ['win', 'half-bye', 'pending']);
});

test('isFinished: junk result codes are not results', () => {
  assert.equal(isFinished(game(1, 1, 'A', 'B', '2-0')), false);
  assert.equal(isFinished(game(1, 1, 'A', 'B', '1-0')), true);
  assert.equal(isFinished(bye(1, 'A', 'full')), true);
  assert.equal(isFinished(null), false);
});

test('wallChartCode prints US Chess crosstable codes', () => {
  const num = (id) => ({ A: 1, B: 2 })[id];
  assert.equal(wallChartCode(outcomeFor(game(1, 1, 'A', 'B', '1-0'), 'A'), num), 'W2');
  assert.equal(wallChartCode(outcomeFor(game(1, 1, 'A', 'B', '1-0'), 'B'), num), 'L1');
  assert.equal(wallChartCode(outcomeFor(game(1, 1, 'A', 'B', '1/2-1/2'), 'B'), num), 'D1');
  assert.equal(wallChartCode(outcomeFor(game(1, 1, 'A', 'B', '1F-0F'), 'A'), num), 'X2');
  assert.equal(wallChartCode(outcomeFor(bye(1, 'A', 'full'), 'A'), num), 'B');
  assert.equal(wallChartCode(outcomeFor(bye(1, 'A', 'half'), 'A'), num), 'H');
  assert.equal(wallChartCode(null, num), 'U');
  assert.equal(wallChartCode(outcomeFor(game(1, 1, 'A', 'B'), 'A'), num), 'vs 2');
});

test('pairedRounds ignores rounds that hold only requested byes; lastCompleteRound stops at a gap', () => {
  const rows = [game(1, 1, 'A', 'B', '1-0'), game(2, 1, 'A', 'C'), bye(3, 'B', 'half')];
  assert.deepEqual(pairedRounds(rows), [1, 2]);
  assert.equal(lastCompleteRound(rows), 1);
  assert.equal(lastCompleteRound([]), 0);
});

// -- seeding ---------------------------------------------------------------

const player = (over) => ({ playerId: 'CC-001', name: 'Ana', ratings: {}, clubRating: null, ...over });

test('ratingFor reads each source and never borrows from another', () => {
  const p = player({
    ratings: { uscf: 812, chesscomRapid: 950, lichessRapid: 1420 },
    clubRating: { rating: 1333.4, rd: 80, count: 12 },
  });
  assert.equal(ratingFor(p, 'uscf'), 812);
  assert.equal(ratingFor(p, 'club'), 1333);
  assert.equal(ratingFor(p, 'chesscomRapid'), 950);
  assert.equal(ratingFor(p, 'lichessRapid'), 1420);
  assert.equal(ratingFor(player({ ratings: { chesscomRapid: 950 } }), 'uscf'), null);
  assert.equal(ratingFor(p, 'fide'), null);
});

test('ratingFor: the untouched 1500 club placeholder is unrated, not a rating', () => {
  assert.equal(ratingFor(player({ clubRating: { rating: 1500, rd: 350, count: 0 } }), 'club'), null);
  assert.equal(ratingFor(player({ clubRating: { rating: 1500, rd: 350 } }), 'club'), null);
  assert.equal(ratingFor(player({ clubRating: { rating: 1500, rd: 90, count: 4 } }), 'club'), 1500);
  assert.equal(ratingFor(player({ ratings: { uscf: '' } }), 'uscf'), null);
  assert.equal(ratingFor(player({ ratings: { uscf: 'abc' } }), 'uscf'), null);
  assert.equal(ratingFor(null, 'uscf'), null);
});

test('seedEntrants: high to low, unrated last, stable on ties', () => {
  const seeded = seedEntrants(
    [
      player({ playerId: 'CC-3', name: 'Cy', ratings: { uscf: 700 } }),
      player({ playerId: 'CC-1', name: 'Al' }),
      player({ playerId: 'CC-2', name: 'Bo', ratings: { uscf: 1100 } }),
      player({ playerId: 'CC-4', name: 'Di', ratings: { uscf: 700 } }),
    ],
    'uscf',
  );
  assert.deepEqual(seeded.map((e) => e.playerId), ['CC-2', 'CC-3', 'CC-4', 'CC-1']);
  assert.equal(seeded[3].rating, null);
  assert.equal(seeded[0].ratingSource, 'uscf');
});

test('coverage and labels say where a number came from', () => {
  const list = [player({ ratings: { uscf: 900 } }), player({})];
  assert.deepEqual(coverage(list, 'uscf'), { rated: 1, total: 2 });
  assert.equal(describeRating(900, 'uscf'), '900 US Chess');
  assert.equal(describeRating(null, 'lichessRapid'), 'unrated (Lichess rapid)');
  assert.equal(ratingSourceLabel('nope'), 'Unknown source');
});
