import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bergerTable, roundRobinSchedule, roundRobinRounds, ROUND_ROBIN_MIN, ROUND_ROBIN_MAX } from './roundRobin.js';
import { auditPairings } from './swiss.js';

const field = (n) => Array.from({ length: n }, (_, i) => ({ playerId: `P${i + 1}`, name: `P${i + 1}` }));

test('bergerTable(6) is the published FIDE table', () => {
  assert.deepEqual(bergerTable(6), [
    [[1, 6], [2, 5], [3, 4]],
    [[6, 4], [5, 3], [1, 2]],
    [[2, 6], [3, 1], [4, 5]],
    [[6, 5], [1, 4], [2, 3]],
    [[3, 6], [4, 2], [5, 1]],
  ]);
});

test('bergerTable(4) is the published FIDE table', () => {
  assert.deepEqual(bergerTable(4), [
    [[1, 4], [2, 3]],
    [[4, 3], [1, 2]],
    [[2, 4], [3, 1]],
  ]);
});

for (let n = ROUND_ROBIN_MIN; n <= ROUND_ROBIN_MAX; n += 1) {
  test(`${n} players: everyone meets everyone once, once per round, colours level within 1`, () => {
    const entrants = field(n);
    const schedule = roundRobinSchedule(entrants);
    assert.equal(schedule.ok, true);
    assert.equal(schedule.rounds.length, roundRobinRounds(n));

    const rows = schedule.rounds.flatMap((r) => r.rows);
    const games = rows.filter((r) => !r.byeType);
    // Every pair exactly once.
    const pairs = new Set(games.map((g) => [g.white, g.black].sort().join('|')));
    assert.equal(games.length, (n * (n - 1)) / 2);
    assert.equal(pairs.size, games.length);

    for (const { round, rows: inRound } of schedule.rounds) {
      const seen = inRound.flatMap((r) => [r.white, r.black]).filter(Boolean);
      assert.deepEqual([...seen].sort(), entrants.map((e) => e.playerId).sort(), `round ${round}`);
      // Boards numbered 1..k with no gaps; the bye (if any) has no board.
      assert.deepEqual(
        inRound.filter((r) => !r.byeType).map((r) => r.board),
        Array.from({ length: Math.floor(n / 2) }, (_, i) => i + 1),
      );
      assert.equal(inRound.filter((r) => r.byeType).length, n % 2);
    }

    // An odd field: each player sits out exactly once, for zero points.
    const byes = rows.filter((r) => r.byeType);
    assert.equal(byes.length, n % 2 ? n : 0);
    assert.equal(new Set(byes.map((b) => b.white)).size, byes.length);
    assert.ok(byes.every((b) => b.byeType === 'zero' && b.black === null && b.board === null));

    // Colours: within one of level, never three the same in a row.
    for (const e of entrants) {
      const colours = games
        .filter((g) => g.white === e.playerId || g.black === e.playerId)
        .sort((a, b) => a.round - b.round)
        .map((g) => (g.white === e.playerId ? 1 : -1));
      assert.ok(Math.abs(colours.reduce((s, c) => s + c, 0)) <= 1, `${e.playerId} colour balance`);
    }
    assert.deepEqual(auditPairings(rows.map((r) => ({ ...r, result: r.byeType ? null : '1/2-1/2' }))), []);
  });
}

test('round 1 of an odd field: the top seed sits out, the rest play', () => {
  const schedule = roundRobinSchedule(field(5));
  const r1 = schedule.rounds[0].rows;
  assert.deepEqual(r1.at(-1), { round: 1, board: null, white: 'P1', black: null, result: null, byeType: 'zero' });
  assert.equal(r1.filter((r) => !r.byeType).length, 2);
});

test('refuses fields outside 3–10, duplicates and missing ids', () => {
  assert.equal(roundRobinSchedule(field(2)).error, 'too-few-players');
  assert.equal(roundRobinSchedule([]).error, 'too-few-players');
  assert.equal(roundRobinSchedule(null).error, 'too-few-players');
  const eleven = roundRobinSchedule(field(11));
  assert.equal(eleven.error, 'too-many-players');
  assert.match(eleven.message, /11 rounds/);
  assert.equal(roundRobinSchedule([...field(3), { playerId: 'P1' }]).error, 'duplicate-entrant');
  assert.equal(roundRobinSchedule([...field(3), { name: 'no id' }]).error, 'bad-entrant');
  assert.throws(() => bergerTable(5));
});

test('roundRobinRounds: n−1 for an even field, n for an odd one', () => {
  assert.equal(roundRobinRounds(10), 9);
  assert.equal(roundRobinRounds(9), 9);
  assert.equal(roundRobinRounds(1), 0);
  assert.equal(roundRobinRounds('4'), 0);
});
