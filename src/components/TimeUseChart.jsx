import { useMemo, useState } from 'react';
import { timeUse, timeUseHeadline, baseSecondsFromPgn } from '../analysis/timeUse.js';
import '../styles/time-use.css';

/*
 * TimeUseChart — seconds spent on each of one player's moves (research F054).
 *
 * One series, so no legend: the heading says what's plotted. Rushed mistakes
 * (under 5 s with more than 5 minutes left) are the only thing coloured
 * differently, and they also carry a "!" and are listed in words, so the
 * point never depends on seeing red. Hover or focus a bar for its move.
 */

const LABELS = {
  blunder: 'blunder', mistake: 'mistake', inaccuracy: 'inaccuracy',
  best: 'best move', onlyMove: 'only move', excellent: 'excellent', good: 'good',
  book: 'book', forced: 'decided position', unknown: '',
};

const fmt = (s) => (s >= 60 ? `${Math.floor(s / 60)}m ${Math.round(s % 60)}s` : `${Math.round(s)}s`);

export default function TimeUseChart({ row, game }) {
  const report = useMemo(
    () => timeUse(row?.plies || [], { baseSeconds: baseSecondsFromPgn(game?.pgn) }),
    [row, game],
  );
  const [focus, setFocus] = useState(null);

  if (!report.available) return null;

  const rushedPlies = new Set(report.rushed.map((m) => m.ply));
  // Scale to the longest think, but never let one huge think flatten the rest.
  const sorted = report.moves.map((m) => m.seconds).sort((a, b) => a - b);
  const p90 = sorted[Math.floor(sorted.length * 0.9)] || sorted[sorted.length - 1] || 1;
  const top = Math.max(10, Math.ceil(Math.min(sorted[sorted.length - 1], p90 * 1.5) / 10) * 10);
  const headline = timeUseHeadline(report);
  const current = focus != null ? report.moves.find((m) => m.ply === focus) : null;

  return (
    <div className="time-use">
      <div className="time-use-head">
        <strong>Time per move</strong>
        <span className="muted small">
          average {fmt(report.averageSeconds)}
          {report.shareUsed != null ? ` · used ${report.shareUsed}% of the clock` : ''}
        </span>
      </div>

      <div className="time-use-plot" role="img" aria-label={`Seconds spent on each move, up to ${fmt(top)}.`}>
        <span className="time-use-axis muted small">{fmt(top)}</span>
        <div className="time-use-bars">
          {report.moves.map((m) => {
            const rushed = rushedPlies.has(m.ply);
            const height = Math.max(2, Math.min(100, (m.seconds / top) * 100));
            return (
              <button
                key={m.ply}
                type="button"
                className={`time-use-bar ${rushed ? 'rushed' : ''} ${report.troubleFromMove != null && m.fullmove >= report.troubleFromMove ? 'trouble' : ''}`}
                style={{ height: `${height}%` }}
                aria-label={`Move ${m.fullmove} ${m.san}: ${fmt(m.seconds)}${LABELS[m.label] ? `, ${LABELS[m.label]}` : ''}${rushed ? ', rushed' : ''}`}
                onMouseEnter={() => setFocus(m.ply)}
                onFocus={() => setFocus(m.ply)}
                onMouseLeave={() => setFocus(null)}
                onBlur={() => setFocus(null)}
              >
                {rushed && <span className="time-use-flag" aria-hidden="true">!</span>}
              </button>
            );
          })}
        </div>
      </div>

      <p className="time-use-readout muted small" aria-live="polite">
        {current
          ? `Move ${current.fullmove} ${current.san}: ${fmt(current.seconds)}${LABELS[current.label] ? ` · ${LABELS[current.label]}` : ''}${current.clockBefore != null ? ` · ${fmt(current.clockBefore)} left` : ''}`
          : report.troubleFromMove != null
            ? `Short of time from move ${report.troubleFromMove} (lighter bars).`
            : `Longest think: move ${report.longest.fullmove} ${report.longest.san}, ${fmt(report.longest.seconds)}.`}
      </p>

      {headline && <p className="time-use-headline">{headline}</p>}

      <details className="time-use-list">
        <summary className="small">Show as a list</summary>
        <table className="roster-table">
          <thead><tr><th>Move</th><th>Time</th><th>Clock before</th><th /></tr></thead>
          <tbody>
            {report.moves.map((m) => (
              <tr key={m.ply}>
                <td>{m.fullmove}. {m.san}</td>
                <td className="mono">{fmt(m.seconds)}</td>
                <td className="mono">{m.clockBefore != null ? fmt(m.clockBefore) : '—'}</td>
                <td>{rushedPlies.has(m.ply) ? 'rushed ' : ''}{LABELS[m.label] && ['blunder', 'mistake'].includes(m.label) ? LABELS[m.label] : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
