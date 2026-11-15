import { useEffect, useRef, useState } from 'react';
import { useRoute, goTo } from '../../app/useRoute.js';
import { href } from '../../app/routes.js';
import GameAnalysisPanel from '../analysis/GameAnalysisPanel.jsx';
import GameReview from '../analysis/GameReview.jsx';
import { useAnalysisForGame } from '../analysis/analysisStore.js';
import { useAccount } from '../account/accountStore.js';
import { useGames, removeGame, GAME_MODE_LABEL } from './gamesStore.js';
import { usePlayers, useMyProfile } from '../roster/rosterStore.js';
import LogGameForm from './LogGameForm.jsx';
import PgnImportModal from './PgnImportModal.jsx';
import ScoresheetModal from './ScoresheetModal.jsx';
import { scoresheetGapOf } from './scoresheet.js';
import { useFlash } from '../../ui/useFlash.js';
import { shortGameDate } from '../../analysis/playerHome.js';
import './scoresheet.css';
import Toast, { useToast } from '../../ui/Toast.jsx';
import Link from '../../ui/Link.jsx';
import Icon from '../../ui/Icon.jsx';
import Avatar from '../../ui/Avatar.jsx';
import EmptyState from '../../ui/EmptyState.jsx';
import { PageActions, usePageMeta } from '../../ui/PageHeader.jsx';

const RESULT_LABEL = { '1-0': 'White won', '0-1': 'Black won', '1/2-1/2': 'Draw' };

const shortResult = (result) => (result === '1/2-1/2' ? '½-½' : result);

/*
 * #/games is the archive; #/games?game=<id> is one game, as a view of its
 * own with a way back. So a game can be linked (the review queue and quick
 * search do), and the browser's Back button returns to the list.
 */
