import { useMemo, useState } from 'react';
import { useGames, renameInGames } from '../data/gamesStore.js';
import { archiveGraduate } from '../data/rosterStore.js';
import { clearPrivateRow } from '../data/playerPrivateStore.js';
import { setCoachNote } from '../data/coachNotesStore.js';
import { archivePlan, confirmsArchive } from '../data/graduateArchive.js';

/*
 * ArchiveGraduateModal — the coach's "Archive graduate" (research F120).
 * Shows exactly what will be removed and kept, and needs the member's name
 * typed before it runs, because it cannot be undone from the app.
 */
export default function ArchiveGraduateModal({ player, onClose, onArchived }) {
  const games = useGames();
  const plan = useMemo(() => archivePlan(player, games), [player, games]);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (!plan) return null;
  const ready = confirmsArchive(player, typed) && !busy;

  const run = async () => {
    setBusy(true);
    setError('');
    // Games first: if anything fails part-way, the member is still on the
    // roster under their name and the coach can simply run it again.
    const failedGames = await renameInGames(plan.gameUpdates);
    const privateOk = await clearPrivateRow(player.playerId);
    setCoachNote(player.playerId, '');
    const ok = failedGames === 0 && privateOk && (await archiveGraduate(player.playerId, plan.playerPatch));
    setBusy(false);
    if (!ok) {
      setError('Part of it didn’t save, so nothing was hidden. Check your connection and try again.');
      return;
    }
    onArchived?.(player.playerId);
  };

  return (
    <div className="promotion-backdrop" onClick={busy ? undefined : onClose}>
      <div
        className="promotion-dialog archive-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={`Archive ${player.name}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="panel-header">
          <h2>Archive {player.name} as a graduate</h2>
          <button type="button" className="link-button" onClick={onClose} disabled={busy}>
            Cancel
          </button>
        </div>
        <p>
          <strong>Removed:</strong> their name (shown as &ldquo;{plan.label}&rdquo; from now on), linked
          Chess.com / Lichess accounts and US Chess ID, guardian email, goal, style, training focus, your coach
          note, and their student ID and school email. Their name is also replaced in{' '}
          {plan.gameUpdates.length} game{plan.gameUpdates.length === 1 ? '' : 's'}.
        </p>
        <p>
          <strong>Kept without their name:</strong> ratings, rating history, analyses, skill scores and
          puzzle stats, so club stats stay right. They come off the roster.
        </p>
        <p className="hint-text">You can&rsquo;t undo this.</p>
        <label className="field">
          <span>Type their name to confirm</span>
          <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={player.name} autoFocus />
        </label>
        {error && <p className="error-text" role="alert">{error}</p>}
        <div className="panel-header-actions">
          <button type="button" className="primary danger" disabled={!ready} aria-busy={busy} onClick={run}>
            {busy ? 'Archiving…' : 'Archive graduate'}
          </button>
        </div>
      </div>
    </div>
  );
}
