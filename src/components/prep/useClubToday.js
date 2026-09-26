import { useEffect, useState } from 'react';
import { chicagoDate } from '../../data/officialEvents.js';

/**
 * Today's date in the club's time zone, re-read every few minutes so a page
 * left open overnight (the coach's laptop at a Tuesday meeting, say) rolls
 * over to the new day's deadlines without a reload.
 */
export function useClubToday() {
  const [today, setToday] = useState(() => chicagoDate());
  useEffect(() => {
    const timer = setInterval(() => {
      const next = chicagoDate();
      setToday((prev) => (prev === next ? prev : next));
    }, 5 * 60 * 1000);
    return () => clearInterval(timer);
  }, []);
  return today;
}
