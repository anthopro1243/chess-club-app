import { Component, Suspense, useEffect, useState } from 'react';
import DashboardPage from './pages/DashboardPage.jsx';
import { lazyPage } from './lazyPage.js';
import AccountControl from './components/AccountControl.jsx';
import ResetPasswordModal from './components/ResetPasswordModal.jsx';
import AccessGate from './components/AccessGate.jsx';
import { supabase, isSupabaseConfigured } from './data/supabaseClient.js';
import { useAccount } from './data/accountStore.js';
import { useSyncError, clearSyncError } from './data/syncStatus.js';
import { useAnalysisQueue } from './analysis/useAnalysisQueue.js';
import { useAutoSync } from './data/useAutoSync.js';
import { useMyProfile } from './data/rosterStore.js';
import BackgroundActivity from './components/BackgroundActivity.jsx';
import { ROUTES, visibleRoutes, canOpenRoute } from './data/navRoutes.js';
import WhoAreYou from './components/WhoAreYou.jsx';
import { useMyAccountLink } from './data/accountLinkStore.js';
import { shouldAskWhoAreYou } from './data/accountLinking.js';

// Everything but the Club page loads when first opened (lazyPage.js).
const PlayPage = lazyPage(() => import('./pages/PlayPage.jsx'));
const RosterPage = lazyPage(() => import('./pages/RosterPage.jsx'));
const TrainingPage = lazyPage(() => import('./pages/TrainingPage.jsx'));
const GamesPage = lazyPage(() => import('./pages/GamesPage.jsx'));
const MyGamesPage = lazyPage(() => import('./pages/MyGamesPage.jsx'));
const CoachPage = lazyPage(() => import('./pages/CoachPage.jsx'));

const routeFromHash = () => {
  // A route may carry parameters, e.g. #/training?theme=fork, which is how the
  // improvement plan hands a player straight to the drill it just recommended.
  const raw = window.location.hash.replace('#/', '').replace('#', '') || 'home';
  const id = raw.split('?')[0] || 'home';
  return ROUTES.some((r) => r.id === id) ? id : 'home';
};

/** Parameters on the current hash route, as a plain object. */
export const routeParams = () => {
  const raw = window.location.hash.replace('#/', '').replace('#', '');
  const query = raw.split('?')[1];
  return query ? Object.fromEntries(new URLSearchParams(query)) : {};
};

/**
 * App — the club shell.
 *
 * Routing is done off the URL hash rather than a router package: it keeps the
 * dependency list to React alone, which means fewer things to install and
 * fewer things to break on a fresh machine.
 */
