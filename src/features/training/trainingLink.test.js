import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTrainingLink } from './trainingLink.js';

const THEMES = ['fork', 'pin', 'backRankMate'];

test('parseTrainingLink: a theme and difficulty link is read back', () => {
  assert.deepEqual(parseTrainingLink('#/training?theme=fork&difficulty=easy', { themes: THEMES }), {
    theme: 'fork',
    difficulty: 'easy',
    puzzleIds: [],
    mode: '',
  });
});

test('parseTrainingLink: ?mode=mistakes opens the player\'s own positions; unknown modes are dropped', () => {
  assert.equal(parseTrainingLink('#/training?mode=mistakes').mode, 'mistakes');
  assert.equal(parseTrainingLink('#/training?mode=endgames').mode, 'endgames');
  assert.equal(parseTrainingLink('#/training?mode=everything').mode, '');
});

test('parseTrainingLink: known puzzle ids are kept once, in order', () => {
  const parsed = parseTrainingLink('#/training?puzzles=b,a,b,zz', { themes: THEMES, puzzleIds: ['a', 'b'] });
  assert.deepEqual(parsed.puzzleIds, ['b', 'a']);
});

test('parseTrainingLink: unknown themes, bands and ids are dropped (negative case)', () => {
  const empty = { theme: '', difficulty: '', puzzleIds: [], mode: '' };
  assert.deepEqual(parseTrainingLink('#/training?theme=nonsense&difficulty=godlike&puzzles=zzz', { themes: THEMES }), empty);
  assert.deepEqual(parseTrainingLink('#/training', { themes: THEMES }), empty);
  assert.deepEqual(parseTrainingLink(undefined), empty);
});

import { traineeIdFor } from './trainingLink.js';

test('traineeIdFor: a member always trains as themselves, whatever was picked before', () => {
  assert.equal(traineeIdFor({ isCoach: false, myPlayerId: 'CC-005', pickedId: 'CC-009' }), 'CC-005');
  assert.equal(traineeIdFor({ isCoach: false, myPlayerId: null, pickedId: 'CC-009' }), '');
});

test('traineeIdFor: the coach picks, and starts as themselves', () => {
  assert.equal(traineeIdFor({ isCoach: true, myPlayerId: 'CC-002', pickedId: 'CC-009' }), 'CC-009');
  assert.equal(traineeIdFor({ isCoach: true, myPlayerId: 'CC-002', pickedId: null }), 'CC-002');
  // "Practice only" stays practice only.
  assert.equal(traineeIdFor({ isCoach: true, myPlayerId: 'CC-002', pickedId: '' }), '');
  assert.equal(traineeIdFor({ isCoach: true }), '');
});
