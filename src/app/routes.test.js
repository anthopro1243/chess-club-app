import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ROUTES,
  visibleRoutes,
  canOpenRoute,
  parseHash,
  href,
  documentTitle,
  navGroups,
  tabRoutes,
  viewKey,
} from './routes.js';

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

test('parseHash: page and parameters; an unknown path is not-found, a non-path hash is home', () => {
  assert.deepEqual(parseHash('#/training?theme=fork&difficulty=easy'), {
    id: 'training',
    params: { theme: 'fork', difficulty: 'easy' },
  });
  assert.deepEqual(parseHash('#/games'), { id: 'games', params: {} });
  assert.deepEqual(parseHash(''), { id: 'home', params: {} });
  assert.deepEqual(parseHash('#/nope?x=1'), { id: 'not-found', params: { x: '1' } });
  assert.equal(parseHash('#/').id, 'home');
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
  assert.equal(documentTitle('not-found'), 'Page not found · Chess Club');
});

test('navGroups: every visible page once, and no Coaching group for a member', () => {
  const coach = navGroups({ isCoach: true });
  assert.deepEqual(coach.flatMap((g) => g.routes.map((r) => r.id)).sort(), ROUTES.map((r) => r.id).sort());
  const member = navGroups({ isCoach: false });
  assert.ok(!member.some((g) => g.id === 'coach'));
  assert.ok(member.every((g) => g.routes.length > 0));
});

test('tabRoutes: four tabs, the rest under More, nothing lost or repeated', () => {
  const { tabs, more } = tabRoutes({ isCoach: true });
  assert.deepEqual(tabs.map((r) => r.id), ['home', 'play', 'training', 'games']);
  assert.equal(tabs.length + more.length, ROUTES.length);
  assert.ok(!tabRoutes({ isCoach: false }).more.some((r) => r.id === 'coach'));
});

test('every route has an icon, a group and a summary', () => {
  for (const route of ROUTES) assert.ok(route.icon && route.group && route.summary, route.id);
});

test('viewKey: a linked game is its own view, other parameters are not', () => {
  assert.equal(viewKey(parseHash('#/games?game=abc')), 'games:abc');
  assert.equal(viewKey(parseHash('#/games')), 'games');
  assert.equal(viewKey(parseHash('#/roster?player=CC-001')), 'roster');
  assert.equal(viewKey(parseHash('#/training?theme=fork')), 'training');
});
