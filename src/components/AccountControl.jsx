import { useState } from 'react';
import { useCloudStatus, useMyProfile, claimProfile } from '../data/rosterStore.js';
import ConnectionsModal from './ConnectionsModal.jsx';
import { useAccount, redeemInvite } from '../data/accountStore.js';
import {
  signInWithPassword,
  signUpWithPassword,
  sendPasswordReset,
  updatePassword,
  signOut,
} from '../data/auth.js';

const MIN_PASSWORD_LENGTH = 8;

/**
 * AccountControl — the sign-in / account button in the top bar.
 *
 * Renders nothing when no backend is configured (accounts are inherently a
 * shared-backend feature). Otherwise walks through: signed out (sign in /
 * create account / forgot password, one at a time), signed in with no
 * player row yet (claim one), and signed in with a profile (name, rating,
 * change password, sign out).
 */
export default function AccountControl() {
  const cloud = useCloudStatus();
  const profile = useMyProfile();
  const account = useAccount();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState('signin'); // 'signin' | 'signup' | 'forgot'
  const [showConnections, setShowConnections] = useState(false);

  if (!cloud.configured) return null;

  const close = () => {
    setOpen(false);
    setMode('signin');
  };

  return (
    <div className="account-control">
      <button type="button" className="account-button" onClick={() => setOpen((v) => !v)}>
        {cloud.signedIn ? profile?.name || cloud.email : 'Sign in'}
        {profile && <span className="account-rating mono">{Math.round(profile.clubRating?.rating ?? 1500)}</span>}
      </button>

      {open && (
        <div className="account-popover">
          {!cloud.signedIn && mode === 'signin' && (
            <SignInForm onDone={close} onSwitch={setMode} />
          )}
          {!cloud.signedIn && mode === 'signup' && (
            <SignUpForm onDone={close} onSwitch={setMode} />
          )}
          {!cloud.signedIn && mode === 'forgot' && (
            <ForgotPasswordForm onSwitch={setMode} />
          )}
          {cloud.signedIn && !account.loading && !account.isApproved && <AwaitingApproval />}
          {cloud.signedIn && account.isApproved && !profile && <ClaimProfileForm onDone={close} />}
          {cloud.signedIn && account.isApproved && profile && (
            <AccountSummary
              cloud={cloud}
              profile={profile}
              onClose={close}
              onOpenConnections={() => {
                close();
                setShowConnections(true);
              }}
            />
          )}
        </div>
      )}

      {showConnections && <ConnectionsModal onClose={() => setShowConnections(false)} />}
    </div>
  );
}

function PasswordField({ value, onChange, placeholder, autoFocus }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="password-field">
      <input
        type={visible ? 'text' : 'password'}
        required
        autoFocus={autoFocus}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={placeholder.toLowerCase().includes('new') ? 'new-password' : 'current-password'}
      />
      <button type="button" className="password-toggle" onClick={() => setVisible((v) => !v)} tabIndex={-1}>
        {visible ? 'Hide' : 'Show'}
      </button>
    </div>
  );
}

function SignInForm({ onDone, onSwitch }) {
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
      setError(err.message || 'Could not sign in.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="signin-form" onSubmit={submit}>
      <p className="hint-text">Sign in</p>
      <input
        type="email"
        required
        autoFocus
        placeholder="you@example.com"
        value={email}
        onChange={(e) => {
          setEmail(e.target.value);
          setError('');
        }}
      />
      <PasswordField value={password} onChange={setPassword} placeholder="Password" />
      {error && <span className="hint-text auth-error">{error}</span>}
      <button type="submit" className="primary" disabled={busy}>
        Sign in
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

function SignUpForm({ onDone, onSwitch }) {
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
      setError(err.message || 'Could not create the account.');
      setStatus('');
    }
  };

  if (status === 'confirm-email') {
    return (
      <div className="signin-form">
        <p className="hint-text">
          Almost there. Check your email for a confirmation link, then come back and sign in.
        </p>
        <button type="button" className="link-button" onClick={() => onSwitch('signin')}>
          Back to sign in
        </button>
      </div>
    );
  }

  return (
    <form className="signin-form" onSubmit={submit}>
      <p className="hint-text">Create an account</p>
      <input
        type="email"
        required
        autoFocus
        placeholder="you@example.com"
        value={email}
        onChange={(e) => {
          setEmail(e.target.value);
          setError('');
        }}
      />
      <PasswordField value={password} onChange={setPassword} placeholder="Password (min 8 characters)" />
      <PasswordField value={confirm} onChange={setConfirm} placeholder="Confirm password" />
      {error && <span className="hint-text auth-error">{error}</span>}
      <button type="submit" className="primary" disabled={status === 'sending'}>
        Create account
      </button>
      <button type="button" className="link-button" onClick={() => onSwitch('signin')}>
        Already have an account? Sign in
      </button>
    </form>
  );
}