const GAMES_CRUMB = [{ label: 'Games', to: 'games' }];

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function downloadPgn(game) {
  const blob = new Blob([game.pgn], { type: 'application/x-chess-pgn' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${game.whiteName}-vs-${game.blackName}-${String(game.playedAt).slice(0, 10)}.pgn`.replace(
    /\s+/g,
    '-',
  );
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/** GamesPage — every finished game the club has played, newest first. */
export default function GamesPage() {
  const account = useAccount();
  // The account row carries the role; the player id lives on the roster row
  // the account has claimed. Reading it off the account (which has no such
  // field) made every player a stranger to their own games on this page.
  const me = useMyProfile();
  const viewer = { role: account?.role, playerId: me?.playerId ?? null };
  const games = useGames();
  const players = usePlayers();
  const [playerFilter, setPlayerFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const route = useRoute();
  const openId = route.id === 'games' ? route.params.game || null : null;
  // The Club page's "Log a game" button arrives as #/games?log=1.
  const [logging, setLogging] = useState(() => route.params.log === '1');
  const [importing, setImporting] = useState(false);
  const [entering, setEntering] = useState(false);
  const [toast, showToast] = useToast(2000);

  // Coming back from a game puts the list where it was left. (The filters
  // survive on their own: this component stays mounted across the two views.)
  const listScroll = useRef(null);
  const rememberScroll = () => {
    listScroll.current = window.scrollY;
  };
  useEffect(() => {
    if (openId || listScroll.current == null) return;
    const top = listScroll.current;
    listScroll.current = null;
    requestAnimationFrame(() => window.scrollTo?.(0, top));
  }, [openId]);

  if (openId) {
    const game = games.find((g) => g.id === openId);
    return (
      <div className="games-layout view-enter" key={openId}>
        {game ? (
          <GameView game={game} players={players} viewer={viewer} flash={showToast} />
        ) : (
          // The archive keeps the newest 500, so an old link can miss.
          <GameMissing />
        )}
        <Toast message={toast} />
      </div>
    );
  }

  const filtered = games.filter((g) => {
    if (typeFilter && g.mode !== typeFilter) return false;
    if (playerFilter && g.whitePlayerId !== playerFilter && g.blackPlayerId !== playerFilter) return false;
    return true;
  });
  const openGame = (id) => {
    rememberScroll();
    goTo(href('games', { game: id }));
  };

  return (
    <div className="games-layout">
      <PageActions>
        <button type="button" className="btn" onClick={() => setImporting(true)}>
          <Icon name="upload" size={16} />
          Import PGN
        </button>
        <button type="button" className="btn" onClick={() => setEntering(true)}>
          <Icon name="edit" size={16} />
          Enter a scoresheet
        </button>
        <button
          type="button"
          className="btn btn-primary"
          aria-expanded={logging}
          aria-controls="log-game"
          onClick={() => setLogging((v) => !v)}
        >
          <Icon name={logging ? 'x' : 'plus'} size={16} />
          {logging ? 'Cancel' : 'Log a game'}
        </button>
      </PageActions>

      {entering && <ScoresheetModal players={players} games={games} onClose={() => setEntering(false)} />}
      {importing && (
        <PgnImportModal
          players={players}
          existingIds={games.map((g) => g.id)}
          onClose={() => setImporting(false)}
        />
      )}

      <div id="log-game">
        {logging && (
          <section className="panel view-enter" aria-label="Log a game">
            <div className="panel-header">
              <h2>Log a game</h2>
            </div>
            <LogGameForm />
          </section>
        )}
      </div>

      <section className="panel">
        <div className="panel-header">
          <h2>Game archive</h2>
          <span className="badge">
            {filtered.length === games.length
              ? `${games.length} ${games.length === 1 ? 'game' : 'games'}`
              : `${filtered.length} of ${games.length}`}
          </span>
        </div>

        <div className="opponent-controls games-filters">
          <label className="field">
            <span>Player</span>
            <select value={playerFilter} onChange={(e) => setPlayerFilter(e.target.value)}>
              <option value="">Everyone</option>
              {players.map((p) => (
                <option key={p.playerId} value={p.playerId}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Type</span>
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
              <option value="">All games</option>
              <option value="human">Club games</option>
              <option value="computer">vs Computer</option>
              <option value="chesscom">Chess.com</option>
              <option value="lichess">Lichess</option>
            </select>
          </label>
        </div>

        {games.length === 0 ? (
          <EmptyState
            icon="games"
            title="No games yet"
            actions={
              <>
                <button type="button" className="btn btn-primary" onClick={() => setLogging(true)}>
                  Log a game
                </button>
                <button type="button" className="btn" onClick={() => setImporting(true)}>
                  Import PGN
                </button>
              </>
            }
          >
            Games from linked Chess.com and Lichess accounts show up here by themselves. Games played over
            the board come in when you log a result, type in a paper scoresheet, or import a PGN.
          </EmptyState>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon="search"
            title="No games match"
            actions={
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setPlayerFilter('');
                  setTypeFilter('');
                }}
              >
                Clear filters
              </button>
            }
          >
            Nothing in the archive fits both filters.
          </EmptyState>
        ) : (
          <div className="table-scroll">
            <table className="roster-table games-table">
              <caption className="sr-only">Game archive</caption>
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">White</th>
                  <th scope="col">Black</th>
                  <th scope="col">Result</th>
                  <th scope="col" className="hide-narrow">Moves</th>
                  <th scope="col" className="hide-narrow">Type</th>
                  <th scope="col" className="hide-narrow">
                    <span className="sr-only">Open</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((g) => (
                  // The row is a bigger target for the mouse; the link in it is the real control.
                  <tr key={g.id} className="clickable" onClick={() => openGame(g.id)}>
                    <td className="nowrap" title={String(g.playedAt).slice(0, 10)}>
                      {shortGameDate(g.playedAt)}
                    </td>
                    <td className="games-name">
                      <Link
                        to="games"
                        params={{ game: g.id }}
                        className="name-link"
                        onClick={(event) => {
                          event.stopPropagation(); // the link navigates by itself
                          rememberScroll();
                        }}
                      >
                        {g.whiteName}
                        <span className="sr-only"> vs {g.blackName}, open the game</span>
                      </Link>
                    </td>
                    <td className="games-name">{g.blackName}</td>
                    <td>
                      <span className="hide-narrow">{RESULT_LABEL[g.result] || g.result}</span>
                      <span className="show-narrow mono">{shortResult(g.result)}</span>
                      {g.reason && <span className="hint-text hide-narrow"> · {g.reason}</span>}
                    </td>
                    <td className="mono hide-narrow">{g.moveCount}</td>
                    <td className="hide-narrow">
                      <span className={`track ${g.mode === 'human' ? 'competitive' : ''}`}>
                        {GAME_MODE_LABEL[g.mode] || g.mode}
                      </span>
                    </td>
                    <td className="hide-narrow row-chevron">
                      <Icon name="chevron-right" size={16} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Toast message={toast} />
    </div>
  );
}

/** One side of a game: avatar, name (a link to the player when they are on the roster) and colour. */
function GameSide({ name, playerId, onRoster, colour, won }) {
  const text = (
    <>
      <Avatar name={name} size="lg" />
      <span className="game-side-text">
        <span className="person-name">{name}</span>
        <span className="game-side-colour">
          {colour}
          {won && <span className="game-side-won"> · won</span>}
        </span>
      </span>
    </>
  );
  return onRoster ? (
    <Link to="roster" params={{ player: playerId }} className="person game-side">
      {text}
    </Link>
  ) : (
    <span className="person game-side">{text}</span>
  );
}

/** One game: who played, the board review, the analysis, and the PGN. */
function GameView({ game, players, viewer, flash }) {
  const [copied, showCopied] = useFlash();
  const title = `${game.whiteName} vs ${game.blackName}`;
  usePageMeta({
    title,
    summary: [shortGameDate(game.playedAt), RESULT_LABEL[game.result] || game.result, game.reason]
      .filter(Boolean)
      .join(' · '),
    crumbs: GAMES_CRUMB,
  });
  const onRoster = (id) => !!id && players.some((p) => p.playerId === id);
  const gap = scoresheetGapOf(game.pgn);

  return (
    <>
      <PageActions>
        <button
          type="button"
          className="btn"
          onClick={async () => ((await copyText(game.pgn)) ? showCopied(game.id) : flash('Copy failed'))}
        >
          <Icon name="copy" size={16} />
          {copied === game.id ? 'Copied ✓' : 'Copy PGN'}
        </button>
        <button type="button" className="btn" onClick={() => downloadPgn(game)}>
          <Icon name="download" size={16} />
          Download
        </button>
        <button
          type="button"
          className="btn btn-danger"
          onClick={() => {
            if (window.confirm('Delete this game from the archive?')) {
              removeGame(game.id);
              goTo(href('games'));
            }
          }}
        >
          <Icon name="trash" size={16} />
          Delete
        </button>
      </PageActions>

      <section className="panel game-summary" aria-label="Players and result">
        <GameSide
          name={game.whiteName}
          playerId={game.whitePlayerId}
          onRoster={onRoster(game.whitePlayerId)}
          colour="White"
          won={game.result === '1-0'}
        />
        <span className="game-score mono">{shortResult(game.result)}</span>
        <GameSide
          name={game.blackName}
          playerId={game.blackPlayerId}
          onRoster={onRoster(game.blackPlayerId)}
          colour="Black"
          won={game.result === '0-1'}
        />
        <p className="game-otb-tags">
          <span className={`track ${game.mode === 'human' ? 'competitive' : ''}`}>
            {GAME_MODE_LABEL[game.mode] || game.mode}
          </span>
          {game.moveCount != null && <span className="badge">{game.moveCount} moves</span>}
          {game.event && <span className="badge">{game.event}</span>}
          {game.round && <span className="badge">Round {game.round}</span>}
          {game.board && <span className="badge">Board {game.board}</span>}
          {game.timeControl && <span className="badge mono">{game.timeControl}</span>}
        </p>
      </section>

      <section className="panel" id="game-detail">
        <div className="panel-header">
          <h2>Game review</h2>
        </div>
        {gap && (
          <p className="game-gap-note">
            Entered from a scoresheet: {gap}.
            {/\[SetUp "1"\]/.test(game.pgn)
              ? ' The board starts after the gap. The moves before it are in the PGN comment.'
              : ' Only the moves that could be read are analyzed.'}
          </p>
        )}
        <GameReviewFor game={game} />
        <details className="pgn-details">
          <summary>Raw PGN</summary>
          <pre className="pgn-block">{game.pgn}</pre>
        </details>
        <GameAnalysisPanel game={game} viewer={viewer} />
      </section>
    </>
  );
}

/** A link to a game this device does not have. */
function GameMissing() {
  usePageMeta({ title: 'Game not found', crumbs: GAMES_CRUMB });
  return (
    <section className="panel">
      <EmptyState
        icon="games"
        title="Can’t find that game"
        actions={
          <Link to="games" className="btn btn-primary">
            Back to all games
          </Link>
        }
      >
        It isn’t on this device. It may have been deleted, or it is older than the archive keeps.
      </EmptyState>
    </section>
  );
}

/** Small wrapper so the review can subscribe to this game's analyses. */
function GameReviewFor({ game }) {
  const analyses = useAnalysisForGame(game.id);
  return <GameReview game={game} analyses={analyses} />;
}
