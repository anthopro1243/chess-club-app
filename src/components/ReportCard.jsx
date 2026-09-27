import { useEffect, useMemo, useState } from 'react';
import { useAccount } from '../data/accountStore.js';
import { usePlayers } from '../data/rosterStore.js';
import { usePlatformRatings, useRatingOverrides } from '../data/ratingStore.js';
import { useGames } from '../data/gamesStore.js';
import { useAttempts } from '../data/puzzleAttemptsStore.js';
import { useAssignments } from '../data/homeworkStore.js';
import { useAnalyses, useSkillScores } from '../data/analysisStore.js';
import { useCoachNotes } from '../data/coachNotesStore.js';
import { buildReportCard } from '../analysis/reportCard.js';
import { formatDate } from '../data/officialEvents.js';
import '../styles/report-card.css';

/*
 * ReportCard — one member on one page (research F011), for the coach.
 * Opened from the Roster page; prints on its own for a parent meeting.
 * All the rules live in src/analysis/reportCard.js; this only lays it out.
 */
export default function ReportCard({ playerId, onClose }) {
  const account = useAccount();
  const players = usePlayers();
  const platformRatings = usePlatformRatings();
  const overrides = useRatingOverrides();
  const games = useGames();
  const attempts = useAttempts();
  const assignments = useAssignments();
  const analyses = useAnalyses();
  const skillRows = useSkillScores();
  const coachNotes = useCoachNotes();
  const [now] = useState(() => Date.now());
  const [printing, setPrinting] = useState(false);

  const player = players.find((p) => p.playerId === playerId) ?? null;
  const card = useMemo(
    () =>
      buildReportCard({
        player,
        viewer: { role: account?.role, playerId: null },
        platformRatings,
        overrides,
        games,
        attempts,
        assignments,
        skillRows,
        analyses,
        coachNote: coachNotes[playerId] || '',
        now,
      }),
    [player, account?.role, platformRatings, overrides, games, attempts, assignments, skillRows, analyses, coachNotes, playerId, now],
  );

  useEffect(() => {
    if (!printing) return undefined;
    const root = document.documentElement;
    root.classList.add('rc-printing');
    const done = () => {
      root.classList.remove('rc-printing');
      setPrinting(false);
    };
    window.addEventListener('afterprint', done);
    const frame = requestAnimationFrame(() => window.print());
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('afterprint', done);
      root.classList.remove('rc-printing');
    };
  }, [printing]);

  if (!card.available) return null;
  const { activity, attendance, homework } = card;

  return (
    <section className="panel report-card" aria-label={`Report card for ${card.name}`}>
      <div className="panel-header">
        <div>
          <h2>{card.name}: report card</h2>
          <p className="muted small">
            {[card.grade && `Grade ${card.grade}`, card.commitment, card.joined && `joined ${formatDate(card.joined.slice(0, 10), { withYear: true, withWeekday: false })}`]
              .filter(Boolean)
              .join(' · ')}
            {' · '}as of {formatDate(new Date(now).toISOString().slice(0, 10), { withYear: true, withWeekday: false })}
          </p>
        </div>
        <div className="panel-header-actions rc-actions">
          <button type="button" onClick={() => setPrinting(true)}>Print</button>
          {onClose && (
            <button type="button" className="link-button" onClick={onClose}>Close</button>
          )}
        </div>
      </div>

      <p className="rc-headline">{card.headline}</p>

      <div className="rc-grid">
        <div className="rc-block">
          <h3>Ratings</h3>
          {card.ratings.length ? (
            <dl className="rc-list">
              {card.ratings.map((r) => (
                <div key={r.key}>
                  <dt>{r.label}</dt>
                  <dd className="mono">{r.rating}{r.provisional ? '?' : ''}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="muted">No ratings yet. Add a US Chess rating or link an online account.</p>
          )}
        </div>

        <div className="rc-block">
          <h3>Activity (last {activity.days} days)</h3>
          <dl className="rc-list">
            <div><dt>Games</dt><dd className="mono">{activity.games}</dd></div>
            <div><dt>Puzzles solved</dt><dd className="mono">{activity.puzzlesSolved} of {activity.puzzles}</dd></div>
            <div>
              <dt>Last active</dt>
              <dd>{activity.lastActiveAt ? formatDate(activity.lastActiveAt.slice(0, 10), { withWeekday: false }) : '—'}</dd>
            </div>
            <div>
              <dt>Attendance</dt>
              <dd>{attendance.percent == null ? 'Not recorded' : `${attendance.percent}% (${attendance.present} of ${attendance.recorded})`}</dd>
            </div>
            <div>
              <dt>Homework done</dt>
              <dd>
                {homework.assigned
                  ? `${homework.done} of ${homework.assigned}${homework.overdue ? `, ${homework.overdue} overdue` : ''}`
                  : 'None assigned'}
              </dd>
            </div>
          </dl>
        </div>

        <div className="rc-block">
          <h3>Skills</h3>
          {card.priority && (
            <p><strong>Working on:</strong> {card.priority.label}{card.priority.advice ? `. ${card.priority.advice}` : ''}</p>
          )}
          {card.trend.hasTrend && <p>{card.trend.headline}</p>}
          {card.weakest.length ? (
            <p><strong>Weakest measured areas:</strong> {card.weakest.map((c) => `${c.label} (${c.level})`).join(', ')}</p>
          ) : (
            <p className="muted">Not enough analysed games yet to measure skills ({card.analysedCount} analysed).</p>
          )}
          {card.missedTactics.length > 0 && (
            <p><strong>Missed most often:</strong> {card.missedTactics.map((m) => `${m.label} (${m.count})`).join(', ')}</p>
          )}
        </div>

        <div className="rc-block">
          <h3>Goals and notes</h3>
          <p><strong>Goal:</strong> {card.goal || <span className="muted">none set</span>}</p>
          {card.trainingFocus && <p><strong>Training focus:</strong> {card.trainingFocus}</p>}
          <p><strong>Coach note:</strong> {card.coachNote || <span className="muted">none</span>}</p>
        </div>
      </div>
    </section>
  );
}
