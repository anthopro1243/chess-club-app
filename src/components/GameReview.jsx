import { useEffect, useMemo, useState } from 'react';
import { Chess, START_FEN } from '../engine/chess.js';
import { parsePgn } from '../analysis/pgn.js';
import Board from './Board.jsx';
import MoveList from './MoveList.jsx';
import { winPercent } from '../analysis/scoring.js';
import { explainTurningPoints, uciToSan } from '../analysis/explain.js';
import '../styles/explain.css';

/*
 * The "big mistakes" the research says players under 1500 should review first:
 * hung pieces, mates found or missed, and the tactics the detectors name.
 * Everything else is a swing in the evaluation, which is real but less
 * teachable at this level, so it's one click away rather than first.
 */
const BIG_KINDS = new Set(['hangingPiece', 'missedMate', 'allowedMate', 'fork', 'backRank', 'missedCapture']);
const MAX_MOMENTS = 5;

/*
 * GameReview — the board viewer the app has never had.
 *
 * Until now the Games page was a dead list: 54 rows, none of them clickable,
 * with a working analyzer sitting behind them that no user could reach. This
 * is the screen that connects the two. Step through the game, see what the
 * engine thought at every move, and jump straight to the moments that decided
 * it.
 *
 * Read-only by construction: the Board is handed interactive={false}, so this
 * can never accidentally become a second way to play a game.
 */

const LABEL_CLASS = {
  blunder: 'blunder',
  mistake: 'mistake',
  inaccuracy: 'inaccuracy',
  best: 'best',
  onlyMove: 'best',
  excellent: 'good',
  good: 'good',
  book: 'muted',
  forced: 'muted',
};

