import Piece from '../../board/Piece.jsx';
import { formatClock } from './chessClock.js';

const ORDER = { q: 0, r: 1, b: 2, n: 3, p: 4 };

/** One side's strip above or below the board: name, captures, material, clock. */
export default function PlayerBar({ label, color, name, onName, captured, advantage, toMove, clockMs, clockRunning }) {
  const sorted = [...captured].sort((a, b) => ORDER[a] - ORDER[b]);
  const low = clockMs != null && clockMs <= 30000;
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
      {clockMs != null && (
        <span
          className={`clock mono ${clockRunning ? 'running' : ''} ${low ? 'low' : ''}`}
          aria-label={`${label} time remaining`}
        >
          {formatClock(clockMs)}
        </span>
      )}
    </div>
  );
}
