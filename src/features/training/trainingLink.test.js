import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTrainingLink } from './trainingLink.js';

const THEMES = ['fork', 'pin', 'backRankMate'];

test('parseTrainingLink: a theme link is read back', () => {
  assert.deepEqual(parseTrainingLink('#/training?theme=fork', { themes: THEMES }), { theme: 'fork', mode: '' });
});

test('parseTrainingLink: ?mode=mistakes opens the player\'s own positions; unknown modes are dropped', () => {
  assert.equal(parseTrainingLink('#/training?mode=mistakes').mode, 'mistakes');
  assert.equal(parseTrainingLink('#/training?mode=endgames').mode, 'endgames');
  assert.equal(parseTrainingLink('#/training?mode=everything').mode, '');
});

test('parseTrainingLink: old puzzle-set and difficulty links are ignored, not an error', () => {
  assert.deepEqual(parseTrainingLink('#/training?puzzles=a,b&difficulty=easy', { themes: THEMES }), { theme: '', mode: '' });
  assert.equal(parseTrainingLink('#/training?theme=fork&difficulty=easy&puzzles=a', { themes: THEMES }).theme, 'fork');
});

test('parseTrainingLink: unknown themes are dropped (negative case)', () => {
  const empty = { theme: '', mode: '' };
  assert.deepEqual(parseTrainingLink('#/training?theme=nonsense', { themes: THEMES }), empty);
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
