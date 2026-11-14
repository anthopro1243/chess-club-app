import { useState } from 'react';
import { updatePassword } from '../../services/auth.js';
import Modal from '../../ui/Modal.jsx';
import PasswordField from './PasswordField.jsx';
import { MIN_PASSWORD_LENGTH as MIN_LENGTH } from './passwordRules.js';

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
      setError(err.message || 'Couldn’t update the password.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Set a new password" onClose={onCancel} closeLabel={null} className="auth-modal">
      <form className="signin-form" onSubmit={submit}>
        <PasswordField
          label="New password"
          hint={`At least ${MIN_LENGTH} characters`}
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
          autoFocus
        />
        <PasswordField label="Confirm new password" value={confirm} onChange={setConfirm} autoComplete="new-password" />
        {error && (
          <span className="hint-text auth-error" role="alert">
            {error}
          </span>
        )}
        <button type="submit" className="primary" disabled={busy} aria-busy={busy}>
          Set password
        </button>
        <button type="button" className="link-button" onClick={onCancel}>
          Cancel
        </button>
      </form>
    </Modal>
  );
}
