import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildStudyPlan, planRating, PRACTISE_SUGGESTION } from './studyPlan.js';
import { LICHESS_MIXED, THEME_VIDEOS, GENERAL_VIDEOS } from '../data/resources.js';

const REVIEWS = { due: 3, active: 5, href: '#/training?mode=mistakes' };

test('a tactic priority gets that tactic’s video and Lichess link', () => {
  const plan = buildStudyPlan({
    priority: { category: 'tacticalVision', label: 'Tactical vision', advice: 'You keep losing material to forks.', trainingTheme: 'Fork' },
    reviews: REVIEWS,
    rating: 1100,
  });
  assert.equal(plan.hasPriority, true);
  assert.equal(plan.focus.label, 'Tactical vision');
  assert.equal(plan.focus.line, 'You keep losing material to forks.');
  assert.equal(plan.watch, THEME_VIDEOS.fork);
  assert.equal(plan.practise.url, 'https://lichess.org/training/fork');
  assert.equal(plan.practise.suggestion, PRACTISE_SUGGESTION);
  assert.deepEqual(plan.review, REVIEWS);
});

test('a priority with no tactic uses the category video and the mixed puzzles link', () => {
  const plan = buildStudyPlan({
    priority: { category: 'endgameTechnique', label: 'Endgame technique', advice: null, trainingTheme: null },
    reviews: REVIEWS,
    rating: 1500,
  });
  assert.equal(plan.watch.short, 'Endgames like Magnus Carlsen');
  assert.equal(plan.practise.url, LICHESS_MIXED.url);
});

test('a category with no video of its own falls back to the general one for the band', () => {
  const plan = buildStudyPlan({
    priority: { category: 'aCategoryWithNoSlot', label: 'Something new', advice: 'x', trainingTheme: null },
    reviews: REVIEWS,
    rating: 1200,
  });
  assert.equal(plan.watch, GENERAL_VIDEOS['1000-1400']);
});

test('with no priority the plan is the newer-player default, never empty', () => {
  const plan = buildStudyPlan({ priority: null, reviews: { due: 0, active: 0, href: '#/training?mode=mistakes' } });
  assert.equal(plan.hasPriority, false);
  assert.equal(plan.watch, GENERAL_VIDEOS.under1000);
  assert.equal(plan.practise.url, 'https://lichess.org/training');
  assert.ok(plan.focus.label && plan.focus.line);
  assert.match(plan.play.text, /long game/);
});

test('a theme from a deep link overrides the priority', () => {
  const plan = buildStudyPlan({
    priority: { category: 'endgameTechnique', label: 'Endgame technique', advice: 'x', trainingTheme: null },
    reviews: REVIEWS,
    themeOverride: 'pin',
  });
  assert.equal(plan.hasPriority, false);
  assert.equal(plan.focus.label, 'Pin');
  assert.equal(plan.watch, THEME_VIDEOS.pin);
  assert.equal(plan.practise.url, 'https://lichess.org/training/pin');
});

test('a linked theme with no video still shows a general one', () => {
  const plan = buildStudyPlan({ themeOverride: 'mateIn2', reviews: REVIEWS, rating: 1600 });
  assert.equal(plan.watch, GENERAL_VIDEOS['1400+']);
  assert.equal(plan.practise.url, 'https://lichess.org/training/mateIn2');
});

test('planRating prefers US Chess, then the middle online rating, else null', () => {
  assert.equal(planRating({ playerId: 'A', ratings: { uscf: 900 } }, []), 900);
  const online = [
    { playerId: 'A', rating: 1200 }, { playerId: 'A', rating: 1000 }, { playerId: 'A', rating: 1500 }, { playerId: 'B', rating: 2000 },
  ];
  assert.equal(planRating({ playerId: 'A', ratings: {} }, online), 1200);
  assert.equal(planRating({ playerId: 'C', ratings: {} }, online), null);
});
