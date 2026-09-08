import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Chess } from '../engine/chess.js';
import { DIFFICULTIES } from '../engine/ai.js';
import Board from '../components/Board.jsx';
import MoveList from '../components/MoveList.jsx';
import PromotionDialog from '../components/PromotionDialog.jsx';
import Piece from '../components/Piece.jsx';

const PIECE_VALUES = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const START_COUNTS = { p: 8, n: 2, b: 2, r: 2, q: 1, k: 1 };
const SAVE_KEY = 'cc-play-state-v1';

function loadSavedState() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** Rebuild a game from a saved move list, stopping early if storage is corrupt. */
function buildGame(savedMoves) {
  const game = new Chess();
  if (!Array.isArray(savedMoves)) return game;
  for (const m of savedMoves) {
    if (!game.move({ from: m.from, to: m.to, promotion: m.promotion })) break;
  }
  return game;
}

/** Rebuild the position as it stood after `ply` half-moves. */
function replay(moves, ply) {
  const game = new Chess();
  for (let i = 0; i < ply; i += 1) {
    const move = moves[i];
    game.move({ from: move.from, to: move.to, promotion: move.promotion });
  }
  return game;
}

/** What each side has captured, and who is up on material. */
function materialSummary(game) {
  const remaining = { w: {}, b: {} };
  for (const row of game.boardArray()) {
    for (const cell of row) {
      if (!cell) continue;
      remaining[cell.color][cell.type] = (remaining[cell.color][cell.type] || 0) + 1;
    }
  }
  const captured = { w: [], b: [] };
  let score = 0;
  for (const color of ['w', 'b']) {
    for (const [type, start] of Object.entries(START_COUNTS)) {
      const missing = start - (remaining[color][type] || 0);
      for (let i = 0; i < missing; i += 1) captured[color === 'w' ? 'b' : 'w'].push(type);
      score += (color === 'w' ? -1 : 1) * missing * PIECE_VALUES[type];
    }
  }
  return { captured, score };
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Clipboard API needs a secure context; fall back to a temporary textarea.
    try {
      const area = document.createElement('textarea');
      area.value = text;
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(area);
      return ok;
    } catch {
      return false;
    }
  }
}

