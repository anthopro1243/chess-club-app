import { useState } from 'react';
import { GAME_MODE_LABEL } from '../games/gamesStore.js';
import { usePlayerHome } from './usePlayerHome.js';
import ReviewQueuePanel from '../training/ReviewQueuePanel.jsx';
import StudyPlan from '../training/StudyPlan.jsx';
import ConnectionsModal from '../account/ConnectionsModal.jsx';
import { memberCategoryLines, NOT_MEASURABLE } from '../../analysis/presentation.js';
import './player-home.css';

/*
 * PlayerHome — one player's own page, at the top of the Club page.
 *
 * Everything shown here is decided by buildPlayerHome() in
 * src/analysis/playerHome.js, which is unit-tested: who may see it, which
 * scores may appear as numbers, what the one priority is. This component
 * only lays it out. It never reads a raw score, so it cannot show a
 * low-confidence one by accident.
 *
 * The top of the page is the weekly plan (studyPlan.js): the one thing to
 * work on, a video, a Lichess link, the mistakes to review and a long game.
 */
export default function PlayerHome({ playerId, viewer, preview = false }) {
  const home = usePlayerHome(playerId, viewer);

  if (!home.available) return null;

  const firstName = home.name.split(' ')[0] || 'there';

  return (
    <section className="panel player-home" aria-label="Your home page">
      <div className="panel-header ph-header">
        <div>
          <h2>{preview ? `${home.name}'s home page` : `Hi, ${firstName}`}</h2>
          {preview && (
            <p className="muted small ph-preview-note">
              This is what {firstName} sees after signing in.
            </p>
          )}
        </div>
        {/*
          The one next step. When it IS the priority's drill, the button in
          the priority card is that step, so it is not repeated up here.
        */}
        {home.nextStep.reason !== 'priority' && (
          <a className="ph-action primary ph-next" href={home.nextStep.href}>
            {home.nextStep.label}
          </a>
        )}
      </div>

      {home.isNewMember ? (
        <>
          <NewMember firstName={firstName} canConnect={!preview} />
          <PlanCard plan={home.plan} />
        </>
      ) : (
        <div className="ph-grid">
          <PlanCard plan={home.plan} />
          <Trend trend={home.trend} categories={home.categories} analysedCount={home.analysedCount} />
          <ReviewQueuePanel playerId={playerId} compact />
          <RecentGames games={home.recentGames} total={home.gamesCount} />
        </div>
      )}
    </section>
  );
}

/*
 * A brand-new member has nothing to analyse yet. The fastest way to get
 * something on this page is their own online games, so linking an account is
 * a button right here rather than an instruction to find the account menu.
 * (Not in the coach's preview: the dialog links the signed-in account.)
 */
function NewMember({ firstName, canConnect }) {
  const [connecting, setConnecting] = useState(false);
  return (
    <div className="ph-empty">
      <p>
        Welcome, {firstName}! You don&rsquo;t have any games here yet.
      </p>
      <p className="muted">
        Link your Chess.com or Lichess account and your games come in by themselves. Games played over
        the board come in when you log them. Once a few are analyzed, this page names the one thing to
        work on.
      </p>
      {canConnect && (
        <div className="ph-actions">
          <button type="button" className="ph-action" onClick={() => setConnecting(true)}>
            Link Chess.com or Lichess
          </button>
        </div>
      )}
      {connecting && <ConnectionsModal onClose={() => setConnecting(false)} />}
    </div>
  );
}

function PlanCard({ plan }) {
  return (
    <div className="ph-card ph-plan">
      <h3 id="ph-plan-heading">Your week</h3>
      <StudyPlan plan={plan} labelledBy="ph-plan-heading" />
    </div>
  );
}

/*
 * Trend before level: the movement is the first thing in each row and the
 * headline is only movement. A category that is not confident enough reads
 * as words, with no number and no trend.
 */
function Trend({ trend, categories, analysedCount }) {
  // Only skills with a real score get a row; the rest wait in one line
  // instead of a column of "not enough games yet".
  const shown = memberCategoryLines(categories);
  // Notation can't be measured from games at all, so it never counts as "waiting".
  const waiting = categories.filter((c) => !c.showNumber && c.text !== NOT_MEASURABLE).length;
  return (
    <div className="ph-card ph-trend">
      <h3>How you&rsquo;re trending</h3>
      <p className="ph-trend-headline">
        {trend.headline ?? (analysedCount
          ? 'Not enough games yet to show a trend.'
          : 'Shows up once your games are analyzed.')}
      </p>
      {trend.biggestGain && <p className="muted small">Biggest gain: {trend.biggestGain.text}.</p>}
      {shown.length > 0 && (
        <ul className="ph-categories">
          {shown.map((c) => (
            <li key={c.key}>
              <span className="ph-cat-label">{c.label}</span>
              <span className={`ph-trend-chip ${trendClass(c.trend)}`}>{c.trendText ?? 'new'}</span>
              <span className="ph-level mono">{c.level}</span>
            </li>
          ))}
        </ul>
      )}
      {analysedCount > 0 && waiting > 0 && (
        <p className="muted small">
          {shown.length
            ? `${waiting} more skill${waiting === 1 ? '' : 's'} show up after more games.`
            : 'Your skills show up here after a few more analyzed games.'}
        </p>
      )}
    </div>
  );
}

const trendClass = (n) => (n == null ? 'none' : n > 0 ? 'up' : n < 0 ? 'down' : 'steady');

function RecentGames({ games, total }) {
  return (
    <div className="ph-card ph-games">
      <h3>Recent games</h3>
      <ul className="ph-list">
        {games.map((g) => (
          <li key={g.id}>
            <span className={`ph-outcome ${g.outcome}`}>{g.outcomeLabel}</span>
            <span className="ph-game-main">
              <span className="ph-opponent">vs {g.opponent}</span>
              <span className="ph-game-meta muted small">
                {g.colour} · {GAME_MODE_LABEL[g.mode] || g.mode} · {g.date}
              </span>
            </span>
            <span className="ph-accuracy mono small">
              {g.accuracy != null ? `${g.accuracy}% accuracy` : <span className="muted">not analyzed yet</span>}
            </span>
          </li>
        ))}
      </ul>
      <a className="ph-more" href="#/my-games">
        {total > games.length ? `All ${total} of your games` : 'Open your games'}
      </a>
    </div>
  );
}