export default function GameReview({ game, analyses = [], orientation = 'w' }) {
  const [viewPly, setViewPly] = useState(0);
  const [bigOnly, setBigOnly] = useState(true);

  // Replay the PGN once into a position per ply.
  const replay = useMemo(() => {
    if (!game?.pgn) return { moves: [], positions: [START_FEN], lastMoves: [null], error: null };
    try {
      const [parsed] = parsePgn(game.pgn);
      if (!parsed) return { moves: [], positions: [START_FEN], lastMoves: [null], error: 'empty PGN' };
      const startFen = parsed.tags?.FEN?.trim() || START_FEN;
      const board = new Chess(startFen);
      const positions = [board.fen()];
      const lastMoves = [null];
      const moves = [];
      for (const move of parsed.moves) {
        const played = board.move(move.san);
        if (!played) break; // stop at the first move that will not replay
        moves.push(played.san);
        positions.push(board.fen());
        lastMoves.push({ from: played.from, to: played.to });
      }
      return { moves, positions, lastMoves, error: null };
    } catch (error) {
      return { moves: [], positions: [START_FEN], lastMoves: [null], error: error.message };
    }
  }, [game?.pgn]);

  // Both sides' per-ply detail, merged into one timeline keyed by ply number.
  const plyDetail = useMemo(() => {
    const byPly = new Map();
    for (const row of analyses) {
      for (const ply of row.plies || []) byPly.set(ply.ply, ply);
    }
    return byPly;
  }, [analyses]);

  const critical = useMemo(
    () =>
      analyses
        .flatMap((row) => (row.critical || []).map((c) => ({ ...c, side: row.side })))
        .sort((a, b) => (b.winPercentLost ?? 0) - (a.winPercentLost ?? 0)),
    [analyses],
  );

  // Each moment in words, built only from fields the analysis actually has.
  const explained = useMemo(() => explainTurningPoints(critical, plyDetail), [critical, plyDetail]);
  const big = explained.filter((c) => BIG_KINDS.has(c.explanation?.kind));
  const showingBig = bigOnly && big.length > 0;
  const moments = (showingBig ? big : explained).slice(0, MAX_MOMENTS);
  const explanationByPly = useMemo(
    () => new Map(explained.filter((c) => c.explanation).map((c) => [c.ply, c.explanation])),
    [explained],
  );

  const total = replay.moves.length;
  const clamp = (n) => Math.max(0, Math.min(total, n));

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'ArrowLeft') setViewPly((p) => clamp(p - 1));
      if (event.key === 'ArrowRight') setViewPly((p) => clamp(p + 1));
      if (event.key === 'Home') setViewPly(0);
      if (event.key === 'End') setViewPly(total);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [total]);

  const position = useMemo(
    () => new Chess(replay.positions[clamp(viewPly)] ?? START_FEN),
    [replay.positions, viewPly],
  );

  // The move that LED to the position on screen, and what the engine made of it.
  const current = viewPly > 0 ? plyDetail.get(viewPly) : null;
  const evalText = describeEval(current);
  const currentExplanation = viewPly > 0 ? explanationByPly.get(viewPly) : null;
  // The better move in normal notation, played from the position before this move.
  const betterSan = current?.bestUci && current.uci !== current.bestUci
    ? uciToSan(replay.positions[clamp(viewPly - 1)], current.bestUci)
    : null;

  if (replay.error) {
    return <p className="error">This game&rsquo;s PGN could not be replayed: {replay.error}</p>;
  }

  return (
    <div className="game-review">
      <div className="game-review-board">
        <Board
          game={position}
          orientation={orientation}
          interactive={false}
          lastMove={replay.lastMoves[clamp(viewPly)] ?? null}
        />
        <div className="button-grid review-controls">
          <button type="button" onClick={() => setViewPly(0)} disabled={viewPly === 0}>&laquo; Start</button>
          <button type="button" onClick={() => setViewPly(clamp(viewPly - 1))} disabled={viewPly === 0}>&lsaquo; Back</button>
          <button type="button" onClick={() => setViewPly(clamp(viewPly + 1))} disabled={viewPly >= total}>Next &rsaquo;</button>
          <button type="button" onClick={() => setViewPly(total)} disabled={viewPly >= total}>End &raquo;</button>
        </div>
        <p className="muted small">
          Move {Math.ceil(viewPly / 2) || 0} of {Math.ceil(total / 2)} &middot; use the arrow keys
        </p>
        {current && (
          <p className={`review-eval ${LABEL_CLASS[current.label] || ''}`}>
            <strong>{current.san}</strong>{' '}
            {current.label && <span className={`badge ${LABEL_CLASS[current.label] || ''}`}>{current.label}</span>}{' '}
            {evalText}
            {betterSan && (
              <> &middot; better: <span className="mono">{betterSan}</span></>
            )}
          </p>
        )}
        {currentExplanation && (
          <div className="explain-current" aria-live="polite">
            <strong>{currentExplanation.headline}</strong>
            <p>{currentExplanation.detail}</p>
            {currentExplanation.line && <p className="muted small">Better line: <span className="mono">{currentExplanation.line}</span></p>}
          </div>
        )}
      </div>

      <div className="game-review-side">
        <MoveList moves={replay.moves} viewPly={viewPly} onSelectPly={setViewPly} />

        {!!explained.length && (
          <div className="critical-panel">
            <div className="critical-head">
              <h4>{showingBig ? 'Big mistakes' : 'Turning points'}</h4>
              {big.length > 0 && big.length < explained.length && (
                <button type="button" className="link-button" onClick={() => setBigOnly((v) => !v)}>
                  {showingBig ? 'Show all turning points' : 'Big mistakes only'}
                </button>
              )}
            </div>
            <ol className="critical-list">
              {moments.map((c) => (
                <li key={`${c.side}-${c.ply}`} className={viewPly === c.ply ? 'active' : ''}>
                  <button type="button" className="link-button" onClick={() => setViewPly(c.ply)}>
                    {c.fullmove}. {c.side === 'b' ? '…' : ''}{c.san}
                  </button>{' '}
                  <span className="muted">&minus;{c.winPercentLost}%</span>
                  {c.explanation && (
                    <div className="critical-explain">
                      <strong>{c.explanation.headline}</strong>
                      <span className="muted"> {c.explanation.detail}</span>
                    </div>
                  )}
                </li>
              ))}
            </ol>
            <p className="muted small">Click a move to see the position.</p>
          </div>
        )}

        {!analyses.length && (
          <p className="muted">
            This game has not been analysed yet, so there is no evaluation to step through — the
            board and moves above still work.
          </p>
        )}
      </div>
    </div>
  );
}

/** Human-readable evaluation of the position after a move, from White's view. */
function describeEval(ply) {
  if (!ply) return null;
  if (ply.mateAfter != null) {
    const forSide = ply.side === 'w' ? ply.mateAfter : -ply.mateAfter;
    return `mate in ${Math.abs(ply.mateAfter)}${forSide > 0 ? '' : ' against'}`;
  }
  if (ply.cpAfter == null) return null;
  // cpAfter is in the MOVER's point of view; show it from White's, as is conventional.
  const white = ply.side === 'w' ? ply.cpAfter : -ply.cpAfter;
  const pawns = (white / 100).toFixed(1);
  const pct = Math.round(winPercent(white) ?? 50);
  return `${white > 0 ? '+' : ''}${pawns} (${pct}% for White)`;
}
