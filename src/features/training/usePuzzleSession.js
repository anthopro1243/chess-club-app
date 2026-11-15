import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Chess } from '../../engine/chess.js';
import { reviewOwnPuzzle } from './ownPuzzleStore.js';
import { recordPuzzleResult } from '../roster/rosterStore.js';
import { recordAttempt } from './puzzleAttemptsStore.js';

const sameMove = (a, b) =>
  !!a && !!b && a.from === b.from && a.to === b.to && (a.promotion || undefined) === (b.promotion || undefined);

/**
 * One of the player's own mistakes being solved: the board, the expected
 * move, hints, promotion, and what gets recorded when.
 *
 * `puzzle` is the active position (see MistakesReview); the board resets
 * whenever its id changes. `trainee` is the roster player results are saved
 * to, or null for practice.
 */
export function usePuzzleSession({ puzzle, trainee }) {
  const gameRef = useRef(new Chess(puzzle.fen));
  const [, setVersion] = useState(0);
  const bump = useCallback(() => setVersion((v) => v + 1), []);

  const [solutionIndex, setSolutionIndex] = useState(0);
  const [result, setResult] = useState(null); // 'solved' | 'wrong' | null
  const [showHint, setShowHint] = useState(false);
  const [pendingPromotion, setPendingPromotion] = useState(null);
  const [sessionSolved, setSessionSolved] = useState(() => new Set());
  // The move that was just wrong, kept on screen until the next move so a
  // quick glance (or a screen reader) catches it, not only a 0.7 s flash.
  const [lastWrong, setLastWrong] = useState('');

  // Positions whose first outcome this visit already rescheduled them.
  // Later tries don't count.
  const ratedRef = useRef(new Set());
  // Pending timers (undo a wrong move, play the opponent's reply). Cleared
  // whenever the board is reset, so a reply can't land on the next puzzle.
  const timersRef = useRef([]);
  const later = (fn, ms) => {
    const id = setTimeout(() => {
      timersRef.current = timersRef.current.filter((t) => t !== id);
      fn();
    }, ms);
    timersRef.current.push(id);
  };
  useEffect(() => () => timersRef.current.forEach(clearTimeout), []);

  // When the current attempt began. A wrong move ends one attempt and starts
  // another, so this is reset there too, not only when the puzzle changes.
  const attemptStartRef = useRef(Date.now());

  const resetBoard = useCallback(
    (p) => {
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
      gameRef.current = new Chess(p.fen);
      setLastWrong('');
      setSolutionIndex(0);
      setResult(null);
      setShowHint(false);
      setPendingPromotion(null);
      attemptStartRef.current = Date.now();
      bump();
    },
    [bump],
  );

  // Whenever the active puzzle actually changes — theme filter, next/prev,
  // random — reset the board. Keyed on id rather than index so a filter
  // change (which can leave `index` at 0 while pointing at a new puzzle)
  // still resets correctly.
  useEffect(() => {
    resetBoard(puzzle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puzzle.id]);

  /*
   * Write down what just happened. Called for every outcome, including the
   * wrong ones — a failed attempt is the more useful record of the two, and
   * the old code threw it away.
   *
   * Nothing is logged in practice mode, because an attempt with no player
   * attached cannot tell anyone anything later.
   */
  const logAttempt = ({ correct, usedSolution = false }) => {
    if (!trainee) return;
    recordAttempt({
      playerId: trainee.playerId,
      puzzleId: puzzle.id,
      themes: puzzle.themes || [],
      difficulty: '',
      puzzleRating: null,
      correct,
      usedHint: showHint,
      usedSolution,
      secondsTaken: Math.max(0, Math.round((Date.now() - attemptStartRef.current) / 1000)),
    });
    attemptStartRef.current = Date.now();
  };

  /*
   * The first outcome of a visit is the one that counts: it reschedules the
   * position. Later tries are logged as attempts but change nothing. Own-game
   * positions have no rating, so nothing here ever moves one.
   */
  const settleFirstOutcome = (outcome) => {
    const first = !ratedRef.current.has(puzzle.id);
    ratedRef.current.add(puzzle.id);
    if (first) {
      // Solved moves it further out; missed or revealed brings it back tomorrow.
      reviewOwnPuzzle(puzzle.own, outcome === 'solved' ? 'good' : 'again');
    }
    if (outcome === 'solved') setSessionSolved((prev) => new Set(prev).add(puzzle.id));
    // A wrong move writes nothing to the roster row; a solve or a reveal does.
    if (!trainee || outcome === 'wrong') return;
    recordPuzzleResult(trainee.playerId, {
      puzzleId: puzzle.id,
      solved: outcome === 'solved',
      rated: null,
    });
  };

  const game = gameRef.current;
  const orientation = useMemo(() => new Chess(puzzle.fen).turn, [puzzle.fen]);

  const attemptMove = ({ from, to, promotion }) => {
    const played = game.move({ from, to, promotion });
    if (!played) return;

    const expected = puzzle.solution[solutionIndex];
    if (!sameMove(played, expected)) {
      logAttempt({ correct: false });
      settleFirstOutcome('wrong');
      setResult('wrong');
      setLastWrong(played.san);
      bump();
      later(() => {
        game.undo();
        setResult(null);
        bump();
      }, 700);
      return;
    }

    setLastWrong('');
    const nextIndex = solutionIndex + 1;
    if (nextIndex >= puzzle.solution.length) {
      setSolutionIndex(nextIndex);
      setResult('solved');
      logAttempt({ correct: true });
      settleFirstOutcome('solved');
      bump();
      return;
    }

    setSolutionIndex(nextIndex);
    bump();

    // Auto-play the opponent's forced reply.
    later(() => {
      game.move(puzzle.solution[nextIndex]);
      setSolutionIndex(nextIndex + 1);
      bump();
    }, 500);
  };

  const handleMove = ({ from, to, promotion }) => {
    if (result === 'solved') return;
    const options = game.moves({ square: from, verbose: true }).filter((m) => m.to === to);
    if (options.length === 0) return;
    // A typed move ("e8=Q") already names its piece; a board move asks.
    if (options[0].promotion && !promotion) {
      setPendingPromotion({ from, to, color: options[0].color });
      return;
    }
    attemptMove(promotion ? { from, to, promotion } : { from, to });
  };

  const completePromotion = (type) => {
    const move = { ...pendingPromotion, promotion: type };
    setPendingPromotion(null);
    attemptMove(move);
  };

  const reveal = () => {
    for (let i = solutionIndex; i < puzzle.solution.length; i += 1) {
      game.move(puzzle.solution[i]);
    }
    setSolutionIndex(puzzle.solution.length);
    setResult('solved');
    setLastWrong('');
    logAttempt({ correct: false, usedSolution: true });
    settleFirstOutcome('revealed');
    bump();
  };

  const waitingOnOpponent = result === null && solutionIndex > 0 && game.turn !== orientation && solutionIndex < puzzle.solution.length;

  return {
    game,
    orientation,
    solutionIndex,
    result,
    showHint,
    setShowHint,
    pendingPromotion,
    setPendingPromotion,
    lastWrong,
    sessionSolved,
    waitingOnOpponent,
    resetBoard,
    handleMove,
    completePromotion,
    reveal,
  };
}
