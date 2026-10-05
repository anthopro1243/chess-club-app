import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePlayers } from '../data/rosterStore.js';
import { usePlayerPrivate } from '../data/playerPrivateStore.js';
import { buildLinkOverview } from '../data/accountLinking.js';
import { loadLinkData, coachLinkAccount } from '../data/accountLinkStore.js';

/**
 * AccountLinksPanel — on the Roster page, coach only: which accounts are tied
 * to which roster rows, and a one-click fix for a wrong one.
 *
 * Members link themselves with the "Who are you?" step (migration 0025), so
 * nothing here needs doing week to week. It is for the exceptions: a typo in
 * a student ID, two people claiming one ID, an account that should sit on a
 * row the coach imported. The decisions about who lands in which list are in
 * buildLinkOverview (accountLinking.js, tested).
 */
export default function AccountLinksPanel({ onSelectPlayer }) {
  const players = usePlayers();
  const privateById = usePlayerPrivate();
  const [data, setData] = useState({ loading: true, available: true, accounts: [], links: [] });
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    try {
      const next = await loadLinkData();
      setData({ loading: false, ...next });
    } catch (err) {
      setData((d) => ({ ...d, loading: false }));
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const overview = useMemo(
    () => buildLinkOverview({ players, privateById, accounts: data.accounts, links: data.links }),
    [players, privateById, data.accounts, data.links],
  );

  const run = async (key, userId, playerId) => {
    setBusy(key);
    setError('');
    try {
      await coachLinkAccount(userId, playerId);
      await reload();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  };

  if (data.loading) return null;
  if (!data.available) {
    return (
      <section className="panel account-links">
        <h2>Accounts</h2>
        <p className="muted small">
          Apply migration 0025 to see which accounts are linked to which students (steps in
          IMPROVEMENT-LOG.md).
        </p>
      </section>
    );
  }

  const freeRows = overview.rowsWithoutAccount;
  const accountLabel = (account) => account?.email || account?.displayName || 'unknown account';
  const rowPicker = ({ id, label, userId, exclude }) => (
    <select
      aria-label={label}
      value=""
      disabled={!!busy || freeRows.length === 0}
      aria-busy={busy === id}
      onChange={(event) => event.target.value && run(id, userId, event.target.value)}
    >
      <option value="">{freeRows.length ? label : 'No free roster rows'}</option>
      {freeRows
        .filter((r) => r.player.playerId !== exclude)
        .map((r) => (
          <option key={r.player.playerId} value={r.player.playerId}>
            {r.player.name} ({r.player.playerId}){r.studentId ? ` · ${r.studentId}` : ''}
          </option>
        ))}
    </select>
  );

  return (
    <section className="panel account-links">
      <div className="panel-header">
        <h2>Accounts</h2>
        <div className="panel-header-actions">
          <span className="badge">{overview.linked.length} linked</span>
          <span className={`badge ${overview.unlinkedAccounts.length ? 'warn' : ''}`}>
            {overview.unlinkedAccounts.length} not linked
          </span>
          <span className="badge">{freeRows.length} rows without an account</span>
        </div>
      </div>
      {error && <p className="field-error" role="alert">{error}</p>}

      {overview.needsAttention.length > 0 && (
        <>
          <h3>Check these</h3>
          <ul className="link-list">
            {overview.needsAttention.map((item) => (
              <li key={item.link.userId}>
                <span className="link-main">
                  <strong>{item.typedName}</strong>{' '}
                  <span className="muted small">{accountLabel(item.account)}</span>
                  <span className="small">
                    Typed student ID <span className="mono">{item.link.studentId}</span>
                    {item.holder
                      ? `, which is on ${item.holder.name} (${item.holder.playerId}).`
                      : ', which is already on another row.'}
                    {item.current ? ` Now on ${item.current.name} (${item.current.playerId}).` : ''}
                  </span>
                </span>
                <span className="link-actions">
                  {item.holder && !item.holder.userId && (
                    <button
                      type="button"
                      disabled={!!busy}
                      aria-busy={busy === `fix-${item.link.userId}`}
                      onClick={() => run(`fix-${item.link.userId}`, item.link.userId, item.holder.playerId)}
                    >
                      Move to {item.holder.name}
                    </button>
                  )}
                  {item.current && (
                    <button
                      type="button"
                      className="link-button"
                      disabled={!!busy}
                      onClick={() => run(`keep-${item.link.userId}`, item.link.userId, item.current.playerId)}
                    >
                      It&rsquo;s fine
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      {overview.unlinkedAccounts.length > 0 && (
        <>
          <h3>Accounts with no roster row</h3>
          <ul className="link-list">
            {overview.unlinkedAccounts.map((item) => (
              <li key={item.account.userId}>
                <span className="link-main">
                  <strong>{item.typedName || accountLabel(item.account)}</strong>
                  {item.typedName && <span className="muted small">{accountLabel(item.account)}</span>}
                  {!item.link && <span className="muted small">Hasn&rsquo;t answered &ldquo;Who are you?&rdquo; yet.</span>}
                </span>
                <span className="link-actions">
                  {rowPicker({ id: `link-${item.account.userId}`, label: 'Link to…', userId: item.account.userId })}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      <details className="link-details">
        <summary>Linked ({overview.linked.length})</summary>
        <ul className="link-list">
          {overview.linked.map((item) => (
            <li key={item.player.playerId}>
              <span className="link-main">
                <button type="button" className="link-button" onClick={() => onSelectPlayer?.(item.player.playerId)}>
                  <strong>{item.player.name}</strong>
                </button>{' '}
                <span className="mono small">{item.player.playerId}</span>
                {item.isCoach && <span className="badge">coach</span>}
                <span className="muted small">
                  {accountLabel(item.account)}
                  {item.studentId ? ` · ID ${item.studentId}` : ' · no student ID'}
                </span>
                {item.typedDifferent && (
                  <span className="small warn-text">They typed {item.link.studentId}.</span>
                )}
              </span>
              {!item.isCoach && (
                <span className="link-actions">
                  {rowPicker({
                    id: `move-${item.player.userId}`,
                    label: 'Move to…',
                    userId: item.player.userId,
                    exclude: item.player.playerId,
                  })}
                  <button
                    type="button"
                    className="link-button danger"
                    disabled={!!busy}
                    title="The member will be asked “Who are you?” again"
                    onClick={() => run(`unlink-${item.player.userId}`, item.player.userId, null)}
                  >
                    Unlink
                  </button>
                </span>
              )}
            </li>
          ))}
        </ul>
      </details>

      {freeRows.length > 0 && (
        <details className="link-details">
          <summary>Roster rows nobody has signed in as ({freeRows.length})</summary>
          <ul className="link-list">
            {freeRows.map((item) => (
              <li key={item.player.playerId}>
                <span className="link-main">
                  <button type="button" className="link-button" onClick={() => onSelectPlayer?.(item.player.playerId)}>
                    {item.player.name}
                  </button>{' '}
                  <span className="mono small">{item.player.playerId}</span>
                  <span className="muted small">{item.studentId ? `ID ${item.studentId}` : 'no student ID'}</span>
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}

      <p className="muted small">
        Members link themselves when they first sign in. Student IDs are only shown to coaches.
      </p>
    </section>
  );
}
