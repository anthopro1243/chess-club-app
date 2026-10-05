import { useMemo, useState } from 'react';
import { usePlayers } from '../data/rosterStore.js';
import { useAnalyses, useSkillScores } from '../data/analysisStore.js';
import { useGames, GAME_MODE_LABEL } from '../data/gamesStore.js';
import { useOwnPuzzlesFor } from '../data/ownPuzzleStore.js';
import { buildPlayerHome } from '../analysis/playerHome.js';
import ReviewQueuePanel from './ReviewQueuePanel.jsx';
import '../styles/playerHome.css';

/*
 * PlayerHome — one player's own page, at the top of the Club page.
 *
 * Everything shown here is decided by buildPlayerHome() in
 * src/analysis/playerHome.js, which is unit-tested: who may see it, which
 * scores may appear as numbers, what the one priority is. This component
 * only lays it out. It never reads a raw score, so it cannot show a
 * low-confidence one by accident.
 *
 */
export default function PlayerHome({ playerId, viewer, preview = false }) {
  const players = usePlayers();
  const skillRows = useSkillScores();
  const analyses = useAnalyses();
  const games = useGames();
  const ownPuzzles = useOwnPuzzlesFor(playerId);
  // Fixed for the visit: "due now" should not shift under the player while
  // they read the page, and a fresh value every render would defeat useMemo.
  const [now] = useState(() => Date.now());

  const player = players.find((p) => p.playerId === playerId) ?? null;
  const home = useMemo(
    () => buildPlayerHome({ player, viewer, skillRows, analyses, games, ownPuzzles, now }),
    [player, viewer, skillRows, analyses, games, ownPuzzles, now],
  );

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
          <NewMember firstName={firstName} />
        </>
      ) : (
        <div className="ph-grid">
          <Priority
            priority={home.priority}
            analysedCount={home.analysedCount}
            isNextStep={home.nextStep.reason === 'priority'}
          />
          <Trend trend={home.trend} categories={home.categories} analysedCount={home.analysedCount} />
          <Reviews reviews={home.reviews} />
          <ReviewQueuePanel playerId={playerId} compact />
          <RecentGames games={home.recentGames} total={home.gamesCount} />
        </div>
      )}
    </section>
  );
}

function NewMember({ firstName }) {
  return (
    <div className="ph-empty">
      <p>
        Welcome, {firstName}! You don&rsquo;t have any games here yet.
      </p>
      <p className="muted">
        Link your Chess.com or Lichess account from the account menu, or play a game here. After a
        few games are analysed, this page will show what to work on and your mistakes to review.
      </p>
      <div className="ph-actions">
        <a className="ph-action" href="#/training">Try some puzzles</a>
      </div>
    </div>
  );
}

function Priority({ priority, analysedCount, isNextStep }) {
  return (
    <div className="ph-card ph-priority">
      <h3>Work on this next</h3>
      {priority ? (
        <>
          <p className="ph-priority-label">{priority.label}</p>
          {priority.advice && <p className="muted">{priority.advice}</p>}
          {priority.action && (
            <a className={`ph-action ${isNextStep ? 'primary' : ''}`} href={priority.action.href}>
              {priority.action.label}
            </a>
          )}
        </>
      ) : (
        <p className="muted">
          {analysedCount
            ? 'Not enough games yet. Check back after a few more are analysed.'
            : 'Shows up once your games are analysed.'}
        </p>
      )}
    </div>
  );
}

/*
 * Trend before level: the movement is the first thing in each row and the
 * headline is only movement. A category that is not confident enough reads
 * as words, with no number and no trend.
 */
function Trend({ trend, categories, analysedCount }) {
  return (
    <div className="ph-card ph-trend">
      <h3>How you&rsquo;re trending</h3>
      <p className="ph-trend-headline">
        {trend.headline ?? (analysedCount
          ? 'Not enough games yet to show a trend.'
          : 'Shows up once your games are analysed.')}
      </p>
      {trend.biggestGain && <p className="muted small">Biggest gain: {trend.biggestGain.text}.</p>}
      <ul className="ph-categories">
        {categories.map((c) => (
          <li key={c.key} className={c.showNumber ? '' : 'ph-hidden'}>
            <span className="ph-cat-label">{c.label}</span>
            {c.showNumber ? (
              <>
                <span className={`ph-trend-chip ${trendClass(c.trend)}`}>
                  {c.trendText ?? 'new'}
                </span>
                <span className="ph-level mono">{c.level}</span>
              </>
            ) : (
              <span className="ph-words muted">{c.text}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

const trendClass = (n) => (n == null ? 'none' : n > 0 ? 'up' : n < 0 ? 'down' : 'steady');

function Reviews({ reviews }) {
  return (
    <div className="ph-card ph-reviews">
      <h3>Positions to review</h3>
      <p className="ph-count">
        <span className="mono">{reviews.due}</span>{' '}
        {reviews.due === 1 ? 'position' : 'positions'} from your own games
      </p>
      {reviews.due > 0 ? (
        <>
          <a className="ph-action" href={reviews.href}>Review them</a>
        </>
      ) : (
        <p className="muted small">
          {reviews.active
            ? `Nothing due today. ${reviews.active} more will come back later.`
            : 'Positions you get wrong in your games show up here.'}
        </p>
      )}
    </div>
  );
}

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
              {g.accuracy != null ? `${g.accuracy}% accuracy` : <span className="muted">not analysed yet</span>}
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
