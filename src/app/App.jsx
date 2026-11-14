import { Component, Suspense, useEffect, useRef, useState } from 'react';
import ClubPage from '../features/club/ClubPage.jsx';
import { lazyPage } from './lazyPage.js';
import AccountControl from '../features/account/AccountControl.jsx';
import ResetPasswordModal from '../features/account/ResetPasswordModal.jsx';
import AccessGate from '../features/account/AccessGate.jsx';
import { isCloud } from '../services/backend.js';
import { onAuthEvent } from '../services/auth.js';
import { useAccount } from '../features/account/accountStore.js';
import { useSyncError, clearSyncError } from '../services/syncStatus.js';
import { reportClientError } from '../services/errorLog.js';
import { useAnalysisQueue } from '../features/analysis/useAnalysisQueue.js';
import { useAutoSync } from '../services/external/useAutoSync.js';
import { useMyProfile } from '../features/roster/rosterStore.js';
import BackgroundActivity from './BackgroundActivity.jsx';
import { ROUTES, visibleRoutes, canOpenRoute, documentTitle } from './routes.js';
import { useRoute } from './useRoute.js';
import Link from '../ui/Link.jsx';
import WhoAreYou from '../features/account/WhoAreYou.jsx';
import { useMyAccountLink } from '../features/account/accountLinkStore.js';
import { shouldAskWhoAreYou } from '../features/account/accountLinking.js';

// Everything but the Club page loads when first opened (lazyPage.js).
const PAGES = {
  home: ClubPage,
  play: lazyPage(() => import('../features/play/PlayPage.jsx')),
  training: lazyPage(() => import('../features/training/TrainingPage.jsx')),
  games: lazyPage(() => import('../features/games/GamesPage.jsx')),
  'my-games': lazyPage(() => import('../features/games/MyGamesPage.jsx')),
  roster: lazyPage(() => import('../features/roster/RosterPage.jsx')),
  coach: lazyPage(() => import('../features/coach/CoachPage.jsx')),
};

const clearHash = () => window.history.replaceState(null, '', window.location.pathname + window.location.search);

/**
 * App — the club shell: top bar, banners, the access gate, and the page the
 * URL names (routes.js).
 */
