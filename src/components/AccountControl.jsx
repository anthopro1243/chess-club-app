import { useState } from 'react';
import { useCloudStatus, useMyProfile, claimProfile } from '../data/rosterStore.js';
import { signInWithEmail, signOut } from '../data/auth.js';

/**
 * AccountControl — the sign-in / account button in the top bar.
 *
 * Renders nothing when no backend is configured (accounts are inherently a
 * shared-backend feature). Otherwise walks through three states: signed
 * out (email magic link), signed in with no player row yet (claim one),
 * and signed in with a profile (name, rating, sign out).
 */
export default function AccountControl() {
  const cloud = useCloudStatus();
  const profile = useMyProfile();
  const [open, setOpen] = useState(false);

  if (!cloud.configured) return null;

  return (
    <div className="account-control">
      <button type="button" className="account-button" onClick={() => setOpen((v) => !v)}>
        {cloud.signedIn ? profile?.name || cloud.email : 'Sign in'}
        {profile && <span className="account-rating mono">{Math.round(profile.clubRating?.rating ?? 1500)}</span>}
      </button>

      {open && (
        <div className="account-popover">
          {!cloud.signedIn && <SignInForm onDone={() => setOpen(false)} />}
          {cloud.signedIn && !profile && <ClaimProfileForm onDone={() => setOpen(false)} />}
          {cloud.signedIn && profile && (
            <div className="account-summary">
              <p>
                Signed in as <strong>{cloud.email}</strong>
              </p>
              <p className="hint-text">
                Club rating <strong>{Math.round(profile.clubRating?.rating ?? 1500)}</strong>
                {(profile.clubRating?.count ?? 0) < 10 && ' (provisional)'}
              </p>
              <button
                type="button"
                className="link-button"
                onClick={() => {
                  signOut();
                  setOpen(false);
                }}
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SignInForm({ onDone }) {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    if (!email.trim()) return;
    setStatus('sending');
    try {
      await signInWithEmail(email.trim());
      setStatus('sent');
    } catch (error) {
      setStatus(error.message || 'Could not send the link');
    }
  };

  if (status === 'sent') {
    return <p className="hint-text">Check your email for a sign-in link, then come back here.</p>;
  }

  return (
    <form className="signin-form" onSubmit={submit}>
      <p className="hint-text">Sign in or create an account — just an email, no password.</p>
      <input
        type="email"
        required
        autoFocus
        placeholder="you@example.com"
        value={email}
        onChange={(e) => {
          setEmail(e.target.value);
          setStatus('');
        }}
      />
      <button type="submit" className="primary" disabled={status === 'sending'}>
        Send magic link
      </button>
      {status && status !== 'sending' && <span className="hint-text">{status}</span>}
      <button type="button" className="link-button" onClick={onDone}>
        Close
      </button>
    </form>
  );
}

function ClaimProfileForm({ onDone }) {
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
      <p className="hint-text">You're signed in — set up your player profile to join the roster.</p>
      <input type="text" required autoFocus placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} />
      <input type="text" placeholder="Grade (optional)" value={grade} onChange={(e) => setGrade(e.target.value)} />
      <button type="submit" className="primary" disabled={busy}>
        Join the roster
      </button>
    </form>
  );
}
