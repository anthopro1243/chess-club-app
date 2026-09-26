import { useEffect, useMemo, useState } from 'react';
import '../styles/prep.css';
import { useAccount } from '../data/accountStore.js';
import { useOfficialEvents } from '../data/officialEventsStore.js';
import { formatDate, relativeDays, daysBetween, nextEvent } from '../data/officialEvents.js';
import { useClubToday } from '../components/prep/useClubToday.js';
import DeadlineBanner from '../components/prep/DeadlineBanner.jsx';
import EventPanel from '../components/prep/EventPanel.jsx';
import AvailabilityPoll from '../components/prep/AvailabilityPoll.jsx';
import RegistrationHelper from '../components/prep/RegistrationHelper.jsx';
import { usePlayers, useMyProfile } from '../data/rosterStore.js';

/*
 * Which tabs each role sees. A member gets the parts that are about them
 * (their own poll answer, quiz, notation drill and readiness); the coach gets
 * those plus the club-wide tools. The database enforces the same split.
 */
const TABS = [
  { id: 'event', label: 'Event', coachOnly: false },
  { id: 'availability', label: 'Availability', coachOnly: false },
  { id: 'registration', label: 'Registration', coachOnly: true },
];

const TAB_KEY = 'cc-prep-tab';

function initialTab() {
  try {
    const query = window.location.hash.split('?')[1];
    const wanted = query ? new URLSearchParams(query).get('tab') : null;
    if (wanted) return wanted;
    return localStorage.getItem(TAB_KEY) || 'event';
  } catch {
    return 'event';
  }
}

/**
 * PrepPage — getting the club to the district tournament.
 *
 * Built around the research's tournament-day checklist
 * (research/FEATURE-RESEARCH.md §3): deadlines first, then who can come, who
 * is registered, and whether each registered player is ready. Everything
 * here happens before or after games — nothing on this page is meant for use
 * at the board, where devices must be off.
 */
export default function PrepPage() {
  const account = useAccount();
  const isCoach = !!account.isCoach;
  const events = useOfficialEvents();
  const today = useClubToday();
  // The store already leaves retired members out; every list here is the
  // current roster. `me` is null in local mode and for a member who has not
  // claimed a profile yet, which the member views handle.
  const players = usePlayers();
  const me = useMyProfile();

  const sortedEvents = useMemo(
    () => [...events].sort((a, b) => String(a.date).localeCompare(String(b.date))),
    [events],
  );
  const [eventId, setEventId] = useState(null);
  const event =
    sortedEvents.find((e) => e.id === eventId) || nextEvent(sortedEvents, today) || sortedEvents.at(-1) || null;

  const tabs = TABS.filter((t) => isCoach || !t.coachOnly);
  const [tab, setTab] = useState(initialTab);
  const activeTab = tabs.some((t) => t.id === tab) ? tab : tabs[0].id;
  useEffect(() => {
    try {
      localStorage.setItem(TAB_KEY, activeTab);
    } catch {
      /* storage can be unavailable; the tab still holds for this visit */
    }
  }, [activeTab]);

  const daysToEvent = event ? daysBetween(today, event.date) : null;

  return (
    <div className="prep">
      <header className="prep-header">
        <div>
          <h1>Tournament prep</h1>
          {event ? (
            <p>
              {event.name} · {formatDate(event.date, { withYear: true })}
              {event.venue ? ` · ${event.venue}` : ''}
              {daysToEvent != null && daysToEvent >= 0 ? ` · ${relativeDays(daysToEvent)}` : ''}
            </p>
          ) : (
            <p>No tournament on the calendar yet.</p>
          )}
        </div>
        {sortedEvents.length > 1 && (
          <label className="field prep-event-picker">
            <span>Event</span>
            <select value={event?.id || ''} onChange={(e) => setEventId(e.target.value)}>
              {sortedEvents.map((e) => (
                <option key={e.id} value={e.id}>
                  {formatDate(e.date, { withYear: true, withWeekday: false })} · {e.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </header>

      <DeadlineBanner events={events} today={today} isCoach={isCoach} />

      <nav className="prep-tabs" aria-label="Tournament prep sections">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`prep-tab ${activeTab === t.id ? 'active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {activeTab === 'event' && <EventPanel event={event} isCoach={isCoach} onCreated={setEventId} />}
      {activeTab === 'availability' && (
        <AvailabilityPoll event={event} players={players} me={me} isCoach={isCoach} />
      )}
      {activeTab === 'registration' && isCoach && <RegistrationHelper event={event} players={players} />}
    </div>
  );
}
