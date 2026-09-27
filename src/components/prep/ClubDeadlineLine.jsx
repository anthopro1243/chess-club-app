import '../../styles/prep.css';
import { useAccount } from '../../data/accountStore.js';
import { useOfficialEvents } from '../../data/officialEventsStore.js';
import { formatDate, relativeDays, upcomingDeadlines } from '../../data/officialEvents.js';
import { useClubToday } from './useClubToday.js';

/**
 * ClubDeadlineLine — one line on the Club page, for coaches only: the next
 * district deadline, with a link to Tournament prep. Deliberately small; the
 * full banner lives on the prep page.
 */
export default function ClubDeadlineLine({ onNavigate }) {
  const account = useAccount();
  const events = useOfficialEvents();
  const today = useClubToday();
  if (!account.isCoach) return null;

  const [next] = upcomingDeadlines(events, today);
  if (!next) return null;

  return (
    <div className={`prep-club-line stage-${next.stage}`} role="status">
      <span>
        <strong>{next.label}</strong> {formatDate(next.date)} ({relativeDays(next.daysLeft)})
      </span>
      <button type="button" className="link-button" onClick={() => onNavigate('prep')}>
        Tournament prep &rsaquo;
      </button>
    </div>
  );
}
