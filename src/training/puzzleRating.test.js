import test from 'node:test';
import assert from 'node:assert/strict';
import { puzzleRatingScore } from './puzzleRating.js';
import { updateRating, DEFAULT_RATING } from '../data/glicko2.js';

const library = { id: 'abc', rating: 1200 };
const own = { id: 'own:1', rating: 0, own: { id: 1 } };

test('puzzleRatingScore: first outcome of a visit is rated', () => {
  assert.equal(puzzleRatingScore({ puzzle: library, outcome: 'solved' }), 1);
  assert.equal(puzzleRatingScore({ puzzle: library, outcome: 'wrong' }), 0);
  assert.equal(puzzleRatingScore({ puzzle: library, outcome: 'revealed' }), 0);
});

test('puzzleRatingScore: retrying until right does not count as a win (negative case)', () => {
  // The wrong move was rated; the eventual solve must not be.
  assert.equal(puzzleRatingScore({ puzzle: library, outcome: 'solved', alreadyRated: true }), null);
  assert.equal(puzzleRatingScore({ puzzle: library, outcome: 'revealed', alreadyRated: true }), null);
});

test('puzzleRatingScore: re-solving an already solved puzzle earns nothing (negative case)', () => {
  assert.equal(puzzleRatingScore({ puzzle: library, outcome: 'solved', alreadySolved: true }), null);
  assert.equal(puzzleRatingScore({ puzzle: library, outcome: 'wrong', alreadySolved: true }), null);
});

test('puzzleRatingScore: own-game positions are never rated (negative case)', () => {
  for (const outcome of ['solved', 'wrong', 'revealed']) {
    assert.equal(puzzleRatingScore({ puzzle: own, outcome }), null);
  }
  // A library puzzle with no usable rating is not rated either.
  assert.equal(puzzleRatingScore({ puzzle: { id: 'x', rating: 0 }, outcome: 'revealed' }), null);
});

test('regression: the old 0-rated reveal really did cost ~700 points', () => {
  // Documents why own-game puzzles must not be rated.
  const after = updateRating({ ...DEFAULT_RATING }, [{ opponentRating: 0, opponentRd: 60, score: 0 }]);
  assert.ok(DEFAULT_RATING.rating - after.rating > 500);
  assert.equal(puzzleRatingScore({ puzzle: own, outcome: 'revealed' }), null);
});
