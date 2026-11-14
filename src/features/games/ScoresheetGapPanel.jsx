import { describePly } from './scoresheet.js';

/** Marking moves that can't be read: either the game goes on from a set-up position, or it ends here. */
export default function ScoresheetGapPanel({ gap, setGap, gapIsLast, gapResumePly, gapProblems, onApply }) {
  return (
    <div className="ss-gap-panel">
      <h4>Moves that can’t be read, from {describePly(gap.startPly)}</h4>
      <label className="ss-radio">
        <input
          type="radio"
          name="ss-gap-mode"
          checked={gap.mode === 'continue'}
          onChange={() => setGap((g) => ({ ...g, mode: 'continue' }))}
        />
        The game goes on. Set up the position after the gap
      </label>
      <label className="ss-radio">
        <input
          type="radio"
          name="ss-gap-mode"
          checked={gap.mode === 'end'}
          disabled={!gapIsLast}
          onChange={() => setGap((g) => ({ ...g, mode: 'end' }))}
        />
        Nothing after this is readable
      </label>
      {gap.mode === 'continue' ? (
        <>
          <label className="field ss-unknown">
            <span>How many half-moves are missing?</span>
            <input
              type="number"
              inputMode="numeric"
              min="1"
              max="60"
              value={gap.unknown}
              onChange={(e) => setGap((g) => ({ ...g, unknown: e.target.value === '' ? '' : Number(e.target.value) }))}
            />
          </label>
          <p className="muted small">
            Missing: {describePly(gap.startPly)}
            {Math.max(1, gap.unknown || 1) > 1 ? ` to ${describePly(gapResumePly - 1)}` : ''}. The board shows the
            last known position. Move the pieces that moved in the gap so it shows the position
            before {describePly(gapResumePly)}.
          </p>
          {gap.held.length > Math.max(1, gap.unknown || 1) && (
            <p className="muted small">
              Moves after the gap: {gap.held.slice(Math.max(1, gap.unknown || 1)).join(' ')}
            </p>
          )}
          {gapProblems.length > 0 && (
            <ul className="ss-problems">
              {gapProblems.map((p) => (
                <li key={p} className="ss-error">
                  {p}
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <p className="muted small">
          The game is saved up to {describePly(gap.startPly)} with a note that the rest can’t be read.
          {gap.held.length > 0 && ` The ${gap.held.length} move(s) typed after it will be dropped.`}
        </p>
      )}
      <div className="import-actions">
        <button type="button" onClick={() => setGap(null)}>
          Cancel
        </button>
        <button
          type="button"
          className="primary"
          disabled={gap.mode === 'continue' && gapProblems.length > 0}
          onClick={onApply}
        >
          {gap.mode === 'continue' ? 'Continue from this position' : 'Mark the rest unreadable'}
        </button>
      </div>
    </div>
  );
}
