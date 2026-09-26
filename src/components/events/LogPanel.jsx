import { RESULT_LABEL, BYE_LABEL } from '../../tournament/results.js';

/*
 * LogPanel — every manual change, newest first: who, what, why (F077).
 * Shown to coaches only. The reasons are often about children ("avoid
 * siblings", "left upset"), which is not wall material.
 */

const ACTION_LABEL = {
  swap: 'Swap',
  bye: 'Bye requested',
  'cancel-bye': 'Bye cancelled',
  withdraw: 'Withdrawal',
  reinstate: 'Reinstated',
  'late-entry': 'Late entry',
  'result-change': 'Result corrected',
  unpair: 'Round unpaired',
  entrants: 'Players changed',
  settings: 'Settings changed',
};

function describe(entry) {
  const d = entry.detail || {};
  switch (entry.action) {
    case 'swap':
      return `${d.a?.player} (${d.a?.from} → ${d.a?.to}) and ${d.b?.player} (${d.b?.from} → ${d.b?.to})`;
    case 'bye':
    case 'cancel-bye':
      return `${d.player}: ${BYE_LABEL[d.type] || d.type}`;
    case 'withdraw':
      return `${d.player}, from round ${d.fromRound}`;
    case 'reinstate':
      return d.player;
    case 'late-entry':
      return `${d.player}, from round ${d.fromRound}${d.halfByes ? ', half-point byes for missed rounds' : ''}`;
    case 'result-change':
      return `Board ${d.board}: ${RESULT_LABEL[d.from] || d.from || 'none'} → ${RESULT_LABEL[d.to] || d.to || 'cleared'}`;
    case 'unpair':
      return `${d.boards} boards taken back`;
    case 'entrants':
      return [d.added?.length ? `added ${d.added.join(', ')}` : '', d.removed?.length ? `removed ${d.removed.join(', ')}` : '']
        .filter(Boolean)
        .join('; ');
    case 'settings':
      return (d.changed || []).join(', ');
    default:
      return '';
  }
}

function when(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit', month: 'short', day: 'numeric' });
}

export default function LogPanel({ overrides }) {
  const entries = [...overrides].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  if (!entries.length) return <p className="ev-note">No manual changes yet. Swaps, byes, withdrawals, late entries and corrected results will be listed here.</p>;
  return (
    <ol className="ev-log">
      {entries.map((entry) => (
        <li key={entry.id}>
          <div className="ev-log-head">
            <span>{when(entry.createdAt)}</span>
            {entry.round && <span>Round {entry.round}</span>}
            <span>{entry.madeByName || 'Coach'}</span>
          </div>
          <div>
            <strong>{ACTION_LABEL[entry.action] || entry.action}</strong>: {describe(entry)}
          </div>
          {entry.reason && <div className="ev-note">Why: {entry.reason}</div>}
        </li>
      ))}
    </ol>
  );
}
