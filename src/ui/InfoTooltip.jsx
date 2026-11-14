import { useState } from 'react';

/**
 * InfoTooltip — a small "i" icon that reveals a short explanation on click.
 *
 * For the detail that used to sit in the open as a paragraph next to a
 * label. Keeps the label itself short; the explanation is there if you
 * want it, not in the way if you don't.
 */
export default function InfoTooltip({ children, label = 'More info' }) {
  const [open, setOpen] = useState(false);

  return (
    <span className="info-tooltip">
      <button type="button" className="info-icon" onClick={() => setOpen((v) => !v)} aria-label={label}>
        i
      </button>
      {open && <span className="info-bubble">{children}</span>}
    </span>
  );
}
