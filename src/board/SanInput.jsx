import { useId, useState } from 'react';
import { matchSanInput } from './sanInput.js';

/**
 * SanInput — type a move instead of clicking it ("Nf3", "O-O", "e8=Q").
 *
 * The parsing and every explanation live in src/board/sanInput.js; this is
 * only the box. It never plays anything itself: a legal match is handed to
 * `onMove` exactly as a board click would be, so the page's own rules (the
 * puzzle's expected line, the clock, the computer's turn) still apply.
 *
 * It is deliberately never disabled. Disabling a focused input throws focus
 * back to the page body, so a player who typed a move and pressed Enter
 * would lose their place the moment the computer started thinking. Instead
 * a submit while the board is locked explains why (`lockedMessage`).
 */
export default function SanInput({ game, onMove, lockedMessage = null, onAnnounce }) {
  const id = useId();
  const [text, setText] = useState('');
  const [error, setError] = useState('');

  const report = (message) => {
    setError(message);
    onAnnounce?.(message);
  };

  const submit = (event) => {
    event.preventDefault();
    if (lockedMessage) {
      report(lockedMessage);
      return;
    }
    const result = matchSanInput(game, text);
    if (!result.ok) {
      report(result.message);
      return;
    }
    // Clear first: the move below re-renders the page, and the box should
    // be empty and ready for the next move when it does.
    setText('');
    setError('');
    onMove(result.move);
  };

  return (
    <form className="san-input" onSubmit={submit} noValidate>
      <label className="san-input-label" htmlFor={`${id}-move`}>
        Type a move
      </label>
      <div className="san-input-row">
        <input
          id={`${id}-move`}
          type="text"
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            if (error) setError('');
          }}
          placeholder="e.g. Nf3"
          autoComplete="off"
          autoCorrect="off"
          // Phones capitalise the first letter by default, which turns
          // "e4" into "E4" and every pawn move into an error.
          autoCapitalize="none"
          spellCheck={false}
          aria-invalid={error ? 'true' : 'false'}
          aria-describedby={`${id}-feedback`}
        />
        <button type="submit">Play</button>
      </div>
      <p id={`${id}-feedback`} className={error ? 'san-input-error' : 'hint-text san-input-hint'}>
        {error || 'Standard notation: Nf3, exd5, O-O, e8=Q. On the board: arrow keys, then Enter to pick up and put down.'}
      </p>
    </form>
  );
}
