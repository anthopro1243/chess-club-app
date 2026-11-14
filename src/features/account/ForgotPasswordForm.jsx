import { useState } from 'react';
import { sendPasswordReset } from '../../services/auth.js';

export default function ForgotPasswordForm({ onSwitch }) {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    if (!email.trim()) return;
    setStatus('sending');
    try {
      await sendPasswordReset(email.trim());
      setStatus('sent');
    } catch (err) {
      setStatus(err.message || 'Couldn’t send the reset link.');
    }
  };

  if (status === 'sent') {
    return (
      <div className="signin-form">
        <p className="hint-text">Check your email for a link to set a new password.</p>
        <button type="button" className="link-button" onClick={() => onSwitch('signin')}>
          Back to sign in
        </button>
      </div>
    );
  }

  return (
    <form className="signin-form" onSubmit={submit}>
      <p className="hint-text">Enter your email and we'll send a link to reset your password.</p>
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
            setStatus('');
          }}
        />
      </label>
      <button type="submit" className="primary" disabled={status === 'sending'}>
        Send reset link
      </button>
      {status && status !== 'sending' && (
        <span className="hint-text auth-error" role="alert">
          {status}
        </span>
      )}
      <button type="button" className="link-button" onClick={() => onSwitch('signin')}>
        Back to sign in
      </button>
    </form>
  );
}
