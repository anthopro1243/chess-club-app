import test from 'node:test';
import assert from 'node:assert/strict';
import { ROUTES, visibleRoutes, canOpenRoute, parseHash, href, documentTitle } from './routes.js';

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

test('parseHash: page and parameters, unknown pages go home', () => {
  assert.deepEqual(parseHash('#/training?theme=fork&difficulty=easy'), {
    id: 'training',
    params: { theme: 'fork', difficulty: 'easy' },
  });
  assert.deepEqual(parseHash('#/games'), { id: 'games', params: {} });
  assert.deepEqual(parseHash(''), { id: 'home', params: {} });
  assert.deepEqual(parseHash('#/nope?x=1'), { id: 'home', params: { x: '1' } });
  // Supabase's auth redirects also arrive in the hash; they land on home.
  assert.equal(parseHash('#access_token=abc&type=recovery').id, 'home');
});

test('href builds what parseHash reads, dropping empty parameters', () => {
  assert.equal(href('training', { theme: 'fork', difficulty: '' }), '#/training?theme=fork');
  assert.equal(href('home'), '#/home');
  assert.deepEqual(parseHash(href('games', { game: 'a b' })).params, { game: 'a b' });
});

test('documentTitle names the page', () => {
  assert.equal(documentTitle('games'), 'Games · Chess Club');
  assert.equal(documentTitle('home'), 'Chess Club');
});
