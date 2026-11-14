import { useFlash } from './useFlash.js';

/** [message, show]: show('Saved') puts a toast up for `ms`, then clears it. */
export function useToast(ms = 2200) {
  return useFlash(ms);
}

/*
 * Toast — a short message at the bottom of the screen. The live region is
 * always in the page, so screen readers announce each new message (one that
 * appears together with its container is often missed).
 */
export default function Toast({ message }) {
  return (
    <div className="toast-slot" role="status">
      {message && <div className="toast">{message}</div>}
    </div>
  );
}
