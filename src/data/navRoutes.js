/*
 * navRoutes.js — which pages appear in the top bar for whom.
 *
 * The Coach page is the coach's oversight screen: member approval, every
 * player's progress, assessments and the spreadsheet export. A member who
 * opened it saw an approval panel they could not use and "Assess" buttons
 * that failed against the database. The database still refuses them either
 * way; this keeps the dead end out of the menu.
 */

export const ROUTES = [
  { id: 'home', label: 'Club' },
  { id: 'play', label: 'Play' },
  { id: 'training', label: 'Training' },
  { id: 'games', label: 'Games' },
  { id: 'my-games', label: 'My games' },
  { id: 'roster', label: 'Roster' },
  { id: 'coach', label: 'Coach', coachOnly: true },
];

/** The routes this account may see in the nav. */
export function visibleRoutes({ isCoach = false } = {}) {
  return ROUTES.filter((route) => !route.coachOnly || isCoach);
}

/** Whether this account may open the route at all (a typed-in #/coach included). */
export function canOpenRoute(id, { isCoach = false } = {}) {
  const route = ROUTES.find((r) => r.id === id);
  return !!route && (!route.coachOnly || isCoach);
}