export default function PlayPage() {
  const saved = loadSavedState();

  const gameRef = useRef(null);
  if (gameRef.current === null) gameRef.current = buildGame(saved?.moves);
  const [, setVersion] = useState(0);
  const bump = useCallback(() => setVersion((v) => v + 1), []);

  const [orientation, setOrientation] = useState(saved?.orientation === 'b' ? 'b' : 'w');
  const [viewPly, setViewPly] = useState(null); // null === following the live game
  const [pendingPromotion, setPendingPromotion] = useState(null);
  const [toast, setToast] = useState('');
  const [names, setNames] = useState(saved?.names || { white: '', black: '' });

  const [mode, setMode] = useState(saved?.mode === 'computer' ? 'computer' : 'human');
  const [computerColor, setComputerColor] = useState(saved?.computerColor === 'w' ? 'w' : 'b');
  const [difficulty, setDifficulty] = useState(
    DIFFICULTIES.includes(saved?.difficulty) ? saved.difficulty : 'medium',
  );
  const [thinking, setThinking] = useState(false);
  const workerRef = useRef(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    const worker = new Worker(new URL('../engine/aiWorker.js', import.meta.url), { type: 'module' });
    worker.onmessage = (event) => {
      const { requestId, move } = event.data;
      if (requestId !== requestIdRef.current) return; // a new game or undo overtook this reply
      setThinking(false);
      if (move) {
        gameRef.current.move(move);
        setViewPly(null);
        bump();
      }
    };
    workerRef.current = worker;
    return () => worker.terminate();
  }, [bump]);

  // How this build can hand the viewer a file. Running from a local folder or
  // any normal web host that is an ordinary blob download. When the page is
  // published as a Claude artifact the frame cannot download directly, so it
  // asks the host to save the file instead. Neither path affects the game.
  const [saver, setSaver] = useState({ kind: 'blob' });
  useEffect(() => {
    if (typeof window === 'undefined' || !window.claude?.use) return undefined;
    let cancelled = false;
    window.claude
      .use('downloads')
      .then((api) => {
        if (!cancelled) setSaver(api ? { kind: 'host', api } : { kind: 'none' });
      })
      .catch(() => {
        if (!cancelled) setSaver({ kind: 'none' });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const live = gameRef.current;
  const moves = live.moveHistory({ verbose: true });
  const sans = moves.map((m) => m.san);
  const atLive = viewPly === null || viewPly === moves.length;

  const displayGame = useMemo(
    () => (atLive ? live : replay(moves, viewPly)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [atLive, viewPly, moves.length, live.fen()],
  );

  const shownMove = atLive ? moves[moves.length - 1] : moves[viewPly - 1];
  const status = displayGame.status();
  const { captured, score } = materialSummary(displayGame);

  useEffect(() => {
    if (mode !== 'computer' || !atLive || status.over || pendingPromotion) return;
    if (live.turn !== computerColor) return;
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setThinking(true);
    workerRef.current?.postMessage({ requestId, fen: live.fen(), difficulty });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, computerColor, difficulty, atLive, status.over, pendingPromotion, live.fen()]);

  useEffect(() => {
    try {
      localStorage.setItem(
        SAVE_KEY,
        JSON.stringify({
          moves: moves.map((m) => ({ from: m.from, to: m.to, promotion: m.promotion || undefined })),
          names,
          mode,
          computerColor,
          difficulty,
          orientation,
        }),
      );
    } catch {
      /* storage can be unavailable; the game still plays for this visit */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live.fen(), names, mode, computerColor, difficulty, orientation]);

  const flash = (message) => {
    setToast(message);
    setTimeout(() => setToast(''), 2200);
  };

  const handleMove = useCallback(
    ({ from, to }) => {
      if (!atLive) return;
      const options = live.moves({ square: from, verbose: true }).filter((m) => m.to === to);
      if (options.length === 0) return;
      if (options[0].promotion) {
        setPendingPromotion({ from, to, color: options[0].color });
        return;
      }
      live.move({ from, to });
      setViewPly(null);
      bump();
    },
    [atLive, live, bump],
  );

  const completePromotion = (type) => {
    live.move({ ...pendingPromotion, promotion: type });
    setPendingPromotion(null);
    setViewPly(null);
    bump();
  };

  const newGame = () => {
    if (moves.length > 0 && !window.confirm('Start a new game? The current game will be cleared.')) {
      return;
    }
    requestIdRef.current += 1; // orphan any AI reply still in flight
    setThinking(false);
    gameRef.current = new Chess();
    setViewPly(null);
    setPendingPromotion(null);
    bump();
  };

  const undo = () => {
    if (thinking || !live.undo()) return;
    // Against the computer, one "Undo" click backs out both its reply and
    // the human move it answered, landing back on the human's turn.
    if (mode === 'computer' && live.turn === computerColor) live.undo();
    requestIdRef.current += 1; // orphan any AI reply still in flight
    setViewPly(null);
    bump();
  };

  const pgn = () =>
    live.pgn({
      White: names.white.trim() || 'White',
      Black: names.black.trim() || 'Black',
    });

  const downloadPgn = async () => {
    const stamp = new Date().toISOString().slice(0, 10);
    const text = pgn();

    if (saver.kind === 'host') {
      // The host allows a fixed set of extensions, which does not include
      // .pgn — .txt holds the same text and the analyzer reads it either way.
      try {
        await saver.api.save({ filename: `chess-club-${stamp}.txt`, data: text });
      } catch (error) {
        if (error?.code !== 'declined') flash('Could not save the file');
      }
      return;
    }

    const blob = new Blob([text], { type: 'application/x-chess-pgn' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `chess-club-${stamp}.pgn`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const step = (delta) => {
    const current = viewPly === null ? moves.length : viewPly;
    const next = Math.min(Math.max(current + delta, 0), moves.length);
    setViewPly(next === moves.length ? null : next);
  };

  return (
    <div className="play-layout">
      <section className="board-column">
        <PlayerBar
          label={orientation === 'w' ? 'Black' : 'White'}
          color={orientation === 'w' ? 'b' : 'w'}
          name={orientation === 'w' ? names.black : names.white}
          onName={(value) =>
            setNames((n) => (orientation === 'w' ? { ...n, black: value } : { ...n, white: value }))
          }
          captured={captured[orientation === 'w' ? 'b' : 'w']}
          advantage={orientation === 'w' ? -score : score}
          toMove={displayGame.turn === (orientation === 'w' ? 'b' : 'w')}
        />

        <Board
          game={displayGame}
          orientation={orientation}
          onMove={handleMove}
          lastMove={shownMove ? { from: shownMove.from, to: shownMove.to } : null}
          interactive={atLive && !status.over && !(mode === 'computer' && live.turn === computerColor)}
        />

        <PlayerBar
          label={orientation === 'w' ? 'White' : 'Black'}
          color={orientation}
          name={orientation === 'w' ? names.white : names.black}
          onName={(value) =>
            setNames((n) => (orientation === 'w' ? { ...n, white: value } : { ...n, black: value }))
          }
          captured={captured[orientation]}
          advantage={orientation === 'w' ? score : -score}
          toMove={displayGame.turn === orientation}
        />
      </section>

      <aside className="side-panel">
        <div className={`status-banner ${status.over ? 'over' : ''} ${status.reason === 'check' ? 'check' : ''}`}>
          <strong>{thinking ? 'Computer is thinking…' : status.text}</strong>
          {!atLive && <span className="reviewing">Reviewing move {viewPly} of {moves.length}</span>}
        </div>

        <div className="panel-block">
          <h2>Opponent</h2>
          <div className="opponent-controls">
            <label className="field">
              <span>Mode</span>
              <select value={mode} onChange={(event) => setMode(event.target.value)}>
                <option value="human">Human vs human</option>
                <option value="computer">Play vs computer</option>
              </select>
            </label>
            {mode === 'computer' && (
              <>
                <label className="field">
                  <span>You play</span>
                  <select
                    value={computerColor === 'w' ? 'b' : 'w'}
                    onChange={(event) => {
                      const human = event.target.value;
                      setComputerColor(human === 'w' ? 'b' : 'w');
                      setOrientation(human);
                    }}
                  >
                    <option value="w">White</option>
                    <option value="b">Black</option>
                  </select>
                </label>
                <label className="field">
                  <span>Difficulty</span>
                  <select value={difficulty} onChange={(event) => setDifficulty(event.target.value)}>
                    {DIFFICULTIES.map((level) => (
                      <option key={level} value={level}>
                        {level[0].toUpperCase() + level.slice(1)}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            )}
          </div>
        </div>

        <div className="panel-block">
          <h2>Moves</h2>
          <MoveList
            moves={sans}
            viewPly={viewPly === null ? moves.length : viewPly}
            onSelectPly={(ply) => setViewPly(ply === moves.length ? null : ply)}
          />
          <div className="stepper">
            <button type="button" onClick={() => setViewPly(0)} disabled={!moves.length}>
              &laquo;
            </button>
            <button type="button" onClick={() => step(-1)} disabled={!moves.length}>
              &lsaquo; Back
            </button>
            <button type="button" onClick={() => step(1)} disabled={atLive}>
              Next &rsaquo;
            </button>
            <button type="button" onClick={() => setViewPly(null)} disabled={atLive}>
              Live &raquo;
            </button>
          </div>
        </div>

        <div className="panel-block">
          <h2>Game</h2>
          <div className="button-grid">
            <button type="button" className="primary" onClick={newGame}>
              New game
            </button>
            <button type="button" onClick={undo} disabled={!moves.length || thinking}>
              Undo move
            </button>
            <button type="button" onClick={() => setOrientation((o) => (o === 'w' ? 'b' : 'w'))}>
              Flip board
            </button>
            <button
              type="button"
              onClick={async () => flash((await copyText(pgn())) ? 'PGN copied' : 'Copy failed')}
              disabled={!moves.length}
            >
              Copy PGN
            </button>
            <button
              type="button"
              onClick={async () =>
                flash((await copyText(displayGame.fen())) ? 'FEN copied' : 'Copy failed')
              }
            >
              Copy FEN
            </button>
            {saver.kind !== 'none' && (
              <button type="button" onClick={downloadPgn} disabled={!moves.length}>
                Download PGN
              </button>
            )}
          </div>
          <p className="hint-text">
            Download or copy the PGN to run it through <code>coach_report.py</code> for an
            engine-backed review of the game.
          </p>
        </div>
      </aside>

      {pendingPromotion && (
        <PromotionDialog
          color={pendingPromotion.color}
          onChoose={completePromotion}
          onCancel={() => setPendingPromotion(null)}
        />
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

function PlayerBar({ label, color, name, onName, captured, advantage, toMove }) {
  const order = { q: 0, r: 1, b: 2, n: 3, p: 4 };
  const sorted = [...captured].sort((a, b) => order[a] - order[b]);
  return (
    <div className={`player-bar ${toMove ? 'to-move' : ''}`}>
      <span className={`turn-dot ${color === 'w' ? 'white' : 'black'}`} />
      <input
        className="player-name"
        value={name}
        placeholder={label}
        onChange={(event) => onName(event.target.value)}
        aria-label={`${label} player name`}
      />
      <div className="captured">
        {sorted.map((type, index) => (
          <Piece key={`${type}-${index}`} type={type} color={color === 'w' ? 'b' : 'w'} />
        ))}
        {advantage > 0 && <span className="advantage">+{advantage}</span>}
      </div>
    </div>
  );
}
