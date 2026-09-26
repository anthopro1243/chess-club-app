import { useCallback, useMemo, useState } from 'react';
import { RUBRIC_CATEGORIES } from '../data/roster.js';
import { usePlayers, recordAssessment, setAttendance } from '../data/rosterStore.js';
import { useGames } from '../data/gamesStore.js';
import { exportWorkbook } from '../data/exportWorkbook.js';
import InfoTooltip from '../components/InfoTooltip.jsx';
import MemberApproval from '../components/MemberApproval.jsx';
import AnalysisQueuePanel from '../components/AnalysisQueuePanel.jsx';
import TeamToolsPanel from '../components/TeamToolsPanel.jsx';
import ClubWeaknessesPanel from '../components/ClubWeaknessesPanel.jsx';
import { useAnalysisQueue } from '../analysis/useAnalysisQueue.js';
import { useAssessments } from '../data/assessmentStore.js';
import { useSkillScores } from '../data/analysisStore.js';
import { activePlayerIdSet, onlyActiveRows } from '../data/retiredPlayers.js';
import { engineRubricFrom } from '../data/assessmentStore.js';
import { usePlatformRatings, useRatingOverrides } from '../data/ratingStore.js';
import { resolveRating } from '../analysis/ratings.js';
import { useCoachNotes } from '../data/coachNotesStore.js';

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
  const queue = useAnalysisQueue({ enabled: false });
  const players = usePlayers();
  const games = useGames();
  const coachNotes = useCoachNotes();
  const [sessionDate, setSessionDate] = useState(today);
  const [assessingId, setAssessingId] = useState(null);
  const [draftRubric, setDraftRubric] = useState({});
  const [engineSeeded, setEngineSeeded] = useState({});
  const [assessNotes, setAssessNotes] = useState('');
  const [toast, setToast] = useState('');

  // Engine-derived assessments and scores, so the form can start from the data
  // rather than from a row of 5s.
  const assessments = useAssessments();
  // Scores stay in the table after a member is retired; only roster members count.
  const activeIds = useMemo(() => activePlayerIdSet(players), [players]);
  const allSkillRows = useSkillScores();
  const skillRows = useMemo(() => onlyActiveRows(allSkillRows, activeIds), [allSkillRows, activeIds]);
  const skillsByPlayer = useMemo(() => {
    const out = {};
    for (const row of skillRows) (out[row.playerId] ||= {})[row.category] = row;
    return out;
  }, [skillRows]);
  const latestByPlayer = useMemo(() => {
    const out = {};
    for (const a of assessments) {
      const prev = out[a.playerId];
      if (!prev || String(a.assessedAt) > String(prev.assessedAt)) out[a.playerId] = a;
    }
    return out;
  }, [assessments]);

  const flash = (message) => {
    setToast(message);
    setTimeout(() => setToast(''), 2500);
  };

  /*
   * Same fix as the leaderboard: players.club_rating was one Glicko-2 number
   * built from bullet, blitz, rapid and daily games poured into a single pool.
   * Resolve it properly, and show which platform and time control it is.
   */
  const allPlatformRatings = usePlatformRatings();
  const platformRatings = useMemo(
    () => onlyActiveRows(allPlatformRatings, activeIds),
    [allPlatformRatings, activeIds],
  );
  const ratingOverrides = useRatingOverrides();
  const ratingFor = useCallback(
    (player) =>
      resolveRating({
        override: ratingOverrides.find((o) => o.playerId === player.playerId) ?? null,
        official: player.ratings?.uscf != null ? { platform: 'uscf', rating: player.ratings.uscf } : null,
        platformRatings: platformRatings
          .filter((r) => r.playerId === player.playerId)
          .map((r) => ({ platform: r.platform, timeControl: r.timeControl, rating: r.rating })),
      }),
    [platformRatings, ratingOverrides],
  );

  const sorted = useMemo(
    () => [...players].sort((a, b) => (ratingFor(b).rating ?? 0) - (ratingFor(a).rating ?? 0)),
    [players, ratingFor],
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
    /*
     * Start from what the engine has measured, not from a row of 5s. The coach
     * is still the author - every slider is editable and what they save is
     * authoritative - but they begin from the evidence instead of from a
     * default that told them nothing.
     */
    const { rubric: engineRubric } = engineRubricFrom(skillsByPlayer[player.playerId] || {});
    setDraftRubric({ ...player.rubric, ...engineRubric });
    setEngineSeeded(engineRubric);
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
      <MemberApproval />

      <AnalysisQueuePanel queue={queue} />

      <ClubWeaknessesPanel />

      <TeamToolsPanel />

      <section className="panel">
        <div className="panel-header">
          <h2>
            Coach tools
            <InfoTooltip>
              The spreadsheet includes a club summary, player details, skill assessments, the
              ratings log, every archived game, and attendance, each on its own tab.
            </InfoTooltip>
          </h2>
          <button
            type="button"
            className="primary"
            onClick={async () => {
              flash('Building spreadsheet…');
              try {
                const name = await exportWorkbook(players, games, { coachNotes });
                flash(`Exported ${name}`);
              } catch (error) {
                flash(`Export failed: ${error.message}`);
              }
            }}
          >
            Export spreadsheet
          </button>
        </div>
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
                  const fromTable = latestByPlayer[p.playerId];
                  const fromBlob = (p.assessments || [])[(p.assessments || []).length - 1];
                  const last = fromTable
                    ? { at: fromTable.assessedAt, source: fromTable.source }
                    : fromBlob
                      ? { at: fromBlob.at, source: 'coach' }
                      : null;
                  return (
                    <tr key={p.playerId}>
                      <td>{p.name}</td>
                      <td className="mono">
                        {ratingFor(p).rating ?? '—'}
                        <span className="hint-text"> {ratingFor(p).label}</span>
                      </td>
                      <td>
                        {/*
                          The old trend was computed from players.rating_history,
                          which is the blended Glicko-2 sequence built from mixed
                          time controls and a cold RD-350 start. It produced -426
                          measured from a peak that only ever existed because of
                          that cold start. Now that the blend is not the club
                          rating, the number it produced is not a trend of
                          anything - so it is not shown.
                        */}
                        {ratingFor(p).provenance === 'club' ? (
                          <RatingTrend history={p.ratingHistory} />
                        ) : (
                          <span className="hint-text">—</span>
                        )}
                      </td>
                      <td className="mono">{p.clubRating?.count ?? 0}</td>
                      <td className="mono">{p.puzzleStats?.solvedIds?.length ?? 0}</td>
                      <td className="mono">
                        {last ? String(last.at).slice(0, 10) : '—'}
                        {last?.source === 'engine' && (
                          <span className="hint-text"> from games</span>
                        )}
                      </td>
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
            <h2>
              {players.find((p) => p.playerId === assessingId)?.name}'s assessment
              <InfoTooltip>
                The sliders start from what the engine measured across this player's analysed
                games, marked &ldquo;from games&rdquo;. Adjust anything you disagree with — what you
                save is the coach&rsquo;s assessment and outranks the engine&rsquo;s. The engine
                also files its own dated estimate on its own, so this column never sits empty.
              </InfoTooltip>
            </h2>
            <span className="badge mono">{today()}</span>
          </div>
          <div className="rubric rubric-edit">
            {RUBRIC_CATEGORIES.map((category) => (
              <div className="rubric-row" key={category.key}>
                <span className="rubric-label">
                  {category.label}
                  {engineSeeded[category.key] != null && (
                    <em className="rubric-suggestion">from games</em>
                  )}
                </span>
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
