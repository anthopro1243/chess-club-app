import test from 'node:test';
import assert from 'node:assert/strict';
import { ROUTES, visibleRoutes, canOpenRoute } from './navRoutes.js';

test('a member does not see the Coach page in the nav', () => {
  const ids = visibleRoutes({ isCoach: false }).map((r) => r.id);
  assert.ok(!ids.includes('coach'));
  assert.ok(ids.includes('home') && ids.includes('training') && ids.includes('roster'));
});

test('a coach sees every page', () => {
  assert.equal(visibleRoutes({ isCoach: true }).length, ROUTES.length);
});

test('a member typing #/coach is refused; a coach is not', () => {
  assert.equal(canOpenRoute('coach', { isCoach: false }), false);
  assert.equal(canOpenRoute('coach', { isCoach: true }), true);
  assert.equal(canOpenRoute('my-games', { isCoach: false }), true);
  assert.equal(canOpenRoute('nope', { isCoach: true }), false);
});
