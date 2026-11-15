import React from 'react';
import { createRoot } from 'react-dom/client';
// First, so its sign-out / account-switch clean-up runs before any store fetches.
import './services/auth.js';
import App from './app/App.jsx';
import '@fontsource/oswald/latin-500.css';
import '@fontsource/oswald/latin-600.css';
import '@fontsource/public-sans/latin-400.css';
import '@fontsource/public-sans/latin-600.css';
import '@fontsource/public-sans/latin-700.css';
import './styles/app.css';

// The removed Play page left a saved game in the browser; nothing reads it any more.
try {
  localStorage.removeItem('cc-play-state-v2');
} catch {
  /* storage can be unavailable; the stale key is harmless */
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
