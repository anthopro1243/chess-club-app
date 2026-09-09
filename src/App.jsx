import { useEffect, useState } from 'react';
import DashboardPage from './pages/DashboardPage.jsx';
import PlayPage from './pages/PlayPage.jsx';
import RosterPage from './pages/RosterPage.jsx';
import TrainingPage from './pages/TrainingPage.jsx';
import GamesPage from './pages/GamesPage.jsx';
import CoachPage from './pages/CoachPage.jsx';
import AccountControl from './components/AccountControl.jsx';
import ResetPasswordModal from './components/ResetPasswordModal.jsx';
import AccessGate from './components/AccessGate.jsx';
import { supabase, isSupabaseConfigured } from './data/supabaseClient.js';
import { useAccount } from './data/accountStore.js';
import { useSyncError, clearSyncError } from './data/syncStatus.js';

const ROUTES = [
  { id: 'home', label: 'Club' },
  { id: 'play', label: 'Play' },
  { id: 'training', label: 'Training' },
  { id: 'games', label: 'Games' },
  { id: 'roster', label: 'Roster' },
  { id: 'coach', label: 'Coach' },
];

const routeFromHash = () => {
  const id = window.location.hash.replace('#/', '').replace('#', '') || 'home';
  return ROUTES.some((r) => r.id === id) ? id : 'home';
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
  const locked = isSupabaseConfigured && !account.loading && !account.isApproved;

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

  const navigate = (id) => {
    window.location.hash = `#/${id}`;
    setRoute(id);
  };

  return (
    <div className="app">
      <header className="topbar">
        <button type="button" className="brand" onClick={() => navigate('home')}>
          <span className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 45 45">
              <path d="M21 4.4h3v4.1h4.1v3H24v4.2h-3v-4.2h-4.1v-3H21z" />
              <path d="M22.5 16.4c6.4 0 11.1 3.9 12.7 9.2.9 3.2 1 5.4 1 7.2H8.8c0-1.8.1-4 1-7.2 1.6-5.3 6.3-9.2 12.7-9.2z" />
              <path d="M9.5 32.8h26v3H9.5z" />
              <path d="M7.6 35.8h29.8v3.1H7.6z" />
            </svg>
          </span>
          Chess Club
        </button>

        <nav className="nav">
          {(locked ? [] : ROUTES).map((item) => (
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
            Could not save {syncError.what} to the server, so this change only exists in this
            browser. {syncError.message}
          </span>
          <button type="button" onClick={clearSyncError} aria-label="Dismiss">
            ×
          </button>
        </div>
      )}

      <main className="content">
        {isSupabaseConfigured && account.loading ? null : locked ? (
          <AccessGate signedIn={account.signedIn} status={account.status} />
        ) : (
          <>
            {route === 'home' && <DashboardPage onNavigate={navigate} />}
            {route === 'play' && <PlayPage />}
            {route === 'training' && <TrainingPage />}
            {route === 'games' && <GamesPage />}
            {route === 'roster' && <RosterPage />}
            {route === 'coach' && <CoachPage />}
          </>
        )}
      </main>

      <footer className="footer">
        <span>Chess Club app, v0.1</span>
        <span>Rules engine tested against standard reference positions.</span>
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
