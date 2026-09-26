import '../../styles/prep.css';
import { formatDate, relativeDays, upcomingDeadlines } from '../../data/officialEvents.js';

const STAGE_NOTE = {
  today: 'Due today.',
  urgent: 'Final reminder.',
  soon: 'Reminder: this week.',
  upcoming: '',
};

/**
 * DeadlineBanner — every district deadline still ahead, soonest first.
 *
 * Shown to everyone on the Tournament prep page. The colour follows the
 * reminder schedule (amber inside 7 days, red inside 2), so the thing that
 * needs doing this week is the thing that stands out.
 */
export default function DeadlineBanner({ events, today, isCoach }) {
  const deadlines = upcomingDeadlines(events, today);
  if (!deadlines.length) return null;
  const multipleEvents = new Set(deadlines.map((d) => d.eventId)).size > 1;

  return (
    <section className="prep-banner" aria-label="Upcoming deadlines">
      <h2>Upcoming deadlines</h2>
      <ul className="prep-deadlines">
        {deadlines.map((d) => (
          <li key={`${d.eventId}:${d.key}`} className={`prep-deadline stage-${d.stage}`}>
            <span className="prep-deadline-label">
              {d.label}
              {multipleEvents ? ` · ${d.eventName}` : ''}
            </span>
            <span className="prep-deadline-when">
              {formatDate(d.date)} · {relativeDays(d.daysLeft)}
            </span>
            <span className="prep-deadline-meta">
              {[
                STAGE_NOTE[d.stage],
                d.nextReminder && d.nextReminder.date !== today
                  ? `Next reminder ${formatDate(d.nextReminder.date)}.`
                  : '',
                isCoach && d.isDefault ? 'Date from the district rule; edit it under Event.' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
