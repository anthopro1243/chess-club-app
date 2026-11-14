/*
 * routes.js — every page, who may see it, and how a URL names it.
 *
 * Routing is done off the URL hash (#/training?theme=fork) rather than a
 * router package: it keeps the dependency list to React alone. This file is
 * the one place that parses or builds those hashes; pages read the current
 * route through useRoute() and link with <Link> (src/ui/Link.jsx).
 *
 * The Coach page is the coach's oversight screen: member approval, every
 * player's progress, assessments and the spreadsheet export. A member who
 * opened it saw an approval panel they could not use and "Assess" buttons
 * that failed against the database. The database still refuses them either
 * way; this keeps the dead end out of the menu.
 */

export const ROUTES = [
  { id: 'home', label: 'Club', title: 'Club' },
  { id: 'play', label: 'Play', title: 'Play' },
  { id: 'training', label: 'Training', title: 'Training' },
  { id: 'games', label: 'Games', title: 'Games' },
  { id: 'my-games', label: 'My games', title: 'My games' },
  { id: 'roster', label: 'Roster', title: 'Roster' },
  { id: 'coach', label: 'Coach', title: 'Coach', coachOnly: true },
];

export const SITE_NAME = 'Chess Club';

/** The routes this account may see in the nav. */
export function visibleRoutes({ isCoach = false } = {}) {
  return ROUTES.filter((route) => !route.coachOnly || isCoach);
}

/** Whether this account may open the route at all (a typed-in #/coach included). */
export function canOpenRoute(id, { isCoach = false } = {}) {
  const route = ROUTES.find((r) => r.id === id);
  return !!route && (!route.coachOnly || isCoach);
}

/**
 * The route a hash names: { id, params }. Unknown pages fall back to home,
 * and parameters come from the query part: #/games?game=abc → { game: 'abc' }.
 */
export function parseHash(hash = '') {
  const raw = String(hash).replace(/^#\/?/, '');
  const [path, query = ''] = raw.split('?');
  const id = ROUTES.some((r) => r.id === path) ? path : 'home';
  let params = {};
  try {
    params = Object.fromEntries(new URLSearchParams(query));
  } catch {
    params = {};
  }
  return { id, params };
}

/** The hash for a route: href('training', { theme: 'fork' }) → '#/training?theme=fork'. */
export function href(id, params = null) {
  const entries = Object.entries(params || {}).filter(([, v]) => v != null && v !== '');
  const query = entries.length ? `?${new URLSearchParams(entries).toString()}` : '';
  return `#/${id}${query}`;
}

/** The browser tab title for a route. */
export function documentTitle(id) {
  const route = ROUTES.find((r) => r.id === id);
  return route && route.id !== 'home' ? `${route.title} · ${SITE_NAME}` : SITE_NAME;
}
