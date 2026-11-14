import React from 'react';
import { createRoot } from 'react-dom/client';
// First, so its sign-out / account-switch clean-up runs before any store fetches.
import './data/auth.js';
import App from './app/App.jsx';
import '@fontsource/oswald/latin-500.css';
import '@fontsource/oswald/latin-600.css';
import '@fontsource/public-sans/latin-400.css';
import '@fontsource/public-sans/latin-600.css';
import '@fontsource/public-sans/latin-700.css';
import './styles/app.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
