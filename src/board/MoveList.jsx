import { useEffect, useRef } from 'react';

/**
 * MoveList — the game score in algebraic notation.
 *
 * Clicking a move rewinds the board to that point so a position can be talked
 * through in a session, then "Live" jumps back to the current position.
 */
export default function MoveList({ moves, viewPly, onSelectPly }) {
  const scrollRef = useRef(null);

  useEffect(() => {
    const node = scrollRef.current?.querySelector('.move.active');
    node?.scrollIntoView({ block: 'nearest' });
  }, [viewPly, moves.length]);

  const pairs = [];
  for (let i = 0; i < moves.length; i += 2) {
    pairs.push({ number: i / 2 + 1, white: moves[i], black: moves[i + 1], index: i });
  }

  return (
    <div className="movelist" ref={scrollRef}>
      {moves.length === 0 && <p className="movelist-empty">No moves yet. White to start.</p>}
      {pairs.map((pair) => (
        <div className="move-row" key={pair.number}>
          <span className="move-number">{pair.number}.</span>
          <button
            type="button"
            className={`move ${viewPly === pair.index + 1 ? 'active' : ''}`}
            onClick={() => onSelectPly(pair.index + 1)}
          >
            {pair.white}
          </button>
          {pair.black ? (
            <button
              type="button"
              className={`move ${viewPly === pair.index + 2 ? 'active' : ''}`}
              onClick={() => onSelectPly(pair.index + 2)}
            >
              {pair.black}
            </button>
          ) : (
            <span className="move-empty" />
          )}
        </div>
      ))}
    </div>
  );
}
