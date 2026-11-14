import { useSyncExternalStore } from 'react';
import { parseHash } from './routes.js';

/*
 * The current route, re-rendering on every hash change. One listener for the
 * whole app instead of one per page.
 */
const subscribe = (onChange) => {
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
};
const getHash = () => window.location.hash;

let cachedHash = null;
let cachedRoute = null;

/** { id, params, hash } for the current URL. */
export function useRoute() {
  const hash = useSyncExternalStore(subscribe, getHash, getHash);
  if (hash !== cachedHash) {
    cachedHash = hash;
    cachedRoute = { ...parseHash(hash), hash };
  }
  return cachedRoute;
}

/** Go to a route from code (after a form submits, say). Links should use <Link>. */
export function goTo(hrefValue) {
  window.location.hash = hrefValue;
}
