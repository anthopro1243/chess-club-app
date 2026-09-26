import { test } from 'node:test';
import assert from 'node:assert/strict';
import { proposeOrder, checkLineup } from './boardOrder.js';

const players = [
  { id: 'a', rating: 1200 },
  { id: 'b', rating: 1450 },
  { id: 'c', rating: null },
  { id: 'd', rating: 980 },
  { id: 'e', rating: 1310 },
  { id: 'f', rating: 1100 },
];

test('proposeOrder: descending rating, unrated last, alternates split off', () => {
  const r = proposeOrder(players, { boards: 4 });
  assert.deepEqual(r.lineup.map((p) => p.id), ['b', 'e', 'a', 'f']);
  assert.deepEqual(r.alternates.map((p) => p.id), ['d', 'c']);
  assert.deepEqual(r.unratedInLineup, []);
});

test('proposeOrder: an unrated player in the lineup is flagged', () => {
  const r = proposeOrder(players.slice(0, 3), { boards: 3 });
  assert.deepEqual(r.unratedInLineup, ['c']);
});

test('checkLineup: the proposed order is always legal', () => {
  const { lineup } = proposeOrder(players, { boards: 4 });
  assert.equal(checkLineup(lineup).ok, true);
});

test('checkLineup: an out-of-order swap is caught with the exact boards', () => {
  const lineup = [{ id: 'e', rating: 1310 }, { id: 'b', rating: 1450 }];
  const r = checkLineup(lineup, { tolerance: 0 });
  assert.equal(r.ok, false);
  assert.equal(r.violations[0].upperBoard, 1);
  assert.equal(r.violations[0].lowerBoard, 2);
  assert.equal(r.violations[0].by, 140);
});

test('checkLineup: NOT a violation when within the tolerance', () => {
  const lineup = [{ id: 'x', rating: 1300 }, { id: 'y', rating: 1340 }];
  assert.equal(checkLineup(lineup, { tolerance: 50 }).ok, true);
  assert.equal(checkLineup(lineup, { tolerance: 25 }).ok, false);
});

test('checkLineup: unrated above rated is flagged; unrated below rated is fine', () => {
  assert.equal(checkLineup([{ id: 'u', rating: null }, { id: 'r', rating: 900 }]).violations[0].kind, 'unrated-above-rated');
  assert.equal(checkLineup([{ id: 'r', rating: 900 }, { id: 'u', rating: null }]).ok, true);
});
