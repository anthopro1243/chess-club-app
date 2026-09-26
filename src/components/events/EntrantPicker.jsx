import { useMemo, useState } from 'react';
import { ratingFor, ratingSourceLabel, compareSeeds } from '../../tournament/seeding.js';

/*
 * EntrantPicker — tick who is playing. Shows each player's rating on the
 * event's chosen source, labelled, in seed order, so the coach can see the
 * seeding before pairing round 1 (F083): an unrated player is shown as
 * unrated rather than given a number from another pool.
 */
export default function EntrantPicker({ players, source, picked, onChange }) {
  const [filter, setFilter] = useState('');
  const label = ratingSourceLabel(source);

  const rows = useMemo(
    () =>
      (players || [])
        .map((p) => ({ playerId: p.playerId, name: p.name || p.playerId, rating: ratingFor(p, source) }))
        .sort(compareSeeds),
    [players, source],
  );
  const needle = filter.trim().toLowerCase();
  const visible = needle ? rows.filter((r) => r.name.toLowerCase().includes(needle)) : rows;
  const rated = rows.filter((r) => r.rating != null).length;

  const toggle = (id) => {
    const next = new Set(picked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(next);
  };

  return (
    <div className="ev-picker">
      <div className="ev-picker-tools">
        <input
          type="search"
          value={filter}
          placeholder="Find a player"
          aria-label="Find a player"
          onChange={(event) => setFilter(event.target.value)}
        />
        <button type="button" className="ev-button" onClick={() => onChange(new Set(rows.map((r) => r.playerId)))}>
          Select all
        </button>
        <button type="button" className="ev-button" onClick={() => onChange(new Set())}>
          Clear
        </button>
        <span className="badge">
          {picked.size} of {rows.length} picked
        </span>
      </div>
      <p className="ev-note">
        Seeded by <strong>{label}</strong>: {rated} of {rows.length} have one. Players without it are seeded last
        and shown as unrated.
      </p>
      {rows.length === 0 ? (
        <p className="ev-note">The roster is empty. Add players on the Roster page first.</p>
      ) : (
        <div className="ev-picker-list">
          {visible.map((row) => (
            <label key={row.playerId} className={`ev-pick ${picked.has(row.playerId) ? 'is-picked' : ''}`}>
              <input type="checkbox" checked={picked.has(row.playerId)} onChange={() => toggle(row.playerId)} />
              <span className="ev-pick-name">{row.name}</span>
              {row.rating != null ? (
                <span className="ev-rating" title={label}>
                  {row.rating}
                </span>
              ) : (
                <span className="ev-rating ev-unrated">unrated</span>
              )}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
