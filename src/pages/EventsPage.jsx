import { useMemo, useRef, useState } from 'react';
import '../styles/events-swiss.css';
import NewEventForm from '../components/events/NewEventForm.jsx';
import EventView from '../components/events/EventView.jsx';
import { useAccount } from '../data/accountStore.js';
import { usePlayers, useMyProfile } from '../data/rosterStore.js';
import { useGames } from '../data/gamesStore.js';
import { isSupabaseConfigured } from '../data/supabaseClient.js';
import { useTournamentState, createTournament } from '../data/tournamentStore.js';
import { shortDate } from '../tournament/eventOps.js';

/*
 * EventsPage — club tournaments (F075–F080, F083, F084).
 *
 * A coach creates a mock Swiss for a Tuesday, pairs each round in one click,
 * enters results board by board and prints the sheets for the wall. Members
 * see the same pairings and standings, read-only, with their own board
 * highlighted. The rules live in src/tournament/; this page only arranges
 * them.
 */

function hashParam(name) {
  const query = window.location.hash.split('?')[1];
  return query ? new URLSearchParams(query).get(name) : null;
}

const STATUS_LABEL = { draft: 'Not started', running: 'In progress', finished: 'Finished' };

export default function EventsPage({ onNavigate }) {
  const account = useAccount();
  const isCoach = !!account?.isCoach;
  const me = useMyProfile();
  const players = usePlayers();
  const games = useGames();
  const data = useTournamentState();
  const [selectedId, setSelectedId] = useState(() => hashParam('event'));
  const [creating, setCreating] = useState(false);
  const [toast, setToast] = useState('');
  const toastTimer = useRef(null);

  const flash = (message) => {
    setToast(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 2600);
  };

  // Newest first by date; an undated event sorts by when it was made.
  const events = useMemo(
    () =>
      [...data.tournaments].sort(
        (a, b) =>
          String(b.startsOn || '').localeCompare(String(a.startsOn || '')) ||
          String(b.createdAt || '').localeCompare(String(a.createdAt || '')),
      ),
    [data.tournaments],
  );
  // Nothing chosen yet: open the event in progress, else the newest.
  const selected =
    events.find((t) => t.id === selectedId) ||
    (!creating && selectedId === null ? events.find((t) => t.status === 'running') || events[0] : null) ||
    null;

  const select = (id) => {
    setSelectedId(id);
    setCreating(false);
    // Remember the event in the address, so a refresh or a shared link lands
    // on it. replaceState: choosing an event is not a navigation.
    const query = id ? `?event=${encodeURIComponent(id)}` : '';
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#/events${query}`);
  };

  const actor = account?.displayName || me?.name || (isSupabaseConfigured ? 'Coach' : 'Coach (this device)');

  const selectedKey = selected?.id ?? null;
  const scoped = useMemo(() => {
    const only = (list) => (selectedKey ? list.filter((row) => row.tournamentId === selectedKey) : []);
    return { entrants: only(data.entrants), pairings: only(data.pairings), overrides: only(data.overrides) };
  }, [selectedKey, data.entrants, data.pairings, data.overrides]);

  return (
    <div className="events-page">
      <section className="panel ev-screen">
        <div className="panel-header">
          <h2>Club events</h2>
          {isCoach && !creating && (
            <button
              type="button"
              className="ev-button primary"
              onClick={() => {
                setCreating(true);
                setSelectedId('');
              }}
            >
              + New event
            </button>
          )}
        </div>
        {events.length === 0 ? (
          <p className="ev-note">
            {isCoach
              ? 'No events yet. Create a mock tournament to rehearse the district format: pairings, clocks and scoresheets, before Oct 24.'
              : 'No club events yet. When the coach pairs a round, your board shows up here.'}
          </p>
        ) : (
          <div className="ev-list" role="list">
            {events.map((t) => (
              <button
                key={t.id}
                type="button"
                role="listitem"
                className={`ev-chip ${selected?.id === t.id ? 'is-selected' : ''}`}
                aria-current={selected?.id === t.id}
                onClick={() => select(t.id)}
              >
                <span className="ev-chip-name">{t.name}</span>
                <span className="ev-chip-meta">
                  {[shortDate(t.startsOn), STATUS_LABEL[t.status], t.pairedRounds ? `round ${t.pairedRounds}/${t.rounds}` : `${t.rounds} rounds`]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </button>
            ))}
          </div>
        )}
      </section>

      {creating && isCoach && (
        <div className="ev-screen">
          <NewEventForm
            players={players}
            onCancel={() => {
              setCreating(false);
              setSelectedId(null);
            }}
            onCreate={(fields, entrants) => {
              const id = createTournament(fields, entrants);
              select(id);
              flash('Event created. Check the players, then pair round 1.');
            }}
          />
        </div>
      )}

      {selected && !creating && (
        <EventView
          key={selected.id}
          tournament={selected}
          entrants={scoped.entrants}
          pairings={scoped.pairings}
          overrides={scoped.overrides}
          players={players}
          games={games}
          isCoach={isCoach}
          myPlayerId={me?.playerId ?? null}
          actor={actor}
          onNavigate={onNavigate}
          onDeleted={() => select(null)}
          flash={flash}
        />
      )}

      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}
