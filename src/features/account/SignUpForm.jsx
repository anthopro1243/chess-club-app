import { useState } from 'react';
import { signUpWithPassword } from '../../services/auth.js';
import PasswordField from './PasswordField.jsx';
import { MIN_PASSWORD_LENGTH } from './passwordRules.js';

export default function SignUpForm({ onDone, onSwitch }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [status, setStatus] = useState(''); // '' | 'sending' | 'confirm-email'

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password needs to be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setStatus('sending');
    try {
      const { confirmedImmediately } = await signUpWithPassword(email.trim(), password);
      if (confirmedImmediately) {
        onDone();
      } else {
        setStatus('confirm-email');
      }
    } catch (err) {
      setError(err.message || 'Couldn’t create the account.');
      setStatus('');
    }
  };

  if (status === 'confirm-email') {
    return (
      <div className="signin-form">
        <p className="hint-text">
          Almost done. Check your email for a link, then come back and sign in.
        </p>
        <button type="button" className="link-button" onClick={() => onSwitch('signin')}>
          Back to sign in
        </button>
      </div>
    );
  }

  return (
    <form className="signin-form" onSubmit={submit}>
      <h2 className="popover-title">Create an account</h2>
      <label className="field">
        <span>Email</span>
        <input
          type="email"
          required
          autoFocus
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setError('');
          }}
        />
      </label>
      <PasswordField
        label="Password"
        hint={`At least ${MIN_PASSWORD_LENGTH} characters`}
        value={password}
        onChange={setPassword}
        autoComplete="new-password"
      />
      <PasswordField label="Confirm password" value={confirm} onChange={setConfirm} autoComplete="new-password" />
      {error && (
        <span className="hint-text auth-error" role="alert">
          {error}
        </span>
      )}
      <button type="submit" className="btn btn-primary btn-block" disabled={status === 'sending'}>
        Create account
      </button>
      <button type="button" className="link-button" onClick={() => onSwitch('signin')}>
        Already have an account? Sign in
      </button>
    </form>
  );
}
