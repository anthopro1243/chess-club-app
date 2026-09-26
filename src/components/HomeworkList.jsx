import HomeworkStatus from './HomeworkStatus.jsx';
import { assignmentTitle, drillLinkFor, unitFor } from '../data/homework.js';
import '../styles/homework.css';

const shortDate = (iso) =>
  iso
    ? new Date(iso).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
    : '—';

/**
 * HomeworkList — one trainee's homework, as `useHomeworkFor(playerId)`
 * returns it: unfinished first, each with its progress and a link to the
 * drill that completes it.
 *
 * Nothing here is ticked by hand. Progress comes from puzzles solved on the
 * Training page and games in the archive, so the list only ever moves when
 * the work itself happens.
 */
export default function HomeworkList({ items, emptyText = 'No homework right now.' }) {
  if (!items?.length) return <p className="hint-text">{emptyText}</p>;
  return (
    <ul className="hw-mine">
      {items.map(({ assignment, progress }) => {
        const games = assignment.kind === 'games';
        const shown = Math.min(progress.completed, progress.required);
        const percent = progress.required ? Math.round((shown / progress.required) * 100) : 0;
        return (
          <li key={assignment.id} className={`hw-mine-item hw-mine-${progress.status}`}>
            <div className="hw-mine-head">
              <strong>{assignmentTitle(assignment)}</strong>
              <HomeworkStatus progress={progress} />
            </div>
            <div className="hw-mine-meta">
              Due {shortDate(assignment.dueAt)} ·{' '}
              <span className="mono">
                {shown}/{progress.required}
              </span>{' '}
              {unitFor(assignment, progress.required)}
            </div>
            <span className="hw-bar" aria-hidden="true">
              <span style={{ width: `${percent}%` }} />
            </span>
            {assignment.note && <p className="hw-note">{assignment.note}</p>}
            {!progress.done && (
              <a className="hw-go" href={drillLinkFor(assignment)}>
                {games ? 'Play a game' : 'Practise these'} &rsaquo;
              </a>
            )}
            {games && !progress.done && (
              <p className="hw-help">Online games (after a sync) and scoresheets count too.</p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
