import React from 'react';
import { createRoot } from 'react-dom/client';
// First, so its sign-out / account-switch clean-up runs before any store fetches.
import './data/auth.js';
import App from './App.jsx';
import './styles/app.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
