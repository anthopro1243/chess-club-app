import { useCallback, useMemo, useRef, useState } from 'react';
import Piece from './Piece.jsx';

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const RANKS = ['8', '7', '6', '5', '4', '3', '2', '1'];

/**
 * Board — the interactive chessboard.
 *
 * Supports both interaction styles players expect: click a piece then click a
 * destination, or drag the piece across the board. Legal destinations are
 * shown as soon as a piece is picked up, which is the single most useful thing
 * a board can do for a beginner.
 */
export default function Board({
  game,
  orientation = 'w',
  onMove,
  lastMove = null,
  interactive = true,
  showCoordinates = true,
  showLegalMoves = true,
}) {
  const boardRef = useRef(null);
  const [selected, setSelected] = useState(null);
  const [drag, setDrag] = useState(null); // { square, x, y, moved, piece }

  const fen = game.fen();
  const rows = useMemo(() => game.boardArray(), [fen]); // eslint-disable-line react-hooks/exhaustive-deps

  const legalTargets = useMemo(() => {
    if (!selected || !showLegalMoves) return new Map();
    const map = new Map();
    for (const move of game.moves({ square: selected, verbose: true })) {
      map.set(move.to, move);
    }
    return map;
  }, [fen, selected, showLegalMoves]); // eslint-disable-line react-hooks/exhaustive-deps

  const checkSquare = useMemo(() => {
    if (!game.inCheck()) return null;
    const sq = game.kingSquare(game.turn);
    return sq === -1 ? null : FILES[sq & 15] + (8 - (sq >> 4));
  }, [fen]); // eslint-disable-line react-hooks/exhaustive-deps

  const displayFiles = orientation === 'w' ? FILES : [...FILES].reverse();
  const displayRanks = orientation === 'w' ? RANKS : [...RANKS].reverse();

  const pieceAt = useCallback(
    (square) => {
      const file = FILES.indexOf(square[0]);
      const rank = RANKS.indexOf(square[1]);
      return rows[rank][file];
    },
    [rows],
  );

  const squareFromPoint = useCallback(
    (clientX, clientY) => {
      const rect = boardRef.current?.getBoundingClientRect();
      if (!rect) return null;
      const size = rect.width / 8;
      const col = Math.floor((clientX - rect.left) / size);
      const row = Math.floor((clientY - rect.top) / size);
      if (col < 0 || col > 7 || row < 0 || row > 7) return null;
      return displayFiles[col] + displayRanks[row];
    },
    [displayFiles, displayRanks],
  );

  const attempt = useCallback(
    (from, to) => {
      if (from === to) return false;
      const legal = game.moves({ square: from, verbose: true }).some((m) => m.to === to);
      if (!legal) return false;
      onMove({ from, to });
      return true;
    },
    [game, onMove],
  );

  const handlePointerDown = (event, square) => {
    if (!interactive || event.button === 1 || event.button === 2) return;
    const piece = pieceAt(square);

    // Clicking a highlighted destination completes a click-to-move.
    if (selected && selected !== square && legalTargets.has(square)) {
      attempt(selected, square);
      setSelected(null);
      return;
    }

    if (!piece || piece.color !== game.turn) {
      setSelected(null);
      return;
    }

    // Capture on the board so a drag that leaves the board still delivers its
    // pointerup. Wrapped because some browsers reject capture for mouse input,
    // and a throw here would swallow the selection below.
    try {
      boardRef.current?.setPointerCapture?.(event.pointerId);
    } catch {
      /* capture is an optimisation, not a requirement */
    }
    setSelected(square);
    setDrag({
      square,
      piece,
      x: event.clientX,
      y: event.clientY,
      moved: false,
      pointerId: event.pointerId,
    });
  };

  const handlePointerMove = (event) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const moved =
      drag.moved || Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > 4;
    setDrag({ ...drag, x: event.clientX, y: event.clientY, moved });
  };

  const handlePointerUp = (event) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const target = squareFromPoint(event.clientX, event.clientY);

    if (drag.moved) {
      if (target && attempt(drag.square, target)) setSelected(null);
      else setSelected(drag.square);
    } else if (target && target !== drag.square && legalTargets.has(target)) {
      // A click that landed on a legal square without dragging.
      attempt(drag.square, target);
      setSelected(null);
    }

    setDrag(null);
  };

  const handlePointerCancel = () => setDrag(null);

  const squareSize = boardRef.current
    ? boardRef.current.getBoundingClientRect().width / 8
    : 0;

  return (
    <div className="board-wrapper">
      <div
        className="board"
        ref={boardRef}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        role="grid"
        aria-label="Chessboard"
      >
        {displayRanks.map((rank, rowIndex) =>
          displayFiles.map((file, colIndex) => {
            const square = file + rank;
            const piece = pieceAt(square);
            const isLight = (FILES.indexOf(file) + RANKS.indexOf(rank)) % 2 === 0;
            const isTarget = legalTargets.has(square);
            const isBeingDragged = drag?.moved && drag.square === square;

            const classes = ['square', isLight ? 'light' : 'dark'];
            if (selected === square) classes.push('selected');
            if (lastMove && (lastMove.from === square || lastMove.to === square)) {
              classes.push('last-move');
            }
            if (checkSquare === square) classes.push('in-check');

            return (
              <div
                key={square}
                className={classes.join(' ')}
                data-square={square}
                role="gridcell"
                aria-label={
                  piece
                    ? `${square} ${piece.color === 'w' ? 'white' : 'black'} ${piece.type}`
                    : square
                }
                onPointerDown={(event) => handlePointerDown(event, square)}
              >
                {showCoordinates && colIndex === 0 && <span className="coord rank">{rank}</span>}
                {showCoordinates && rowIndex === 7 && <span className="coord file">{file}</span>}

                {piece && !isBeingDragged && <Piece type={piece.type} color={piece.color} />}

                {isTarget && (
                  <span className={piece ? 'hint hint-capture' : 'hint hint-move'} />
                )}
              </div>
            );
          }),
        )}
      </div>

      {drag?.moved && (
        <div
          className="drag-layer"
          style={{
            left: drag.x - squareSize / 2,
            top: drag.y - squareSize / 2,
            width: squareSize,
            height: squareSize,
          }}
        >
          <Piece type={drag.piece.type} color={drag.piece.color} />
        </div>
      )}
    </div>
  );
}
