import { useEffect, useId, useRef, useState } from 'react';

/**
 * InfoTooltip — a small "i" button that reveals a short explanation.
 *
 * For the detail that used to sit in the open as a paragraph next to a
 * label. Keeps the label itself short; the explanation is there if you want
 * it, not in the way if you don't. It sits NEXT to a heading (in a
 * .heading-row), not inside it, so the heading's name stays just its text.
 * Escape or a click elsewhere closes it.
 */
export default function InfoTooltip({ children, label = 'More info' }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const boxRef = useRef(null);
  const buttonRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      buttonRef.current?.focus();
    };
    const onPointer = (event) => {
      if (boxRef.current && !boxRef.current.contains(event.target)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [open]);

  return (
    <span className="info-tooltip" ref={boxRef}>
      <button
        type="button"
        ref={buttonRef}
        className="info-icon"
        onClick={() => setOpen((v) => !v)}
        aria-label={label}
        aria-expanded={open}
        aria-controls={id}
      >
        i
      </button>
      {open && (
        <span className="info-bubble" id={id} role="note">
          {children}
        </span>
      )}
    </span>
  );
}
