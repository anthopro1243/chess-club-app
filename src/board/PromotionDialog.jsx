import Piece from './Piece.jsx';
import Modal from '../ui/Modal.jsx';

const CHOICES = [
  { type: 'q', label: 'Queen' },
  { type: 'r', label: 'Rook' },
  { type: 'b', label: 'Bishop' },
  { type: 'n', label: 'Knight' },
];

/** Asks which piece a promoting pawn becomes. Underpromotion matters. */
export default function PromotionDialog({ color, onChoose, onCancel }) {
  return (
    <Modal title="Promote to" onClose={onCancel} closeLabel={null}>
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
    </Modal>
  );
}
