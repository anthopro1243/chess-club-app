/*
 * lazyPage.js — load a page's code the first time someone opens it.
 *
 * The Club page is what everyone sees first, so only it ships in the first
 * download; Play, Training (with its 400-puzzle library), Games, Roster and
 * Coach come when tapped. On a phone on school wifi that is most of the
 * first-load script.
 *
 * The catch with split code: after a new deploy, a tab that was already open
 * asks for the OLD file names, which are gone. That shows up as a failed
 * import. Reloading once fetches the new page; the session flag stops a loop
 * if the failure is something else (offline, say), and the error then
 * reaches the Suspense fallback's error message instead.
 */

import { lazy } from 'react';

const RELOAD_FLAG = 'cc-chunk-reload';

export function lazyPage(loader) {
  return lazy(async () => {
    try {
      const module = await loader();
      try {
        sessionStorage.removeItem(RELOAD_FLAG);
      } catch {
        /* storage can be blocked; nothing to clear */
      }
      return module;
    } catch (error) {
      let reloaded = false;
      try {
        reloaded = sessionStorage.getItem(RELOAD_FLAG) === '1';
        if (!reloaded) sessionStorage.setItem(RELOAD_FLAG, '1');
      } catch {
        reloaded = true; // can't remember, so don't risk a reload loop
      }
      if (!reloaded) {
        window.location.reload();
        return new Promise(() => {}); // the reload replaces the page
      }
      throw error;
    }
  });
}
