/** What the dialog shows once a sheet is saved. */
export default function ScoresheetSaved({ saved, onAnother, onClose }) {
  const { whiteName, blackName, event, round } = saved.game;
  // Initials like "J.D." already end the sentence.
  const stop = !event && blackName.endsWith('.') ? '' : '.';
  return (
    <div className="ss-saved" role="status">
      <p>
        Saved <strong>{whiteName}</strong> vs <strong>{blackName}</strong>
        {event ? ` (${event}${round ? `, round ${round}` : ''})` : ''}
        {stop}
      </p>
      {saved.note && (
        <p className="muted">
          Note on the game: {saved.note}. The analysis covers the {saved.analysedPlies} known half-moves
          from {saved.analysedFrom}.
        </p>
      )}
      <p className="muted">
        {saved.local
          ? 'Saved in this browser only. No server is connected, so it won’t be analyzed.'
          : 'It’ll be analyzed shortly.'}
      </p>
      <div className="import-actions">
        <button type="button" className="primary" onClick={onAnother}>
          Enter another from this event
        </button>
        <button type="button" onClick={onClose}>
          Done
        </button>
      </div>
    </div>
  );
}
