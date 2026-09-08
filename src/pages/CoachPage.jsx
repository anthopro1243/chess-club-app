import { useMemo, useState } from 'react';
import { RUBRIC_CATEGORIES } from '../data/roster.js';
import { usePlayers, recordAssessment, setAttendance } from '../data/rosterStore.js';
import { useGames } from '../data/gamesStore.js';
import { exportWorkbook } from '../data/exportWorkbook.js';

const today = () => new Date().toISOString().slice(0, 10);

/** A compact sparkline of a player's rating over time — enough to see a trend. */
function RatingTrend({ history }) {
  const points = (history || []).filter((h) => typeof h.rating === 'number');
  if (points.length < 2) return <span className="hint-text">Not enough data yet</span>;

  const values = points.map((p) => p.rating);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const width = 160;
  const height = 34;
  const path = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * width;
      const y = height - ((v - min) / span) * height;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  const net = Math.round(values[values.length - 1] - values[0]);

  return (
    <span className="rating-trend">
      <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} aria-hidden="true">
        <path d={path} fill="none" stroke="currentColor" strokeWidth="2" />
      </svg>
      <span className={`mono ${net >= 0 ? 'trend-up' : 'trend-down'}`}>
        {net >= 0 ? '+' : ''}
        {net}
      </span>
    </span>
  );
}

/**
 * CoachPage — the oversight screen.
 *
 * Everything a coach needs to run a session in one place: who's here, where
 * each player is, logging a dated skill assessment, and pulling the whole
 * club's records out as a spreadsheet. Read-write, unlike the Club
 * dashboard, which is the members' view.
 */
