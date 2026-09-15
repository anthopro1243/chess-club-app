import { useMemo, useState } from 'react';
import { useAnalysisForGame } from '../data/analysisStore.js';
import { analyzeArchivedGame } from '../analysis/runner.js';
import { playerSummary, coachSummary, isStaff, canViewAnalysis } from '../analysis/presentation.js';
import { CATEGORY_LABELS } from '../analysis/scoring.js';

/*
 * The engine's read on one archived game.
 *
 * Who sees what is decided by presentation.js, which is unit-tested, not by
 * the JSX below — a rule enforced only in React is not enforced at all. The
 * database policies in 0009_game_analysis.sql are the real boundary; this is
 * the second line.
 */
export default function GameAnalysisPanel({ game, viewer }) {
  const stored = useAnalysisForGame(game.id);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState(null);

  const staff = isStaff(viewer);

  // Which sides may this viewer look at?
  const visible = useMemo(
    () =>
      stored.filter((row) =>
        canViewAnalysis(viewer, row.playerId ?? (row.side === 'w' ? game.whitePlayerId : game.blackPlayerId)),
      ),
    [stored, viewer, game],
  );

  const run = async () => {
    setRunning(true);
    setError(null);
    setProgress({ done: 0, total: 0 });
    const result = await analyzeArchivedGame(game, {
      onProgress: (p) => setProgress(p),
    });
    setRunning(false);
    setProgress(null);
    if (!result.ok) setError(result.error);
  };

  if (!viewer?.role) return null;

  return (
    <div className="analysis-panel">
      <div className="panel-header">
        <h3>Game analysis</h3>
        {staff && (
          <button type="button" onClick={run} disabled={running}>
            {running ? 'Analysing…' : visible.length ? 'Re-analyse' : 'Analyse this game'}
          </button>
        )}
      </div>

      {running && (
        <p className="muted">
          {progress?.total
            ? `Position ${progress.done} of ${progress.total}…`
            : 'Starting the engine…'}
        </p>
      )}
      {error && <p className="error">Analysis failed: {error}</p>}

      {!visible.length && !running && (
        <p className="muted">
          {staff
            ? 'Not analysed yet.'
            : 'Your coach has not published an analysis of this game yet.'}
        </p>
      )}

      {visible.map((row) => (
        <SideReport key={row.side} row={row} game={game} staff={staff} />
      ))}
    </div>
  );
}

function SideReport({ row, game, staff }) {
  const name = row.side === 'w' ? game.whiteName : game.blackName;
  const summary = useMemo(() => playerSummary(row.scores, null), [row.scores]);
  const coachRows = useMemo(() => (staff ? coachSummary(row.scores) : null), [row.scores, staff]);

  return (
    <div className="analysis-side">
      <div className="analysis-headline">
        <strong>{name}</strong>
        <span className="badge mono">{row.accuracy != null ? `${row.accuracy}% accuracy` : '—'}</span>
        {row.acpl != null && <span className="muted mono">ACPL {row.acpl}</span>}
        <span className="muted mono">
          depth {row.depth}
        </span>
      </div>

      <ul className="score-list">
        {(staff ? coachRows : summary.categories).map((entry) => {
          const key = entry.key ?? entry.label;
          if (staff) {
            return (
              <li key={key}>
                <span>{entry.label}</span>
                <span className="mono">
                  {entry.score ?? '—'}
                  {entry.caveat ? <em className="muted"> ({entry.caveat})</em> : null}
                </span>
              </li>
            );
          }
          return (
            <li key={key}>
              <span>{entry.label}</span>
              <span className="mono">{entry.text}</span>
            </li>
          );
        })}
      </ul>

      {!!row.critical?.length && (
        <>
          <h4>Turning points</h4>
          <ol className="critical-list">
            {row.critical.slice(0, staff ? 8 : 3).map((c) => (
              <li key={c.ply}>
                <span className="mono">
                  {c.fullmove}. {c.san}
                </span>{' '}
                <span className={`badge ${c.label}`}>{c.label}</span>{' '}
                <span className="muted">
                  lost {c.winPercentLost}% — better was {c.better}
                </span>
              </li>
            ))}
          </ol>
        </>
      )}

      {!!Object.keys(row.motifCounts || {}).length && (
        <p className="muted">
          Patterns:{' '}
          {Object.entries(row.motifCounts)
            .sort((a, b) => b[1] - a[1])
            .map(([motif, n]) => `${motif} ×${n}`)
            .join(', ')}
        </p>
      )}

      {row.coachNote && <blockquote className="coach-note">{row.coachNote}</blockquote>}
    </div>
  );
}

export { CATEGORY_LABELS };
