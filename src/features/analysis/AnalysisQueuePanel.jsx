import { useEffect, useState } from 'react';
import { queueCounts, enqueueAll } from './queue.js';
import { useAnalysisActivity } from './useAnalysisQueue.js';
import { withTimeout } from '../../services/external/autoPolicy.js';
import { isCloud } from '../../services/backend.js';

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
        {isCloud
          ? 'New games get analyzed on their own while the app is open. You shouldn’t need to touch this.'
          : 'Background analysis needs the club server, and this copy of the app isn’t connected to one. Open a game on the Games page to analyze it there.'}
      </p>

      {running && (
        <p className="muted">
          Analyzing now
          {progress?.total ? `: position ${progress.done} of ${progress.total}` : '…'}
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
          // Only loud when there's something to retry.
          className={shown?.failed || shown?.skipped ? 'primary' : undefined}
          disabled={working}
          aria-busy={working}
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
                  : 'Nothing to retry. Every game is analyzed or already in line.'
                : `Couldn’t retry: ${result.error}`,
            );
          }}
        >
          {working ? 'Queuing…' : 'Retry failed and skipped'}
        </button>
      </div>

      {shown?.skipped > 0 && (
        <p className="muted">
          Skipped games are ones the engine is not meant to do: bullet games, and games of members
          who have left the club. Open one and press Analyze to do it by hand.
        </p>
      )}
      {shown?.failed > 0 && (
        <p className="muted">
          {shown.failed} game{shown.failed === 1 ? '' : 's'} couldn&rsquo;t be analyzed after a few
          tries. Press the button above to try again.
        </p>
      )}
      {message && <p className="muted">{message}</p>}
    </section>
  );
}
