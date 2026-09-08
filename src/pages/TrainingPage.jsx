import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Chess } from '../engine/chess.js';
import Board from '../components/Board.jsx';
import { MATE_IN_ONE } from '../data/puzzles.js';
import { usePlayers, recordPuzzleSolved } from '../data/rosterStore.js';

const TRAINEE_KEY = 'cc-trainee';

/**
 * TrainingPage — a working mate-in-one trainer plus the outline of the
 * training loop.
 *
 * Correctness is decided by the engine, not by a stored answer key: the move
 * is played and the position is asked whether it is checkmate. Any move that
 * mates is accepted.
 */
export default function TrainingPage() {
  const [index, setIndex] = useState(0);
  const puzzle = MATE_IN_ONE[index];

  const gameRef = useRef(new Chess(puzzle.fen));
  const [, setVersion] = useState(0);
  const bump = useCallback(() => setVersion((v) => v + 1), []);

  const [result, setResult] = useState(null); // 'solved' | 'wrong' | null
  const [showHint, setShowHint] = useState(false);
  const [sessionSolved, setSessionSolved] = useState(() => new Set());

  const players = usePlayers();
  const [traineeId, setTraineeId] = useState(() => {
    try {
      return localStorage.getItem(TRAINEE_KEY) || '';
    } catch {
      return '';
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(TRAINEE_KEY, traineeId);
    } catch {
      /* storage can be unavailable; the selection still holds for this visit */
    }
  }, [traineeId]);

  const trainee = players.find((p) => p.playerId === traineeId) || null;
  const solvedIds = useMemo(
    () => (trainee ? new Set(trainee.puzzleStats?.solvedIds || []) : sessionSolved),
    [trainee, sessionSolved],
  );

  const loadPuzzle = useCallback(
    (nextIndex) => {
      const wrapped = (nextIndex + MATE_IN_ONE.length) % MATE_IN_ONE.length;
      setIndex(wrapped);
      gameRef.current = new Chess(MATE_IN_ONE[wrapped].fen);
      setResult(null);
      setShowHint(false);
      bump();
    },
    [bump],
  );

  const game = gameRef.current;
  const orientation = useMemo(() => new Chess(puzzle.fen).turn, [puzzle.fen]);

  const handleMove = ({ from, to }) => {
    if (result === 'solved') return;
    const played = game.move({ from, to, promotion: 'q' });
    if (!played) return;

    if (game.isCheckmate()) {
      setResult('solved');
      if (trainee) {
        recordPuzzleSolved(trainee.playerId, puzzle.id);
      } else {
        setSessionSolved((prev) => new Set(prev).add(puzzle.id));
      }
      bump();
      return;
    }

    // Not mate — put the piece back and let them try again.
    setResult('wrong');
    bump();
    setTimeout(() => {
      game.undo();
      setResult(null);
      bump();
    }, 700);
  };

  const reveal = () => {
    const mate = game.moves().find((san) => san.endsWith('#'));
    if (!mate) return;
    game.move(mate);
    setResult('solved');
    bump();
  };

  return (
    <div className="training-layout">
      <section className="board-column">
        <div className={`puzzle-banner ${result || ''}`}>
          <div>
            <span className="puzzle-counter mono">
              {index + 1} / {MATE_IN_ONE.length}
            </span>
            <strong>{puzzle.name}</strong>
          </div>
          <span className="puzzle-prompt">
            {result === 'solved'
              ? 'Checkmate — solved'
              : result === 'wrong'
                ? 'Not mate. Try again.'
                : `${orientation === 'w' ? 'White' : 'Black'} to play and mate in one`}
          </span>
        </div>

        <Board
          game={game}
          orientation={orientation}
          onMove={handleMove}
          interactive={result !== 'solved'}
        />

        <div className="puzzle-controls">
          <button type="button" onClick={() => loadPuzzle(index - 1)}>
            &lsaquo; Previous
          </button>
          <button type="button" onClick={() => loadPuzzle(index)}>
            Reset
          </button>
          <button type="button" onClick={() => setShowHint(true)} disabled={showHint}>
            Hint
          </button>
          <button type="button" onClick={reveal} disabled={result === 'solved'}>
            Show answer
          </button>
          <button type="button" className="primary" onClick={() => loadPuzzle(index + 1)}>
            Next &rsaquo;
          </button>
        </div>

        {showHint && <p className="hint-box">{puzzle.hint}</p>}
      </section>

      <aside className="side-panel">
        <div className="panel-block">
          <h2>Trainee</h2>
          <select
            className="trainee-select"
            value={traineeId}
            onChange={(event) => setTraineeId(event.target.value)}
          >
            <option value="">Practice (not saved to a player)</option>
            {players.map((p) => (
              <option key={p.playerId} value={p.playerId}>
                {p.name}
              </option>
            ))}
          </select>
          <p className="hint-text">
            {trainee
              ? `Solved puzzles are saved to ${trainee.name}'s record — see it on the Roster page.`
              : 'Pick a trainee to save results to their record, or keep practicing without one.'}
          </p>
        </div>

        <div className="panel-block">
          <h2>{trainee ? `${trainee.name}'s progress` : 'Progress this session'}</h2>
          <p className="big-number">
            {solvedIds.size}
            <span> / {MATE_IN_ONE.length} solved</span>
          </p>
          <ul className="puzzle-index">
            {MATE_IN_ONE.map((item, itemIndex) => (
              <li key={item.id}>
                <button
                  type="button"
                  className={`puzzle-chip ${solvedIds.has(item.id) ? 'solved' : ''} ${
                    itemIndex === index ? 'current' : ''
                  }`}
                  onClick={() => loadPuzzle(itemIndex)}
                >
                  {itemIndex + 1}
                </button>
                <span className="puzzle-theme">{item.theme}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="panel-block">
          <h2>The training loop</h2>
          <ol className="loop-list">
            <li>
              <strong>Baseline.</strong> A timed puzzle set and a questionnaire at intake, scored
              on the eight-category rubric.
            </li>
            <li>
              <strong>Group work.</strong> Teach to the club’s three weakest rubric averages —
              the dashboard picks them out.
            </li>
            <li>
              <strong>Individual work.</strong> Each player gets the theme their own scores flag,
              not the club average.
            </li>
            <li>
              <strong>Measure.</strong> Play games, export the PGN, run it through the analyzer,
              and log the result back to the rubric.
            </li>
          </ol>
        </div>
      </aside>
    </div>
  );
}
