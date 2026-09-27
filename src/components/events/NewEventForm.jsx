import { useState } from 'react';
import EntrantPicker from './EntrantPicker.jsx';
import { RATING_SOURCES, DEFAULT_RATING_SOURCE } from '../../tournament/seeding.js';
import { TIEBREAKS, DEFAULT_TIEBREAK_ORDER, tiebreakLabel } from '../../tournament/tiebreaks.js';
import { roundRobinRounds } from '../../tournament/roundRobin.js';
import {
  TIME_CONTROL_PROFILES,
  DEFAULT_TIME_CONTROL,
  validateEventDraft,
  nextWeekday,
  shortDate,
} from '../../tournament/eventOps.js';

/*
 * NewEventForm — set up a mock tournament in one screen (F075, F084).
 *
 * Defaults are the rehearsal the research recommends: a Swiss on the coming
 * Tuesday at G/30 d5 (the usual scholastic control), four rounds, seeded on
 * the club rating, US Chess scholastic tiebreak order. The coach mostly just
 * ticks who is in the room.
 */
export default function NewEventForm({ players, onCreate, onCancel }) {
  const [startsOn, setStartsOn] = useState(() => nextWeekday(new Date()));
  const [name, setName] = useState(() => `Mock tournament, ${shortDate(nextWeekday(new Date()))}`);
  const [format, setFormat] = useState('swiss');
  const [rounds, setRounds] = useState(4);
  const [timeControl, setTimeControl] = useState(DEFAULT_TIME_CONTROL);
  const [ratingSource, setRatingSource] = useState(DEFAULT_RATING_SOURCE);
  const [initialColour, setInitialColour] = useState('w');
  const [order, setOrder] = useState(DEFAULT_TIEBREAK_ORDER);
  const [picked, setPicked] = useState(() => new Set());
  const [tried, setTried] = useState(false);

  const effectiveRounds = format === 'round-robin' ? roundRobinRounds(picked.size) : Number(rounds);
  const problems = validateEventDraft({ name, rounds: effectiveRounds, format, entrantCount: picked.size });
  const profile = TIME_CONTROL_PROFILES.find((p) => p.id === timeControl);

  const move = (index, delta) => {
    const next = [...order];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setOrder(next);
  };

  const submit = (event) => {
    event.preventDefault();
    setTried(true);
    if (problems.length) return;
    onCreate(
      {
        name,
        startsOn,
        format,
        rounds: effectiveRounds,
        timeControl,
        ratingSource,
        initialColour,
        // Round robins are usually split by Sonneborn-Berger first; the
        // median family says little when everyone has played everyone.
        tiebreakOrder:
          format === 'round-robin' ? ['sonnebornBerger', ...order.filter((id) => id !== 'sonnebornBerger')] : order,
      },
      players.filter((p) => picked.has(p.playerId)),
    );
  };

  return (
    <section className="panel">
      <div className="panel-header">
        <h2>New club event</h2>
        <button type="button" className="link-button" onClick={onCancel}>
          Cancel
        </button>
      </div>
      <form className="ev-form" onSubmit={submit}>
        <label className="field field-wide">
          <span>Name</span>
          <input type="text" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="field">
          <span>Date</span>
          <input type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} />
        </label>
        <label className="field">
          <span>Format</span>
          <select value={format} onChange={(e) => setFormat(e.target.value)}>
            <option value="swiss">Swiss (mock tournament)</option>
            <option value="round-robin">Round robin (3–10 players)</option>
          </select>
        </label>
        <label className="field">
          <span>Rounds</span>
          {format === 'round-robin' ? (
            <input type="text" value={picked.size >= 3 ? `${effectiveRounds} (everyone plays everyone)` : 'Set by the field'} readOnly />
          ) : (
            <input
              type="number"
              min={1}
              max={15}
              value={rounds}
              onChange={(e) => setRounds(e.target.value === '' ? '' : Number(e.target.value))}
            />
          )}
        </label>
        <label className="field">
          <span>Time control</span>
          <select value={timeControl} onChange={(e) => setTimeControl(e.target.value)}>
            {TIME_CONTROL_PROFILES.map((p) => (
              <option key={p.id} value={p.id}>
                {p.id}
              </option>
            ))}
          </select>
          <small className="ev-note">
            {profile?.note ? `${profile.note}. ` : ''}
            {profile?.clockId
              ? 'Practice games on the Play page default to this clock.'
              : 'The Play page has no preset for this clock yet; set it there by hand.'}
          </small>
        </label>
        <label className="field">
          <span>Seed by</span>
          <select value={ratingSource} onChange={(e) => setRatingSource(e.target.value)}>
            {RATING_SOURCES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Top seed in round 1 plays</span>
          <select value={initialColour} onChange={(e) => setInitialColour(e.target.value)}>
            <option value="w">White</option>
            <option value="b">Black</option>
          </select>
        </label>
        <div className="field field-wide">
          <span>Tiebreak order (announce it before round 1)</span>
          <ol className="ev-order">
            {order.map((id, index) => (
              <li key={id}>
                <span className="ev-order-rank">{index + 1}.</span>
                <span>{tiebreakLabel(id)}</span>
                <button type="button" aria-label={`Move ${tiebreakLabel(id)} up`} disabled={index === 0} onClick={() => move(index, -1)}>
                  ↑
                </button>
                <button
                  type="button"
                  aria-label={`Move ${tiebreakLabel(id)} down`}
                  disabled={index === order.length - 1}
                  onClick={() => move(index, 1)}
                >
                  ↓
                </button>
              </li>
            ))}
          </ol>
          {format === 'round-robin' && (
            <small className="ev-note">A round robin puts {TIEBREAKS.find((t) => t.id === 'sonnebornBerger').label} first.</small>
          )}
        </div>
        <div className="field field-wide">
          <span>Players</span>
          <EntrantPicker players={players} source={ratingSource} picked={picked} onChange={setPicked} />
        </div>
        {tried && problems.length > 0 && (
          <div className="field-wide">
            {problems.map((p) => (
              <p key={p} className="ev-error">
                {p}
              </p>
            ))}
          </div>
        )}
        <div className="field-wide ev-actions">
          <button type="submit" className="ev-button primary">
            Create event with {picked.size} player{picked.size === 1 ? '' : 's'}
          </button>
        </div>
      </form>
    </section>
  );
}
