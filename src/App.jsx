import { useEffect, useState } from 'react';
import DashboardPage from './pages/DashboardPage.jsx';
import PlayPage from './pages/PlayPage.jsx';
import RosterPage from './pages/RosterPage.jsx';
import TrainingPage from './pages/TrainingPage.jsx';
import AccountControl from './components/AccountControl.jsx';

const ROUTES = [
  { id: 'home', label: 'Club' },
  { id: 'play', label: 'Play' },
  { id: 'training', label: 'Training' },
  { id: 'roster', label: 'Roster' },
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
          {ROUTES.map((item) => (
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

      <main className="content">
        {route === 'home' && <DashboardPage onNavigate={navigate} />}
        {route === 'play' && <PlayPage />}
        {route === 'training' && <TrainingPage />}
        {route === 'roster' && <RosterPage />}
      </main>

      <footer className="footer">
        <span>Chess Club app — v0.1</span>
        <span>Rules engine verified against standard perft counts.</span>
      </footer>
    </div>
  );
}
