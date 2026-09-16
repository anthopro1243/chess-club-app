import { useState } from 'react';
import { useGames } from '../data/gamesStore.js';
import { usePendingQueue, useAnalyses } from '../data/analysisStore.js';
import { enqueueUnanalysed } from '../analysis/useAnalysisQueue.js';

/*
 * The coach's fallback, not the main mechanism.
 *
 * Games queue themselves when played or imported, and the queue drains while
 * the app is open. This panel exists for the case the automation cannot cover:
 * a backlog imported before auto-analysis existed, or a batch someone wants
 * pushed through straight after club night.
 */
export default function AnalysisQueuePanel() {
  const games = useGames();
  const queue = usePendingQueue();
  const analyses = useAnalyses();
  const [message, setMessage] = useState(null);

  const analysedGameIds = new Set(analyses.map((a) => a.gameId));
  const unanalysed = games.filter((g) => g.pgn && !analysedGameIds.has(g.id));

  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Analysis queue</h2>
        <span className="badge mono">{queue.length} queued</span>
      </div>
      <p className="muted">
        Games queue themselves when they are played or imported, and are analysed in the
        background while this app is open. Nothing here needs pressing in the normal course of
        things — this is for clearing a backlog.
      </p>
      <dl className="stat-row">
        <div>
          <dt>Archived games</dt>
          <dd className="mono">{games.length}</dd>
        </div>
        <div>
          <dt>Analysed</dt>
          <dd className="mono">{analysedGameIds.size}</dd>
        </div>
        <div>
          <dt>Never analysed</dt>
          <dd className="mono">{unanalysed.length}</dd>
        </div>
      </dl>
      <div className="button-grid">
        <button
          type="button"
          className="primary"
          disabled={!unanalysed.length}
          onClick={() => {
            const queued = enqueueUnanalysed(games);
            setMessage(
              queued
                ? `${queued} game${queued === 1 ? '' : 's'} queued. They will be analysed in the background — you can leave this page.`
                : 'Everything with a PGN has already been analysed.',
            );
          }}
        >
          Analyse all pending ({unanalysed.length})
        </button>
      </div>
      {message && <p className="muted">{message}</p>}
    </section>
  );
}
