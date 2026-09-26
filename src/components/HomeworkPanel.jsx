import { useMemo, useState } from 'react';
import InfoTooltip from './InfoTooltip.jsx';
import HomeworkStatus from './HomeworkStatus.jsx';
import { PUZZLES, PUZZLE_THEMES } from '../data/puzzles.js';
import {
  DEFAULT_GAMES,
  DEFAULT_GAME_MINUTES,
  DEFAULT_REQUIRED,
  GAME_MINUTE_OPTIONS,
  HOMEWORK_DIFFICULTIES,
  MAX_GAMES,
  MAX_REQUIRED,
  MIN_GAME_PLIES,
  NOTE_MAX,
  assignmentReport,
  assignmentTitle,
  audienceLabel,
  buildAssignment,
  defaultDueDate,
  dueAtFromDate,
  localDateString,
  orderAssignments,
  playerCompletion,
  puzzlesMatching,
  rosterGroups,
  themeLabel,
  unitFor,
} from '../data/homework.js';
import { useAssignments, saveAssignment, removeAssignment, newHomeworkId } from '../data/homeworkStore.js';
import { useAttempts } from '../data/puzzleAttemptsStore.js';
import { useGames } from '../data/gamesStore.js';
import '../styles/homework.css';

const blankDraft = () => ({
  kind: 'theme',
  theme: '',
  difficulty: '',
  requiredCount: DEFAULT_REQUIRED,
  puzzleIds: [],
  minMinutes: DEFAULT_GAME_MINUTES,
  audience: 'club',
  groupKey: '',
  playerIds: [],
  dueDate: defaultDueDate(),
  note: '',
});

const shortDate = (iso) =>
  iso
    ? new Date(iso).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
    : '—';

const themeCounts = new Map(PUZZLE_THEMES.map((t) => [t, puzzlesMatching(PUZZLES, { theme: t }).length]));

/** "7 tries · last Sat, Oct 3" for puzzles; "2 games · 1 counted" for games. */
function activityLine(assignment, progress) {
  if (!progress.attempts) return assignment.kind === 'games' ? 'no games yet' : 'no attempts yet';
  if (assignment.kind === 'games') {
    return `${progress.attempts} game${progress.attempts === 1 ? '' : 's'} · ${progress.completed} counted`;
  }
  return `${progress.attempts} tr${progress.attempts === 1 ? 'y' : 'ies'} · last ${shortDate(progress.lastAttemptAt)}`;
}

/**
 * HomeworkPanel — set homework, and see who has done it.
 *
 * Coach page only. Setting homework writes an assignment; nothing is written
 * when a trainee does it, because completion is read straight off their
 * puzzle attempts and archived games (homework.js). So the lists below are
 * live: they move the moment a trainee finishes a puzzle or a game lands in
 * the archive.
 *
 * Built so the common case takes seconds: the form opens on "puzzles on a
 * theme, whole club, due next Tuesday, 5 puzzles", so setting homework is
 * pick a theme, press Set.
 */
