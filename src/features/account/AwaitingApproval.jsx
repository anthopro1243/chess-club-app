import { useState } from 'react';
import { redeemInvite } from './accountStore.js';
import { signOut } from '../../services/auth.js';

/**
 * Shown to an account that has signed up but is not approved yet. Signing up
 * no longer gets you in on its own: either a coach approves the account, or
 * an invite code does it immediately. Until then the database returns
 * nothing, so there is nothing useful to render here anyway.
 */
export default function AwaitingApproval() {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    if (!code.trim()) return;
    setError('');
    setBusy(true);
    try {
      await redeemInvite(code);
    } catch (err) {
      setError(err.message || 'That code didn’t work.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="signin-form" onSubmit={submit}>
      <p className="hint-text">
        Your account is waiting for the coach to approve it. Got an invite code? Enter it here to
        get in now.
      </p>
      <label className="field">
        <span>Invite code</span>
        <input
          type="text"
          autoComplete="one-time-code"
          autoCapitalize="characters"
          value={code}
          onChange={(e) => {
            setCode(e.target.value.toUpperCase());
            setError('');
          }}
        />
      </label>
      {error && (
        <span className="hint-text auth-error" role="alert">
          {error}
        </span>
      )}
      <button type="submit" className="primary" disabled={busy} aria-busy={busy}>
        {busy ? 'Checking…' : 'Use code'}
      </button>
      <button type="button" className="link-button" onClick={() => signOut()}>
        Sign out
      </button>
    </form>
  );
}
