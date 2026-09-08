import { useState } from 'react';
import { useMyProfile, removeConnection } from '../data/rosterStore.js';
import { PLATFORMS } from '../data/externalChess.js';
import { connectAccount, syncPlatform } from '../data/externalSync.js';
import InfoTooltip from './InfoTooltip.jsx';

const RATING_LABELS = [
  ['bullet', 'Bullet'],
  ['blitz', 'Blitz'],
  ['rapid', 'Rapid'],
  ['classical', 'Classical'],
  ['daily', 'Daily'],
  ['puzzles', 'Puzzles'],
];

const relative = (iso) => {
  if (!iso) return 'never';
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
};

/**
 * ConnectionsModal — link a Chess.com or Lichess account to your player
 * profile, and pull your real games in.
 *
 * Everything here runs against the two sites' public APIs straight from the
 * browser, so linking an account only ever needs a username. We never ask
 * for a password and could not use one.
 */
export default function ConnectionsModal({ onClose }) {
  const profile = useMyProfile();

  return (
    <div className="promotion-backdrop" onClick={onClose}>
      <div
        className="promotion-dialog connections-modal"
        role="dialog"
        aria-label="Connected accounts"
        onClick={(event) => event.stopPropagation()}
      >
        <h3>
          Connected accounts
          <InfoTooltip>
            Games you play on these sites count toward your club rating, alongside club games and
            puzzles. Only rated standard games are counted.
          </InfoTooltip>
        </h3>

        {!profile ? (
          <p className="hint-text">Set up your player profile first, then come back here.</p>
        ) : (
          <div className="connection-cards">
            {Object.values(PLATFORMS).map((platform) => (
              <PlatformCard key={platform.key} platform={platform} profile={profile} />
            ))}
          </div>
        )}

        <button type="button" className="link-button" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}

function PlatformCard({ platform, profile }) {
  const connection = profile.connections?.[platform.key];
  const [username, setUsername] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const connect = async (event) => {
    event.preventDefault();
    if (!username.trim()) return;
    setError('');
    setBusy('connecting');
    try {
      await connectAccount(profile.playerId, platform.key, username.trim());
      setUsername('');
      await runSync();
    } catch (err) {
      setError(err.message || 'Could not link that account.');
    } finally {
      setBusy('');
    }
  };

  const runSync = async () => {
    setError('');
    setBusy('syncing');
    try {
      setResult(await syncPlatform(profile.playerId, platform.key));
    } catch (err) {
      setError(err.message || 'Sync failed.');
    } finally {
      setBusy('');
    }
  };

  const disconnect = () => {
    if (!window.confirm(`Unlink ${platform.label}? Games already counted stay counted.`)) return;
    removeConnection(profile.playerId, platform.key);
    setResult(null);
    setError('');
  };

  if (!connection?.username) {
    return (
      <section className="connection-card">
        <h4>{platform.label}</h4>
        <form className="signin-form" onSubmit={connect}>
          <input
            type="text"
            placeholder={`Your ${platform.label} username`}
            value={username}
            onChange={(e) => {
              setUsername(e.target.value);
              setError('');
            }}
          />
          {error && <span className="hint-text auth-error">{error}</span>}
          <button type="submit" className="primary" disabled={!!busy}>
            {busy === 'connecting' ? 'Checking…' : busy === 'syncing' ? 'Importing games…' : 'Connect'}
          </button>
        </form>
      </section>
    );
  }

  const ratings = connection.ratings || {};
  const shown = RATING_LABELS.filter(([key]) => ratings[key] != null);

  return (
    <section className="connection-card connected">
      <h4>
        {platform.label}
        <a href={connection.url} target="_blank" rel="noreferrer" className="connection-user">
          {connection.username}
        </a>
      </h4>

      {shown.length > 0 && (
        <div className="connection-ratings">
          {shown.map(([key, label]) => (
            <span key={key} className="rating-chip">
              <span className="rating-chip-label">{label}</span>
              <span className="mono">{ratings[key]}</span>
            </span>
          ))}
        </div>
      )}

      <p className="hint-text">Last synced {relative(connection.lastSyncedAt)}</p>

      {result && !error && (
        <p className="hint-text sync-result">
          {result.imported > 0
            ? `Imported ${result.imported} game${result.imported === 1 ? '' : 's'}. Club rating ${Math.round(result.ratingBefore)} to ${Math.round(result.ratingAfter)}.`
            : 'Already up to date.'}
        </p>
      )}
      {error && <span className="hint-text auth-error">{error}</span>}

      <div className="auth-links">
        <button type="button" className="link-button" onClick={runSync} disabled={!!busy}>
          {busy === 'syncing' ? 'Syncing…' : 'Sync now'}
        </button>
        <button type="button" className="link-button danger" onClick={disconnect} disabled={!!busy}>
          Unlink
        </button>
      </div>
    </section>
  );
}
