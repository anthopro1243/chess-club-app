import { useEffect, useState } from 'react';
import { recentClientErrors, clearClientErrors, pruneClientErrors } from '../../services/errorLog.js';
import { shortGameDate } from '../../analysis/playerHome.js';

/*
 * What went wrong in members' browsers: failed saves and crashed pages
 * (services/errorLog.js, migration 0027). Before this the coach only heard
 * about a problem if a student mentioned it.
 */
export default function ClientErrorsPanel() {
  const [rows, setRows] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    await pruneClientErrors();
    setRows(await recentClientErrors(30));
  };

  useEffect(() => {
    load();
  }, []);

  if (!rows?.length) return null;

  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Problems in members&rsquo; browsers</h2>
        <button
          type="button"
          className="btn btn-sm"
          disabled={busy}
          aria-busy={busy}
          onClick={async () => {
            setBusy(true);
            await clearClientErrors();
            await load();
            setBusy(false);
          }}
        >
          Clear
        </button>
      </div>
      <p className="muted">The latest {rows.length}, newest first. Kept for 90 days.</p>
      <ul className="error-list">
        {rows.map((row) => (
          <li key={row.id}>
            <span className="mono">{shortGameDate(row.created_at)}</span> <strong>{row.place}</strong>
            {row.page ? <span className="muted"> on {row.page}</span> : null}
            <div className="small">{row.message}</div>
          </li>
        ))}
      </ul>
    </section>
  );
}