export default function HomeworkPanel({ players }) {
  const assignments = useAssignments();
  const attempts = useAttempts();
  const games = useGames();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(blankDraft);
  const [errors, setErrors] = useState([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  const activePlayers = useMemo(() => players.filter((p) => !p.deletedAt), [players]);
  const groups = useMemo(() => rosterGroups(activePlayers), [activePlayers]);
  const update = (patch) => setDraft((d) => ({ ...d, ...patch }));

  const matching = useMemo(
    () => (draft.theme ? puzzlesMatching(PUZZLES, { theme: draft.theme, difficulty: draft.difficulty }) : []),
    [draft.theme, draft.difficulty],
  );
  const bandCounts = useMemo(
    () =>
      Object.fromEntries(
        HOMEWORK_DIFFICULTIES.map((d) => [
          d.key,
          draft.theme ? puzzlesMatching(PUZZLES, { theme: draft.theme, difficulty: d.key }).length : null,
        ]),
      ),
    [draft.theme],
  );

  // Every report walks the attempt and game lists, so they are rebuilt when
  // those, the assignments or the roster change, not on every keystroke in
  // the form. `now` is taken at that moment for the same reason.
  const { ordered, reports, byPlayer, now } = useMemo(() => {
    const at = Date.now();
    const list = orderAssignments(assignments, { now: at });
    return {
      ordered: list,
      reports: Object.fromEntries(
        list.map((a) => [a.id, assignmentReport(a, attempts, activePlayers, { now: at, games })]),
      ),
      byPlayer: playerCompletion(list, attempts, activePlayers, { now: at, games }),
      now: at,
    };
  }, [assignments, attempts, games, activePlayers]);
  const running = ordered.filter((a) => Date.parse(a.dueAt) >= now).length;

  const errorFor = (field) =>
    errors
      .filter((e) => e.field === field)
      .map((e) => e.message)
      .join(' ');

  const toggle = (list, id) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  const submit = async (event) => {
    event.preventDefault();
    const result = buildAssignment(
      { ...draft, dueAt: dueAtFromDate(draft.dueDate) },
      { themes: PUZZLE_THEMES, puzzles: PUZZLES, players: activePlayers, now: new Date(), id: newHomeworkId() },
    );
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setBusy(true);
    const saved = await saveAssignment(result.assignment);
    setBusy(false);
    if (!saved.ok) {
      setErrors([{ field: 'save', message: `Not saved: ${saved.error}` }]);
      return;
    }
    setErrors([]);
    setDraft(blankDraft());
    setOpen(false);
    setNotice(
      `Set: ${assignmentTitle(result.assignment)} for ${audienceLabel(result.assignment).toLowerCase()}, due ${shortDate(result.assignment.dueAt)}.`,
    );
  };

  const remove = (assignment) => {
    // Attempts and games stay either way; this only takes it off everyone's list.
    if (!window.confirm(`Remove "${assignmentTitle(assignment)}"? Puzzle attempts and games are kept.`)) return;
    removeAssignment(assignment.id);
  };

  const setKind = (kind) =>
    update({
      kind,
      requiredCount: kind === 'games' ? DEFAULT_GAMES : DEFAULT_REQUIRED,
    });

  return (
    <section className="panel hw-panel">
      <div className="panel-header">
        <h2>
          Homework
          <InfoTooltip>
            Set puzzles on a theme, a fixed set of puzzles, or a number of games, with a due date.
            Progress fills itself in: puzzles from what each trainee solves on the Training page
            (only after the homework was set, each puzzle once, and a hint or a shown answer does not
            count), games from the archive (club, online after sync, or a scoresheet). Late work
            still counts, marked late.
          </InfoTooltip>
        </h2>
        <span className="panel-header-actions">
          <span className="badge">{running} running</span>
          {!open && (
            <button
              type="button"
              className="primary hw-new"
              onClick={() => {
                setOpen(true);
                setNotice('');
              }}
            >
              New homework
            </button>
          )}
        </span>
      </div>

      {notice && (
        <p className="hw-notice" role="status">
          {notice}
        </p>
      )}

      {open && (
        <form className="hw-form" onSubmit={submit} noValidate>
          <fieldset className="hw-choice hw-wide">
            <legend>What to do</legend>
            <label>
              <input type="radio" name="hw-kind" checked={draft.kind === 'theme'} onChange={() => setKind('theme')} />
              Puzzles on a theme
            </label>
            <label>
              <input type="radio" name="hw-kind" checked={draft.kind === 'set'} onChange={() => setKind('set')} />
              A fixed set of puzzles
            </label>
            <label>
              <input type="radio" name="hw-kind" checked={draft.kind === 'games'} onChange={() => setKind('games')} />
              Play games
            </label>
          </fieldset>

          {draft.kind !== 'games' && (
            <>
              <label className="field">
                <span>Theme</span>
                <select value={draft.theme} onChange={(e) => update({ theme: e.target.value })}>
                  <option value="">Choose a theme…</option>
                  {PUZZLE_THEMES.map((t) => (
                    <option key={t} value={t}>
                      {themeLabel(t)} ({themeCounts.get(t)})
                    </option>
                  ))}
                </select>
                {errorFor('theme') && <em className="hw-error">{errorFor('theme')}</em>}
              </label>

              <label className="field">
                <span>Difficulty</span>
                <select value={draft.difficulty} onChange={(e) => update({ difficulty: e.target.value })}>
                  <option value="">Any difficulty</option>
                  {HOMEWORK_DIFFICULTIES.map((d) => (
                    <option key={d.key} value={d.key} disabled={bandCounts[d.key] === 0}>
                      {d.label}
                      {bandCounts[d.key] != null ? ` (${bandCounts[d.key]})` : ''}
                    </option>
                  ))}
                </select>
                {errorFor('difficulty') && <em className="hw-error">{errorFor('difficulty')}</em>}
              </label>
            </>
          )}

          {draft.kind === 'theme' && (
            <label className="field">
              <span>Puzzles to solve</span>
              <input
                type="number"
                inputMode="numeric"
                min="1"
                max={Math.min(MAX_REQUIRED, matching.length || MAX_REQUIRED)}
                value={draft.requiredCount}
                onChange={(e) => update({ requiredCount: e.target.value === '' ? '' : Number(e.target.value) })}
              />
              {draft.theme && <em className="hw-help">{matching.length} available</em>}
              {errorFor('requiredCount') && <em className="hw-error">{errorFor('requiredCount')}</em>}
            </label>
          )}

          {draft.kind === 'set' && (
            <div className="field hw-wide">
              <span>
                Puzzles in the set: <strong className="mono">{draft.puzzleIds.length}</strong> chosen
                {draft.puzzleIds.length > 0 && (
                  <button type="button" className="link-button hw-inline" onClick={() => update({ puzzleIds: [] })}>
                    clear
                  </button>
                )}
              </span>
              {!draft.theme ? (
                <em className="hw-help">Choose a theme to list its puzzles. Picks are kept if you switch theme.</em>
              ) : (
                <ul className="hw-pick-list">
                  {matching.map((p) => (
                    <li key={p.id}>
                      <label>
                        <input
                          type="checkbox"
                          checked={draft.puzzleIds.includes(p.id)}
                          onChange={() => update({ puzzleIds: toggle(draft.puzzleIds, p.id) })}
                        />
                        <span className="hw-pick-name">{p.name}</span>
                        <span className="mono hw-pick-rating">{p.rating}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
              {errorFor('puzzleIds') && <em className="hw-error">{errorFor('puzzleIds')}</em>}
            </div>
          )}

          {draft.kind === 'games' && (
            <>
              <label className="field">
                <span>Games to play</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min="1"
                  max={MAX_GAMES}
                  value={draft.requiredCount}
                  onChange={(e) => update({ requiredCount: e.target.value === '' ? '' : Number(e.target.value) })}
                />
                {errorFor('requiredCount') && <em className="hw-error">{errorFor('requiredCount')}</em>}
              </label>
              <label className="field">
                <span>Time control</span>
                <select value={draft.minMinutes} onChange={(e) => update({ minMinutes: Number(e.target.value) })}>
                  {GAME_MINUTE_OPTIONS.map((m) => (
                    <option key={m} value={m}>
                      {m ? `${m} minutes or longer` : 'Any speed'}
                    </option>
                  ))}
                </select>
                <em className="hw-help">
                  Minutes per player, counting 40 moves of increment or delay: G/30;d5 is about 33. A game
                  needs a result and at least {MIN_GAME_PLIES / 2} moves each; games with no time control
                  recorded only count for “Any speed”.
                </em>
                {errorFor('minMinutes') && <em className="hw-error">{errorFor('minMinutes')}</em>}
              </label>
            </>
          )}

          <label className="field">
            <span>Due</span>
            <input
              type="date"
              value={draft.dueDate}
              min={localDateString(new Date())}
              onChange={(e) => update({ dueDate: e.target.value })}
            />
            <em className="hw-help">By the end of that day.</em>
            {errorFor('dueAt') && <em className="hw-error">{errorFor('dueAt')}</em>}
          </label>

          <fieldset className="hw-choice hw-wide">
            <legend>For</legend>
            <label>
              <input
                type="radio"
                name="hw-audience"
                checked={draft.audience === 'club'}
                onChange={() => update({ audience: 'club' })}
              />
              Whole club ({activePlayers.length})
            </label>
            <label>
              <input
                type="radio"
                name="hw-audience"
                checked={draft.audience === 'group'}
                disabled={!groups.length}
                onChange={() => update({ audience: 'group', groupKey: draft.groupKey || groups[0]?.key || '' })}
              />
              A group
            </label>
            <label>
              <input
                type="radio"
                name="hw-audience"
                checked={draft.audience === 'players'}
                onChange={() => update({ audience: 'players' })}
              />
              Chosen players
            </label>
            {draft.audience === 'group' && (
              <select
                className="hw-group-select"
                value={draft.groupKey}
                aria-label="Group"
                onChange={(e) => update({ groupKey: e.target.value })}
              >
                {groups.map((g) => (
                  <option key={g.key} value={g.key}>
                    {g.label} ({g.playerIds.length})
                  </option>
                ))}
              </select>
            )}
            {draft.audience === 'players' && (
              <ul className="hw-pick-list hw-pick-players">
                {activePlayers.map((p) => (
                  <li key={p.playerId}>
                    <label>
                      <input
                        type="checkbox"
                        checked={draft.playerIds.includes(p.playerId)}
                        onChange={() => update({ playerIds: toggle(draft.playerIds, p.playerId) })}
                      />
                      <span className="hw-pick-name">{p.name}</span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
            {errorFor('audience') && <em className="hw-error">{errorFor('audience')}</em>}
          </fieldset>

          <label className="field hw-wide">
            <span>Note for trainees (optional)</span>
            <input
              type="text"
              maxLength={NOTE_MAX}
              value={draft.note}
              placeholder="e.g. Warm-up for the Oct 24 tournament"
              onChange={(e) => update({ note: e.target.value })}
            />
            {errorFor('note') && <em className="hw-error">{errorFor('note')}</em>}
          </label>

          {(errorFor('save') || errorFor('kind') || errorFor('id')) && (
            <p className="hw-error hw-wide" role="alert">
              {[errorFor('save'), errorFor('kind'), errorFor('id')].filter(Boolean).join(' ')}
            </p>
          )}

          <div className="button-grid hw-wide">
            <button type="submit" className="primary" disabled={busy}>
              {busy ? 'Saving…' : 'Set homework'}
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setErrors([]);
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {ordered.length === 0 ? (
        !open && <p className="hint-text">No homework set yet.</p>
      ) : (
        <>
          <ul className="hw-list">
            {ordered.map((assignment) => {
              const report = reports[assignment.id];
              const past = Date.parse(assignment.dueAt) < now;
              return (
                <li key={assignment.id} className={`hw-card${past ? ' hw-card-past' : ''}`}>
                  <div className="hw-card-head">
                    <div className="hw-card-title">
                      <strong>{assignmentTitle(assignment)}</strong>
                      <span className="hw-meta">
                        Due {shortDate(assignment.dueAt)} · {audienceLabel(assignment)}
                        {report.removed > 0 && ` · ${report.removed} since left the roster`}
                      </span>
                      {assignment.note && <span className="hw-note">{assignment.note}</span>}
                    </div>
                    <button type="button" className="link-button danger" onClick={() => remove(assignment)}>
                      Remove
                    </button>
                  </div>

                  <div className="hw-tally">
                    <span className="hw-percent mono">{report.percent == null ? '—' : `${report.percent}%`}</span>
                    <span
                      className="hw-bar"
                      role="img"
                      aria-label={`${report.counts.done} of ${report.counts.total} done`}
                    >
                      <span style={{ width: `${report.percent ?? 0}%` }} />
                    </span>
                    <span className="hw-counts">
                      <strong className="mono">
                        {report.counts.done}/{report.counts.total}
                      </strong>{' '}
                      done
                      {report.counts['in-progress'] > 0 && ` · ${report.counts['in-progress']} started`}
                      {report.counts['not-started'] > 0 && ` · ${report.counts['not-started']} not started`}
                      {report.counts.overdue > 0 && ` · ${report.counts.overdue} overdue`}
                    </span>
                  </div>

                  <details className="hw-who" open={!past && report.rows.length <= 12}>
                    <summary>Who has done it</summary>
                    {report.rows.length === 0 ? (
                      <p className="hint-text">Nobody on the roster is set this any more.</p>
                    ) : (
                      <ul className="hw-player-list">
                        {report.rows.map(({ playerId, name, progress }) => (
                          <li key={playerId}>
                            <span className="hw-player-name">{name}</span>
                            <span className="mono hw-fraction" title={`${unitFor(assignment)} done`}>
                              {Math.min(progress.completed, progress.required)}/{progress.required}
                            </span>
                            <span className="hw-detail">{activityLine(assignment, progress)}</span>
                            <HomeworkStatus progress={progress} />
                          </li>
                        ))}
                      </ul>
                    )}
                  </details>
                </li>
              );
            })}
          </ul>

          {byPlayer.length > 0 && (
            <details className="hw-by-player" open>
              <summary>
                Completion by player
                <span className="hint-text"> · across the {ordered.length} listed</span>
              </summary>
              <div className="table-scroll">
                <table className="roster-table hw-player-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Done</th>
                      <th>Overdue</th>
                      <th>Complete</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byPlayer.map((row) => (
                      <tr key={row.playerId}>
                        <td>{row.name}</td>
                        <td className="mono">
                          {row.done}/{row.assigned}
                        </td>
                        <td className="mono">{row.overdue || '—'}</td>
                        <td>
                          <span className="hw-percent mono">{row.percent}%</span>
                          <span className="hw-bar hw-bar-small" aria-hidden="true">
                            <span style={{ width: `${row.percent}%` }} />
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}
        </>
      )}
    </section>
  );
}
