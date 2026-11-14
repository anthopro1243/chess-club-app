import { useState } from 'react';
import { RESULTS, REASONS, TIME_CONTROL_PRESETS } from './scoresheet.js';

const OTHER_TC = '__other__';

/** The scoresheet's game details: players, event, round, board, time control, date, result. */
export default function ScoresheetTags({ sheet, update, roster, knownEvents, fieldError, maxDate }) {
  const tcIsPreset = !sheet.timeControl || TIME_CONTROL_PRESETS.includes(sheet.timeControl);
  const [tcOther, setTcOther] = useState(!tcIsPreset);

  const sideField = (label, idKey, nameKey) => (
    <div className="field ss-side">
      <span>{label}</span>
      <select
        value={sheet[idKey]}
        aria-label={`${label} player`}
        onChange={(e) => update({ [idKey]: e.target.value })}
      >
        <option value="">Outside player…</option>
        {roster.map((p) => (
          <option key={p.playerId} value={p.playerId}>
            {p.name}
          </option>
        ))}
      </select>
      {!sheet[idKey] && (
        <input
          type="text"
          value={sheet[nameKey]}
          maxLength={60}
          placeholder="Name or initials, e.g. J.D."
          aria-label={`${label} name`}
          onChange={(e) => update({ [nameKey]: e.target.value })}
        />
      )}
      {fieldError(nameKey) && <em className="ss-error">{fieldError(nameKey)}</em>}
    </div>
  );

  return (
    <section className="ss-tags" aria-label="Game details">
      {sideField('White', 'whiteId', 'whiteName')}
      {sideField('Black', 'blackId', 'blackName')}
      <label className="field ss-wide">
        <span>Event</span>
        <input
          type="text"
          list="ss-events"
          maxLength={100}
          value={sheet.event}
          placeholder="e.g. DISD District Championship"
          onChange={(e) => update({ event: e.target.value })}
        />
        <datalist id="ss-events">
          {knownEvents.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
        {fieldError('event') && <em className="ss-error">{fieldError('event')}</em>}
      </label>
      <label className="field">
        <span>Round</span>
        <input type="text" inputMode="decimal" maxLength={12} value={sheet.round} onChange={(e) => update({ round: e.target.value })} />
        {fieldError('round') && <em className="ss-error">{fieldError('round')}</em>}
      </label>
      <label className="field">
        <span>Board</span>
        <input type="text" inputMode="numeric" maxLength={3} value={sheet.board} onChange={(e) => update({ board: e.target.value })} />
        {fieldError('board') && <em className="ss-error">{fieldError('board')}</em>}
      </label>
      <label className="field">
        <span>Time control</span>
        <select
          value={tcOther ? OTHER_TC : sheet.timeControl}
          onChange={(e) => {
            const v = e.target.value;
            setTcOther(v === OTHER_TC);
            if (v !== OTHER_TC) update({ timeControl: v });
          }}
        >
          {TIME_CONTROL_PRESETS.map((tc) => (
            <option key={tc} value={tc}>
              {tc}
            </option>
          ))}
          <option value="">Not recorded</option>
          <option value={OTHER_TC}>Other…</option>
        </select>
        {tcOther && (
          <input
            type="text"
            value={sheet.timeControl}
            placeholder="e.g. G/40;d5"
            aria-label="Other time control"
            onChange={(e) => update({ timeControl: e.target.value })}
          />
        )}
        {fieldError('timeControl') && <em className="ss-error">{fieldError('timeControl')}</em>}
      </label>
      <label className="field">
        <span>Date</span>
        <input type="date" value={sheet.date} max={maxDate} onChange={(e) => update({ date: e.target.value })} />
        {fieldError('date') && <em className="ss-error">{fieldError('date')}</em>}
      </label>
      <label className="field">
        <span>Result</span>
        <select value={sheet.result} onChange={(e) => update({ result: e.target.value })}>
          <option value="">Choose…</option>
          {RESULTS.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
        {fieldError('result') && <em className="ss-error">{fieldError('result')}</em>}
      </label>
      <label className="field">
        <span>How it ended</span>
        <select value={sheet.reason} onChange={(e) => update({ reason: e.target.value })}>
          <option value="">Not recorded</option>
          {REASONS.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </label>
    </section>
  );
}
