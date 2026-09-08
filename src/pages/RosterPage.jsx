import { useEffect, useState } from 'react';
import { RUBRIC_CATEGORIES } from '../data/roster.js';
import { usePlayers, addPlayer, updatePlayer, updateRubric, removePlayer } from '../data/rosterStore.js';

const COMMITMENTS = ['Casual', 'Competitive'];

const emptyForm = { name: '', grade: '', boardRole: '', commitment: 'Casual', uscf: '', goal: '' };

/**
 * RosterPage — one row per player, with a detail panel keyed to the same
 * rubric the coach workbook uses. Backed by src/data/rosterStore.js, which
 * persists to this browser and is the same store the training page writes
 * solved puzzles into.
 */
export default function RosterPage() {
  const players = usePlayers();
  const [selectedId, setSelectedId] = useState(players[0]?.playerId ?? null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(null);

  const selected = players.find((p) => p.playerId === selectedId) || null;

  useEffect(() => {
    if (!selected && players.length) setSelectedId(players[0].playerId);
  }, [players, selected]);

  const startEdit = () => {
    if (!selected) return;
    setDraft({
      name: selected.name,
      grade: selected.grade,
      boardRole: selected.boardRole,
      commitment: selected.commitment,
      style: selected.style,
      goal: selected.goal,
      trainingFocus: selected.trainingFocus,
      coachNotes: selected.coachNotes,
      rubric: { ...selected.rubric },
    });
    setEditing(true);
  };

  const saveEdit = () => {
    if (!selected || !draft) return;
    const { rubric, ...rest } = draft;
    updatePlayer(selected.playerId, rest);
    updateRubric(selected.playerId, rubric);
    setEditing(false);
    setDraft(null);
  };

  const submitAdd = (event) => {
    event.preventDefault();
    if (!form.name.trim()) return;
    const id = addPlayer(form);
    setForm(emptyForm);
    setAdding(false);
    setSelectedId(id);
  };

  const remove = () => {
    if (!selected) return;
    if (!window.confirm(`Remove ${selected.name} from the roster?`)) return;
    removePlayer(selected.playerId);
    setSelectedId(null);
    setEditing(false);
  };

  return (
    <div className="roster-layout">
      <section className="panel">
        <div className="panel-header">
          <h2>Roster</h2>
          <div className="panel-header-actions">
            <span className="badge">{players.length} players</span>
            <button type="button" className="link-button" onClick={() => setAdding((v) => !v)}>
              {adding ? 'Cancel' : '+ Add player'}
            </button>
          </div>
        </div>

        {adding && (
          <form className="roster-form" onSubmit={submitAdd}>
            <label className="field">
              <span>Name</span>
              <input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                autoFocus
                required
              />
            </label>
            <label className="field">
              <span>Grade</span>
              <input value={form.grade} onChange={(e) => setForm((f) => ({ ...f, grade: e.target.value }))} />
            </label>
            <label className="field">
              <span>Board role</span>
              <input
                value={form.boardRole}
                onChange={(e) => setForm((f) => ({ ...f, boardRole: e.target.value }))}
                placeholder="Board 4"
              />
            </label>
            <label className="field">
              <span>Track</span>
              <select
                value={form.commitment}
                onChange={(e) => setForm((f) => ({ ...f, commitment: e.target.value }))}
              >
                {COMMITMENTS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>USCF rating</span>
              <input
                type="number"
                value={form.uscf}
                onChange={(e) => setForm((f) => ({ ...f, uscf: e.target.value }))}
              />
            </label>
            <label className="field field-wide">
              <span>Goal</span>
              <input value={form.goal} onChange={(e) => setForm((f) => ({ ...f, goal: e.target.value }))} />
            </label>
            <button type="submit" className="primary form-submit">
              Add to roster
            </button>
          </form>
        )}

        <div className="table-scroll">
          <table className="roster-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Name</th>
                <th>Board</th>
                <th>USCF</th>
                <th>Rapid</th>
                <th>Track</th>
              </tr>
            </thead>
            <tbody>
              {players.map((player) => (
                <tr
                  key={player.playerId}
                  className={player.playerId === selectedId ? 'selected' : ''}
                  onClick={() => {
                    setSelectedId(player.playerId);
                    setEditing(false);
                  }}
                >
                  <td className="mono">{player.playerId}</td>
                  <td>{player.name}</td>
                  <td>{player.boardRole}</td>
                  <td>{player.ratings.uscf ?? '—'}</td>
                  <td>{player.ratings.chesscomRapid ?? '—'}</td>
                  <td>
                    <span className={`track ${player.commitment.toLowerCase()}`}>
                      {player.commitment}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="hint-text">
          Saved to this browser. Players you add or edit here stick around after a refresh — see{' '}
          <code>src/data/rosterStore.js</code> to point the roster at a real backend instead.
        </p>
      </section>

      {selected && (
        <section className="panel player-detail">
          <div className="panel-header">
            <h2>{editing ? 'Editing' : selected.name}</h2>
            <div className="panel-header-actions">
              <span className="badge mono">{selected.playerId}</span>
              {!editing && (
                <>
                  <button type="button" className="link-button" onClick={startEdit}>
                    Edit
                  </button>
                  <button type="button" className="link-button danger" onClick={remove}>
                    Remove
                  </button>
                </>
              )}
            </div>
          </div>

          {editing && draft ? (
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
                {RUBRIC_CATEGORIES.map((category) => (
                  <div className="rubric-row" key={category.key}>
                    <span className="rubric-label">{category.label}</span>
                    <input
                      type="range"
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
                    <span className="rubric-score mono">{draft.rubric[category.key] ?? 0}</span>
                  </div>
                ))}
              </div>

              <h3>Current goal</h3>
              <textarea
                className="text-area"
                value={draft.goal}
                onChange={(e) => setDraft((d) => ({ ...d, goal: e.target.value }))}
              />

              <h3>Training focus</h3>
              <textarea
                className="text-area"
                value={draft.trainingFocus}
                onChange={(e) => setDraft((d) => ({ ...d, trainingFocus: e.target.value }))}
              />

              <h3>Coach notes</h3>
              <textarea
                className="text-area"
                value={draft.coachNotes}
                onChange={(e) => setDraft((d) => ({ ...d, coachNotes: e.target.value }))}
              />

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
          ) : (
            <>
              <dl className="facts">
                <div>
                  <dt>Joined</dt>
                  <dd>{selected.joined}</dd>
                </div>
                <div>
                  <dt>Grade</dt>
                  <dd>{selected.grade || '—'}</dd>
                </div>
                <div>
                  <dt>Style</dt>
                  <dd>{selected.style || '—'}</dd>
                </div>
                <div>
                  <dt>Openings</dt>
                  <dd>{selected.preferredOpenings.join(', ') || '—'}</dd>
                </div>
              </dl>

              <h3>Skill assessment</h3>
              <div className="rubric">
                {RUBRIC_CATEGORIES.map((category) => {
                  const score = selected.rubric[category.key] ?? 0;
                  return (
                    <div className="rubric-row" key={category.key}>
                      <span className="rubric-label">{category.label}</span>
                      <span className="rubric-bar">
                        <span
                          className={`rubric-fill ${score <= 3 ? 'low' : score <= 6 ? 'mid' : 'high'}`}
                          style={{ width: `${score * 10}%` }}
                        />
                      </span>
                      <span className="rubric-score mono">{score}</span>
                    </div>
                  );
                })}
              </div>

              <h3>Current goal</h3>
              <p>{selected.goal || '—'}</p>

              <h3>Training focus</h3>
              <p>{selected.trainingFocus || '—'}</p>

              <h3>Coach notes</h3>
              <p className="notes">{selected.coachNotes || '—'}</p>

              <h3>Puzzle training</h3>
              <p>
                {selected.puzzleStats?.solvedIds?.length || 0} mate-in-one puzzle
                {selected.puzzleStats?.solvedIds?.length === 1 ? '' : 's'} solved
                {selected.puzzleStats?.lastPlayed
                  ? ` · last practiced ${new Date(selected.puzzleStats.lastPlayed).toLocaleDateString()}`
                  : ''}
              </p>
            </>
          )}
        </section>
      )}
    </div>
  );
}
