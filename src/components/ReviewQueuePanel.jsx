import { useMemo, useState } from 'react';
import { useGames, setGameReviewed } from '../data/gamesStore.js';
import { useAnalyses } from '../data/analysisStore.js';
import { usePlayers } from '../data/rosterStore.js';
import { reviewQueueFor, clubReviewQueue } from '../analysis/reviewQueue.js';
import InfoTooltip from './InfoTooltip.jsx';
import { useFlash } from './useFlash.js';
import '../styles/review-queue.css';

const SHOW_PER_PLAYER = 3;

/*
 * ReviewQueuePanel — the games to go over next (research F091). Given a
 * `playerId` it lists that player's queue (their home page); without one it
 * lists the whole club, busiest first (the Coach page). Pure rules live in
 * src/analysis/reviewQueue.js.
 */
export default function ReviewQueuePanel({ playerId = null, compact = false }) {
  const games = useGames();
  const analyses = useAnalyses();
  const players = usePlayers();
  const [now] = useState(() => Date.now());
  const [justReviewed, showReviewed] = useFlash(2500);

  const rows = useMemo(() => {
    if (playerId) {
      const items = reviewQueueFor(playerId, { games, analyses, now });
      return items.length ? [{ playerId, name: null, items }] : [];
    }
    return clubReviewQueue(players, { games, analyses, now });
  }, [playerId, games, analyses, players, now]);

  const total = rows.reduce((n, r) => n + r.items.length, 0);

  const done = justReviewed && (
    <p className="rq-done" role="status">
      ✓ Marked reviewed: {justReviewed}
    </p>
  );

  const list =
    rows.length === 0 ? (
      <p className="muted small">
        {playerId
          ? 'Nothing to go over right now. Games you play in person and games with big mistakes show up here.'
          : 'No games waiting for review in the last 60 days.'}
      </p>
    ) : (
      <div className="rq-rows">
        {rows.map((row) => (
          <div key={row.playerId} className="rq-player">
            {row.name && (
              <h3>
                {row.name} <span className="muted small">({row.items.length} waiting)</span>
              </h3>
            )}
            <ul className="rq-list">
              {row.items.slice(0, SHOW_PER_PLAYER).map((item) => (
                <li key={item.gameId}>
                  <div className="rq-game">
                    <a href={`#/games?game=${encodeURIComponent(item.gameId)}`}>
                      vs {item.opponent} · {String(item.playedAt).slice(0, 10)}
                    </a>
                    <span className={`rq-reason ${item.otb ? 'otb' : ''}`}>
                      {item.reason}
                      {!item.analysed && ' · not analysed yet'}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="link-button"
                    onClick={() => {
                      setGameReviewed(item.gameId, true);
                      showReviewed(`vs ${item.opponent}`);
                    }}
                  >
                    Mark reviewed
                  </button>
                </li>
              ))}
            </ul>
            {row.items.length > SHOW_PER_PLAYER && (
              <p className="muted small">and {row.items.length - SHOW_PER_PLAYER} more</p>
            )}
          </div>
        ))}
      </div>
    );

  const body = (
    <>
      {done}
      {list}
    </>
  );

  if (compact) {
    return (
      <div className="ph-card ph-review-queue">
        <h3>Games to go over</h3>
        {body}
      </div>
    );
  }

  return (
    <section className="panel review-queue">
      <div className="panel-header">
        <h2>
          Review queue
          <InfoTooltip>
            In-person games first, then games with the most big mistakes. Press Mark reviewed after
            you go over one with the player.
          </InfoTooltip>
        </h2>
        <span className="badge">{total} waiting</span>
      </div>
      {body}
    </section>
  );
}
