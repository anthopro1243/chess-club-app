import { Component, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { useAutoSync } from '../features/sync/useAutoSync.js';
import { useMyProfile } from '../features/roster/rosterStore.js';
import BackgroundActivity from './BackgroundActivity.jsx';
import { ROUTES, SITE_NAME, NOT_FOUND, navGroups, tabRoutes, viewKey, canOpenRoute, documentTitle } from './routes.js';
import { useRoute } from './useRoute.js';
import Link from '../ui/Link.jsx';
import EmptyState from '../ui/EmptyState.jsx';
import Icon from '../ui/Icon.jsx';
import Modal from '../ui/Modal.jsx';
import PageHeader, { PageChromeProvider } from '../ui/PageHeader.jsx';
import PageSkeleton from '../ui/Skeleton.jsx';
import CommandPalette from './CommandPalette.jsx';
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

const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || '');

/** Whether a key press is headed for a text box, where "/" is just a slash. */
const isTyping = (target) =>
  !!target?.closest?.('input, textarea, select, [contenteditable=""], [contenteditable="true"]');

/**
 * App — the club shell: the menu (a sidebar on a laptop, a top bar and a tab
 * bar on a phone), quick search, banners, the page header, the access gate,
 * and the page the URL names (routes.js).
 */
export default function App() {
  const currentRoute = useRoute();
  const route = currentRoute.id;
  const view = viewKey(currentRoute);
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
  const toggleTheme = useCallback(() => setTheme((t) => (t === 'dark' ? 'light' : 'dark')), []);

  // Quick search opens from its button, Ctrl/Cmd K anywhere, or "/" when
  // nothing is being typed and no dialog is up.
  const [searching, setSearching] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  useEffect(() => {
    if (locked) return undefined;
    const onKey = (event) => {
      const combo = (event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'k';
      const slash =
        event.key === '/' && !event.ctrlKey && !event.metaKey && !event.altKey && !isTyping(event.target);
      if (!combo && !slash) return;
      if (document.querySelector('dialog[open]')) {
        if (combo) event.preventDefault(); // keep the browser's own Ctrl K out of it
        return;
      }
      event.preventDefault();
      setSearching(true);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [locked]);

  // The page header belongs to the shell; a page adds its actions and, for a
  // detail view, its own title and breadcrumb (ui/PageHeader.jsx).
  const [actionsNode, setActionsNode] = useState(null);
  const [meta, setMeta] = useState(null);
  const chrome = useMemo(() => ({ actionsNode, setMeta }), [actionsNode]);

  // A page change is announced: the tab title names the page, and focus
  // moves to the page's heading (not on first load, where it would steal
  // focus from the address bar).
  const headingRef = useRef(null);
  const firstRouteRef = useRef(true);
  useEffect(() => {
    if (firstRouteRef.current) {
      firstRouteRef.current = false;
      return;
    }
    setMoreOpen(false);
    headingRef.current?.focus({ preventScroll: true });
    window.scrollTo?.(0, 0);
  }, [view]);
  const detailTitle = meta?.crumbs?.length ? meta.title : null;
  useEffect(() => {
    document.title = detailTitle ? `${detailTitle} · ${SITE_NAME}` : documentTitle(route);
  }, [route, detailTitle]);

  const mainRef = useRef(null);
  const missing = route === NOT_FOUND;
  const Page = missing ? NotFound : PAGES[route] || ClubPage;
  const allowed = missing || canOpenRoute(route, account);
  const routeInfo = missing
    ? { title: 'Page not found', summary: null }
    : ROUTES.find((r) => r.id === route) || ROUTES[0];
  const showsPage = !(isCloud && account.loading) && !locked && !askWhoAreYou && allowed;
  const groups = locked ? [] : navGroups(account);
  const { tabs, more } = tabRoutes(account);
  const themeLabel = theme === 'dark' ? 'Light theme' : 'Dark theme';
  const themeIcon = theme === 'dark' ? 'sun' : 'moon';

  return (
    <div className="app">
      <button type="button" className="skip-link" onClick={() => mainRef.current?.focus()}>
        Skip to content
      </button>
      <header className="shell">
        <Link to="home" className="brand">
          <img className="brand-mark" src="./sem-logo.png" alt="" width="34" height="34" />
          <span className="brand-name">Chess Club</span>
        </Link>

        {!locked && (
          <button type="button" className="shell-search" onClick={() => setSearching(true)}>
            <Icon name="search" size={16} />
            <span className="shell-search-label">Search</span>
            <kbd className="kbd" aria-hidden="true">
              {IS_MAC ? '⌘K' : 'Ctrl K'}
            </kbd>
          </button>
        )}

        <nav className="sidenav" aria-label="Pages">
          {groups.map((group) => (
            <div className="sidenav-group" key={group.id}>
              <p className="sidenav-label">{group.label}</p>
              <ul>
                {group.routes.map((item) => (
                  <li key={item.id}>
                    <Link
                      to={item.id}
                      current={route === item.id}
                      className={`sidenav-link ${route === item.id ? 'active' : ''}`}
                    >
                      <Icon name={item.icon} />
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <div className="shell-tools">
          <AccountControl />
          <button
            type="button"
            className="shell-theme"
            onClick={toggleTheme}
            aria-label={`Switch to ${themeLabel.toLowerCase()}`}
          >
            <Icon name={themeIcon} size={17} />
            <span className="shell-theme-label">{themeLabel}</span>
          </button>
        </div>
      </header>

      <div className="app-main">
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
              {syncError.kind === 'load'
                ? <>Couldn&rsquo;t load {syncError.what} from the server, so what you see may be out of
                    date. {syncError.message}</>
                : <>Couldn&rsquo;t save {syncError.what} to the server. It&rsquo;s only saved in this
                    browser for now. {syncError.message}</>}
            </span>
            <button type="button" onClick={clearSyncError} aria-label="Dismiss">
              ×
            </button>
          </div>
        )}
      </div>

      <main className="content" id="main" ref={mainRef} tabIndex={-1}>
        <PageHeader
          title={showsPage ? meta?.title ?? routeInfo.title : allowed ? SITE_NAME : routeInfo.title}
          summary={showsPage ? (meta ? meta.summary : routeInfo.summary) : null}
          crumbs={showsPage ? meta?.crumbs : null}
          headingRef={headingRef}
          actionsRef={setActionsNode}
        />
        {isCloud && account.loading ? (
          <PageSkeleton />
        ) : locked ? (
          <AccessGate signedIn={account.signedIn} status={account.status} />
        ) : askWhoAreYou ? (
          <WhoAreYou onDone={(message) => setAuthNotice({ kind: 'success', message })} />
        ) : (
          <PageErrorBoundary key={route}>
            <PageChromeProvider value={chrome}>
              <div className="page-body">
                <Suspense fallback={<PageSkeleton />}>{allowed ? <Page /> : <CoachOnly />}</Suspense>
              </div>
            </PageChromeProvider>
          </PageErrorBoundary>
        )}
      </main>

      <footer className="footer">
        <span>SEM Chess Club</span>
        <span>
          Press <kbd className="kbd">{IS_MAC ? '⌘K' : 'Ctrl K'}</kbd> to search.
        </span>
      </footer>
      </div>

      {!locked && <BackgroundActivity />}

      {!locked && (
        <nav className="tabbar" aria-label="Pages">
          {tabs.map((item) => (
            <Link
              key={item.id}
              to={item.id}
              current={route === item.id}
              className={`tab ${route === item.id ? 'active' : ''}`}
            >
              <Icon name={item.icon} size={21} />
              <span>{item.label}</span>
            </Link>
          ))}
          <button
            type="button"
            className={`tab ${more.some((item) => item.id === route) ? 'active' : ''}`}
            aria-haspopup="dialog"
            onClick={() => setMoreOpen(true)}
          >
            <Icon name="more" size={21} />
            <span>More</span>
          </button>
        </nav>
      )}

      {moreOpen && (
        <Modal title="More" onClose={() => setMoreOpen(false)} className="more-sheet">
          <ul className="more-list">
            {more.map((item) => (
              <li key={item.id}>
                <Link
                  to={item.id}
                  current={route === item.id}
                  className={`more-link ${route === item.id ? 'active' : ''}`}
                  onClick={() => setMoreOpen(false)}
                >
                  <span className="more-icon">
                    <Icon name={item.icon} size={20} />
                  </span>
                  <span className="more-text">
                    <strong>{item.label}</strong>
                    <span>{item.summary}</span>
                  </span>
                  <Icon name="chevron-right" size={16} className="more-chevron" />
                </Link>
              </li>
            ))}
            <li>
              <button
                type="button"
                className="more-link"
                onClick={() => {
                  setMoreOpen(false);
                  setSearching(true);
                }}
              >
                <span className="more-icon">
                  <Icon name="search" size={20} />
                </span>
                <span className="more-text">
                  <strong>Search</strong>
                  <span>Find a page, a player or a game.</span>
                </span>
              </button>
            </li>
          </ul>
        </Modal>
      )}

      {searching && (
        <CommandPalette
          account={account}
          theme={theme}
          onToggleTheme={toggleTheme}
          onClose={() => setSearching(false)}
        />
      )}

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

/** A typed-in or out-of-date address that names no page. */
function NotFound() {
  return (
    <EmptyState
      icon="search"
      title="There’s no page at this address"
      actions={
        <Link to="home" className="btn btn-primary">
          Go to the Club page
        </Link>
      }
    >
      The link may be old or mistyped. Everything in the club is reachable from the menu.
    </EmptyState>
  );
}

/** What a member sees if they follow an old link to the Coach page. */
function CoachOnly() {
  return (
    <section className="panel access-gate">
      <h2>Coaches only</h2>
      <p>This page is for the coach. Your own games and what to work on are on the Club page.</p>
      <Link to="home" className="btn btn-primary">
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
        <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
          Reload
        </button>
      </section>
    );
  }
}