export default function App() {
  const { id: route } = useRoute();
  const [authNotice, setAuthNotice] = useState(null);
  const [passwordResetActive, setPasswordResetActive] = useState(false);

  // With a backend configured, the club's pages are for approved members
  // only. Without one, the app is running on somebody's own machine against
  // their own storage and there is nothing to gate.
  const account = useAccount();
  const syncError = useSyncError();

  // Drains the analysis queue while the app is open, so no game waits on a
  // human noticing it. The viewer's own games go first, and a member's tab
  // drains only their own: claiming anyone else's is refused by the database
  // anyway, and used to cost dozens of wasted requests per idle cycle.
  const me = useMyProfile();
  useAnalysisQueue({
    enabled: !!account?.isApproved && (account.isCoach || !!me),
    playerId: account?.isCoach ? null : me?.playerId ?? null,
    preferPlayerId: me?.playerId ?? null,
    publish: true,
  });

  // Linked Chess.com / Lichess accounts sync themselves on open: the viewer's
  // own at most every 30 minutes, and in a coach's session every member's
  // account that hasn't synced in a day, politely (clubSync.js).
  useAutoSync({ enabled: !!account?.isApproved, isCoach: !!account?.isCoach });

  const locked = isCloud && !account.loading && !account.isApproved;

  // Once approved, a member says who they are, once (accountLinking.js).
  const link = useMyAccountLink();
  const askWhoAreYou = shouldAskWhoAreYou({ configured: isCloud, account, link });

  // Supabase redirects auth outcomes back here via the URL hash, the same
  // place our routing looks. A successful sign-in's tokens are handled by the
  // Supabase client itself; what we handle here is the failure case (an
  // expired or already-used link), which would otherwise land on the Club
  // page with no explanation.
  useEffect(() => {
    const hash = window.location.hash;
    if (!hash.includes('error=')) return;
    const params = new URLSearchParams(hash.replace(/^#\/?/, ''));
    let description = (params.get('error_description') || 'That sign-in link no longer works').replace(/\+/g, ' ');
    if (!/[.!?]$/.test(description)) description += '.';
    setAuthNotice({ kind: 'error', message: `${description} Request a new one from Sign in.` });
    clearHash();
  }, []);

  // A link click that signs someone in also lands here with tokens in the
  // hash. A password-reset link has the same shape but type=recovery: that
  // opens the reset dialog instead of the "signed in" banner.
  useEffect(() => {
    if (!isCloud || !window.location.hash.includes('access_token')) return undefined;
    if (window.location.hash.includes('type=recovery')) {
      setPasswordResetActive(true);
      return undefined;
    }
    return onAuthEvent((event) => {
      if (event === 'SIGNED_IN') setAuthNotice({ kind: 'success', message: "You're signed in." });
    });
  }, []);

  // The theme is applied before first paint by a script in index.html; this
  // keeps it in step with the toggle.
  const [theme, setTheme] = useState(() => (document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'));
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem('cc-theme', theme);
    } catch {
      /* storage can be unavailable; the theme still applies for this visit */
    }
  }, [theme]);

  // A page change is announced: the tab title names the page, and focus
  // moves to the page's heading (not on first load, where it would steal
  // focus from the address bar).
  const headingRef = useRef(null);
  const firstRouteRef = useRef(true);
  useEffect(() => {
    document.title = documentTitle(route);
    if (firstRouteRef.current) {
      firstRouteRef.current = false;
      return;
    }
    headingRef.current?.focus({ preventScroll: true });
    window.scrollTo?.(0, 0);
  }, [route]);

  // On a phone the nav scrolls sideways. Keep the current page's link in view
  // and fade whichever edge has more links past it, so it's clear there are.
  const navRef = useRef(null);
  const [navEdges, setNavEdges] = useState({ left: false, right: false });
  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return undefined;
    nav.querySelector('[aria-current="page"]')?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    const measure = () =>
      setNavEdges({
        left: nav.scrollLeft > 4,
        right: nav.scrollLeft + nav.clientWidth < nav.scrollWidth - 4,
      });
    measure();
    nav.addEventListener('scroll', measure, { passive: true });
    window.addEventListener('resize', measure);
    return () => {
      nav.removeEventListener('scroll', measure);
      window.removeEventListener('resize', measure);
    };
  }, [route, locked, account.isCoach]);

  const mainRef = useRef(null);
  const Page = PAGES[route] || ClubPage;
  const allowed = canOpenRoute(route, account);
  const title = ROUTES.find((r) => r.id === route)?.title || 'Club';

  return (
    <div className="app">
      <button type="button" className="skip-link" onClick={() => mainRef.current?.focus()}>
        Skip to content
      </button>
      <header className="topbar">
        <Link to="home" className="brand">
          <img className="brand-mark" src="./sem-logo.png" alt="" width="34" height="34" />
          <span className="brand-name">Chess Club</span>
        </Link>

        <nav
          ref={navRef}
          className={`nav ${navEdges.left ? 'fade-left' : ''} ${navEdges.right ? 'fade-right' : ''}`}
          aria-label="Pages"
        >
          {(locked ? [] : visibleRoutes(account)).map((item) => (
            <Link
              key={item.id}
              to={item.id}
              current={route === item.id}
              className={`nav-link ${route === item.id ? 'active' : ''}`}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <AccountControl />

        <button
          type="button"
          className="theme-toggle"
          onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
        >
          {theme === 'dark' ? 'Light theme' : 'Dark theme'}
        </button>
      </header>

      <div role="status" className="banner-slot">
        {authNotice && (
          <div className={`auth-banner ${authNotice.kind}`}>
            <span>{authNotice.message}</span>
            <button type="button" onClick={() => setAuthNotice(null)} aria-label="Dismiss">
              ×
            </button>
          </div>
        )}
      </div>

      <div role="alert" className="banner-slot">
        {syncError && (
          <div className="auth-banner error">
            <span>
              Couldn&rsquo;t save {syncError.what} to the server. It&rsquo;s only saved in this browser
              for now. {syncError.message}
            </span>
            <button type="button" onClick={clearSyncError} aria-label="Dismiss">
              ×
            </button>
          </div>
        )}
      </div>

      <main className="content" id="main" ref={mainRef} tabIndex={-1}>
        <h1 className="sr-only" ref={headingRef} tabIndex={-1}>
          {title}
        </h1>
        {isCloud && account.loading ? (
          <p className="muted page-loading" role="status">
            Loading…
          </p>
        ) : locked ? (
          <AccessGate signedIn={account.signedIn} status={account.status} />
        ) : askWhoAreYou ? (
          <WhoAreYou onDone={(message) => setAuthNotice({ kind: 'success', message })} />
        ) : (
          <PageErrorBoundary key={route}>
            <Suspense
              fallback={
                <p className="muted page-loading" role="status">
                  Loading…
                </p>
              }
            >
              {allowed ? <Page /> : <CoachOnly />}
            </Suspense>
          </PageErrorBoundary>
        )}
      </main>

      {!locked && <BackgroundActivity />}

      <footer className="footer">
        <span>Chess Club app, v0.1</span>
        <span>Made for the SEM Chess Club.</span>
      </footer>

      {passwordResetActive && (
        <ResetPasswordModal
          onDone={() => {
            setPasswordResetActive(false);
            setAuthNotice({ kind: 'success', message: 'Password updated. You are signed in.' });
            clearHash();
          }}
          onCancel={() => {
            setPasswordResetActive(false);
            clearHash();
          }}
        />
      )}
    </div>
  );
}

/** What a member sees if they follow an old link to the Coach page. */
function CoachOnly() {
  return (
    <section className="panel access-gate">
      <h2>Coaches only</h2>
      <p>This page is for the coach. Your own games and what to work on are on the Club page.</p>
      <Link to="home" className="button primary">
        Go to the Club page
      </Link>
    </section>
  );
}

/** A failed dynamic import: the page's code didn't download. */
export function isChunkLoadError(error) {
  const text = `${error?.name || ''} ${error?.message || ''}`;
  return /ChunkLoadError|dynamically imported module|Importing a module script failed|error loading dynamically|Failed to fetch/i.test(
    text,
  );
}

/**
 * A page that can't be shown says so with a way out, instead of a blank
 * screen. A download failure (offline, or a stale tab after a deploy) says
 * to check the connection; anything else is a bug, says so, and is logged
 * for the coach (errorLog.js).
 */
class PageErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    if (!isChunkLoadError(error)) {
      reportClientError('page crash', `${error?.message || error}${info?.componentStack?.split('\n')[1] || ''}`);
    }
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const download = isChunkLoadError(error);
    return (
      <section className="panel access-gate" role="alert">
        <h2>{download ? 'This page didn’t load' : 'Something went wrong on this page'}</h2>
        <p>
          {download
            ? 'Check your connection and try again.'
            : 'It’s been reported to the coach. Reloading usually gets you going again.'}
        </p>
        <button type="button" className="primary" onClick={() => window.location.reload()}>
          Reload
        </button>
      </section>
    );
  }
}
