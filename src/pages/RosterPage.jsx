import { useEffect, useState, useMemo } from 'react';
import { RUBRIC_CATEGORIES } from '../data/roster.js';
import { useSkillsForPlayer } from '../data/analysisStore.js';
import { suggestedRubric } from '../analysis/presentation.js';
import { usePlayers, useCloudStatus, addPlayer, updatePlayer, updateRubric, removePlayer } from '../data/rosterStore.js';
import InfoTooltip from '../components/InfoTooltip.jsx';
import { useAccount } from '../data/accountStore.js';
import { useCoachNotes, setCoachNote, seedCoachNotesFromPlayers } from '../data/coachNotesStore.js';
import { usePlayerPrivate } from '../data/playerPrivateStore.js';
import RosterImportModal from '../components/RosterImportModal.jsx';
import { gradeSection, mediaReleaseLabel } from '../data/privacy.js';

const COMMITMENTS = ['Casual', 'Competitive'];

const ONLINE_RATINGS = [
  ['rapid', 'Rapid'],
  ['blitz', 'Blitz'],
  ['bullet', 'Bullet'],
  ['puzzles', 'Puzzles'],
];

const emptyForm = { name: '', grade: '', boardRole: '', commitment: 'Casual', uscf: '', goal: '' };

/**
 * RosterPage — one row per player, with a detail panel keyed to the same
 * rubric the coach workbook uses.
 */
