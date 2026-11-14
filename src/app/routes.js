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
  { id: 'home', label: 'Club', title: 'Club', icon: 'home', group: 'club', summary: 'The leaderboard and how the club is doing.' },
  { id: 'play', label: 'Play', title: 'Play', icon: 'play', group: 'play', summary: 'A game against a clubmate or the computer.' },
  { id: 'training', label: 'Training', title: 'Training', icon: 'training', group: 'play', summary: 'Puzzles picked for what you need to work on.' },
  { id: 'games', label: 'Games', title: 'Games', icon: 'games', group: 'records', summary: 'Every game the club has played, newest first.' },
  { id: 'my-games', label: 'My games', title: 'My games', icon: 'my-games', group: 'records', summary: 'Your own games, with the analysis for each.' },
  { id: 'roster', label: 'Roster', title: 'Roster', icon: 'roster', group: 'club', summary: 'Everyone in the club and their record.' },
  { id: 'coach', label: 'Coach', title: 'Coach', icon: 'coach', group: 'coach', summary: 'Queues, progress and tools for running the club.', coachOnly: true },
];

/*
 * The menu is grouped by what a page is for. Group order is the order of the
 * sidebar; a group nobody may see (Coach, for a member) is left out whole.
 */
export const NAV_GROUPS = [
  { id: 'club', label: 'Club' },
  { id: 'play', label: 'Play and train' },
  { id: 'records', label: 'Game records' },
  { id: 'coach', label: 'Coaching' },
];

/** The phone's bottom bar: the pages people use most. The rest sit under "More". */
const TAB_IDS = ['home', 'play', 'training', 'games'];

export const SITE_NAME = 'Chess Club';

/** What a typed-in address that names no page resolves to (see parseHash). */
export const NOT_FOUND = 'not-found';

/** The routes this account may see in the nav. */
export function visibleRoutes({ isCoach = false } = {}) {
  return ROUTES.filter((route) => !route.coachOnly || isCoach);
}

/** The sidebar: [{ id, label, routes }], empty groups dropped. */
export function navGroups(account = {}) {
  const routes = visibleRoutes(account);
  return NAV_GROUPS.map((group) => ({ ...group, routes: routes.filter((r) => r.group === group.id) })).filter(
    (group) => group.routes.length,
  );
}

/** The phone's bottom bar: { tabs, more }. Every visible route is in exactly one. */
export function tabRoutes(account = {}) {
  const routes = visibleRoutes(account);
  return {
    tabs: TAB_IDS.map((id) => routes.find((r) => r.id === id)).filter(Boolean),
    more: routes.filter((r) => !TAB_IDS.includes(r.id)),
  };
}

/**
 * What counts as "a different view" for focus and scroll: the page, plus the
 * one game a Games link opens. Other parameters (a puzzle theme, a selected
 * player) change what a page shows without leaving it.
 */
export function viewKey({ id, params = {} } = {}) {
  return id === 'games' && params.game ? `games:${params.game}` : id;
}

/** Whether this account may open the route at all (a typed-in #/coach included). */
export function canOpenRoute(id, { isCoach = false } = {}) {
  const route = ROUTES.find((r) => r.id === id);
  return !!route && (!route.coachOnly || isCoach);
}

/**
 * The route a hash names: { id, params }. A path that names no page is
 * NOT_FOUND. An empty hash, or one that is not a path at all (Supabase's
 * #access_token=… sign-in links), is home. Parameters come from the query
 * part: #/games?game=abc → { game: 'abc' }.
 */
export function parseHash(hash = '') {
  const raw = String(hash).replace(/^#\/?/, '');
  const [path, query = ''] = raw.split('?');
  const isPath = /^#\//.test(hash) && path !== '';
  const id = ROUTES.some((r) => r.id === path) ? path : isPath ? NOT_FOUND : 'home';
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
  if (id === NOT_FOUND) return `Page not found · ${SITE_NAME}`;
  const route = ROUTES.find((r) => r.id === id);
  return route && route.id !== 'home' ? `${route.title} · ${SITE_NAME}` : SITE_NAME;
}
