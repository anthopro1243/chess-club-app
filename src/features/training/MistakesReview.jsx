import { useEffect, useMemo, useState } from 'react';
import Board from '../../board/Board.jsx';
import PromotionDialog from '../../board/PromotionDialog.jsx';
import SanInput from '../../board/SanInput.jsx';
import { usePuzzleSession } from './usePuzzleSession.js';

/*
 * MistakesReview — "Your mistakes": positions the player got wrong in their
 * own games, with the better move the engine found. Each is a puzzle, and a
 * far better one than a random tactic because it is THEIR blunder. The
 * spaced-repetition schedule (src/analysis/spacedRepetition.js) decides which
 * come back today; solving one reschedules it.
 *
 * The round's positions are fixed when the section opens. Solving one takes
 * it out of the due list straight away; without this the last position
 * vanished the moment it was solved instead of saying "Solved".
 */

/** An own-game position in the shape usePuzzleSession solves. */
const toPuzzle = (p) => ({
  id: `own:${p.id ?? p.fen}`,
  fen: p.fen,
  name: p.san ? `From your game (you played ${p.san})` : 'From your game',
  hint: 'You got this one wrong in a real game. Find the better move.',
  solution: [
    {
      from: p.solution.slice(0, 2),
      to: p.solution.slice(2, 4),
      ...(p.solution.length > 4 ? { promotion: p.solution[4] } : {}),
    },
  ],
  own: p,
});

export default function MistakesReview({ due, trainee }) {
  const dueKey = due.map((p) => p.id ?? p.fen).join(',');
  const fromDue = useMemo(() => due.map(toPuzzle), [dueKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const [round, setRound] = useState(fromDue);
  // The queue can still be loading when the section opens; take it once it arrives.
  useEffect(() => {
    if (!round.length && fromDue.length) setRound(fromDue);
  }, [fromDue, round.length]);

  const [index, setIndex] = useState(0);
  const puzzle = round[Math.min(index, round.length - 1)];

  if (!puzzle) {
    return <p className="hint-text">Nothing to review right now.</p>;
  }
  return <Session key={puzzle.id} puzzle={puzzle} trainee={trainee} index={index} total={round.length} setIndex={setIndex} />;
}

function Session({ puzzle, trainee, index, total, setIndex }) {
  const {
    game,
    orientation,
    result,
    showHint,
    setShowHint,
    pendingPromotion,
    setPendingPromotion,
    lastWrong,
    waitingOnOpponent,
    resetBoard,
    handleMove,
    completePromotion,
    reveal,
  } = usePuzzleSession({ puzzle, trainee });
  const go = (next) => setIndex((next + total) % total);

  return (
    <div className="mistakes-review">
      <div className={`puzzle-banner ${result || ''}`} role="status">
        <div>
          <span className="puzzle-counter mono">
            {index + 1} / {total}
          </span>
          <strong>{puzzle.name}</strong>
        </div>
        <span className="puzzle-prompt">
          {result === 'solved'
            ? 'Solved'
            : result === 'wrong'
              ? 'Not the move. Try again.'
              : waitingOnOpponent
                ? 'Opponent is replying…'
                : `${orientation === 'w' ? 'White' : 'Black'} to play`}
        </span>
      </div>

      <Board game={game} orientation={orientation} onMove={handleMove} interactive={result !== 'solved' && !waitingOnOpponent} />
      <SanInput
        game={game}
        onMove={handleMove}
        lockedMessage={result === 'solved' ? 'This one is done. Press Next for another.' : waitingOnOpponent ? 'Wait for the reply.' : null}
      />

      <div className="puzzle-controls">
        <button type="button" className="btn" onClick={() => go(index - 1)} disabled={total < 2}>
          &lsaquo; Previous
        </button>
        <button type="button" className="btn" onClick={() => resetBoard(puzzle)}>
          Reset
        </button>
        <button type="button" className="btn" onClick={() => setShowHint(true)} disabled={showHint}>
          Hint
        </button>
        <button type="button" className="btn" onClick={reveal} disabled={result === 'solved'}>
          Show answer
        </button>
        <button type="button" className="btn btn-primary" onClick={() => go(index + 1)} disabled={total < 2}>
          Next &rsaquo;
        </button>
      </div>

      {lastWrong && result !== 'solved' && (
        <p className="puzzle-feedback" role="status">
          Not {lastWrong}. Try again.
        </p>
      )}
      {showHint && <p className="hint-box">{puzzle.hint}</p>}

      {pendingPromotion && (
        <PromotionDialog color={pendingPromotion.color} onChoose={completePromotion} onCancel={() => setPendingPromotion(null)} />
      )}
    </div>
  );
}
