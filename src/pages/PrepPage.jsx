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
import RulesQuiz from '../components/prep/RulesQuiz.jsx';
import NotationTrainer from '../components/prep/NotationTrainer.jsx';
import ReadinessPanel from '../components/prep/ReadinessPanel.jsx';
import { useGames } from '../data/gamesStore.js';
import { usePrepResults } from '../data/prepResultsStore.js';
import { useEventRegistrations } from '../data/eventRegistrationStore.js';
import { readinessByPlayer } from '../data/readiness.js';
import { useAttempts } from '../data/puzzleAttemptsStore.js';
import PractisingAs, { usePractisingAs } from '../components/prep/PractisingAs.jsx';
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
  { id: 'quiz', label: 'Rules quiz', coachOnly: false },
  { id: 'notation', label: 'Notation', coachOnly: false },
  { id: 'readiness', label: 'Readiness', coachOnly: false },
];

const TAB_KEY = 'cc-prep-tab';

/** The ?tab= on the current hash (#/prep?tab=quiz), or null. */
function tabFromHash() {
  const query = window.location.hash.split('?')[1];
  return query ? new URLSearchParams(query).get('tab') : null;
}

function initialTab() {
  try {
    return tabFromHash() || localStorage.getItem(TAB_KEY) || 'event';
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
  const practising = usePractisingAs({ isCoach, me, players });

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
  // A link to #/prep?tab=… while the page is already open changes the hash
  // without remounting, so follow the hash as well as the first render.
  useEffect(() => {
    const onHash = () => {
      const wanted = tabFromHash();
      if (wanted) setTab(wanted);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(TAB_KEY, activeTab);
    } catch {
      /* storage can be unavailable; the tab still holds for this visit */
    }
  }, [activeTab]);

  const daysToEvent = event ? daysBetween(today, event.date) : null;

  // Readiness is computed once here and shared: the Readiness tab shows it,
  // and the registration suggestions can be ordered by it.
  const games = useGames();
  const results = usePrepResults();
  const registrations = useEventRegistrations();
  const attempts = useAttempts();
  const readinessById = useMemo(
    () => readinessByPlayer({ players, results, games, event, registrations, attempts }),
    [players, results, games, event, registrations, attempts],
  );

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
      {activeTab === 'registration' && isCoach && (
        <RegistrationHelper event={event} players={players} readinessById={readinessById} />
      )}
      {activeTab === 'quiz' && (
        <>
          <PractisingAs isCoach={isCoach} players={players} {...practising} />
          <RulesQuiz key={practising.player?.playerId || 'practice'} player={practising.player} />
        </>
      )}
      {activeTab === 'notation' && (
        <>
          <PractisingAs isCoach={isCoach} players={players} {...practising} />
          <NotationTrainer key={practising.player?.playerId || 'practice'} player={practising.player} />
        </>
      )}
      {activeTab === 'readiness' && (
        <ReadinessPanel
          event={event}
          players={players}
          me={me}
          isCoach={isCoach}
          readinessById={readinessById}
          onOpenTab={setTab}
        />
      )}
    </div>
  );
}
