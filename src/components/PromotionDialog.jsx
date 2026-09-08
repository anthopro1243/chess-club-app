import Piece from './Piece.jsx';

const CHOICES = [
  { type: 'q', label: 'Queen' },
  { type: 'r', label: 'Rook' },
  { type: 'b', label: 'Bishop' },
  { type: 'n', label: 'Knight' },
];

/** Asks which piece a promoting pawn becomes. Underpromotion matters. */
export default function PromotionDialog({ color, onChoose, onCancel }) {
  return (
    <div className="promotion-backdrop" onClick={onCancel}>
      <div
        className="promotion-dialog"
        role="dialog"
        aria-label="Choose a promotion piece"
        onClick={(event) => event.stopPropagation()}
      >
        <h3>Promote to</h3>
        <div className="promotion-choices">
          {CHOICES.map((choice) => (
            <button
              key={choice.type}
              type="button"
              className="promotion-choice"
              onClick={() => onChoose(choice.type)}
            >
              <Piece type={choice.type} color={color} />
              <span>{choice.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
