import { useState } from 'react';
import { signInWithPassword } from '../../services/auth.js';
import PasswordField from './PasswordField.jsx';

export default function SignInForm({ onDone, onSwitch }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      await signInWithPassword(email.trim(), password);
      onDone();
    } catch (err) {
      setError(err.message || 'Couldn’t sign in.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="signin-form" onSubmit={submit}>
      <h2 className="popover-title">Sign in</h2>
      <label className="field">
        <span>Email</span>
        <input
          type="email"
          required
          autoFocus
          autoComplete="username"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setError('');
          }}
        />
      </label>
      <PasswordField label="Password" value={password} onChange={setPassword} autoComplete="current-password" />
      {error && (
        <span className="hint-text auth-error" role="alert">
          {error}
        </span>
      )}
      <button type="submit" className="btn btn-primary btn-block" disabled={busy} aria-busy={busy}>
        {busy ? 'Signing in…' : 'Sign in'}
      </button>
      <div className="auth-links">
        <button type="button" className="link-button" onClick={() => onSwitch('signup')}>
          Create an account
        </button>
        <button type="button" className="link-button" onClick={() => onSwitch('forgot')}>
          Forgot password?
        </button>
      </div>
    </form>
  );
}
