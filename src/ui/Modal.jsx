import { useEffect, useId, useRef } from 'react';

/*
 * Modal — every dialog in the app, built on the browser's own <dialog>.
 *
 * showModal() gives the things the seven hand-made overlays never had: focus
 * moves into the dialog and can't Tab out behind it, Escape closes it, and
 * the page behind is inert. Focus goes back to whatever opened the dialog
 * when it closes, and the page behind stops scrolling while it is open.
 *
 * `busy` blocks closing (Escape, the backdrop and the close button) while
 * an import or save is running. `closeLabel` = null leaves the header
 * without a close button, for dialogs whose own buttons end them. A dialog
 * with no visible title (the quick search) passes `label` instead, so it
 * still has a name.
 */
export default function Modal({
  title,
  label,
  titleExtra = null,
  onClose,
  busy = false,
  closeLabel = 'Close',
  className = '',
  children,
}) {
  const ref = useRef(null);
  const titleId = useId();
  // Whatever had focus when the dialog first rendered, before showModal()
  // moved focus inside it. Read at render time, so StrictMode's second
  // effect run doesn't record an element inside the dialog instead.
  const openerRef = useRef(typeof document === 'undefined' ? null : document.activeElement);

  useEffect(() => {
    const dialog = ref.current;
    const opener = openerRef.current;
    if (dialog && !dialog.open) {
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
    }
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = overflow;
      if (opener && typeof opener.focus === 'function' && document.contains(opener)) opener.focus();
    };
  }, []);

  const requestClose = () => {
    if (!busy) onClose?.();
  };

  return (
    // The backdrop click is a mouse shortcut; Escape (onCancel) is the keyboard way.
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions
    <dialog
      ref={ref}
      className="modal"
      aria-labelledby={title ? titleId : undefined}
      aria-label={title ? undefined : label}
      onCancel={(event) => {
        // Escape: let React decide, so a busy dialog stays open.
        event.preventDefault();
        requestClose();
      }}
      onClick={(event) => {
        // A click on the dialog element itself is a click on the backdrop.
        if (event.target === ref.current) requestClose();
      }}
    >
      <div className={`modal-panel ${className}`}>
        {title && (
          <div className="modal-header">
            <div className="modal-heading">
              <h2 id={titleId} className="modal-title">
                {title}
              </h2>
              {titleExtra}
            </div>
            {closeLabel && onClose && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={requestClose} disabled={busy}>
                {closeLabel}
              </button>
            )}
          </div>
        )}
        {children}
      </div>
    </dialog>
  );
}
