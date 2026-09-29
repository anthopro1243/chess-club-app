import { useState } from 'react';
import Piece from './Piece.jsx';
import { placementFromFen } from '../data/scoresheet.js';
import '../styles/scoresheet.css';

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const RANKS = ['8', '7', '6', '5', '4', '3', '2', '1'];
const PALETTE = ['K', 'Q', 'R', 'B', 'N', 'P', 'k', 'q', 'r', 'b', 'n', 'p'];
const NAMES = { k: 'king', q: 'queen', r: 'rook', b: 'bishop', n: 'knight', p: 'pawn' };

const pieceOf = (ch) => ({ type: ch.toLowerCase(), color: ch === ch.toUpperCase() ? 'w' : 'b' });
const pieceName = (ch) => `${ch === ch.toUpperCase() ? 'white' : 'black'} ${NAMES[ch.toLowerCase()]}`;

/**
 * PositionEditor — set up a position by hand, for continuing a scoresheet
 * after moves nobody can read.
 *
 * It starts from the last position the sheet reached, because the usual
 * repair is "these two pieces moved during the gap", not "rebuild the
 * board". So the default tool moves a piece: tap it, tap where it went (a
 * piece already there is captured). The palette adds or removes pieces for
 * the rarer cases, and a FEN field takes a position from anywhere else.
 *
 * `squares` is `{ e1: 'K', … }`; nothing here checks legality — the caller
 * shows scoresheet.js → validateSetup's answer under the board.
 */
export default function PositionEditor({ squares, onChange, orientation = 'w', fen }) {
  const [tool, setTool] = useState(null); // null = move; a piece letter = place; 'x' = remove
  const [picked, setPicked] = useState(null);
  const [fenText, setFenText] = useState('');
  const [fenError, setFenError] = useState('');

  const files = orientation === 'w' ? FILES : [...FILES].reverse();
  const ranks = orientation === 'w' ? RANKS : [...RANKS].reverse();

  const click = (square) => {
    if (tool === 'x') {
      const next = { ...squares };
      delete next[square];
      onChange(next);
      return;
    }
    if (tool) {
      onChange({ ...squares, [square]: tool });
      return;
    }
    if (!picked) {
      if (squares[square]) setPicked(square);
      return;
    }
    if (picked === square) {
      setPicked(null);
      return;
    }
    const next = { ...squares, [square]: squares[picked] };
    delete next[picked];
    onChange(next);
    setPicked(null);
  };

  const applyFen = () => {
    const text = fenText.trim();
    if (!text) return;
    const { squares: parsed } = placementFromFen(text);
    if (!Object.keys(parsed).length) {
      setFenError('That isn’t a valid FEN.');
      return;
    }
    setFenError('');
    onChange(parsed);
  };

  return (
    <div className="pe">
      <div className="pe-tools" role="toolbar" aria-label="Position editor tools">
        <button
          type="button"
          className={`pe-tool pe-tool-move${tool === null ? ' active' : ''}`}
          aria-pressed={tool === null}
          onClick={() => {
            setTool(null);
            setPicked(null);
          }}
        >
          Move
        </button>
        {PALETTE.map((ch) => (
          <button
            key={ch}
            type="button"
            className={`pe-tool${tool === ch ? ' active' : ''}`}
            aria-pressed={tool === ch}
            aria-label={`Place a ${pieceName(ch)}`}
            title={`Place a ${pieceName(ch)}`}
            onClick={() => {
              setTool(ch);
              setPicked(null);
            }}
          >
            <Piece {...pieceOf(ch)} />
          </button>
        ))}
        <button
          type="button"
          className={`pe-tool pe-tool-move${tool === 'x' ? ' active' : ''}`}
          aria-pressed={tool === 'x'}
          onClick={() => {
            setTool('x');
            setPicked(null);
          }}
        >
          Remove
        </button>
      </div>

      <div className="board pe-board" role="grid" aria-label="Set-up board">
        {ranks.map((rank, r) =>
          files.map((file, f) => {
            const square = `${file}${rank}`;
            const ch = squares[square];
            const light = (FILES.indexOf(file) + RANKS.indexOf(rank)) % 2 === 0;
            return (
              <button
                key={square}
                type="button"
                className={`square ${light ? 'light' : 'dark'}${picked === square ? ' selected' : ''}`}
                data-square={square}
                aria-label={ch ? `${square} ${pieceName(ch)}` : square}
                onClick={() => click(square)}
              >
                {f === 0 && <span className="coord rank">{rank}</span>}
                {r === 7 && <span className="coord file">{file}</span>}
                {ch && <Piece {...pieceOf(ch)} />}
              </button>
            );
          }),
        )}
      </div>

      <p className="hint-text pe-help">
        {tool === null
          ? picked
            ? `Now tap where the ${pieceName(squares[picked])} went.`
            : 'Tap a piece, then the square it moved to.'
          : tool === 'x'
            ? 'Tap a piece to take it off the board.'
            : `Tap squares to place a ${pieceName(tool)}.`}
      </p>

      <details className="pe-fen">
        <summary>Paste a FEN instead</summary>
        <div className="pe-fen-row">
          <input
            type="text"
            value={fenText}
            placeholder={fen || 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR'}
            aria-label="FEN"
            onChange={(e) => setFenText(e.target.value)}
          />
          <button type="button" onClick={applyFen}>
            Use it
          </button>
        </div>
        {fenError && <p className="form-error small">{fenError}</p>}
        <p className="hint-text">Only the piece positions are used. Whose move it is comes from the sheet.</p>
      </details>
    </div>
  );
}
