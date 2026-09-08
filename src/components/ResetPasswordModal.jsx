import { useState } from 'react';
import { updatePassword } from '../data/auth.js';

const MIN_LENGTH = 8;

/**
 * ResetPasswordModal — shown when a password-reset email link lands back
 * on the app (App.jsx detects `type=recovery` in the URL and opens this).
 * Clicking that link already signs the browser in with a short-lived
 * recovery session; this just collects the new password and applies it.
 */
export default function ResetPasswordModal({ onDone, onCancel }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    if (password.length < MIN_LENGTH) {
      setError(`Password needs to be at least ${MIN_LENGTH} characters.`);
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      await updatePassword(password);
      onDone();
    } catch (err) {
      setError(err.message || 'Could not update the password.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="promotion-backdrop" onClick={onCancel}>
      <div
        className="promotion-dialog auth-modal"
        role="dialog"
        aria-label="Set a new password"
        onClick={(event) => event.stopPropagation()}
      >
        <h3>Set a new password</h3>
        <form className="signin-form" onSubmit={submit}>
          <input
            type="password"
            required
            autoFocus
            placeholder="New password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <input
            type="password"
            required
            placeholder="Confirm new password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
          {error && <span className="hint-text auth-error">{error}</span>}
          <button type="submit" className="primary" disabled={busy}>
            Set password
          </button>
          <button type="button" className="link-button" onClick={onCancel}>
            Cancel
          </button>
        </form>
      </div>
    </div>
  );
}