export default function App() {
  const [route, setRoute] = useState(routeFromHash);
  const [authNotice, setAuthNotice] = useState(null);
  const [passwordResetActive, setPasswordResetActive] = useState(false);

  // With a backend configured, the club's pages are for approved members
  // only. Without one, the app is running on somebody's own machine against
  // their own storage and there is nothing to gate.
  const account = useAccount();
  const syncError = useSyncError();

  // Drains the analysis queue while the app is open, so no game waits on a
  // human noticing it. The coach's batch button remains as a fallback.
  // The viewer's own games go first: theirs is the analysis someone is
  // waiting to read. `publish` feeds the corner indicator.
  const me = useMyProfile();
  useAnalysisQueue({ enabled: !!account?.isApproved, preferPlayerId: me?.playerId ?? null, publish: true });

  // Linked Chess.com / Lichess accounts sync themselves on open: the viewer's
  // own at most every 30 minutes, and in a coach's session every member's
  // account that hasn't synced in a day, politely (clubSync.js).
  useAutoSync({ enabled: !!account?.isApproved, isCoach: !!account?.isCoach });

  const locked = isSupabaseConfigured && !account.loading && !account.isApproved;

  // Once approved, a member says who they are, once (accountLinking.js).
  const link = useMyAccountLink();
  const askWhoAreYou = shouldAskWhoAreYou({ configured: isSupabaseConfigured, account, link });

  // Supabase redirects auth outcomes back here via the URL hash — the same
  // place our own routing looks. A successful sign-in's tokens are handled
  // by the Supabase client itself; what we handle here is the failure case
  // (an expired or already-used link), which Supabase also reports via the
  // hash and which would otherwise be silently swallowed by routeFromHash
  // falling back to "home" with no explanation.
  useEffect(() => {
    const hash = window.location.hash;
    if (!hash.includes('error=')) return;
    const params = new URLSearchParams(hash.replace(/^#\/?/, ''));
    let description = (params.get('error_description') || 'That sign-in link no longer works').replace(
      /\+/g,
      ' ',
    );
    if (!/[.!?]$/.test(description)) description += '.';
    setAuthNotice({ kind: 'error', message: `${description} Request a new one from Sign in.` });
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }, []);

  // A successful link click also lands here via the hash, but as tokens
  // the Supabase client consumes itself — we only need to know it happened,
  // to say so. Only for this landing (hadAuthHash), not every ordinary
  // visit where a session is simply already cached. A password-reset link
  // carries the same access_token shape but type=recovery — that's not a
  // "you're signed in" moment, it's "now set a new password", so it's
  // handled separately by opening the reset modal instead of the banner.
  useEffect(() => {
    if (!isSupabaseConfigured || !window.location.hash.includes('access_token')) return undefined;
    if (window.location.hash.includes('type=recovery')) {
      setPasswordResetActive(true);
      return undefined;
    }
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN') setAuthNotice({ kind: 'success', message: "You're signed in." });
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const [theme, setTheme] = useState(() => {
    // A saved choice wins; otherwise follow the host page, then the OS.
    try {
      const stored = localStorage.getItem('cc-theme');
      if (stored === 'light' || stored === 'dark') return stored;
    } catch {
      /* storage can be blocked; fall through to the environment */
    }
    const hosted = document.documentElement.getAttribute('data-theme');
    if (hosted === 'light' || hosted === 'dark') return hosted;
    return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  });

  // On a phone the nav scrolls sideways, so the current page's link can sit
  // off-screen (Roster, Coach). Keep it in view without moving the page.
  useEffect(() => {
    document.querySelector('.nav-link.active')?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }, [route]);

  useEffect(() => {
    const onHashChange = () => setRoute(routeFromHash());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem('cc-theme', theme);
    } catch {
      /* storage can be unavailable; the theme still applies for this visit */
    }
  }, [theme]);

  const navigate = (id, params = null) => {
    const query = params ? `?${new URLSearchParams(params).toString()}` : '';
    window.location.hash = `#/${id}${query}`;
    setRoute(id);
  };

  return (
    <div className="app">
      <header className="topbar">
        <button type="button" className="brand" onClick={() => navigate('home')}>
          <img className="brand-mark" src="./sem-logo.png" alt="" aria-hidden="true" width="34" height="34" />
          <span className="brand-name">Chess Club</span>
        </button>

        <nav className="nav">
          {(locked ? [] : visibleRoutes(account)).map((item) => (
            <button
              key={item.id}
              type="button"
              className={`nav-link ${route === item.id ? 'active' : ''}`}
              onClick={() => navigate(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <AccountControl />

        <button
          type="button"
          className="theme-toggle"
          onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
          aria-label="Toggle colour theme"
        >
          {theme === 'dark' ? 'Light' : 'Dark'}
        </button>
      </header>

      {authNotice && (
        <div className={`auth-banner ${authNotice.kind}`}>
          <span>{authNotice.message}</span>
          <button type="button" onClick={() => setAuthNotice(null)} aria-label="Dismiss">
            ×
          </button>
        </div>
      )}

      {syncError && (
        <div className="auth-banner error">
          <span>
            Couldn&rsquo;t save {syncError.what} to the server. It&rsquo;s only saved in this
            browser for now. {syncError.message}
          </span>
          <button type="button" onClick={clearSyncError} aria-label="Dismiss">
            ×
          </button>
        </div>
      )}

      <main className="content">
        {isSupabaseConfigured && account.loading ? null : locked ? (
          <AccessGate signedIn={account.signedIn} status={account.status} />
        ) : askWhoAreYou ? (
          <WhoAreYou onDone={(message) => setAuthNotice({ kind: 'success', message })} />
        ) : (
          <PageErrorBoundary key={route}>
            <Suspense fallback={<p className="muted page-loading">Loading…</p>}>
              {route === 'home' && <DashboardPage onNavigate={navigate} />}
              {route === 'my-games' && <MyGamesPage />}
              {route === 'play' && <PlayPage />}
              {route === 'training' && <TrainingPage />}
              {route === 'games' && <GamesPage />}
              {route === 'roster' && <RosterPage />}
              {route === 'coach' && (canOpenRoute('coach', account) ? <CoachPage /> : <CoachOnly onNavigate={navigate} />)}
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
            window.history.replaceState(null, '', window.location.pathname + window.location.search);
          }}
          onCancel={() => {
            setPasswordResetActive(false);
            window.history.replaceState(null, '', window.location.pathname + window.location.search);
          }}
        />
      )}
    </div>
  );
}

/** What a member sees if they follow an old link to the Coach page. */
function CoachOnly({ onNavigate }) {
  return (
    <section className="panel access-gate">
      <h2>Coaches only</h2>
      <p>This page is for the coach. Your own games and what to work on are on the Club page.</p>
      <button type="button" className="primary" onClick={() => onNavigate('home')}>
        Go to the Club page
      </button>
    </section>
  );
}

/**
 * If a page's code can't be fetched (offline, or a failed reload after a
 * deploy), say so with a way out, instead of a blank screen.
 */
class PageErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <section className="panel access-gate">
        <h2>This page didn&rsquo;t load</h2>
        <p>Check your connection and try again.</p>
        <button type="button" className="primary" onClick={() => window.location.reload()}>
          Reload
        </button>
      </section>
    );
  }
}
