import { useEffect, useRef, useState } from 'react';
import { createFlashTimer } from './flashTimer.js';

/**
 * useFlash — [activeKey, show]. show('pgn') makes activeKey 'pgn' for `ms`,
 * then null. Used for button labels like "Copied" that should revert.
 */
export function useFlash(ms = 1500) {
  const [active, setActive] = useState(null);
  const ref = useRef(null);
  if (!ref.current) ref.current = createFlashTimer({ ms, onChange: setActive });
  useEffect(() => () => ref.current.dispose(), []);
  return [active, ref.current.show];
}