export default function RosterPage() {
  const players = usePlayers();
  const cloud = useCloudStatus();
  const account = useAccount();
  const coachNotes = useCoachNotes();
  const privateFields = usePlayerPrivate();
  const [importing, setImporting] = useState(false);
  const [selectedId, setSelectedId] = useState(players[0]?.playerId ?? null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(null);

  const selected = players.find((p) => p.playerId === selectedId) || null;

  // The engine's tracked scores for this player, mapped onto the roster's
  // 0-10 rubric. Withheld entirely where the evidence is thin - see
  // suggestedRubric, which drops anything below medium confidence.
  const skills = useSkillsForPlayer(selectedId);
  const suggestions = useMemo(
    () =>
      suggestedRubric(
        Object.fromEntries(
          Object.entries(skills).map(([key, row]) => [
            key,
            {
              score: row.score,
              confidence: row.confidence,
              measured: row.score != null,
              n: row.observations ?? 0,
            },
          ]),
        ),
      ),
    [skills],
  );

  useEffect(() => {
    if (!selected && players.length) setSelectedId(players[0].playerId);
  }, [players, selected]);

  // Notes written before they moved off the player row.
  useEffect(() => {
    if (players.length) seedCoachNotesFromPlayers(players);
  }, [players]);

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
      coachNotes: coachNotes[selected.playerId] || '',
      rubric: { ...selected.rubric },
    });
    setEditing(true);
  };

  const saveEdit = () => {
    if (!selected || !draft) return;
    const { rubric, coachNotes: note, ...rest } = draft;
    updatePlayer(selected.playerId, rest);
    updateRubric(selected.playerId, rubric);
    if (account.isCoach) setCoachNote(selected.playerId, note);
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
            {account.isCoach && (
              <button type="button" className="link-button" onClick={() => setImporting(true)}>
                Import CSV
              </button>
            )}
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
                    <span className={`track ${(player.commitment || 'Casual').toLowerCase()}`}>
                      {player.commitment}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="hint-text">
          {cloud.signedIn ? 'Shared with everyone signed in.' : 'Saved to this browser.'}
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
                            title={`From ${hint.observations} analysed observations (${hint.confidence} confidence). Click to adopt.`}
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
                &ldquo;Suggested&rdquo; is what the engine derived from analysed games. It never
                overwrites your score; click one to adopt it.
              </p>

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

              {account.isCoach && (
                <>
                  <h3>
                    Coach notes
                    <InfoTooltip>
                      Only coaches can read these. They live in a separate table the players'
                      accounts have no access to, not just a hidden panel.
                    </InfoTooltip>
                  </h3>
                  <textarea
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
                  <dt>Experience</dt>
                  <dd>{selected.experience || '—'}</dd>
                </div>
                <div>
                  <dt>Style</dt>
                  <dd>{selected.style || '—'}</dd>
                </div>
                <div>
                  <dt>Openings</dt>
                  <dd>{selected.preferredOpenings.join(', ') || '—'}</dd>
                </div>
                {/* Coach-only. player_private refuses a player account outright,
                    so for them this block has nothing to render - it is not
                    merely hidden. */}
                {account.isCoach && privateFields[selected.playerId] && (
                  <>
                    <div>
                      <dt>Student ID</dt>
                      <dd>{privateFields[selected.playerId].studentId || '—'}</dd>
                    </div>
                    <div>
                      <dt>School email</dt>
                      <dd>{privateFields[selected.playerId].schoolEmail || '—'}</dd>
                    </div>
                  </>
                )}
                {account.isCoach && selected.guardianEmail && (
                  <div>
                    <dt>Guardian email</dt>
                    <dd>{selected.guardianEmail}</dd>
                  </div>
                )}
                <div>
                  <dt>Section</dt>
                  <dd>{gradeSection(selected.grade) ? `Grades ${gradeSection(selected.grade)}` : '—'}</dd>
                </div>
                {account.isCoach && (
                  <div>
                    <dt>
                      Media release
                      <InfoTooltip>
                        Dallas ISD guidance: no student names or photos in anything shared outside
                        the club without a release on file. Without one, printed pairings,
                        standings and family summaries show initials instead of the name.
                      </InfoTooltip>
                    </dt>
                    <dd>
                      <select
                        aria-label="Media release"
                        value={selected.mediaRelease === true ? 'yes' : selected.mediaRelease === false ? 'no' : ''}
                        onChange={(e) => updatePlayer(selected.playerId, {
                          mediaRelease: e.target.value === 'yes' ? true : e.target.value === 'no' ? false : null,
                        })}
                      >
                        <option value="">{mediaReleaseLabel(null)}</option>
                        <option value="yes">{mediaReleaseLabel(true)}</option>
                        <option value="no">{mediaReleaseLabel(false)}</option>
                      </select>
                    </dd>
                  </div>
                )}
              </dl>

              <h3>Skill assessment</h3>
              <div className="rubric">
                {RUBRIC_CATEGORIES.map((category) => {
                  const score = selected.rubric[category.key] ?? 0;
                  return (
                    <div className="rubric-row" key={category.key}>
                      <span className="rubric-label">
                        {category.label}
                        {suggestions[category.key] ? (
                          <em
                            className="rubric-suggestion"
                            title={`Engine suggestion from ${suggestions[category.key].observations} observations (${suggestions[category.key].confidence} confidence)`}
                          >
                            suggested {suggestions[category.key].suggestion}
                          </em>
                        ) : null}
                      </span>
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

              {account.isCoach && (
                <>
                  <h3>
                    Coach notes
                    <InfoTooltip>
                      Only coaches can read these. They live in a separate table the players'
                      accounts have no access to, not just a hidden panel.
                    </InfoTooltip>
                  </h3>
                  <p className="notes">{coachNotes[selected.playerId] || '—'}</p>
                </>
              )}

              <h3>Puzzle training</h3>
              <p>
                {selected.puzzleStats?.solvedIds?.length || 0} puzzle
                {selected.puzzleStats?.solvedIds?.length === 1 ? '' : 's'} solved
                {selected.puzzleStats?.lastPlayed
                  ? ` · last practiced ${new Date(selected.puzzleStats.lastPlayed).toLocaleDateString()}`
                  : ''}
              </p>

              {Object.keys(selected.connections || {}).length > 0 && (
                <>
                  <h3>
                    Online play
                    <InfoTooltip>
                      Rated games from these accounts count toward the club rating, same as club
                      games and puzzles.
                    </InfoTooltip>
                  </h3>
                  {Object.entries(selected.connections).map(([platform, connection]) => (
                    <p key={platform}>
                      <strong>{platform === 'chesscom' ? 'Chess.com' : 'Lichess'}</strong>{' '}
                      <a href={connection.url} target="_blank" rel="noreferrer">
                        {connection.username}
                      </a>
                      {ONLINE_RATINGS.map(([key, label]) => {
                        const value = connection.ratings?.[key];
                        return value == null ? null : (
                          <span key={key} className="hint-text">
                            {' · '}
                            {label} <span className="mono">{value}</span>
                          </span>
                        );
                      })}
                    </p>
                  ))}
                </>
              )}
            </>
          )}
        </section>
      )}
      {importing && (
        <RosterImportModal
          players={players}
          onClose={() => setImporting(false)}
          onImported={(outcome) => {
            if (outcome.playerIds.length) setSelectedId(outcome.playerIds[0]);
          }}
        />
      )}
    </div>
  );
}
