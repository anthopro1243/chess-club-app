import { useCallback, useMemo, useRef, useState } from 'react';
import { RUBRIC_CATEGORIES } from '../roster/roster.js';
import { usePlayers, recordAssessment } from '../roster/rosterStore.js';
import { useGames } from '../games/gamesStore.js';
import { exportWorkbook } from './exportWorkbook.js';
import InfoTooltip from '../../ui/InfoTooltip.jsx';
import MemberApproval from './MemberApproval.jsx';
import AnalysisQueuePanel from '../analysis/AnalysisQueuePanel.jsx';
import ClientErrorsPanel from './ClientErrorsPanel.jsx';
import { isCloud } from '../../services/backend.js';
import ClubWeaknessesPanel from '../analysis/ClubWeaknessesPanel.jsx';
import ReviewQueuePanel from '../training/ReviewQueuePanel.jsx';
import { useAnalysisQueue } from '../analysis/useAnalysisQueue.js';
import { useAssessments } from './assessmentStore.js';
import { useSkillScores } from '../analysis/analysisStore.js';
import { activePlayerIdSet, onlyActiveRows } from '../roster/retiredPlayers.js';
import { engineRubricFrom } from './assessmentStore.js';
import { usePlatformRatings, useRatingOverrides } from '../ratings/ratingStore.js';
import { resolveRating } from '../../analysis/ratings.js';
import { useCoachNotes } from './coachNotesStore.js';
import Toast, { useToast } from '../../ui/Toast.jsx';
import { PageActions } from '../../ui/PageHeader.jsx';
import JumpNav from '../../ui/JumpNav.jsx';
import Icon from '../../ui/Icon.jsx';
import EmptyState from '../../ui/EmptyState.jsx';

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
  const [assessingId, setAssessingId] = useState(null);
  const [draftRubric, setDraftRubric] = useState({});
  const [engineSeeded, setEngineSeeded] = useState({});
  const [assessNotes, setAssessNotes] = useState('');
  const [toast, showToast] = useToast(2500);
  const [exporting, setExporting] = useState(false);

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

  const flash = showToast;

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
    flash('Assessment saved');
  };


  const pageRef = useRef(null);

  return (
    <div className="dashboard" ref={pageRef}>
      <PageActions>
          <button
            type="button"
            className="btn"
            title="One file with a tab each for the club summary, players, assessments, ratings and games."
            disabled={exporting}
            aria-busy={exporting}
            onClick={async () => {
              setExporting(true);
              // Let "Building…" paint before the workbook ties up the page.
              await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
              try {
                const name = await exportWorkbook(players, games, { coachNotes });
                flash(`Exported ${name}`);
              } catch (error) {
                flash(`Export failed: ${error.message}`);
              } finally {
                setExporting(false);
              }
            }}
          >
            <Icon name="download" size={16} />
            {exporting ? 'Building…' : 'Export spreadsheet'}
          </button>
      </PageActions>
      <JumpNav containerRef={pageRef} />
      <MemberApproval />

      <AnalysisQueuePanel queue={queue} />
      {isCloud && <ClientErrorsPanel />}

      <ReviewQueuePanel />

      <ClubWeaknessesPanel />

      <section className="panel">
        <div className="panel-header">
          <h2>Player progress</h2>
        </div>

        {sorted.length === 0 ? (
          <EmptyState icon="roster" title="No players yet">
            Add players on the Roster page and their progress shows here.
          </EmptyState>
        ) : (
          <div className="table-scroll">
            <table className="roster-table">
<caption className="sr-only">Player progress</caption>
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Rating</th>
                  <th scope="col" className="hide-narrow">Trend</th>
                  <th scope="col" className="hide-narrow">Results</th>
                  <th scope="col" className="hide-narrow">Puzzles</th>
                  <th scope="col" className="hide-narrow">Last assessed</th>
                  <th scope="col" />
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
                      <td className="hide-narrow">
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
                      <td className="mono hide-narrow">{p.clubRating?.count ?? 0}</td>
                      <td className="mono hide-narrow">{p.puzzleStats?.solvedIds?.length ?? 0}</td>
                      <td className="mono hide-narrow">
                        {last ? String(last.at).slice(0, 10) : '—'}
                        {last?.source === 'engine' && (
                          <span className="hint-text"> from games</span>
                        )}
                      </td>
                      <td>
                        <button type="button" className="btn btn-sm" onClick={() => startAssessment(p)}>
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
            <div className="heading-row">
              <h2>{players.find((p) => p.playerId === assessingId)?.name}'s assessment</h2>
              <InfoTooltip>
                Sliders marked &ldquo;from games&rdquo; start where the engine put them. Move
                anything you disagree with. Your scores count over the engine&rsquo;s.
              </InfoTooltip>
            </div>
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
            placeholder="What you saw and what to work on next"
          />
          <div className="button-grid">
            <button type="button" className="primary" onClick={saveAssessment}>
              Save assessment
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
          <p className="hint-text">No activity yet.</p>
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

      <Toast message={toast} />
    </div>
  );
}