function ForgotPasswordForm({ onSwitch }) {
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
      setStatus(err.message || 'Could not send the reset link.');
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
        Send reset link
      </button>
      {status && status !== 'sending' && <span className="hint-text auth-error">{status}</span>}
      <button type="button" className="link-button" onClick={() => onSwitch('signin')}>
        Back to sign in
      </button>
    </form>
  );
}

/**
 * Shown to an account that has signed up but is not approved yet. Signing up
 * no longer gets you in on its own: either a coach approves the account, or
 * an invite code does it immediately. Until then the database returns
 * nothing, so there is nothing useful to render here anyway.
 */
function AwaitingApproval() {
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
      setError(err.message || 'That code did not work.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="signin-form" onSubmit={submit}>
      <p className="hint-text">
        Your account is waiting for a coach to approve it. If you were given an invite code, enter
        it here and you are in straight away.
      </p>
      <input
        type="text"
        placeholder="Invite code"
        value={code}
        onChange={(e) => {
          setCode(e.target.value.toUpperCase());
          setError('');
        }}
      />
      {error && <span className="hint-text auth-error">{error}</span>}
      <button type="submit" className="primary" disabled={busy}>
        {busy ? 'Checking…' : 'Use code'}
      </button>
      <button type="button" className="link-button" onClick={() => signOut()}>
        Sign out
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
      <p className="hint-text">You're signed in. Set up your player profile to join the roster.</p>
      <input type="text" required autoFocus placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} />
      <input type="text" placeholder="Grade (optional)" value={grade} onChange={(e) => setGrade(e.target.value)} />
      <button type="submit" className="primary" disabled={busy}>
        Join the roster
      </button>
    </form>
  );
}

function AccountSummary({ cloud, profile, onClose, onOpenConnections }) {
  const [changingPassword, setChangingPassword] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [status, setStatus] = useState(''); // '' | 'saving' | 'done'
  const [busy, setBusy] = useState(false);

  const submitPasswordChange = async (event) => {
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
    setBusy(true);
    try {
      await updatePassword(password);
      setStatus('done');
      setPassword('');
      setConfirm('');
    } catch (err) {
      setError(err.message || 'Could not update the password.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="account-summary">
      <p>
        Signed in as <strong>{cloud.email}</strong>
      </p>
      <p className="hint-text">
        Club rating <strong>{Math.round(profile.clubRating?.rating ?? 1500)}</strong>
        {(profile.clubRating?.count ?? 0) < 10 && ' (provisional)'}
      </p>

      {!changingPassword && (
        <button type="button" className="connections-button" onClick={onOpenConnections}>
          Connected accounts
          <span className="badge">{Object.keys(profile.connections || {}).length || 'none'}</span>
        </button>
      )}

      {!changingPassword && (
        <div className="auth-links">
          <button type="button" className="link-button" onClick={() => setChangingPassword(true)}>
            Change password
          </button>
          <button
            type="button"
            className="link-button"
            onClick={() => {
              signOut();
              onClose();
            }}
          >
            Sign out
          </button>
        </div>
      )}

      {changingPassword && status !== 'done' && (
        <form className="signin-form" onSubmit={submitPasswordChange}>
          <PasswordField value={password} onChange={setPassword} placeholder="New password" autoFocus />
          <PasswordField value={confirm} onChange={setConfirm} placeholder="Confirm new password" />
          {error && <span className="hint-text auth-error">{error}</span>}
          <button type="submit" className="primary" disabled={busy}>
            Update password
          </button>
          <button type="button" className="link-button" onClick={() => setChangingPassword(false)}>
            Cancel
          </button>
        </form>
      )}

      {changingPassword && status === 'done' && (
        <p className="hint-text">Password updated.</p>
      )}
    </div>
  );
}
