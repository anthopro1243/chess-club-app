import { useMemo, useState } from 'react';
import { usePlayers } from '../data/rosterStore.js';
import { useAnalyses, useSkillScores } from '../data/analysisStore.js';
import { useGames, GAME_MODE_LABEL } from '../data/gamesStore.js';
import { useOwnPuzzlesFor } from '../data/ownPuzzleStore.js';
import { buildPlayerHome } from '../analysis/playerHome.js';
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
 * `homework` is optional. The homework feature is being built separately;
 * until it passes a list in, the block does not render at all, rather than
 * telling a player they have nothing due when nobody has looked.
 */
export default function PlayerHome({ playerId, viewer, homework, preview = false }) {
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
    () => buildPlayerHome({ player, viewer, skillRows, analyses, games, ownPuzzles, homework, now }),
    [player, viewer, skillRows, analyses, games, ownPuzzles, homework, now],
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
              Local preview: what {firstName} sees when signed in. Nothing here is saved.
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
        <NewMember firstName={firstName} />
      ) : (
        <div className={`ph-grid ${home.homework ? 'has-homework' : ''}`}>
          <Priority
            priority={home.priority}
            analysedCount={home.analysedCount}
            isNextStep={home.nextStep.reason === 'priority'}
          />
          <Trend trend={home.trend} categories={home.categories} analysedCount={home.analysedCount} />
          <Reviews reviews={home.reviews} />
          {home.homework && <Homework homework={home.homework} />}
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
        Welcome, {firstName}. There are no games on your page yet, so there is nothing to measure.
      </p>
      <p className="muted">
        Link Chess.com or Lichess in your account menu, or play a game here. Once a few games are
        analysed, this page shows the one thing to work on, how you are trending, and your own
        mistakes to review.
      </p>
      <div className="ph-actions">
        <a className="ph-action" href="#/training">Or try some puzzles</a>
      </div>
    </div>
  );
}

function Priority({ priority, analysedCount, isNextStep }) {
  return (
    <div className="ph-card ph-priority">
      <h3>Your one thing to work on</h3>
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
            ? 'Not enough games yet to pick one. It appears after a few more of your games are analysed.'
            : 'It appears once your games have been analysed. That happens on its own while the app is open.'}
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
      <h3>How you are trending</h3>
      <p className="ph-trend-headline">
        {trend.headline ?? (analysedCount
          ? 'Not enough games yet to show a trend.'
          : 'Your trend appears once your games have been analysed.')}
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
      <h3>Review positions due</h3>
      <p className="ph-count">
        <span className="mono">{reviews.due}</span>{' '}
        {reviews.due === 1 ? 'position' : 'positions'} from your own games
      </p>
      {reviews.due > 0 ? (
        <>
          <p className="muted small">
            On Training, pick yourself as the trainee and choose &ldquo;Your mistakes&rdquo;.
          </p>
          <a className="ph-action" href={reviews.href}>Review them</a>
        </>
      ) : (
        <p className="muted small">
          {reviews.active
            ? `Nothing due right now. ${reviews.active} on your list will come back on schedule.`
            : 'Positions you get wrong in analysed games land here to practise again.'}
        </p>
      )}
    </div>
  );
}

function Homework({ homework }) {
  return (
    <div className="ph-card ph-homework">
      <h3>Homework due</h3>
      {homework.items.length === 0 ? (
        <p className="muted small">Nothing assigned right now.</p>
      ) : (
        <ul className="ph-list">
          {homework.items.map((item) => (
            <li key={item.id}>
              <a href={item.href}>{item.title}</a>
              {item.dueAt && (
                <span className={`small ${item.overdue ? 'ph-overdue' : 'muted'}`}>
                  {item.overdue ? 'overdue' : `due ${String(item.dueAt).slice(0, 10)}`}
                </span>
              )}
            </li>
          ))}
        </ul>
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
