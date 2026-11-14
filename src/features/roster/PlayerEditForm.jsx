import { useId } from 'react';
import InfoTooltip from '../../ui/InfoTooltip.jsx';
import { COMMITMENTS, RUBRIC_CATEGORIES } from './roster.js';

/** Editing one player: facts, rubric sliders (with engine suggestions) and notes. */
export default function PlayerEditForm({ draft, setDraft, account, suggestions, saveEdit, setEditing }) {
  const id = useId();
  return (
    <>
      <div className="facts facts-edit">
        <label className="field">
          <span>Name</span>
          <input value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} />
        </label>
        <label className="field">
          <span>Grade</span>
          <input value={draft.grade} onChange={(e) => setDraft((d) => ({ ...d, grade: e.target.value }))} />
        </label>
        <label className="field">
          <span>Board role</span>
          <input
            value={draft.boardRole}
            onChange={(e) => setDraft((d) => ({ ...d, boardRole: e.target.value }))}
          />
        </label>
        <label className="field">
          <span>Track</span>
          <select
            value={draft.commitment}
            onChange={(e) => setDraft((d) => ({ ...d, commitment: e.target.value }))}
          >
            {COMMITMENTS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className="field field-wide">
          <span>Style</span>
          <input value={draft.style} onChange={(e) => setDraft((d) => ({ ...d, style: e.target.value }))} />
        </label>
      </div>

      <h3>Skill assessment</h3>
      <div className="rubric rubric-edit">
        {RUBRIC_CATEGORIES.map((category) => {
          const hint = suggestions[category.key];
          return (
            <div className="rubric-row" key={category.key}>
              <span className="rubric-label">
                {category.label}
                {hint ? (
                  <button
                    type="button"
                    className="rubric-suggestion link-button"
                    title={`Engine's score, from ${hint.observations} data points. Tap to use it.`}
                    onClick={() =>
                      setDraft((d) => ({
                        ...d,
                        rubric: { ...d.rubric, [category.key]: hint.suggestion },
                      }))
                    }
                  >
                    suggested {hint.suggestion}
                  </button>
                ) : null}
              </span>
              <input
                type="range"
                aria-label={category.label}
                min="0"
                max="10"
                value={draft.rubric[category.key] ?? 0}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    rubric: { ...d.rubric, [category.key]: Number(e.target.value) },
                  }))
                }
              />
              {/*
                The engine's opinion sits BESIDE the coach's, never in
                place of it. Clicking copies it into the slider, which
                is a deliberate act by the coach - nothing here ever
                writes a score on its own.
              */}
              <span className="rubric-score mono">{draft.rubric[category.key] ?? 0}</span>
            </div>
          );
        })}
      </div>
      <p className="muted small">
        &ldquo;Suggested&rdquo; is the engine&rsquo;s score from analyzed games. Tap it to use
        it.
      </p>

      <h3 id={`${id}-goal`}>Current goal</h3>
      <textarea
        aria-labelledby={`${id}-goal`}
        className="text-area"
        value={draft.goal}
        onChange={(e) => setDraft((d) => ({ ...d, goal: e.target.value }))}
      />

      <h3 id={`${id}-focus`}>Training focus</h3>
      <textarea
        aria-labelledby={`${id}-focus`}
        className="text-area"
        value={draft.trainingFocus}
        onChange={(e) => setDraft((d) => ({ ...d, trainingFocus: e.target.value }))}
      />

      {account.isCoach && (
        <>
          <div className="heading-row">
            <h3 id={`${id}-notes`}>Coach notes</h3>
            <InfoTooltip label="More about Coach notes">
              Only coaches can see these.
            </InfoTooltip>
          </div>
          <textarea
            aria-labelledby={`${id}-notes`}
            className="text-area"
            value={draft.coachNotes}
            onChange={(e) => setDraft((d) => ({ ...d, coachNotes: e.target.value }))}
          />
        </>
      )}

      <div className="button-grid">
        <button type="button" className="primary" onClick={saveEdit}>
          Save
        </button>
        <button
          type="button"
          onClick={() => {
            setEditing(false);
            setDraft(null);
          }}
        >
          Cancel
        </button>
      </div>
    </>
  );
}
