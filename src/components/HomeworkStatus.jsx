import { STATUS_LABEL } from '../data/homework.js';
import '../styles/homework.css';

/**
 * HomeworkStatus — the done / in progress / not started / overdue pill.
 *
 * Colour is never the only cue (the label is always written out), because
 * the coach reads this list across a room on a projector as often as up close.
 */
export default function HomeworkStatus({ progress }) {
  const status = progress?.status || 'not-started';
  return (
    <span className={`hw-status hw-status-${status}`}>
      {STATUS_LABEL[status]}
      {progress?.late ? ' · late' : ''}
    </span>
  );
}
