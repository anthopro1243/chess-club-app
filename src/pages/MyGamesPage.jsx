import { useMemo, useState } from 'react';
import { useGames, GAME_MODE_LABEL } from '../data/gamesStore.js';
import { useMyProfile } from '../data/rosterStore.js';
import { useAccount } from '../data/accountStore.js';
import { useAnalysisForGame } from '../data/analysisStore.js';
import { useDuePuzzles, useReviewSummary } from '../data/ownPuzzleStore.js';
import GameAnalysisPanel from '../components/GameAnalysisPanel.jsx';
import GameReview from '../components/GameReview.jsx';

/*
 * MyGamesPage — a player's own game history, and the analyser on demand.
 *
 * Every other view in this app is built for the coach. This one is built for
 * the player: their games, their analysis, their mistakes queued for review.
 *
 * The visibility rule is the same as everywhere else and is enforced twice:
 * the list is filtered to the signed-in player's own player_id here, and the
 * RLS policies refuse anyone else's analysis rows regardless of what this page
 * asks for. A coach who opens this page sees their own games, not the club's -
 * the club-wide view is the Games page.
 */
export default function MyGamesPage() {
  const games = useGames();
  const me = useMyProfile();
  const account = useAccount();
  const [openId, setOpenId] = useState(null);

  const playerId = me?.playerId ?? null;
  const viewer = { role: account?.role, playerId };

  const mine = useMemo(() => {
    if (!playerId) return [];
    return games
      .filter((g) => g.whitePlayerId === playerId || g.blackPlayerId === playerId)
      .sort((a, b) => String(b.playedAt).localeCompare(String(a.playedAt)));
  }, [games, playerId]);

  const due = useDuePuzzles(playerId);
  const reviewState = useReviewSummary(playerId);

  if (!playerId) {
    return (
      <div className="page">
        <section className="panel">
          <div className="panel-header">
            <h2>My games</h2>
          </div>
          <p className="muted">
            Your account is not linked to a player on the roster yet, so there are no games to
            show. A coach can link it for you from the Roster page.
          </p>
        </section>
      </div>
    );
  }

  return (
    <div className="page">
      <section className="panel">
        <div className="panel-header">
          <h2>My games</h2>
          <span className="badge mono">{mine.length} games</span>
        </div>

        {reviewState.total > 0 && (
          <p className="muted">
            {due.length > 0
              ? `${due.length} position${due.length === 1 ? '' : 's'} from your own games ready to review.`
              : `Nothing due right now — ${reviewState.active} position${reviewState.active === 1 ? '' : 's'} on your review list.`}
          </p>
        )}

        {!mine.length && (
          <p className="muted">
            No games yet. Games you play here, and games synced from a linked Chess.com or Lichess
            account, will appear in this list.
          </p>
        )}

        {!!mine.length && (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Opponent</th>
                  <th>Colour</th>
                  <th>Result</th>
                  <th>Moves</th>
                  <th>Type</th>
                  <th>Analysis</th>
                </tr>
              </thead>
              <tbody>
                {mine.map((game) => (
                  <MyGameRow
                    key={game.id}
                    game={game}
                    playerId={playerId}
                    open={openId === game.id}
                    onToggle={() => setOpenId(openId === game.id ? null : game.id)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {openId && (() => {
        const game = mine.find((g) => g.id === openId);
        if (!game) return null;
        return (
          <section className="panel">
            <div className="panel-header">
              <h2>
                {game.whiteName} vs {game.blackName}
              </h2>
              <span className="badge mono">{game.result}</span>
            </div>
            {/*
              allowSelfAnalysis: on their own game a player may run the engine
              themselves, rather than waiting for the queue or for a coach. The
              database still decides what may be written.
            */}
            <MyGameReview game={game} playerId={playerId} />
            <GameAnalysisPanel game={game} viewer={viewer} allowSelfAnalysis />
          </section>
        );
      })()}
    </div>
  );
}

function MyGameRow({ game, playerId, open, onToggle }) {
  const analyses = useAnalysisForGame(game.id);
  const asWhite = game.whitePlayerId === playerId;
  const opponent = asWhite ? game.blackName : game.whiteName;
  const mine = analyses.find((a) => a.side === (asWhite ? 'w' : 'b'));

  return (
    <tr className={open ? 'selected' : ''}>
      <td className="mono">{String(game.playedAt ?? '').slice(0, 10)}</td>
      <td>{opponent || '—'}</td>
      <td>{asWhite ? 'White' : 'Black'}</td>
      <td>{game.result}</td>
      <td className="mono">{game.moveCount}</td>
      <td>
        <span className="badge">{GAME_MODE_LABEL[game.mode] || game.mode}</span>
      </td>
      <td>
        <button type="button" className="link-button" onClick={onToggle}>
          {mine?.accuracy != null ? `${mine.accuracy}%` : open ? 'Close' : 'Analyse'}
        </button>
      </td>
    </tr>
  );
}

/** The board viewer, oriented to the side this player actually had. */
function MyGameReview({ game, playerId }) {
  const analyses = useAnalysisForGame(game.id);
  const mine = analyses.filter((a) => a.playerId === playerId);
  return (
    <GameReview
      game={game}
      analyses={mine.length ? mine : analyses}
      orientation={game.whitePlayerId === playerId ? 'w' : 'b'}
    />
  );
}
