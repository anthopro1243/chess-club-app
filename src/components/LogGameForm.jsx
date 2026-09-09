import { useState } from 'react';
import { usePlayers, recordGameResult } from '../data/rosterStore.js';
import { recordGame } from '../data/gamesStore.js';
import { countPlies } from '../data/externalChess.js';
import InfoTooltip from './InfoTooltip.jsx';

const RESULTS = [
  { value: '1-0', label: 'White won' },
  { value: '0-1', label: 'Black won' },
  { value: '1/2-1/2', label: 'Draw' },
];

const today = () => new Date().toISOString().slice(0, 10);

const blank = {
  whitePlayerId: '',
  blackPlayerId: '',
  whiteName: '',
  blackName: '',
  result: '1-0',
  playedAt: today(),
  reason: '',
  pgn: '',
};

/** Pull what we can out of a pasted PGN so the form fills itself in. */
function readPgnTags(pgn) {
  const tag = (name) => pgn.match(new RegExp(`\\[${name}\\s+"([^"]*)"`))?.[1] || '';
  return {
    white: tag('White'),
    black: tag('Black'),
    result: tag('Result'),
    date: tag('Date').replace(/\./g, '-'),
    termination: tag('Termination'),
  };
}

/**
 * LogGameForm — put a game played on a wooden board into the archive.
 *
 * Most club games are not played on a screen. If the only way in is playing
 * here, the archive stays nearly empty and every statistic built on it
 * describes a fraction of what the club actually did. This is meant to take
 * about twenty seconds: two names, a result, and optionally a pasted PGN.
 */
export default function LogGameForm({ onDone }) {
  const players = usePlayers();
  const [form, setForm] = useState(blank);
  const [rated, setRated] = useState(true);
  const [saved, setSaved] = useState('');

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const pickPlayer = (side, id) => {
    const player = players.find((p) => p.playerId === id);
    set({
      [`${side}PlayerId`]: id,
      ...(player ? { [`${side}Name`]: player.name } : {}),
    });
  };

  const onPastePgn = (pgn) => {
    const tags = readPgnTags(pgn);
    set({
      pgn,
      ...(tags.white && !form.whiteName ? { whiteName: tags.white } : {}),
      ...(tags.black && !form.blackName ? { blackName: tags.black } : {}),
      ...(RESULTS.some((r) => r.value === tags.result) ? { result: tags.result } : {}),
      ...(/^\d{4}-\d{2}-\d{2}$/.test(tags.date) ? { playedAt: tags.date } : {}),
      ...(tags.termination && !form.reason ? { reason: tags.termination } : {}),
    });
  };

  const bothRegistered = form.whitePlayerId && form.blackPlayerId
    && form.whitePlayerId !== form.blackPlayerId;

  const submit = (event) => {
    event.preventDefault();

    const whiteName = form.whiteName.trim()
      || players.find((p) => p.playerId === form.whitePlayerId)?.name
      || 'White';
    const blackName = form.blackName.trim()
      || players.find((p) => p.playerId === form.blackPlayerId)?.name
      || 'Black';

    recordGame({
      // Dated rather than timestamped: this is a game that happened earlier,
      // and the archive sorts on it.
      playedAt: new Date(`${form.playedAt}T12:00:00`).toISOString(),
      whitePlayerId: form.whitePlayerId,
      blackPlayerId: form.blackPlayerId,
      whiteName,
      blackName,
      result: form.result,
      reason: form.reason.trim(),
      moveCount: countPlies(form.pgn),
      mode: 'human',
      computerElo: null,
      pgn: form.pgn.trim(),
    });

    if (rated && bothRegistered) {
      const whiteScore = form.result === '1-0' ? 1 : form.result === '0-1' ? 0 : 0.5;
      recordGameResult(form.whitePlayerId, form.blackPlayerId, whiteScore);
    }

    setSaved(`${whiteName} vs ${blackName} logged.`);
    setForm({ ...blank, playedAt: form.playedAt });
    onDone?.();
  };

  return (
    <form className="roster-form" onSubmit={submit}>
      <label className="field">
        <span>White</span>
        <select value={form.whitePlayerId} onChange={(e) => pickPlayer('white', e.target.value)}>
          <option value="">Not on the roster</option>
          {players.map((p) => (
            <option key={p.playerId} value={p.playerId}>
              {p.name}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span>White name</span>
        <input
          value={form.whiteName}
          placeholder="As it should appear"
          onChange={(e) => set({ whiteName: e.target.value })}
        />
      </label>

      <label className="field">
        <span>Black</span>
        <select value={form.blackPlayerId} onChange={(e) => pickPlayer('black', e.target.value)}>
          <option value="">Not on the roster</option>
          {players.map((p) => (
            <option key={p.playerId} value={p.playerId}>
              {p.name}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span>Black name</span>
        <input
          value={form.blackName}
          placeholder="As it should appear"
          onChange={(e) => set({ blackName: e.target.value })}
        />
      </label>

      <label className="field">
        <span>Result</span>
        <select value={form.result} onChange={(e) => set({ result: e.target.value })}>
          {RESULTS.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span>Date</span>
        <input type="date" value={form.playedAt} onChange={(e) => set({ playedAt: e.target.value })} />
      </label>

      <label className="field">
        <span>How it ended</span>
        <input
          value={form.reason}
          placeholder="Checkmate, resignation, time…"
          onChange={(e) => set({ reason: e.target.value })}
        />
      </label>

      <label className="field checkbox-field">
        <input
          type="checkbox"
          checked={rated && bothRegistered}
          disabled={!bothRegistered}
          onChange={(e) => setRated(e.target.checked)}
        />
        <span>
          Count toward ratings
          <InfoTooltip>
            Only possible when both sides are different players on the roster. A game against
            someone outside the club still gets archived, it just cannot move a club rating.
          </InfoTooltip>
        </span>
      </label>

      <label className="field field-wide">
        <span>PGN (optional)</span>
        <textarea
          className="text-area"
          rows={4}
          value={form.pgn}
          placeholder="Paste the moves here and the rest of the form fills itself in"
          onChange={(e) => onPastePgn(e.target.value)}
        />
      </label>

      <button type="submit" className="primary form-submit">
        Log this game
      </button>

      {saved && <p className="hint-text sync-result">{saved}</p>}
    </form>
  );
}
