import { useEffect, useMemo, useRef, useState } from 'react';
import { Chess } from '../engine/chess.js';
import { createEngine } from '../engine/stockfishClient.js';
import Board from './Board.jsx';
import PromotionDialog from './PromotionDialog.jsx';
import { recordAttempt, useAttempts } from '../data/puzzleAttemptsStore.js';
import {
  BANDS, bandForRating, positionsForBand, judge, passedDrills, attemptIdFor,
} from '../training/endgames.js';
import '../styles/endgames.css';

/*
 * EndgameTrainer — play textbook endgames out against Stockfish (research
 * F028, F029). The engine defends (or attacks) at full strength; the drill is
 * passed on mate, a safe queen, or a held draw, as endgames.js decides.
 *
 * A pass or a fail is recorded in puzzle_attempts as `endgame:<id>`, so the
 * coach sees completion per player with no new table, and the readiness
 * checklist can count a finished band.
 */

const REPLY_MS = 600;
const EVAL_DEPTH = 16;

export default function EndgameTrainer({ trainee, rating = null }) {
  const attempts = useAttempts();
  const [band, setBand] = useState(() => bandForRating(rating));
  useEffect(() => setBand(bandForRating(rating)), [rating]);
  const drills = positionsForBand(band);
  const [drillId, setDrillId] = useState(drills[0]?.id);
  const drill = drills.find((d) => d.id === drillId) || drills[0];
  const passed = useMemo(() => passedDrills(attempts, trainee?.playerId), [attempts, trainee]);

  const gameRef = useRef(new Chess(drill.fen));
  const [, setVersion] = useState(0);
  const bump = () => setVersion((v) => v + 1);
  const [playerMoves, setPlayerMoves] = useState(0);
  const [outcome, setOutcome] = useState(null);
  const [thinking, setThinking] = useState(false);
  const [lastMove, setLastMove] = useState(null);
  const [showIdea, setShowIdea] = useState(false);
  const [pendingPromotion, setPendingPromotion] = useState(null);
  const startedAt = useRef(Date.now());
  const engineRef = useRef(null);
  const run = useRef(0);

  const playerColor = new Chess(drill.fen).turn;

  useEffect(() => {
    const engine = createEngine();
    engineRef.current = engine;
    return () => engine.terminate();
  }, []);

  const reset = (next = drill) => {
    run.current += 1;
    gameRef.current = new Chess(next.fen);
    setPlayerMoves(0);
    setOutcome(null);
    setThinking(false);
    setLastMove(null);
    setShowIdea(false);
    startedAt.current = Date.now();
    bump();
  };

  useEffect(() => {
    if (!drills.some((d) => d.id === drillId)) setDrillId(drills[0]?.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [band]);
  useEffect(() => reset(drill), [drill.id]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Engine score from the player's side of the board. */
  const evalForPlayer = async (chess) => {
    const result = await engineRef.current.evaluate(chess.fen(), { depth: EVAL_DEPTH });
    const top = result.lines[0] || {};
    const flip = chess.turn !== playerColor ? -1 : 1;
    return top.mate != null ? { mate: flip * top.mate } : { cp: flip * (top.cp ?? 0) };
  };

  const finish = (verdict) => {
    setOutcome(verdict);
    if (verdict.status !== 'playing' && trainee) {
      recordAttempt({
        playerId: trainee.playerId,
        puzzleId: attemptIdFor(drill),
        themes: ['endgame', drill.band],
        difficulty: drill.band,
        correct: verdict.status === 'success',
        secondsTaken: Math.round((Date.now() - startedAt.current) / 1000),
      });
    }
  };

  /** Judge the position; ask the engine when the rule needs its opinion. */
  const settle = async (moves, move, token) => {
    const chess = gameRef.current;
    let verdict = judge({ chess, position: drill, playerColor, playerMoves: moves, lastMove: move });
    if (verdict.needsEval) {
      setThinking(true);
      const score = await evalForPlayer(chess);
      if (token !== run.current) return null;
      verdict = judge({ chess, position: drill, playerColor, playerMoves: moves, lastMove: move, evalForPlayer: score });
    }
    if (verdict.status !== 'playing') {
      setThinking(false);
      finish(verdict);
      return null;
    }
    return verdict;
  };

  const play = async (input) => {
    const token = run.current;
    const chess = gameRef.current;
    const move = chess.move(input);
    if (!move) return;
    const moves = playerMoves + 1;
    setPlayerMoves(moves);
    setLastMove({ from: move.from, to: move.to });
    bump();
    if (!(await settle(moves, move, token))) return;

    setThinking(true);
    const reply = await engineRef.current.bestMove(chess.fen(), { elo: null, movetimeMs: REPLY_MS });
    if (token !== run.current) return;
    if (reply) {
      const answered = chess.move(reply);
      if (answered) setLastMove({ from: answered.from, to: answered.to });
      bump();
      if (!(await settle(moves, answered, token))) return;
    }
    setThinking(false);
  };

  const handleMove = ({ from, to }) => {
    if (outcome || thinking) return;
    const chess = gameRef.current;
    if (chess.turn !== playerColor) return;
    const options = chess.moves({ square: from, verbose: true }).filter((m) => m.to === to);
    if (!options.length) return;
    if (options[0].promotion) {
      setPendingPromotion({ from, to, color: options[0].color });
      return;
    }
    play({ from, to });
  };

  const goal = `${playerColor === 'w' ? 'White' : 'Black'} to play and ${drill.goal === 'win' ? (drill.successWhen === 'promote' ? 'queen the pawn safely' : 'checkmate') : `hold the draw${drill.holdMoves ? ` for ${drill.holdMoves} moves` : ''}`}`;
  const bandDone = drills.filter((d) => passed.has(d.id)).length;

  return (
    <div className="endgame-trainer">
      <div className="panel-block endgame-head">
        <label className="field">
          <span>Level</span>
          <select value={band} onChange={(e) => setBand(e.target.value)}>
            {BANDS.map((b, i) => (
              <option key={b.key} value={b.key}>
                {b.label} ({i === 0 ? `under ${b.max + 1}` : b.max === Infinity ? `${BANDS[i - 1].max + 1}+` : `${BANDS[i - 1].max + 1}–${b.max}`})
              </option>
            ))}
          </select>
        </label>
        <p className="muted small">
          {trainee
            ? `${trainee.name}: ${bandDone} of ${drills.length} passed at this level.`
            : 'Practice only. Pick a trainee to have passes count.'}
        </p>
        <ul className="endgame-list">
          {drills.map((d) => (
            <li key={d.id}>
              <button type="button" className={`link-button ${d.id === drill.id ? 'active' : ''}`} onClick={() => setDrillId(d.id)}>
                {passed.has(d.id) ? '✓ ' : ''}{d.title}
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className={`puzzle-banner ${outcome ? (outcome.status === 'success' ? 'solved' : 'wrong') : ''}`}>
        <div><strong>{drill.title}</strong></div>
        <span className="puzzle-prompt" aria-live="polite">
          {outcome ? outcome.reason : thinking ? 'Engine is thinking…' : goal}
        </span>
      </div>

      <Board
        game={gameRef.current}
        orientation={playerColor}
        onMove={handleMove}
        lastMove={lastMove}
        interactive={!outcome && !thinking}
      />

      <div className="button-grid">
        <button type="button" onClick={() => reset()}>{outcome ? 'Try again' : 'Restart'}</button>
        <button type="button" onClick={() => setShowIdea((v) => !v)}>{showIdea ? 'Hide the idea' : 'Show the idea'}</button>
        {outcome?.status === 'success' && drills.indexOf(drill) < drills.length - 1 && (
          <button type="button" className="primary" onClick={() => setDrillId(drills[drills.indexOf(drill) + 1].id)}>Next</button>
        )}
      </div>
      {showIdea && <p className="endgame-idea">{drill.idea}</p>}

      {pendingPromotion && (
        <PromotionDialog
          color={pendingPromotion.color}
          onChoose={(type) => {
            const move = { ...pendingPromotion, promotion: type };
            setPendingPromotion(null);
            play(move);
          }}
          onCancel={() => setPendingPromotion(null)}
        />
      )}
    </div>
  );
}
