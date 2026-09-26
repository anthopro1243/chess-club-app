import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isPassing, mergeResult, resultFor, NOTATION_GAME_PLIES } from './prepResults.js';

test('isPassing: rules quiz at 80% of at least 10 questions', () => {
  assert.equal(isPassing('rules-quiz', { score: 11, total: 13 }), true);
  assert.equal(isPassing('rules-quiz', { score: 10, total: 13 }), false);
  assert.equal(isPassing('rules-quiz', { score: 8, total: 10 }), true);
  // A 5-question quiz is not the rules quiz, however well it went.
  assert.equal(isPassing('rules-quiz', { score: 5, total: 5 }), false);
});

test('isPassing: notation needs a full 40-move game (80 half-moves) at 95%', () => {
  assert.equal(NOTATION_GAME_PLIES, 80);
  assert.equal(isPassing('notation-game-type', { score: 76, total: 80 }), true);
  assert.equal(isPassing('notation-game-type', { score: 75, total: 80 }), false);
  assert.equal(isPassing('notation-game-type', { score: 20, total: 20 }), false);
  // Playing the moves on the board is practice, not the scoresheet skill.
  assert.equal(isPassing('notation-game-play', { score: 80, total: 80 }), false);
});

test('isPassing: malformed attempts never pass', () => {
  assert.equal(isPassing('rules-quiz', { score: 14, total: 13 }), false);
  assert.equal(isPassing('rules-quiz', { score: -1, total: 13 }), false);
  assert.equal(isPassing('rules-quiz', {}), false);
  assert.equal(isPassing('rules-quiz'), false);
});

test('mergeResult: first attempt becomes best and last, counts one', () => {
  const r = mergeResult(null, 'rules-quiz', { score: 9, total: 13, seconds: 120.4, at: '2026-09-29T23:00:00Z' });
  assert.equal(r.attempts, 1);
  assert.equal(r.best.score, 9);
  assert.equal(r.best.seconds, 120);
  assert.equal(r.last.score, 9);
  assert.equal(r.passedAt, null);
});

test('mergeResult: keeps the better attempt as best, the newer as last', () => {
  let r = mergeResult(null, 'rules-quiz', { score: 12, total: 13, seconds: 200, at: '2026-09-29T23:00:00Z' });
  r = mergeResult(r, 'rules-quiz', { score: 9, total: 13, seconds: 90, at: '2026-10-06T23:00:00Z' });
  assert.equal(r.best.score, 12);
  assert.equal(r.last.score, 9);
  assert.equal(r.attempts, 2);
});

test('mergeResult: at equal accuracy the longer, then the faster, attempt wins', () => {
  let r = mergeResult(null, 'notation-skills-type', { score: 10, total: 10, seconds: 60 });
  r = mergeResult(r, 'notation-skills-type', { score: 20, total: 20, seconds: 200 });
  assert.equal(r.best.total, 20);
  r = mergeResult(r, 'notation-skills-type', { score: 20, total: 20, seconds: 150 });
  assert.equal(r.best.seconds, 150);
});

test('mergeResult: the first pass is sticky; a worse retake does not un-ready a player', () => {
  let r = mergeResult(null, 'rules-quiz', { score: 12, total: 13, at: '2026-09-29T23:00:00Z' });
  assert.equal(r.passedAt, '2026-09-29T23:00:00Z');
  r = mergeResult(r, 'rules-quiz', { score: 3, total: 13, at: '2026-10-20T23:00:00Z' });
  assert.equal(r.passedAt, '2026-09-29T23:00:00Z');
});

test('mergeResult: refuses malformed attempts and unknown drills, keeping the old record', () => {
  const prev = mergeResult(null, 'rules-quiz', { score: 9, total: 13 });
  assert.equal(mergeResult(prev, 'rules-quiz', { score: 14, total: 13 }), prev);
  assert.equal(mergeResult(prev, 'rules-quiz', { score: 1.5, total: 13 }), prev);
  assert.equal(mergeResult(prev, 'rules-quiz', { score: 0, total: 0 }), prev);
  assert.equal(mergeResult(prev, 'made-up-drill', { score: 1, total: 1 }), prev);
  assert.equal(mergeResult(null, 'rules-quiz', null), null);
});

test('resultFor finds one player\'s drill record', () => {
  const rows = [
    { playerId: 'CC-1', drill: 'rules-quiz', attempts: 1 },
    { playerId: 'CC-2', drill: 'rules-quiz', attempts: 2 },
  ];
  assert.equal(resultFor(rows, 'CC-2', 'rules-quiz').attempts, 2);
  assert.equal(resultFor(rows, 'CC-3', 'rules-quiz'), null);
  assert.equal(resultFor(null, 'CC-1', 'rules-quiz'), null);
});
