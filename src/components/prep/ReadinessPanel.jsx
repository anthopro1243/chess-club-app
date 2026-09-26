import { useMemo, useState } from 'react';
import { answersForEvent } from '../../data/availabilityPoll.js';
import { useEventAvailability } from '../../data/eventAvailabilityStore.js';
import { useEventRegistrations, upsertRegistration } from '../../data/eventRegistrationStore.js';
import { READINESS_ITEMS } from '../../data/readiness.js';

const MARK = { done: '✓', todo: '○', 'coming-soon': '…' };
const ITEM_KEYS = Object.keys(READINESS_ITEMS);
const SHORT = { rules: 'Rules', notation: 'Notation', slowGames: 'Slow games', endgame: 'Endgame', repertoire: 'Repertoire' };

const SLOW_GAME_HINT =
  'Slow games count when played on the Play page with a G/30 or longer clock, or entered from a scoresheet ' +
  'whose PGN carries a TimeControl tag of 30 minutes or more (for example [TimeControl "G/30;d5"]). ' +
  'Chess.com and Lichess games do not count.';

function Meter({ percent }) {
  return (
    <span className="prep-meter" aria-label={`${percent}% ready`}>
      <span style={{ width: `${percent}%` }} />
    </span>
  );
}

/**
 * ReadinessPanel — the per-player tournament checklist (F074).
 *
 * The coach sees every player's readiness at a glance and ticks the one item
 * only a person can judge (the mini-repertoire review). A member sees their
 * own checklist, with a way straight to the drills that move it.
 */
export default function ReadinessPanel({ event, players, me, isCoach, readinessById, onOpenTab }) {
  if (!event) return <p className="hint-text">Add an event first.</p>;
  if (isCoach) return <CoachReadiness event={event} players={players} readinessById={readinessById} />;

  if (!me) {
    return (
      <section className="panel">
        <p className="hint-text">Claim your player profile from the account menu to see your checklist.</p>
      </section>
    );
  }
  const r = readinessById.get(me.playerId);
  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Your readiness</h2>
        <span className="badge">{r.percent}%</span>
      </div>
      <Meter percent={r.percent} />
      <ul className="prep-checklist">
        {r.items.map((item) => (
          <li key={item.key} className={`status-${item.status}`}>
            <span className="prep-check-mark" aria-hidden="true">
              {MARK[item.status]}
            </span>
            <span className="prep-check-body">
              <strong>{item.label}</strong>
              <span className="prep-note">{item.detail}</span>
            </span>
            {item.status === 'todo' && item.key === 'rules' && (
              <button type="button" className="link-button" onClick={() => onOpenTab('quiz')}>
                Take the quiz
              </button>
            )}
            {item.status === 'todo' && item.key === 'notation' && (
              <button type="button" className="link-button" onClick={() => onOpenTab('notation')}>
                Practise
              </button>
            )}
          </li>
        ))}
      </ul>
      <p className="hint-text">{SLOW_GAME_HINT}</p>
    </section>
  );
}

function CoachReadiness({ event, players, readinessById }) {
  const registrations = useEventRegistrations();
  const availability = useEventAvailability();
  const answers = useMemo(() => answersForEvent(availability, event.id), [availability, event.id]);
  const registered = useMemo(
    () => new Map(registrations.filter((r) => r.eventId === event.id).map((r) => [r.playerId, r])),
    [registrations, event.id],
  );
  const [show, setShow] = useState(() => (registered.size ? 'registered' : 'everyone'));

  const shown = players
    .filter((p) => {
      if (show === 'registered') return registered.has(p.playerId);
      if (show === 'yes') return answers.get(p.playerId)?.answer === 'yes';
      return true;
    })
    .sort(
      (a, b) =>
        (readinessById.get(b.playerId)?.percent ?? 0) - (readinessById.get(a.playerId)?.percent ?? 0) ||
        String(a.name).localeCompare(String(b.name)),
    );

  const average = shown.length
    ? Math.round(shown.reduce((sum, p) => sum + (readinessById.get(p.playerId)?.percent ?? 0), 0) / shown.length)
    : null;

  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Readiness</h2>
        {average != null && <span className="badge">Average {average}%</span>}
      </div>

      <div className="prep-filter-row" role="group" aria-label="Show">
        {[
          ['registered', `Registered (${registered.size})`],
          ['yes', 'Said yes'],
          ['everyone', 'Everyone'],
        ].map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`prep-count-chip ${show === id ? 'active' : ''}`}
            aria-pressed={show === id}
            onClick={() => setShow(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <p className="hint-text">
          {show === 'registered' ? 'Nobody registered yet. Use the Registration tab.' : 'Nobody to show.'}
        </p>
      ) : (
        <div className="table-scroll">
          <table className="prep-table">
            <thead>
              <tr>
                <th>Player</th>
                <th>Ready</th>
                {ITEM_KEYS.map((key) => (
                  <th key={key} title={READINESS_ITEMS[key]}>
                    {SHORT[key]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((p) => {
                const r = readinessById.get(p.playerId);
                const reg = registered.get(p.playerId) || null;
                return (
                  <tr key={p.playerId}>
                    <td className="prep-table-name">{p.name}</td>
                    <td>
                      <span className="prep-pct mono">{r.percent}%</span>
                      <Meter percent={r.percent} />
                    </td>
                    {r.items.map((item) =>
                      item.key === 'repertoire' ? (
                        <td key={item.key}>
                          <label className="prep-tick" title={reg ? 'Mini-repertoire reviewed' : 'Register the player first'}>
                            <input
                              type="checkbox"
                              checked={!!reg?.repertoireReviewed}
                              disabled={!reg}
                              aria-label={`${p.name}: mini-repertoire reviewed`}
                              onChange={(e) =>
                                upsertRegistration(event.id, p.playerId, { repertoireReviewed: e.target.checked })
                              }
                            />
                          </label>
                        </td>
                      ) : (
                        <td key={item.key} className={`prep-cell status-${item.status}`} title={item.detail}>
                          <span aria-label={`${item.label}: ${item.detail}`}>{MARK[item.status]}</span>
                        </td>
                      ),
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="hint-text">
        ✓ done · ○ to do · … coming soon (left out of the %). The endgame-band check arrives with the endgame
        curriculum. {SLOW_GAME_HINT}
      </p>
    </section>
  );
}
