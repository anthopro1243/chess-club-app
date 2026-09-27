import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTrainingLink } from './trainingLink.js';

const THEMES = ['fork', 'pin', 'backRankMate'];

test('parseTrainingLink: a theme and difficulty link is read back', () => {
  assert.deepEqual(parseTrainingLink('#/training?theme=fork&difficulty=easy', { themes: THEMES }), {
    theme: 'fork',
    difficulty: 'easy',
    puzzleIds: [],
  });
});

test('parseTrainingLink: known puzzle ids are kept once, in order', () => {
  const parsed = parseTrainingLink('#/training?puzzles=b,a,b,zz', { themes: THEMES, puzzleIds: ['a', 'b'] });
  assert.deepEqual(parsed.puzzleIds, ['b', 'a']);
});

test('parseTrainingLink: unknown themes, bands and ids are dropped (negative case)', () => {
  const empty = { theme: '', difficulty: '', puzzleIds: [] };
  assert.deepEqual(parseTrainingLink('#/training?theme=nonsense&difficulty=godlike&puzzles=zzz', { themes: THEMES }), empty);
  assert.deepEqual(parseTrainingLink('#/training', { themes: THEMES }), empty);
  assert.deepEqual(parseTrainingLink(undefined), empty);
});
