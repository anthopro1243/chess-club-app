import { useEffect, useState } from 'react';
import { queueCounts, enqueueAll } from '../analysis/queue.js';
import { useAnalysisActivity } from '../analysis/useAnalysisQueue.js';
import { withTimeout } from '../data/autoPolicy.js';

/*
 * The coach's view of the analysis queue — a status board and a backfill
 * button, not the mechanism. Games queue themselves when played or imported
 * and are drained in the background; this exists for clearing a backlog and
 * for seeing that the machinery is alive.
 */
export default function AnalysisQueuePanel({ queue }) {
  const [counts, setCounts] = useState(null);
  const [message, setMessage] = useState(null);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    let alive = true;
    queueCounts().then((c) => alive && setCounts(c));
    return () => {
      alive = false;
    };
  }, []);

  // The app-wide drainer (mounted in App) is the one actually working; this
  // page's own hook instance is disabled, so read what the drainer publishes.
  const activity = useAnalysisActivity();
  const running = queue?.running || !!activity.current;
  const progress = queue?.running ? queue.progress : activity.progress;

  // The live counts win once there are any.
  const shown = activity.counts ?? queue?.counts ?? counts;
  const outstanding = (shown?.pending ?? 0) + (shown?.running ?? 0);

  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Analysis queue</h2>
        <span className="badge mono">{outstanding} outstanding</span>
      </div>

      <p className="muted">
        Games are queued automatically when they are played or synced in, and analysed in the
        background while this app is open. In the normal course of things nothing here needs
        pressing.
      </p>

      {running && (
        <p className="muted">
          Analysing now
          {progress?.total ? ` — position ${progress.done} of ${progress.total}` : '…'}
        </p>
      )}

      <dl className="stat-row">
        {['pending', 'running', 'done', 'failed', 'skipped'].map((key) => (
          <div key={key}>
            <dt>{key[0].toUpperCase() + key.slice(1)}</dt>
            <dd className="mono">{shown?.[key] ?? '—'}</dd>
          </div>
        ))}
      </dl>

      <div className="button-grid">
        <button
          type="button"
          className="primary"
          disabled={working}
          onClick={async () => {
            setWorking(true);
            let result;
            try {
              result = await withTimeout(enqueueAll(), 30 * 1000, { label: 'Queuing' });
              setCounts(await withTimeout(queueCounts(), 30 * 1000, { label: 'Counting' }));
            } catch (error) {
              result = { ok: false, error: `${error.message} Try again.` };
            } finally {
              setWorking(false);
            }
            setMessage(
              result.ok
                ? result.queued
                  ? `${result.queued} game${result.queued === 1 ? '' : 's'} put back in the queue.`
                  : 'Nothing was waiting — everything with a PGN is analysed or already queued.'
                : `Could not queue: ${result.error}`,
            );
          }}
        >
          {working ? 'Queuing…' : 'Retry failed and skipped'}
        </button>
      </div>

      {shown?.failed > 0 && (
        <p className="muted">
          {shown.failed} game{shown.failed === 1 ? '' : 's'} failed analysis after repeated
          attempts. They stay failed rather than retrying forever — use the button above once the
          cause is fixed.
        </p>
      )}
      {message && <p className="muted">{message}</p>}
    </section>
  );
}
