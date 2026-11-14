import { useState } from 'react';
import { claimProfile } from '../roster/rosterStore.js';

export default function ClaimProfileForm({ onDone }) {
  const [name, setName] = useState('');
  const [grade, setGrade] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    try {
      await claimProfile({ name, grade });
      onDone();
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="signin-form" onSubmit={submit}>
      <p className="hint-text">You&rsquo;re signed in. Add your name to join the roster.</p>
      <label className="field">
        <span>Your name</span>
        <input type="text" required autoFocus autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="field">
        <span>Grade (optional)</span>
        <input type="text" value={grade} onChange={(e) => setGrade(e.target.value)} />
      </label>
      <button type="submit" className="primary" disabled={busy} aria-busy={busy}>
        {busy ? 'Joining…' : 'Join the roster'}
      </button>
    </form>
  );
}
