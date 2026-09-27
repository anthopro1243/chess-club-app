import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { targetRating, matchPuzzles, STRETCH, MIN_POOL } from './puzzleMatch.js';

const LIBRARY = JSON.parse(readFileSync(new URL('../data/puzzles.json', import.meta.url), 'utf8'));
const P = (id, rating, themes = ['fork']) => ({ id, rating, themes });

test('targetRating: an established club rating wins, then US Chess, then 1000', () => {
  assert.deepEqual(targetRating({ clubRating: { rating: 1180.4, count: 12 }, ratings: { uscf: 900 } }), { rating: 1180, source: 'club' });
  assert.deepEqual(targetRating({ clubRating: { rating: 1500, count: 2 }, ratings: { uscf: 900 } }), { rating: 900, source: 'uscf' });
  assert.deepEqual(targetRating({}), { rating: 1000, source: 'default' });
  assert.deepEqual(targetRating(null), { rating: 1000, source: 'default' });
});

test('matchPuzzles: closest to target + stretch first, unsolved before solved', () => {
  const puzzles = [P('a', 700), P('b', 1060), P('c', 1040), P('d', 1300), P('e', 1050)];
  const { puzzles: out, center } = matchPuzzles(puzzles, 1000, { solvedIds: ['e'], minPool: 1 });
  assert.equal(center, 1000 + STRETCH);
  assert.deepEqual(out.map((p) => p.id), ['b', 'c', 'e']);
});

test('matchPuzzles: the window widens until enough unsolved puzzles are in range', () => {
  const puzzles = [P('a', 1050), P('b', 1350), P('c', 1400)];
  const { puzzles: out, window } = matchPuzzles(puzzles, 1000, { minPool: 3 });
  assert.ok(window >= 350);
  assert.equal(out.length, 3);
});

test('matchPuzzles: a theme filter applies, and nothing matching gives an empty list (negative case)', () => {
  const puzzles = [P('a', 1000, ['pin']), P('b', 1000, ['fork'])];
  assert.deepEqual(matchPuzzles(puzzles, 1000, { theme: 'pin', minPool: 1 }).puzzles.map((p) => p.id), ['a']);
  assert.deepEqual(matchPuzzles(puzzles, 1000, { theme: 'skewer' }).puzzles, []);
});

test('matchPuzzles: a 700 player is never served the library\'s hardest puzzles', () => {
  const { puzzles: out } = matchPuzzles(LIBRARY, 700);
  assert.ok(out.length >= MIN_POOL);
  assert.ok(out.every((p) => p.rating <= 700 + STRETCH + 600), 'stays within the widest window');
  assert.ok(out.slice(0, MIN_POOL).every((p) => Math.abs(p.rating - 750) <= 150));
});
