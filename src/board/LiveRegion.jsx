import { useCallback, useState } from 'react';

/**
 * useAnnouncer — one page-wide voice for the board.
 *
 * Moves, selections and typed-move errors all go through the same region.
 * Two regions speaking at once make screen readers drop or interleave
 * messages, and the most recent thing said is what the player needs.
 *
 * @returns {[{text: string, serial: number}, (text: string) => void]}
 */
export function useAnnouncer() {
  const [message, setMessage] = useState({ text: '', serial: 0 });
  const announce = useCallback((text) => {
    if (!text) return;
    setMessage((prev) => ({ text, serial: prev.serial + 1 }));
  }, []);
  return [message, announce];
}

/**
 * LiveRegion — the polite aria-live element that useAnnouncer speaks into.
 *
 * A screen reader only speaks when the region's text CHANGES, so the same
 * sentence twice ("Not the move. Try again.") would be heard once. A
 * no-break space is toggled on alternate messages to make each one new.
 * The region is visually hidden: sighted players already see the move on
 * the board and in the move list.
 */
export default function LiveRegion({ message }) {
  return (
    <div className="sr-only board-live" role="status" aria-live="polite" aria-atomic="true">
      {message.text}
      {message.serial % 2 ? ' ' : ''}
    </div>
  );
}