export default function CoachPage() {
  const players = usePlayers();
  const games = useGames();
  const [sessionDate, setSessionDate] = useState(today);
  const [assessingId, setAssessingId] = useState(null);
  const [draftRubric, setDraftRubric] = useState({});
  const [assessNotes, setAssessNotes] = useState('');
  const [toast, setToast] = useState('');

  const flash = (message) => {
    setToast(message);
    setTimeout(() => setToast(''), 2500);
  };

  const sorted = useMemo(
    () => [...players].sort((a, b) => (b.clubRating?.rating ?? 0) - (a.clubRating?.rating ?? 0)),
    [players],
  );

  const recentActivity = useMemo(() => {
    const events = [];
    for (const p of players) {
      for (const h of p.ratingHistory || []) {
        events.push({ at: h.at, who: p.name, what: h.detail || h.source, change: h.change });
      }
    }
    return events.sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 12);
  }, [players]);

  const startAssessment = (player) => {
    setAssessingId(player.playerId);
    setDraftRubric({ ...player.rubric });
    setAssessNotes('');
  };

  const saveAssessment = () => {
    recordAssessment(assessingId, draftRubric, assessNotes);
    setAssessingId(null);
    flash('Assessment logged');
  };

  const attendanceFor = (player) =>
    (player.attendance || []).find((a) => a.date === sessionDate)?.present ?? null;

  const presentCount = players.filter((p) => attendanceFor(p) === true).length;

  return (
    <div className="dashboard">
      <section className="panel">
        <div className="panel-header">
          <h2>Coach tools</h2>
          <button
            type="button"
            className="primary"
            onClick={async () => {
              flash('Building spreadsheet…');
              try {
                const name = await exportWorkbook(players, games);
                flash(`Exported ${name}`);
              } catch (error) {
                flash(`Export failed: ${error.message}`);
              }
            }}
          >
            Export spreadsheet
          </button>
        </div>
        <p className="hint-text">
          The export is a real .xlsx workbook: club summary, player master, dated skill
          assessments, the full ratings log, every archived game with its PGN, and an attendance
          grid — one tab each.
        </p>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Attendance</h2>
          <span className="badge">
            {presentCount} / {players.length} present
          </span>
        </div>
        <label className="field">
          <span>Session date</span>
          <input type="date" value={sessionDate} onChange={(e) => setSessionDate(e.target.value)} />
        </label>

        {players.length === 0 ? (
          <p className="hint-text">No players on the roster yet.</p>
        ) : (
          <ul className="attendance-list">
            {players.map((p) => {
              const state = attendanceFor(p);
              return (
                <li key={p.playerId}>
                  <span className="attendance-name">{p.name}</span>
                  <span className="attendance-buttons">
                    <button
                      type="button"
                      className={state === true ? 'attend-on' : ''}
                      onClick={() => setAttendance(p.playerId, sessionDate, true)}
                    >
                      Present
                    </button>
                    <button
                      type="button"
                      className={state === false ? 'attend-off' : ''}
                      onClick={() => setAttendance(p.playerId, sessionDate, false)}
                    >
                      Absent
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Player progress</h2>
          <span className="hint-text">Rating trend across every recorded result</span>
        </div>

        {sorted.length === 0 ? (
          <p className="hint-text">No players yet.</p>
        ) : (
          <div className="table-scroll">
            <table className="roster-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Rating</th>
                  <th>Trend</th>
                  <th>Results</th>
                  <th>Puzzles</th>
                  <th>Last assessed</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {sorted.map((p) => {
                  const last = (p.assessments || [])[(p.assessments || []).length - 1];
                  return (
                    <tr key={p.playerId}>
                      <td>{p.name}</td>
                      <td className="mono">{Math.round(p.clubRating?.rating ?? 1500)}</td>
                      <td>
                        <RatingTrend history={p.ratingHistory} />
                      </td>
                      <td className="mono">{p.clubRating?.count ?? 0}</td>
                      <td className="mono">{p.puzzleStats?.solvedIds?.length ?? 0}</td>
                      <td className="mono">{last ? String(last.at).slice(0, 10) : '—'}</td>
                      <td>
                        <button type="button" className="link-button" onClick={() => startAssessment(p)}>
                          Assess
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {assessingId && (
        <section className="panel">
          <div className="panel-header">
            <h2>Assessment — {players.find((p) => p.playerId === assessingId)?.name}</h2>
            <span className="badge mono">{today()}</span>
          </div>
          <div className="rubric rubric-edit">
            {RUBRIC_CATEGORIES.map((category) => (
              <div className="rubric-row" key={category.key}>
                <span className="rubric-label">{category.label}</span>
                <input
                  type="range"
                  min="0"
                  max="10"
                  value={draftRubric[category.key] ?? 5}
                  onChange={(e) =>
                    setDraftRubric((d) => ({ ...d, [category.key]: Number(e.target.value) }))
                  }
                />
                <span className="rubric-score mono">{draftRubric[category.key] ?? 5}</span>
              </div>
            ))}
          </div>
          <h3>Notes</h3>
          <textarea
            className="text-area"
            value={assessNotes}
            onChange={(e) => setAssessNotes(e.target.value)}
            placeholder="What this assessment was based on, what to work on next…"
          />
          <div className="button-grid">
            <button type="button" className="primary" onClick={saveAssessment}>
              Log assessment
            </button>
            <button type="button" onClick={() => setAssessingId(null)}>
              Cancel
            </button>
          </div>
          <p className="hint-text">
            Logging keeps the dated history — the roster's rubric bars always show the most recent
            one, and every assessment lands in the spreadsheet export.
          </p>
        </section>
      )}

      <section className="panel">
        <div className="panel-header">
          <h2>Recent activity</h2>
        </div>
        {recentActivity.length === 0 ? (
          <p className="hint-text">Nothing recorded yet.</p>
        ) : (
          <ul className="activity-list">
            {recentActivity.map((e, i) => (
              <li key={`${e.at}-${i}`}>
                <span className="mono activity-date">{String(e.at).slice(0, 10)}</span>
                <span className="activity-who">{e.who}</span>
                <span className="activity-what">{e.what}</span>
                <span className={`mono ${e.change >= 0 ? 'trend-up' : 'trend-down'}`}>
                  {e.change >= 0 ? '+' : ''}
                  {Math.round(e.change || 0)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
