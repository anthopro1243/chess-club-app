import { useState } from 'react';
import { usePlatformRatingsFor, useRatingOverrideFor } from '../ratings/ratingStore.js';
import { resolveRating } from '../../analysis/ratings.js';
import { updatePassword, signOut } from '../../services/auth.js';
import PasswordField from './PasswordField.jsx';
import { MIN_PASSWORD_LENGTH } from './passwordRules.js';

export default function AccountSummary({ cloud, profile, studentId, onClose, onOpenConnections }) {
  // The same rating the leaderboard shows, with where it comes from. The old
  // line read players.club_rating, a blend of every time control that nothing
  // else in the app trusts any more (HANDOFF §9 item 5).
  const platformRatings = usePlatformRatingsFor(profile.playerId);
  const override = useRatingOverrideFor(profile.playerId);
  const rating = resolveRating({
    override,
    official: profile.ratings?.uscf != null ? { platform: 'uscf', rating: profile.ratings.uscf } : null,
    platformRatings: platformRatings.map((r) => ({ platform: r.platform, timeControl: r.timeControl, rating: r.rating })),
  });
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
      setError(err.message || 'Couldn’t update the password.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="account-summary">
      <p>
        Signed in as <strong>{cloud.email}</strong>
      </p>
      {rating.rating != null && (
        <p className="hint-text">
          Rating <strong className="mono">{rating.rating}</strong> ({rating.label})
        </p>
      )}
      {studentId && (
        <p className="hint-text">
          Student ID <span className="mono">{studentId}</span> (only you and the coach see this)
        </p>
      )}

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
          <PasswordField
            label="New password"
            hint={`At least ${MIN_PASSWORD_LENGTH} characters`}
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
            {busy ? 'Saving…' : 'Update password'}
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
