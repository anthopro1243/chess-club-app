import { useState } from 'react';
import GameAnalysisPanel from '../components/GameAnalysisPanel.jsx';
import GameReview from '../components/GameReview.jsx';
import { useAnalysisForGame } from '../data/analysisStore.js';
import { useAccount } from '../data/accountStore.js';
import { useGames, removeGame, GAME_MODE_LABEL } from '../data/gamesStore.js';
import { usePlayers } from '../data/rosterStore.js';
import LogGameForm from '../components/LogGameForm.jsx';
import PgnImportModal from '../components/PgnImportModal.jsx';

const RESULT_LABEL = { '1-0': 'White won', '0-1': 'Black won', '1/2-1/2': 'Draw' };

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
  const viewer = { role: account?.role, playerId: account?.playerId ?? null };
  const games = useGames();
  const players = usePlayers();
  const [playerFilter, setPlayerFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [openId, setOpenId] = useState(null);
  const [logging, setLogging] = useState(false);
  const [importing, setImporting] = useState(false);
  const [toast, setToast] = useState('');

  const flash = (message) => {
    setToast(message);
    setTimeout(() => setToast(''), 2000);
  };

  const filtered = games.filter((g) => {
    if (typeFilter && g.mode !== typeFilter) return false;
    if (playerFilter && g.whitePlayerId !== playerFilter && g.blackPlayerId !== playerFilter) return false;
    return true;
  });

  return (
    <div className="games-layout">
      <section className="panel">
        <div className="panel-header">
          <h2>Game archive</h2>
          <div className="panel-header-actions">
            <span className="badge">{filtered.length} games</span>
            <button type="button" className="link-button" onClick={() => setLogging((v) => !v)}>
              {logging ? 'Cancel' : '+ Log a game'}
            </button>
            <button type="button" className="link-button" onClick={() => setImporting(true)}>
              Import PGN
            </button>
          </div>
        </div>

        {logging && <LogGameForm />}
        {importing && (
          <PgnImportModal
            players={players}
            existingIds={games.map((g) => g.id)}
            onClose={() => setImporting(false)}
          />
        )}

        <div className="opponent-controls">
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

        {filtered.length === 0 ? (
          <p className="hint-text">
            No games yet. Finished games from the Play page are archived here automatically.
          </p>
        ) : (
          <div className="table-scroll">
            <table className="roster-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>White</th>
                  <th>Black</th>
                  <th>Result</th>
                  <th>Moves</th>
                  <th>Type</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filtered.map((g) => (
                  <tr
                    key={g.id}
                    className={`clickable ${openId === g.id ? 'selected' : ''}`}
                    onClick={() => setOpenId(openId === g.id ? null : g.id)}
                  >
                    <td className="mono">{String(g.playedAt).slice(0, 10)}</td>
                    <td>{g.whiteName}</td>
                    <td>{g.blackName}</td>
                    <td>
                      {RESULT_LABEL[g.result] || g.result}
                      {g.reason && <span className="hint-text"> · {g.reason}</span>}
                    </td>
                    <td className="mono">{g.moveCount}</td>
                    <td>
                      <span className={`track ${g.mode === 'human' ? 'competitive' : ''}`}>
                        {GAME_MODE_LABEL[g.mode] || g.mode}
                      </span>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="link-button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenId(openId === g.id ? null : g.id);
                        }}
                      >
                        {openId === g.id ? 'Hide' : 'PGN'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {openId && (() => {
        const game = filtered.find((g) => g.id === openId);
        if (!game) return null;
        return (
          <section className="panel">
            <div className="panel-header">
              <h2>
                {game.whiteName} vs {game.blackName}
              </h2>
              <span className="badge mono">{game.result}</span>
            </div>
            <GameReviewFor game={game} />
            <details className="pgn-details">
              <summary>Raw PGN</summary>
              <pre className="pgn-block">{game.pgn}</pre>
            </details>
            <div className="button-grid">
              <button
                type="button"
                className="primary"
                onClick={async () => flash((await copyText(game.pgn)) ? 'PGN copied' : 'Copy failed')}
              >
                Copy PGN
              </button>
              <button type="button" onClick={() => downloadPgn(game)}>
                Download PGN
              </button>
              <button
                type="button"
                className="link-button danger"
                onClick={() => {
                  if (window.confirm('Delete this game from the archive?')) {
                    removeGame(game.id);
                    setOpenId(null);
                  }
                }}
              >
                Delete game
              </button>
            </div>
            <GameAnalysisPanel game={game} viewer={viewer} />
          </section>
        );
      })()}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

/** Small wrapper so the review can subscribe to this game's analyses. */
function GameReviewFor({ game }) {
  const analyses = useAnalysisForGame(game.id);
  return <GameReview game={game} analyses={analyses} />;
}
