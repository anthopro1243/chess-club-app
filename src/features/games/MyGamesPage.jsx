import { useMemo, useState } from 'react';
import { useGames, GAME_MODE_LABEL } from './gamesStore.js';
import { useMyProfile } from '../roster/rosterStore.js';
import { useAccount } from '../account/accountStore.js';
import { useAnalysisForGame } from '../analysis/analysisStore.js';
import { useDuePuzzles, useReviewSummary } from '../training/ownPuzzleStore.js';
import GameAnalysisPanel from '../analysis/GameAnalysisPanel.jsx';
import GameReview from '../analysis/GameReview.jsx';
import { gameFromPlayerSide, shortGameDate } from '../../analysis/playerHome.js';
import { isCloud } from '../../services/backend.js';
import Link from '../../ui/Link.jsx';
import EmptyState from '../../ui/EmptyState.jsx';

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
          <EmptyState
            icon="my-games"
            title={isCloud ? 'Your account isn’t on the roster yet' : 'My games needs a club account'}
            actions={
              <Link to="games" className="btn btn-primary">
                See every game
              </Link>
            }
          >
            {isCloud
              ? 'Ask the coach to link it from the Roster page. Until then, every game is on the Games page.'
              : 'This copy of the app isn’t connected to the club server, so there is nobody signed in. Every game is on the Games page.'}
          </EmptyState>
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
              ? `${due.length} position${due.length === 1 ? '' : 's'} from your games to review.`
              : `Nothing due today. ${reviewState.active} position${reviewState.active === 1 ? '' : 's'} will come back later.`}
          </p>
        )}

        {!mine.length && (
          <EmptyState
            icon="my-games"
            title="No games yet"
            actions={
              <Link to="play" className="btn btn-primary">
                Play a game
              </Link>
            }
          >
            Games you play here or on a linked Chess.com or Lichess account show up here.
          </EmptyState>
        )}

        {!!mine.length && (
          <div className="table-scroll">
            <table className="roster-table my-games-table">
<caption className="sr-only">Your games</caption>
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Opponent</th>
                  <th scope="col" className="hide-narrow">Color</th>
                  <th scope="col">Result</th>
                  <th scope="col" className="hide-narrow">Moves</th>
                  <th scope="col" className="hide-narrow">Type</th>
                  <th scope="col">Analysis</th>
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
  // Result from the member's side ("Lost"), not the scoreline ("0-1").
  const side = gameFromPlayerSide(game, playerId);
  const mine = analyses.find((a) => a.side === side.side);

  return (
    <tr className={`clickable ${open ? 'selected' : ''}`} onClick={onToggle}>
      <td className="nowrap" title={String(game.playedAt ?? '').slice(0, 10)}>{shortGameDate(game.playedAt)}</td>
      <td className="my-games-opponent">{side.opponent}</td>
      <td className="hide-narrow">{side.colour}</td>
      <td title={game.result}>
        <span className={`ph-outcome ${side.outcome}`}>{side.outcomeLabel}</span>
      </td>
      <td className="mono hide-narrow">{game.moveCount}</td>
      <td className="hide-narrow">
        <span className="badge">{GAME_MODE_LABEL[game.mode] || game.mode}</span>
      </td>
      <td>
        <button
          type="button"
          className="link-button"
          aria-expanded={open}
          onClick={(event) => {
            event.stopPropagation(); // the row toggles too; don't toggle twice
            onToggle();
          }}
        >
          {mine?.accuracy != null ? `${mine.accuracy}%` : open ? 'Close' : 'Analyze'}
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
